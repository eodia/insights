import type { DatasourceOptions, SourceView, SourceViewInput, ViewImpact } from '@eodia/contracts'
import { audit } from '../audit'
import { type Actor, type Core, principalOf } from '../context'
import { isAdmin } from '../access/decide'
import { AppError, invalid, notFound } from '../errors'
import { enqueue } from '../jobs'
import { assertOwnSource, requestSync } from './datasources'

/**
 * The Trino views of a source: listed, saved from the SQL editor, removed — with what reads them.
 *
 * Trino stays read-only for people. A view is checked under the person's own name first — its
 * SELECT analysed with their rights, so they cannot store what they may not read —, then created
 * by the service, always `SECURITY INVOKER`: whoever reads it reads the tables beneath with their
 * own rights, their row filters and their masks. A view `SECURITY DEFINER` would read them with
 * its owner's, the service's: a way round every rule, which is never made here.
 */

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`

interface SourceRow {
  readonly id: string
  readonly catalog: string
  readonly options: DatasourceOptions | null
}

async function sourceOf(core: Core, actor: Actor, id: string): Promise<SourceRow> {
  await assertOwnSource(core, actor, id)
  const row = await core.db.one<SourceRow>('SELECT id, catalog, options FROM datasource WHERE id = $1', [id])
  if (!row) throw notFound('Source introuvable.')
  if (row.options?.internal) throw invalid('Un catalogue technique ne garde pas de vues : seule la source qui le cite en a.')
  return row
}

/** A schema the source shows: a view elsewhere would be made where no one sees it. */
function assertShownSchema(row: SourceRow, schema: string) {
  const chosen = row.options?.schemas
  if (schema.toLowerCase() === 'information_schema') throw invalid('Ce schéma est celui de Trino : choisissez-en un de la source.')
  if (chosen?.length && !chosen.some((s) => s.toLowerCase() === schema.toLowerCase())) {
    throw invalid(`Le schéma « ${schema} » n’est pas exposé par cette source.`)
  }
}

const viewKey = (schema: string, name: string) => `${schema}.${name}`.toLowerCase()

/** A Trino timestamp as text (`2026-11-03 19:47:22.347 UTC`) in ISO form; `null` when none. */
function instant(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const at = new Date(String(value).trim().replace(' ', 'T').replace(/ (UTC|Z)$/, 'Z'))
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

interface MaterializedRow {
  readonly schema: string
  readonly name: string
  readonly definition: string
  readonly freshness: string | null
  readonly fresh_at: string | null
}

/** The materialized views of a catalog, as Trino's metadata lists them — none for most connectors. */
async function materializedOf(core: Core, catalog: string): Promise<MaterializedRow[]> {
  try {
    const res = await core.engine.run(
      `SELECT schema_name, name, definition, freshness, CAST(last_fresh_time AS varchar) FROM system.metadata.materialized_views WHERE catalog_name = ${literal(catalog)}`,
      { timeoutMs: 60_000 },
    )
    const views = res.data.map((r) => ({
      schema: String(r[0]),
      name: String(r[1]),
      definition: String(r[2] ?? ''),
      freshness: r[3] == null ? null : String(r[3]),
      fresh_at: instant(r[4]),
    }))
    // Iceberg leaves `last_fresh_time` empty: the last snapshot of the view's storage says when.
    return Promise.all(
      views.map(async (v) => {
        if (v.fresh_at) return v
        const last = await core.engine
          .run(`SELECT CAST(max(committed_at) AS varchar) FROM ${quote(catalog)}.${quote(v.schema)}.${quote(`${v.name}$snapshots`)}`, { timeoutMs: 30_000 })
          .then((r) => instant(r.data[0]?.[0]))
          .catch(() => null)
        return { ...v, fresh_at: last }
      }),
    )
  } catch {
    return []
  }
}

/** The views of the source's catalog, in the schemas it shows — the materialized ones too. */
export async function listViews(core: Core, actor: Actor, id: string): Promise<SourceView[]> {
  const row = await sourceOf(core, actor, id)
  const [res, materialized] = await Promise.all([
    core.engine.run(`SELECT table_schema, table_name, view_definition FROM ${quote(row.catalog)}.information_schema.views ORDER BY 1, 2`, { timeoutMs: 60_000 }),
    materializedOf(core, row.catalog),
  ])
  const chosen = row.options?.schemas?.length ? new Set(row.options.schemas.map((s) => s.toLowerCase())) : null
  const tables = await core.db.many<{ id: string; schema_name: string; name: string }>(
    `SELECT id, schema_name, name FROM db_table WHERE datasource_id = $1 AND status = 'active'`,
    [id],
  )
  const tableOf = new Map(tables.map((t) => [viewKey(t.schema_name, t.name), t.id]))
  const refresh = row.options?.view_refresh ?? {}
  const mvs = new Map(materialized.map((m) => [viewKey(m.schema, m.name), m]))
  const plain = res.data
    .map((r) => ({ schema: String(r[0]), name: String(r[1]), definition: String(r[2] ?? '') }))
    // Trino may list a materialized view among the views too: it shows once, as what it is.
    .filter((v) => !mvs.has(viewKey(v.schema, v.name)))
    .map((v) => ({ ...v, materialized: false, fresh_at: null, freshness: null, refresh_hours: null }))
  const kept = materialized.map((m) => ({ ...m, materialized: true, refresh_hours: refresh[viewKey(m.schema, m.name)] ?? null }))
  return [...plain, ...kept]
    .filter((v) => v.schema.toLowerCase() !== 'information_schema' && (!chosen || chosen.has(v.schema.toLowerCase())))
    .map((v) => ({ ...v, table: tableOf.get(viewKey(v.schema, v.name)) ?? null }))
    .sort((a, b) => a.schema.localeCompare(b.schema) || a.name.localeCompare(b.name))
}

/** Keeps when a materialized view refreshes by itself — or forgets it, refreshed by hand. */
async function setRefresh(core: Core, id: string, schema: string, name: string, hours: number | null): Promise<void> {
  const row = await core.db.one<{ options: DatasourceOptions | null }>('SELECT options FROM datasource WHERE id = $1', [id])
  const next: Record<string, number> = { ...(row?.options?.view_refresh ?? {}) }
  if (hours) next[viewKey(schema, name)] = hours
  else delete next[viewKey(schema, name)]
  await core.db.exec(`UPDATE datasource SET options = jsonb_set(COALESCE(options, '{}'::jsonb), '{view_refresh}', $2::jsonb), updated_at = now() WHERE id = $1`, [id, JSON.stringify(next)])
}

/** A statement that only reads: a query, nothing that writes or runs a procedure. */
function assertQuery(sql: string): string {
  const body = sql.trim().replace(/;\s*$/, '')
  const bare = body.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, ' ').trim()
  if (!/^(select|with|values|table|\()/i.test(bare)) throw invalid('Une vue enregistre une requête : un SELECT (ou WITH …).')
  if (/\{\{|\[\[/.test(body)) throw invalid('Une vue ne garde pas de variables {{…}} : remplacez-les par des valeurs, ou filtrez sur la vue ensuite.')
  if (body.includes(';')) throw invalid('Une seule requête par vue.')
  return body
}

/**
 * Saves a view: its SELECT analysed under the person's identity — what they may not read, they
 * cannot store —, then created by the service, `SECURITY INVOKER`. The source is synchronised
 * again: the view becomes a table to describe, to query, to give rights on.
 */
export async function saveView(core: Core, actor: Actor, id: string, input: SourceViewInput): Promise<{ job: string }> {
  const row = await sourceOf(core, actor, id)
  assertShownSchema(row, input.schema)
  const body = assertQuery(input.sql)
  // A materialized view keeps a result computed once, by the service: its readers see that result
  // whatever their rights on the tables beneath. Only who sees every row may make one — and its
  // own access is then set on it, as on any table.
  if (input.materialized && !isAdmin(await core.snapshot(), principalOf(actor))) {
    throw new AppError('FORBIDDEN', 'Une vue matérialisée garde un résultat déjà calculé, que ses lecteurs voient quels que soient leurs droits : seul un administrateur de l’espace en crée.')
  }
  // Under the person's own name: every table and column read is checked by Trino's decision point.
  await core.engine.run(`EXPLAIN (TYPE VALIDATE) ${body}`, { user: principalOf(actor), timeoutMs: 60_000 })
  const target = `${quote(row.catalog)}.${quote(input.schema)}.${quote(input.name)}`
  const there = await core.engine.run(
    `SELECT 1 FROM ${quote(row.catalog)}.information_schema.tables WHERE table_schema = ${literal(input.schema)} AND table_name = ${literal(input.name.toLowerCase())}`,
    { timeoutMs: 60_000 },
  )
  if (there.data.length && !input.replace) throw new AppError('CONFLICT', `« ${input.schema}.${input.name} » existe déjà : remplacez-la, ou choisissez un autre nom.`)
  // A view become materialized, or the reverse, is removed first: Trino replaces only its own kind.
  if (there.data.length) {
    const wasMaterialized = (await materializedOf(core, row.catalog)).some((m) => viewKey(m.schema, m.name) === viewKey(input.schema, input.name))
    if (wasMaterialized !== !!input.materialized) await core.engine.run(`DROP ${wasMaterialized ? 'MATERIALIZED ' : ''}VIEW ${target}`, { timeoutMs: 120_000 })
  }
  try {
    if (input.materialized) await core.engine.run(`CREATE OR REPLACE MATERIALIZED VIEW ${target} AS\n${body}`, { timeoutMs: 120_000 })
    else await core.engine.run(`CREATE OR REPLACE VIEW ${target} SECURITY INVOKER AS\n${body}`, { timeoutMs: 120_000 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/not supported|does not support/i.test(message)) {
      throw invalid(
        input.materialized
          ? 'Ce catalogue ne sait pas garder de vues matérialisées : il faut un catalogue Iceberg sur un métastore Hive, Glue ou Nessie (ni REST, ni JDBC).'
          : 'Ce connecteur ne sait pas garder de vues (une base PostgreSQL ou MySQL branchée, par exemple) : choisissez une source Iceberg, Hive ou Delta.',
      )
    }
    throw err
  }
  await setRefresh(core, id, input.schema, input.name, input.materialized ? (input.refresh_hours ?? null) : null)
  await audit(core, actor, input.replace ? 'view.replace' : 'view.create', { kind: 'datasource', id }, { view: `${input.schema}.${input.name}`, materialized: !!input.materialized })
  // Its result is computed now, in the background: a heavy query is why it is materialized.
  if (input.materialized) await enqueue(core, 'refresh_view', { datasource: id, schema: input.schema, name: input.name }, { dedupe: `refresh_view:${id}:${viewKey(input.schema, input.name)}`, createdBy: actor.userId })
  return { job: await requestSync(core, id, actor.userId) }
}

/** Computes a materialized view's result again — now, in the background. */
export async function refreshView(core: Core, actor: Actor, id: string, schema: string, name: string): Promise<{ job: string }> {
  const row = await sourceOf(core, actor, id)
  if (!(await materializedOf(core, row.catalog)).some((m) => viewKey(m.schema, m.name) === viewKey(schema, name))) throw notFound('Vue matérialisée introuvable.')
  await audit(core, actor, 'view.refresh', { kind: 'datasource', id }, { view: `${schema}.${name}` })
  return { job: await enqueue(core, 'refresh_view', { datasource: id, schema, name }, { dedupe: `refresh_view:${id}:${viewKey(schema, name)}`, createdBy: actor.userId }) }
}

/** Every so many hours, or by hand: when a materialized view computes its result again. */
export async function setViewRefresh(core: Core, actor: Actor, id: string, schema: string, name: string, hours: number | null): Promise<void> {
  const row = await sourceOf(core, actor, id)
  if (!(await materializedOf(core, row.catalog)).some((m) => viewKey(m.schema, m.name) === viewKey(schema, name))) throw notFound('Vue matérialisée introuvable.')
  await setRefresh(core, id, schema, name, hours)
  await audit(core, actor, 'view.refresh_schedule', { kind: 'datasource', id }, { view: `${schema}.${name}`, hours })
}

/** The job: `REFRESH MATERIALIZED VIEW`, by the service — up to an hour for a heavy one. */
export async function refreshViewJob(core: Core, payload: Record<string, unknown>): Promise<{ refreshed: string }> {
  const id = String(payload.datasource)
  const row = await core.db.one<{ catalog: string }>('SELECT catalog FROM datasource WHERE id = $1', [id])
  if (!row) throw notFound('Source introuvable.')
  const view = `${quote(row.catalog)}.${quote(String(payload.schema))}.${quote(String(payload.name))}`
  await core.engine.run(`REFRESH MATERIALIZED VIEW ${view}`, { timeoutMs: 3_600_000 })
  return { refreshed: `${payload.schema}.${payload.name}` }
}

/** What the worker checks now and then: the materialized views whose time to refresh has come. */
export async function refreshDueViews(core: Core): Promise<void> {
  const sources = await core.db.many<{ id: string; catalog: string; view_refresh: Record<string, number> }>(
    `SELECT id, catalog, options->'view_refresh' AS view_refresh FROM datasource WHERE options->'view_refresh' IS NOT NULL AND options->'view_refresh' <> '{}'::jsonb`,
  )
  for (const s of sources) {
    const views = await materializedOf(core, s.catalog)
    for (const v of views) {
      const hours = s.view_refresh[viewKey(v.schema, v.name)]
      if (!hours) continue
      const age = v.fresh_at ? Date.now() - Date.parse(v.fresh_at) : Number.POSITIVE_INFINITY
      if (age < hours * 3_600_000) continue
      await enqueue(core, 'refresh_view', { datasource: s.id, schema: v.schema, name: v.name }, { dedupe: `refresh_view:${s.id}:${viewKey(v.schema, v.name)}` })
    }
  }
}

/**
 * What reads a view: the questions built on its table (as source, joined, or a metric's), the SQL
 * that cites it, the dashboards showing either — those of the person's space by name, the
 * others counted.
 */
export async function viewImpact(core: Core, actor: Actor, id: string, schema: string, name: string): Promise<ViewImpact> {
  const row = await sourceOf(core, actor, id)
  const table = await core.db.one<{ id: string }>(
    `SELECT id FROM db_table WHERE datasource_id = $1 AND lower(schema_name) = lower($2) AND lower(name) = lower($3)`,
    [id, schema, name],
  )
  // `catalogue.schéma.vue`, quoted or not, as SQL may cite it.
  const part = (p: string) => `"?${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?`
  const cited = [row.catalog, schema, name].map(part).join('\\s*\\.\\s*')
  const questions = await core.db.many<{ id: string; name: string; type: string; workspace_id: string }>(
    `SELECT id, name, type, workspace_id FROM question
      WHERE NOT archived AND (($1::text IS NOT NULL AND query::text LIKE '%' || $1 || '%') OR (kind <> 'builder' AND query->>'sql' ~* $2))
      ORDER BY name`,
    [table?.id ?? null, cited],
  )
  const ids = questions.map((q) => q.id)
  const dashboards = await core.db.many<{ id: string; name: string; workspace_id: string }>(
    `SELECT id, name, workspace_id FROM dashboard
      WHERE NOT archived AND (
        EXISTS (SELECT 1 FROM jsonb_array_elements(cards) c WHERE c->>'question' = ANY($1::text[]))
        OR ($2::text IS NOT NULL AND cards::text LIKE '%' || $2 || '%')
        OR cards::text ~* $3
      )
      ORDER BY name`,
    [ids, table?.id ?? null, cited],
  )
  const mine = <T extends { workspace_id: string }>(list: T[]) => list.filter((x) => x.workspace_id === actor.workspaceId)
  return {
    questions: mine(questions).map((q) => ({ id: q.id, name: q.name, type: q.type })),
    dashboards: mine(dashboards).map((d) => ({ id: d.id, name: d.name })),
    elsewhere: questions.length + dashboards.length - mine(questions).length - mine(dashboards).length,
  }
}

/** Removes a view from the catalog; its table leaves insights at the sync that follows. */
export async function dropView(core: Core, actor: Actor, id: string, schema: string, name: string): Promise<{ job: string }> {
  const row = await sourceOf(core, actor, id)
  assertShownSchema(row, schema)
  const materialized = (await materializedOf(core, row.catalog)).some((m) => viewKey(m.schema, m.name) === viewKey(schema, name))
  if (!materialized) {
    const views = await core.engine.run(
      `SELECT 1 FROM ${quote(row.catalog)}.information_schema.views WHERE table_schema = ${literal(schema)} AND table_name = ${literal(name)}`,
      { timeoutMs: 60_000 },
    )
    if (!views.data.length) throw notFound('Vue introuvable.')
  }
  await core.engine.run(`DROP ${materialized ? 'MATERIALIZED ' : ''}VIEW ${quote(row.catalog)}.${quote(schema)}.${quote(name)}`, { timeoutMs: 120_000 })
  await setRefresh(core, id, schema, name, null)
  await audit(core, actor, 'view.drop', { kind: 'datasource', id }, { view: `${schema}.${name}` })
  return { job: await requestSync(core, id, actor.userId) }
}
