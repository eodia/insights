/**
 * Exécuter une question : compiler vers Trino SQL, exécuter sous l'identité du lecteur
 * (Trino demande à l'endpoint OPA ce qu'il peut voir), mettre en cache, journaliser.
 */
import {
  type BuilderQuery,
  type Constraint,
  type ParameterValue,
  type QueryResult,
  type QuestionQuery,
  type ResultColumn,
  type SourceRef,
  applyConstraints,
  cardConstraints,
  kindOfTrinoType,
} from '@eodia/contracts'
import {
  type ColumnInfo,
  type CompileContext,
  type CompiledSource,
  CompileError,
  type MetricInfo,
  type TableInfo,
  cleanStatement,
  compileBuilder,
  expandSnippets,
  humanize,
  nativeSql,
  renderSql,
  snippetNames,
} from '@eodia/compiler'
import { TrinoCancelled, TrinoQueryError } from '@eodia/engine'
import { accessFingerprint, canQuery, columnAccess, nativeAllowed, queryLevel, tableAccess } from '../access/decide'
import type { Snapshot } from '../access/snapshot'
import { type Actor, type Core, principalOf } from '../context'
import { getDashboard, getQuestion, metricDefinition } from '../content/items'
import { AppError } from '../errors'
import { ensureCatalogs } from '../sources/datasources'
import { valueLooks } from '../sources/metadata'
import { cacheGet, cacheKey, cachePut } from './cache'

export type Origin = 'editor' | 'question' | 'card' | 'api' | 'mcp' | 'copilot' | 'share' | 'home'

export interface RunInput {
  readonly query: QuestionQuery
  readonly parameters?: Readonly<Record<string, ParameterValue | null>>
  readonly constraints?: readonly Constraint[]
  readonly fresh?: boolean
  readonly limit?: number
  readonly origin: Origin
  /** The query is written by the caller, not read from a saved question: their query level applies. */
  readonly adhoc: boolean
  readonly questionId?: string
  readonly dashboardId?: string
  readonly cacheTtl?: number | null
  /** A key the caller may cancel the execution with. */
  readonly executionId?: string
  /** Column metadata of a model, applied to the result. */
  readonly columnsMeta?: Record<string, Partial<{ label: string; semantic: string | null; format: Record<string, unknown> }>> | null
}

export interface RunResult extends QueryResult {
  readonly sql: string
  /** Values' looks (label, colour, pictogram) by column id. */
  readonly looks?: Record<string, { value: string; label?: string | null; color?: string | null; icon?: string | null; image_url?: string | null }[]>
}

const today = () => new Date().toISOString().slice(0, 10)
const MAX_SOURCE_DEPTH = 4

// ── Contexte de compilation ─────────────────────────────────────────────────

interface Prepared {
  readonly tables: Map<string, TableInfo>
  readonly questions: Map<string, CompiledSource>
  readonly metrics: Map<string, MetricInfo>
  readonly datasources: Set<string>
}

async function loadTable(core: Core, snap: Snapshot, userId: string, id: string, prepared: Prepared): Promise<void> {
  if (prepared.tables.has(id)) return
  const t = await core.db.one<{ id: string; datasource_id: string; catalog: string; schema_name: string; name: string; label: string }>(
    `SELECT t.id, t.datasource_id, d.catalog, t.schema_name, t.name, t.label FROM db_table t JOIN datasource d ON d.id = t.datasource_id WHERE t.id = $1`,
    [id],
  )
  if (!t || tableAccess(snap, userId, t.datasource_id, t.schema_name, t.id).access === 'none') {
    throw new AppError('DATA_ACCESS_DENIED', 'Accès aux données refusé : table introuvable ou non autorisée.')
  }
  const snapTable = snap.tables.get(id)
  const cols = await core.db.many<{ id: string; name: string; data_type: string; label: string; semantic_type: string | null; format: Record<string, unknown>; fingerprint: ColumnInfo['fingerprint'] }>(
    `SELECT id, name, data_type, label, semantic_type, format, fingerprint FROM db_column WHERE table_id = $1 AND status = 'active' ORDER BY position`,
    [id],
  )
  prepared.datasources.add(t.datasource_id)
  prepared.tables.set(id, {
    id: t.id,
    catalog: t.catalog,
    schema: t.schema_name,
    name: t.name,
    label: t.label,
    columns: cols
      .filter((c) => !snapTable || columnAccess(snap, userId, snapTable, c.name).access !== 'hidden')
      .map((c) => ({ id: c.id, name: c.name, type: c.data_type, label: c.label, semantic: c.semantic_type, format: c.format, fingerprint: c.fingerprint })),
  })
}

/** Result columns of a SQL statement without running it: `LIMIT 0` returns the types. */
async function describe(core: Core, userId: string, sql: string): Promise<ColumnInfo[]> {
  const res = await core.engine.run(`SELECT * FROM (\n${sql}\n) LIMIT 0`, { user: userId, timeoutMs: 60_000 })
  return res.columns.map((c) => ({ name: c.name, type: c.dataType, label: humanize(c.name) }))
}

async function prepare(core: Core, actor: Actor, snap: Snapshot, query: QuestionQuery, prepared: Prepared, depth = 0): Promise<void> {
  if (query.kind !== 'builder') return
  if (depth > MAX_SOURCE_DEPTH) throw new AppError('INVALID_INPUT', 'Trop de questions imbriquées.')
  const refs: SourceRef[] = [query.source, ...(query.joins ?? []).map((j) => j.source)]
  for (const a of query.aggregations ?? []) {
    if (a.fn !== 'metric' || !a.metric || prepared.metrics.has(a.metric)) continue
    const m = await metricDefinition(core, actor, a.metric)
    if (!m) throw new AppError('NOT_FOUND', 'Métrique introuvable ou inaccessible.')
    prepared.metrics.set(m.id, { id: m.id, name: m.name, source: m.source, aggregation: m.aggregation, filters: m.filters })
    refs.push(m.source)
  }
  for (const ref of refs) {
    if (ref.kind === 'table') await loadTable(core, snap, principalOf(actor), ref.id, prepared)
    else if (!prepared.questions.has(ref.id)) {
      const q = await getQuestion(core, actor, ref.id)
      const compiled = await compileQuery(core, actor, snap, q.query, {}, [], prepared, depth + 1)
      const columns: ColumnInfo[] =
        q.query.kind === 'builder'
          ? (compiled.columns ?? []).map((c) => ({
              name: c.name,
              type: c.type === 'number' ? 'double' : c.type === 'date' ? 'date' : c.type === 'datetime' ? 'timestamp(3)' : c.type === 'boolean' ? 'boolean' : 'varchar',
              label: c.label,
              ...(c.semantic ? { semantic: c.semantic } : {}),
              ...(c.format ? { format: c.format } : {}),
              ...(c.source?.column ? { id: c.source.column } : {}),
            }))
          : await describe(core, principalOf(actor), compiled.sql)
      // A model's own column metadata wins.
      const meta = q.columns_meta ?? {}
      prepared.questions.set(ref.id, {
        sql: compiled.sql,
        label: q.name,
        columns: columns.map((c) => {
          const m = meta[c.name]
          return m ? { ...c, ...(m.label ? { label: m.label } : {}), ...(m.semantic !== undefined ? { semantic: m.semantic } : {}), ...(m.format ? { format: m.format } : {}) } : c
        }),
      })
    }
  }
}

function contextOf(prepared: Prepared, allowSql: boolean): CompileContext {
  return {
    table: (id) => prepared.tables.get(id),
    question: (id) => prepared.questions.get(id),
    metric: (id) => prepared.metrics.get(id),
    today: today(),
    weekStart: 1,
    allowSql,
  }
}

async function compileQuery(
  core: Core,
  actor: Actor,
  snap: Snapshot,
  query: QuestionQuery,
  parameters: Readonly<Record<string, ParameterValue | null>>,
  constraints: readonly Constraint[],
  prepared: Prepared,
  depth = 0,
): Promise<{ sql: string; columns: ResultColumn[] | null; datasource?: string }> {
  try {
    if (query.kind === 'builder') {
      await prepare(core, actor, snap, query, prepared, depth)
      const allowSql = [...prepared.datasources].every((ds) => canQuery(snap, principalOf(actor), ds, 'sql'))
      const withConstraints: BuilderQuery = constraints.length ? applyConstraints(query, constraints) : query
      const out = compileBuilder(withConstraints, contextOf(prepared, allowSql))
      return { sql: out.sql, columns: out.columns }
    }
    const snippets = snippetNames(query.sql)
    let text = query.sql
    if (snippets.length) {
      const rows = await core.db.many<{ name: string; content: string }>('SELECT name, content FROM snippet WHERE name = ANY($1) AND workspace_id = $2', [
        snippets,
        actor.workspaceId,
      ])
      const byName = new Map(rows.map((r) => [r.name, r.content]))
      text = expandSnippets(text, (n) => byName.get(n))
    }
    const rendered = cleanStatement(renderSql(text, query.variables ?? [], parameters, { today: today() }, constraints))
    if (query.kind === 'native') {
      const ds = snap.datasources.get(query.datasource)
      if (!ds) throw new AppError('NOT_FOUND', 'Source introuvable.')
      if (!nativeAllowed(snap, principalOf(actor), ds.id)) {
        throw new AppError('DATA_ACCESS_DENIED', 'Le SQL natif est réservé aux personnes sans restriction de ligne ni de colonne sur cette source.')
      }
      return { sql: nativeSql(ds.catalog, rendered), columns: null, datasource: ds.id }
    }
    return { sql: rendered, columns: null }
  } catch (err) {
    if (err instanceof CompileError) throw new AppError('INVALID_INPUT', err.message)
    throw err
  }
}

// ── Valeurs ─────────────────────────────────────────────────────────────────

const STAMP = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?: (.+))?$/

/** A Trino value as JSON the interface reads: numbers as numbers, instants as ISO text. */
function normalize(value: unknown, kind: string): unknown {
  if (value === null || value === undefined) return null
  if (kind === 'number') {
    if (typeof value === 'number') return value
    const n = Number(value)
    return Number.isFinite(n) ? n : value
  }
  if (kind === 'datetime' && typeof value === 'string') {
    const m = STAMP.exec(value)
    return m ? `${m[1]}T${(m[2] as string).replace(/(\.\d{3})\d+$/, '$1')}` : value
  }
  return value
}

function sqlColumns(columns: readonly { name: string; dataType: string }[]): ResultColumn[] {
  const seen = new Map<string, number>()
  return columns.map((c) => {
    const n = (seen.get(c.name) ?? 0) + 1
    seen.set(c.name, n)
    const kind = kindOfTrinoType(c.dataType)
    return {
      name: n === 1 ? c.name : `${c.name}#${n}`,
      label: humanize(c.name),
      role: 'field' as const,
      type: kind === 'other' ? 'text' : kind,
    }
  })
}

// ── Exécution ───────────────────────────────────────────────────────────────

const CATALOG_MISSING = /Catalog '([^']+)' (?:not found|does not exist)/i

export async function runQuery(core: Core, actor: Actor, input: RunInput): Promise<RunResult> {
  const snap = await core.snapshot()
  const prepared: Prepared = { tables: new Map(), questions: new Map(), metrics: new Map(), datasources: new Set() }
  if (input.adhoc) {
    const levels = [...snap.datasources.keys()].map((ds) => queryLevel(snap, principalOf(actor), ds))
    const needed = input.query.kind === 'builder' ? 'builder' : input.query.kind === 'sql' ? 'sql' : 'native'
    const rank = ['none', 'builder', 'sql', 'native']
    if (!levels.some((l) => rank.indexOf(l) >= rank.indexOf(needed))) {
      throw new AppError(
        'FORBIDDEN',
        needed === 'builder' ? "Vous n'avez le droit d'interroger aucune source." : needed === 'sql' ? "Vous n'avez pas le droit d'écrire du SQL." : "Vous n'avez pas le droit d'écrire du SQL natif.",
      )
    }
  }
  const compiled = await compileQuery(core, actor, snap, input.query, input.parameters ?? {}, input.constraints ?? [], prepared)
  if (input.adhoc && input.query.kind === 'builder') {
    for (const ds of prepared.datasources) {
      if (!canQuery(snap, principalOf(actor), ds, 'builder')) throw new AppError('FORBIDDEN', "Vous n'avez pas le droit d'interroger cette source.")
    }
  }
  const limit = Math.min(input.limit ?? core.config.maxRows, 1_000_000)
  const key = cacheKey(compiled.sql, accessFingerprint(snap, principalOf(actor)), limit)
  const useCache = input.origin !== 'editor' && !input.fresh
  if (useCache) {
    const hit = await cacheGet(core, key)
    if (hit) {
      void logExecution(core, actor, input, compiled.sql, hit.duration_ms, hit.rows.length, null, true)
      return { ...hit, sql: compiled.sql }
    }
  }

  const started = Date.now()
  const controller = new AbortController()
  const execKey = input.executionId ? `${actor.userId}:${input.executionId}` : null
  if (execKey) core.running.set(execKey, { controller, userId: actor.userId })
  try {
    let res: Awaited<ReturnType<typeof core.engine.run>>
    const run = () =>
      core.engine.run(compiled.sql, {
        user: principalOf(actor),
        maxRows: limit,
        timeoutMs: core.config.queryTimeoutMs,
        signal: controller.signal,
        onQueryId: (id) => {
          if (execKey) {
            const r = core.running.get(execKey)
            if (r) core.running.set(execKey, { ...r, queryId: id })
          }
        },
      })
    try {
      res = await run()
    } catch (err) {
      // Trino restarted and lost its catalogs (catalog.store=memory): recreate, then once more.
      if (err instanceof TrinoQueryError && CATALOG_MISSING.test(err.message)) {
        const { created } = await ensureCatalogs(core)
        if (created.length === 0) throw err
        res = await run()
      } else throw err
    }
    const columns = compiled.columns ?? sqlColumns(res.columns)
    // The column metadata of a model, or of a saved question, dresses its result.
    const dressed = input.columnsMeta
      ? columns.map((c) => {
          const m = input.columnsMeta?.[c.name]
          return m ? ({ ...c, ...(m.label ? { label: m.label } : {}), ...(m.semantic ? { semantic: m.semantic } : {}), ...(m.format ? { format: m.format } : {}) } as ResultColumn) : c
        })
      : columns
    const rows = res.data.map((row) => dressed.map((c, i) => normalize(row[i], c.type)))
    const result: RunResult = {
      columns: dressed,
      rows,
      truncated: res.truncated,
      duration_ms: Date.now() - started,
      sql: compiled.sql,
    }
    const columnIds = dressed.map((c) => c.source?.column).filter((x): x is string => !!x)
    const looks = await valueLooks(core, columnIds)
    const withLooks: RunResult = Object.keys(looks).length ? { ...result, looks } : result
    if (input.origin !== 'editor') {
      const ttl = await ttlFor(core, input, prepared)
      if (ttl !== 0) void cachePut(core, key, withLooks, ttl)
    }
    void logExecution(core, actor, input, compiled.sql, result.duration_ms, rows.length, null, false)
    return withLooks
  } catch (err) {
    const mapped = mapError(err, core.config.queryTimeoutMs)
    void logExecution(core, actor, input, compiled.sql, Date.now() - started, null, mapped.message, false)
    throw mapped
  } finally {
    if (execKey) core.running.delete(execKey)
  }
}

export async function cancelExecution(core: Core, actor: Actor, executionId: string): Promise<boolean> {
  const key = `${actor.userId}:${executionId}`
  const run = core.running.get(key)
  if (!run) return false
  run.controller.abort()
  if (run.queryId) await core.engine.cancel(run.queryId)
  return true
}

function mapError(err: unknown, timeoutMs: number): AppError {
  if (err instanceof AppError) return err
  if (err instanceof TrinoCancelled) return new AppError('QUERY_CANCELLED', 'Requête annulée.')
  if (err instanceof TrinoQueryError) {
    if (/Access Denied/i.test(err.message)) {
      return new AppError('DATA_ACCESS_DENIED', `Accès aux données refusé : ${err.message.replace(/^Access Denied:\s*/i, '')}`)
    }
    return new AppError('QUERY_FAILED', err.message, err.location ? { location: err.location } : undefined)
  }
  const message = err instanceof Error ? err.message : String(err)
  if (/Délai dépassé/.test(message)) return new AppError('QUERY_TIMEOUT', `La requête a dépassé ${Math.round(timeoutMs / 1000)} s.`)
  if (/coordinateur Trino|ECONNREFUSED|joindre/.test(message)) return new AppError('ENGINE_UNAVAILABLE', message)
  return new AppError('QUERY_FAILED', message)
}

async function ttlFor(core: Core, input: RunInput, prepared: Prepared): Promise<number | 'adaptive'> {
  if (input.cacheTtl !== undefined && input.cacheTtl !== null) return input.cacheTtl
  const ds = [...prepared.datasources]
  if (ds.length) {
    const rows = await core.db.many<{ ttl: number | null }>(`SELECT (options->>'cache_ttl')::int AS ttl FROM datasource WHERE id = ANY($1)`, [ds])
    const set = rows.map((r) => r.ttl).filter((x): x is number => x !== null)
    if (set.length) return Math.min(...set)
  }
  const setting = await core.db.one<{ value: { ttl?: number; adaptive?: boolean } }>(`SELECT value FROM instance_setting WHERE key = 'cache'`)
  if (setting?.value?.adaptive) return 'adaptive'
  return setting?.value?.ttl ?? core.config.defaultCacheTtl
}

async function logExecution(core: Core, actor: Actor, input: RunInput, sql: string, ms: number, rows: number | null, error: string | null, cached: boolean) {
  await core.db
    .exec(
      `INSERT INTO query_execution (user_id, origin, question_id, dashboard_id, sql, duration_ms, row_count, error, cached, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [actor.via === 'system' ? null : actor.userId, input.origin, input.questionId ?? null, input.dashboardId ?? null, sql, ms, rows, error, cached, actor.workspaceId || null],
    )
    .catch(() => undefined)
}

// ── Questions et cartes ─────────────────────────────────────────────────────

export async function runQuestion(
  core: Core,
  actor: Actor,
  id: string,
  opts: { parameters?: Record<string, ParameterValue | null>; constraints?: readonly Constraint[]; fresh?: boolean; origin?: Origin; dashboardId?: string; executionId?: string; limit?: number } = {},
): Promise<RunResult> {
  const q = await getQuestion(core, actor, id)
  return runQuery(core, actor, {
    query: q.query,
    origin: opts.origin ?? 'question',
    adhoc: false,
    questionId: id,
    ...(opts.parameters ? { parameters: opts.parameters } : {}),
    ...(opts.constraints ? { constraints: opts.constraints } : {}),
    ...(opts.fresh ? { fresh: true } : {}),
    ...(opts.dashboardId ? { dashboardId: opts.dashboardId } : {}),
    ...(opts.executionId ? { executionId: opts.executionId } : {}),
    ...(opts.limit ? { limit: opts.limit } : {}),
    cacheTtl: q.cache_ttl,
    // A model's column metadata, or a saved question's own (labels and formats of its SQL).
    columnsMeta: (q.columns_meta as RunInput['columnsMeta']) ?? null,
  })
}

/**
 * Runs a card of a dashboard with the filters' values: the filters it is tied to are read from
 * the dashboard itself — a caller never chooses what a card filters.
 */
export async function runCard(
  core: Core,
  actor: Actor,
  dashboardId: string,
  cardId: string,
  values: Readonly<Record<string, ParameterValue | null>>,
  opts: { fresh?: boolean; origin?: Origin; locked?: Readonly<Record<string, ParameterValue | null>> } = {},
): Promise<RunResult> {
  const d = await getDashboard(core, actor, dashboardId)
  const card = d.cards.find((c) => c.id === cardId)
  if (!card || card.kind !== 'question') throw new AppError('NOT_FOUND', 'Carte introuvable.')
  const merged = { ...values, ...(opts.locked ?? {}) }
  const constraints = cardConstraints(card.mappings, d.parameters, merged)
  const common = { origin: opts.origin ?? ('card' as const), dashboardId, constraints, ...(opts.fresh ? { fresh: true } : {}) }
  if (card.question) {
    const q = await getQuestion(core, actor, card.question)
    return runQuery(core, actor, {
      ...common,
      query: q.query,
      adhoc: false,
      questionId: q.id,
      cacheTtl: q.cache_ttl ?? d.cache_ttl,
      columnsMeta: (q.columns_meta as RunInput['columnsMeta']) ?? null,
    })
  }
  if (!card.query) throw new AppError('NOT_FOUND', 'Carte sans question.')
  return runQuery(core, actor, { ...common, query: card.query, adhoc: false, cacheTtl: d.cache_ttl })
}

/** Warms the cache of the dashboards marked « préchargés », as their author. */
export async function prewarmDashboards(core: Core): Promise<number> {
  const dashboards = await core.db.many<{
    id: string
    created_by: string
    workspace_id: string
    cards: { id: string; kind: string }[]
    parameters: { id: string; default?: ParameterValue | null }[]
  }>('SELECT id, created_by, workspace_id, cards, parameters FROM dashboard WHERE preload AND NOT archived AND created_by IS NOT NULL')
  let n = 0
  for (const d of dashboards) {
    // In the dashboard's space: its author's rights there, and its sources.
    const actor: Actor = { userId: d.created_by, workspaceId: d.workspace_id, via: 'system' }
    const values = Object.fromEntries(d.parameters.map((p) => [p.id, p.default ?? null]))
    for (const card of d.cards.filter((c) => c.kind === 'question')) {
      await runCard(core, actor, d.id, card.id, values, { origin: 'card', fresh: true }).then(() => n++).catch(() => undefined)
    }
  }
  return n
}
