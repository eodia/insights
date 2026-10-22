/**
 * Sources : une connexion chiffrée en catalogue, un catalogue Trino créé à chaud.
 * L'application est la source de vérité ; Trino reste sans état.
 */
import {
  type Datasource,
  type DatasourceInput,
  type DatasourceOptions,
  type SourceDependency,
  type SourceSchema,
  ENGINE_SPECS,
  type Engine,
  fieldApplies,
  sourceSchemas,
} from '@eodia/contracts'
import { type Settings, isSystemSchema, testConnection } from '@eodia/drivers'
import { type CatalogDefinition, catalogNameFor, connectorOf } from '@eodia/engine'
import { refusedIdentities } from '../access/opa'
import { audit } from '../audit'
import { type Actor, type Core, principalOf } from '../context'
import { decrypt, encrypt } from '../crypto'
import type pg from 'pg'
import { AppError, invalid, notFound } from '../errors'
import { enqueue, stopJob } from '../jobs'
import { cacheClear } from '../query/cache'
import { notHere } from '../workspaces'

interface DatasourceRow {
  id: string
  name: string
  engine: Engine
  catalog: string
  description: string | null
  config: Record<string, string | number | boolean>
  secret: Buffer | null
  secret_keys: string[]
  options: DatasourceOptions
  schedule: 'hourly' | 'daily' | 'manual'
  sync_status: Datasource['sync']['status']
  sync_error: string | null
  last_sync_at: Date | null
  created_at: Date
  schemas: number
  tables: number
  columns: number
  workspace_id: string
  workspace_name: string
  shared_with: { id: string; name: string }[]
}

const SELECT = `
  SELECT d.*, w.name AS workspace_name,
    (SELECT count(*) FROM db_schema s WHERE s.datasource_id = d.id AND s.status = 'active')::int AS schemas,
    (SELECT count(*) FROM db_table t WHERE t.datasource_id = d.id AND t.status = 'active')::int AS tables,
    (SELECT count(*) FROM db_column c JOIN db_table t ON t.id = c.table_id WHERE t.datasource_id = d.id AND c.status = 'active')::int AS columns,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('id', sw.id, 'name', sw.name) ORDER BY sw.name), '[]'::jsonb)
       FROM datasource_share sh JOIN workspace sw ON sw.id = sh.workspace_id WHERE sh.datasource_id = d.id) AS shared_with
  FROM datasource d JOIN workspace w ON w.id = d.workspace_id`

/** The sources a space reads: its own, and those shared with it. */
const IN_SPACE = `(d.workspace_id = $1 OR EXISTS (SELECT 1 FROM datasource_share sh WHERE sh.datasource_id = d.id AND sh.workspace_id = $1))`
/** A source shown as one: not a technical catalog. */
const SHOWN = `NOT COALESCE((d.options->>'internal')::boolean, false)`

/** A source as a space sees it: managed there if it is its own, read only if shared with it. */
function toDto(r: DatasourceRow, workspaceId: string): Datasource {
  const own = r.workspace_id === workspaceId
  return {
    id: r.id,
    name: r.name,
    engine: r.engine,
    catalog: r.catalog,
    description: r.description,
    config: r.config,
    secrets: r.secret_keys,
    // Kept to some databases, a source takes no native SQL (`nativeAllowed`), whatever was saved.
    options: sourceSchemas(r.engine, r.config) ? { ...r.options, native_sql: false } : r.options,
    sync: {
      schedule: r.schedule,
      status: r.sync_status,
      last_at: r.last_sync_at?.toISOString() ?? null,
      error: r.sync_error,
    },
    stats: { schemas: r.schemas, tables: r.tables, columns: r.columns },
    created_at: r.created_at.toISOString(),
    workspace: { id: r.workspace_id, name: r.workspace_name },
    shared: !own,
    shared_with: own ? r.shared_with : [],
  }
}

/** The sources of the actor's space, and those shared with it. */
export async function listDatasources(core: Core, actor: Actor): Promise<Datasource[]> {
  return (await core.db.many<DatasourceRow>(`${SELECT} WHERE ${IN_SPACE} AND ${SHOWN} ORDER BY d.name`, [actor.workspaceId])).map((r) => toDto(r, actor.workspaceId))
}

export async function getDatasource(core: Core, actor: Actor, id: string): Promise<Datasource> {
  const row = await core.db.one<DatasourceRow>(`${SELECT} WHERE d.id = $2 AND ${IN_SPACE}`, [actor.workspaceId, id])
  if (!row) throw await notHere(core, actor, 'datasource', id, 'Source introuvable.')
  return toDto(row, actor.workspaceId)
}

/**
 * Throws unless the source is the actor's space's own: its connection, its sync, its metadata
 * and its shares are managed there — a space it is shared with only reads it.
 */
export async function assertOwnSource(core: Core, actor: Actor, id: string): Promise<void> {
  const row = await core.db.one<{ workspace_id: string; name: string }>(
    'SELECT d.workspace_id, w.name FROM datasource d JOIN workspace w ON w.id = d.workspace_id WHERE d.id = $1',
    [id],
  )
  if (!row) throw notFound('Source introuvable.')
  if (row.workspace_id === actor.workspaceId) return
  const shared = await core.db.one('SELECT 1 FROM datasource_share WHERE datasource_id = $1 AND workspace_id = $2', [id, actor.workspaceId])
  if (!shared) throw await notHere(core, actor, 'datasource', id, 'Source introuvable.')
  throw new AppError('FORBIDDEN', `Cette source est partagée par l’espace « ${row.name} » : elle se gère là-bas.`)
}

/** Splits a submitted configuration into what is stored in clear and what is encrypted. */
function splitConfig(engine: Engine, config: DatasourceInput['config']) {
  const spec = ENGINE_SPECS[engine]
  const plain: Record<string, string | number | boolean> = {}
  const secrets: Record<string, string> = {}
  for (const field of spec.fields) {
    const v = config[field.key]
    if (v === undefined || v === '' || !fieldApplies(field, config)) continue
    if (field.secret) secrets[field.key] = String(v)
    else plain[field.key] = field.type === 'number' ? Number(v) : field.type === 'boolean' ? v === true || v === 'true' : v
  }
  return { plain, secrets }
}

function checkRequired(engine: Engine, settings: Settings): void {
  for (const field of ENGINE_SPECS[engine].fields) {
    const v = settings[field.key]
    if (field.required && fieldApplies(field, settings) && (v === undefined || v === '')) throw invalid(`Le champ « ${field.label} » est obligatoire.`)
  }
}

async function settingsOf(core: Core, id: string): Promise<{ row: DatasourceRow; settings: Settings }> {
  const row = await core.db.one<DatasourceRow>(`${SELECT} WHERE d.id = $1`, [id])
  if (!row) throw notFound('Source introuvable.')
  const secrets = row.secret ? (JSON.parse(decrypt(core.config.secretKey, row.secret)) as Record<string, string>) : {}
  return { row, settings: { ...row.config, ...secrets } }
}

export async function datasourceSettings(core: Core, id: string): Promise<Settings> {
  return (await settingsOf(core, id)).settings
}

export function catalogDefinition(row: Pick<DatasourceRow, 'catalog' | 'engine' | 'options'>, settings: Settings): CatalogDefinition {
  return {
    catalog: row.catalog,
    engine: row.engine,
    settings,
    ...(row.options?.trino_properties ? { extra: row.options.trino_properties } : {}),
  }
}

/** Trino's refusal of a catalog, saying what to fix when its message tells. */
function catalogRefused(def: CatalogDefinition, err: unknown): AppError {
  const reason = err instanceof Error ? err.message : String(err)
  const unused = /Configuration property '([^']+)' was not used/.exec(reason)?.[1]
  if (unused) {
    return new AppError('CONNECTION_FAILED', `Le connecteur « ${connectorOf(def)} » ne connaît pas la propriété « ${unused} » : vérifiez le connecteur, ou retirez-la.`)
  }
  const missing = /Invalid configuration property ([\w.-]+): must not be null/.exec(reason)?.[1]
  if (missing) return new AppError('CONNECTION_FAILED', `Le connecteur « ${connectorOf(def)} » exige la propriété « ${missing} ».`)
  return new AppError('CONNECTION_FAILED', `Trino refuse le catalogue : ${reason}`)
}

/** Tests the connection with the native driver (and, through Trino, the catalog). */
export async function testDatasource(core: Core, actor: Actor, input: DatasourceInput, existingId?: string) {
  let settings: Settings = { ...input.config }
  if (existingId) {
    // Its saved secrets are tried only from its own space.
    await assertOwnSource(core, actor, existingId)
    const { settings: saved } = await settingsOf(core, existingId)
    // Secrets left blank in the form keep their saved value.
    settings = { ...saved, ...Object.fromEntries(Object.entries(input.config).filter(([, v]) => v !== '')) }
  }
  checkRequired(input.engine, settings)
  const native = await testConnection(input.engine, settings)
  return native
}

export async function createDatasource(core: Core, actor: Actor, input: DatasourceInput): Promise<Datasource> {
  const { plain, secrets } = splitConfig(input.engine, input.config)
  checkRequired(input.engine, { ...plain, ...secrets })
  const native = await testConnection(input.engine, { ...plain, ...secrets })
  if (!native.ok) throw new AppError('CONNECTION_FAILED', `Connexion impossible : ${native.error}`)

  const taken = new Set((await core.db.many<{ catalog: string }>('SELECT catalog FROM datasource')).map((r) => r.catalog))
  const catalog = input.catalog ?? catalogNameFor(input.name, taken)
  if (taken.has(catalog)) throw new AppError('CONFLICT', `Le catalogue « ${catalog} » existe déjà.`)
  const options: DatasourceOptions = { native_sql: true, ...(input.options ?? {}) }

  // The catalog first: a source Trino cannot open is not saved.
  const def = catalogDefinition({ catalog, engine: input.engine, options }, { ...plain, ...secrets })
  try {
    await core.engine.putCatalog(def)
  } catch (err) {
    throw catalogRefused(def, err)
  }

  const id = await core.db.tx(async (c) => {
    const row = await core.db.one<{ id: string }>(
      `INSERT INTO datasource (name, engine, catalog, description, config, secret, secret_keys, options, schedule, created_by, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        input.name.trim(),
        input.engine,
        catalog,
        input.description ?? null,
        plain,
        Object.keys(secrets).length ? encrypt(core.config.secretKey, JSON.stringify(secrets)) : null,
        Object.keys(secrets),
        options,
        input.schedule ?? 'hourly',
        actor.userId,
        actor.workspaceId,
      ],
      c,
    )
    const dsId = row?.id as string
    await openToSpace(core, dsId, actor.workspaceId, c)
    return dsId
  })
  core.changed()
  await audit(core, actor, 'datasource.create', { kind: 'datasource', id }, { engine: input.engine, catalog })
  // A technical catalog has no structure to show: it is not synchronised.
  if (!options.internal) await requestSync(core, id, actor.userId)
  return getDatasource(core, actor, id)
}

/**
 * Every member of the space reads a source it gains and may write SQL on it, as in Metabase;
 * narrowed in Permissions.
 */
async function openToSpace(core: Core, datasource: string, workspace: string, c: pg.PoolClient): Promise<void> {
  await core.db.exec(
    `INSERT INTO data_permission (group_id, datasource_id, access) SELECT id, $1, 'read' FROM user_group WHERE kind = 'all' AND workspace_id = $2
     ON CONFLICT DO NOTHING`,
    [datasource, workspace],
    c,
  )
  await core.db.exec(
    `INSERT INTO query_permission (group_id, datasource_id, level) SELECT id, $1, 'sql' FROM user_group WHERE kind = 'all' AND workspace_id = $2
     ON CONFLICT DO NOTHING`,
    [datasource, workspace],
    c,
  )
}

/**
 * The spaces a source is shared with, read only — set whole by its own space. A space that
 * gains it opens it to its members (Permissions narrow it there); one that loses it loses every
 * right its groups had on it.
 */
export async function shareDatasource(core: Core, actor: Actor, id: string, workspaces: readonly string[]): Promise<Datasource> {
  const row = await core.db.one<{ workspace_id: string }>('SELECT workspace_id FROM datasource WHERE id = $1', [id])
  if (!row || row.workspace_id !== actor.workspaceId) throw await notHere(core, actor, 'datasource', id, 'Source introuvable.')
  const wanted = [...new Set(workspaces)].filter((w) => w !== row.workspace_id)
  const known = await core.db.many<{ id: string }>('SELECT id FROM workspace WHERE id = ANY($1) AND NOT archived', [wanted])
  if (known.length !== wanted.length) throw notFound('Espace introuvable.')
  await core.db.tx(async (c) => {
    const before = (await core.db.many<{ workspace_id: string }>('SELECT workspace_id FROM datasource_share WHERE datasource_id = $1', [id], c)).map(
      (r) => r.workspace_id,
    )
    for (const w of before.filter((w) => !wanted.includes(w))) {
      await core.db.exec('DELETE FROM datasource_share WHERE datasource_id = $1 AND workspace_id = $2', [id, w], c)
      const groups = 'SELECT id FROM user_group WHERE workspace_id = $2'
      await core.db.exec(`DELETE FROM data_permission WHERE datasource_id = $1 AND group_id IN (${groups})`, [id, w], c)
      await core.db.exec(`DELETE FROM query_permission WHERE datasource_id = $1 AND group_id IN (${groups})`, [id, w], c)
      await core.db.exec(
        `DELETE FROM row_policy WHERE table_id IN (SELECT id FROM db_table WHERE datasource_id = $1) AND group_id IN (${groups})`,
        [id, w],
        c,
      )
      await core.db.exec(
        `DELETE FROM column_permission WHERE column_id IN (SELECT c.id FROM db_column c JOIN db_table t ON t.id = c.table_id WHERE t.datasource_id = $1)
           AND group_id IN (${groups})`,
        [id, w],
        c,
      )
    }
    for (const w of wanted.filter((w) => !before.includes(w))) {
      await core.db.exec('INSERT INTO datasource_share (datasource_id, workspace_id, created_by) VALUES ($1, $2, $3)', [id, w, actor.userId], c)
      await openToSpace(core, id, w, c)
    }
  })
  core.changed()
  // A space that lost the source must not read it from the cache either.
  await cacheClear(core)
  await audit(core, actor, 'datasource.share', { kind: 'datasource', id }, { workspaces: wanted })
  return getDatasource(core, actor, id)
}

export async function updateDatasource(core: Core, actor: Actor, id: string, input: DatasourceInput): Promise<Datasource> {
  await assertOwnSource(core, actor, id)
  const { row, settings: saved } = await settingsOf(core, id)
  if (input.engine !== row.engine) throw invalid("Le moteur d'une source ne change pas : créez-en une autre.")
  const { plain, secrets } = splitConfig(input.engine, input.config)
  const savedSecrets = Object.fromEntries(row.secret_keys.map((k) => [k, String(saved[k] ?? '')]))
  const allSecrets = { ...savedSecrets, ...secrets }
  const settings = { ...plain, ...allSecrets }
  checkRequired(input.engine, settings)
  const native = await testConnection(input.engine, settings)
  if (!native.ok) throw new AppError('CONNECTION_FAILED', `Connexion impossible : ${native.error}`)
  const options: DatasourceOptions = { ...row.options, ...(input.options ?? {}) }
  const def = catalogDefinition({ catalog: row.catalog, engine: row.engine, options }, settings)
  try {
    await core.engine.putCatalog(def)
  } catch (err) {
    // `putCatalog` dropped the catalog before Trino refused the new one: the saved one comes back.
    await core.engine.putCatalog(catalogDefinition(row, saved)).catch(() => undefined)
    throw catalogRefused(def, err)
  }
  await core.db.exec(
    `UPDATE datasource SET name = $2, description = $3, config = $4, secret = $5, secret_keys = $6, options = $7,
       schedule = $8, updated_at = now() WHERE id = $1`,
    [
      id,
      input.name.trim(),
      input.description ?? null,
      plain,
      Object.keys(allSecrets).length ? encrypt(core.config.secretKey, JSON.stringify(allSecrets)) : null,
      Object.keys(allSecrets),
      options,
      input.schedule ?? row.schedule,
    ],
  )
  core.changed()
  await audit(core, actor, 'datasource.update', { kind: 'datasource', id })
  return getDatasource(core, actor, id)
}

export async function deleteDatasource(core: Core, actor: Actor, id: string): Promise<void> {
  await assertOwnSource(core, actor, id)
  const { row } = await settingsOf(core, id)
  await core.db.exec('DELETE FROM datasource WHERE id = $1', [id])
  // Trino can take a while to unload a catalog: the person does not wait for it.
  void core.engine.dropCatalog(row.catalog).catch(() => undefined)
  // No source cites it any more; its technical catalogs no other source uses go with it.
  await unlinkEverywhere(core, id)
  for (const dep of row.options?.dependencies ?? []) {
    if (!(await dependents(core, dep)).length) {
      const gone = await core.db.one<{ catalog: string }>(`DELETE FROM datasource WHERE id = $1 AND COALESCE((options->>'internal')::boolean, false) RETURNING catalog`, [dep])
      if (gone) void core.engine.dropCatalog(gone.catalog).catch(() => undefined)
    }
  }
  core.changed()
  await audit(core, actor, 'datasource.delete', { kind: 'datasource', id }, { name: row.name })
}

// ── Catalogues techniques ───────────────────────────────────────────────────

/** The sources that cite `dep` among their technical catalogs. */
async function dependents(core: Core, dep: string): Promise<{ id: string; name: string }[]> {
  return core.db.many<{ id: string; name: string }>(`SELECT id, name FROM datasource WHERE options->'dependencies' ? $1 ORDER BY name`, [dep])
}

async function unlinkEverywhere(core: Core, dep: string): Promise<void> {
  await core.db.exec(`UPDATE datasource SET options = jsonb_set(options, '{dependencies}', (options->'dependencies') - $1) WHERE options->'dependencies' ? $1`, [dep])
}

async function setLinks(core: Core, mainId: string, ids: readonly string[]): Promise<void> {
  await core.db.exec(`UPDATE datasource SET options = jsonb_set(options, '{dependencies}', $2::jsonb), updated_at = now() WHERE id = $1`, [mainId, JSON.stringify([...new Set(ids)])])
}

/** A source shown as one, of the actor's space: what technical catalogs hang from. */
async function mainSource(core: Core, actor: Actor, id: string): Promise<DatasourceRow> {
  await assertOwnSource(core, actor, id)
  const { row } = await settingsOf(core, id)
  if (row.options?.internal) throw invalid('Un catalogue technique ne dépend pas d’un autre : choisissez la source qui le cite.')
  return row
}

/**
 * The technical catalogs a source depends on, and the space's others, free to attach: shared
 * catalogs are declared once and cited by several sources.
 */
export async function listDependencies(core: Core, actor: Actor, mainId: string): Promise<{ dependencies: SourceDependency[]; available: SourceDependency[] }> {
  const main = await mainSource(core, actor, mainId)
  const linked = new Set(main.options?.dependencies ?? [])
  const rows = await core.db.many<{ id: string; name: string; catalog: string; engine: Engine }>(
    `SELECT id, name, catalog, engine FROM datasource WHERE workspace_id = $1 AND COALESCE((options->>'internal')::boolean, false) ORDER BY name`,
    [actor.workspaceId],
  )
  const out = await Promise.all(
    rows.map(async (r) => ({ ...r, shared_with: (await dependents(core, r.id)).filter((d) => d.id !== mainId).map((d) => d.name) })),
  )
  return { dependencies: out.filter((d) => linked.has(d.id)), available: out.filter((d) => !linked.has(d.id)) }
}

/** The technical catalogs a source cites: those detached and cited by no other source are deleted. */
export async function setDependencies(core: Core, actor: Actor, mainId: string, ids: readonly string[]): Promise<void> {
  const main = await mainSource(core, actor, mainId)
  const ok = await core.db.many<{ id: string }>(
    `SELECT id FROM datasource WHERE id = ANY($1) AND workspace_id = $2 AND COALESCE((options->>'internal')::boolean, false)`,
    [[...ids], actor.workspaceId],
  )
  if (ok.length !== new Set(ids).size) throw invalid('Seul un catalogue technique de cet espace peut être cité.')
  await setLinks(core, mainId, ids)
  for (const dropped of (main.options?.dependencies ?? []).filter((d) => !ids.includes(d))) {
    if (!(await dependents(core, dropped)).length) await deleteDatasource(core, actor, dropped)
  }
  core.changed()
  await audit(core, actor, 'datasource.dependencies', { kind: 'datasource', id: mainId }, { ids })
}

/** A new technical catalog, cited by `mainId`: created in Trino, never synchronised. */
export async function createDependency(core: Core, actor: Actor, mainId: string, input: DatasourceInput): Promise<Datasource> {
  const main = await mainSource(core, actor, mainId)
  if (!input.catalog) throw invalid('Nommez le catalogue comme les vues le citent.')
  // `internal` is not an input a request may set: only here is a source made technical.
  const options = { ...(input.options ?? {}), native_sql: false, internal: true } as DatasourceInput['options']
  const ds = await createDatasource(core, actor, { ...input, schedule: 'manual', ...(options ? { options } : {}) })
  await setLinks(core, mainId, [...(main.options?.dependencies ?? []), ds.id])
  core.changed()
  return ds
}

/**
 * A source becomes a technical catalog of `mainId` — a catalog of raw tables added as a source
 * to make views work: it leaves the lists, its structure is no longer synchronised, and no one
 * reads it directly any more.
 */
export async function makeDependency(core: Core, actor: Actor, id: string, mainId: string): Promise<void> {
  if (id === mainId) throw invalid('Une source ne dépend pas d’elle-même.')
  const main = await mainSource(core, actor, mainId)
  await assertOwnSource(core, actor, id)
  const { row } = await settingsOf(core, id)
  if (row.options?.dependencies?.length) throw invalid('Cette source cite elle-même des catalogues techniques : elle reste une source.')
  const options: DatasourceOptions = { ...row.options, internal: true, native_sql: false }
  await core.db.exec(`UPDATE datasource SET options = $2, schedule = 'manual', updated_at = now() WHERE id = $1`, [id, options])
  await setLinks(core, mainId, [...(main.options?.dependencies ?? []), id])
  // The owners it allowed go on the source citing it: they read it, and that source's catalog.
  const owners = [...new Set([...(main.options?.view_owners ?? []), ...(row.options?.view_owners ?? [])])]
  if (owners.length !== (main.options?.view_owners ?? []).length) {
    await core.db.exec(`UPDATE datasource SET options = jsonb_set(options, '{view_owners}', $2::jsonb) WHERE id = $1`, [mainId, JSON.stringify(owners)])
  }
  core.changed()
  await audit(core, actor, 'datasource.internal', { kind: 'datasource', id }, { main: mainId })
}

/** A technical catalog shown as a source again: no source cites it any more, it is synchronised. */
export async function makeVisible(core: Core, actor: Actor, id: string): Promise<void> {
  await assertOwnSource(core, actor, id)
  const { row } = await settingsOf(core, id)
  const { internal: _internal, ...options } = row.options ?? {}
  await core.db.exec(`UPDATE datasource SET options = $2, schedule = 'daily', updated_at = now() WHERE id = $1`, [id, options])
  await unlinkEverywhere(core, id)
  core.changed()
  await audit(core, actor, 'datasource.visible', { kind: 'datasource', id })
  await requestSync(core, id, actor.userId)
}

export async function requestSync(core: Core, id: string, userId: string | null, passes: readonly string[] = ['schema', 'fingerprint', 'values']): Promise<string> {
  const internal = await core.db.one(`SELECT 1 FROM datasource WHERE id = $1 AND COALESCE((options->>'internal')::boolean, false)`, [id])
  if (internal) throw invalid('Un catalogue technique ne se synchronise pas : seule la source qui le cite est explorée.')
  await core.db.exec(`UPDATE datasource SET sync_status = 'queued' WHERE id = $1 AND sync_status <> 'running'`, [id])
  return enqueue(core, 'sync', { datasource: id, passes }, { dedupe: `sync:${id}`, createdBy: userId })
}

/**
 * The schemas of a source as Trino lists them under the administrator's own rights: which are
 * shown, how they are named, how many tables each brought.
 */
export async function listSourceSchemas(core: Core, actor: Actor, id: string): Promise<SourceSchema[]> {
  await assertOwnSource(core, actor, id)
  const { row } = await settingsOf(core, id)
  const res = await core.engine.run(`SHOW SCHEMAS FROM "${row.catalog.replace(/"/g, '""')}"`, { user: principalOf(actor), timeoutMs: 60_000 })
  const counts = new Map(
    (await core.db.many<{ schema_name: string; n: number }>(`SELECT schema_name, count(*)::int AS n FROM db_table WHERE datasource_id = $1 AND status = 'active' GROUP BY 1`, [id])).map((r) => [
      r.schema_name.toLowerCase(),
      r.n,
    ]),
  )
  const chosen = row.options?.schemas?.length ? new Set(row.options.schemas.map((s) => s.toLowerCase())) : null
  const labels = row.options?.schema_labels ?? {}
  return res.data
    .map((r) => String(r[0]))
    .filter((name) => name.toLowerCase() !== 'information_schema')
    .map((name) => {
      const system = isSystemSchema(row.engine, name)
      return {
        name,
        system,
        shown: !system && (!chosen || chosen.has(name.toLowerCase())),
        label: labels[name] ?? null,
        tables: counts.get(name.toLowerCase()) ?? 0,
      }
    })
    .sort((a, b) => Number(a.system) - Number(b.system) || a.name.localeCompare(b.name))
}

/**
 * Keeps a source to some schemas, and names them: the next sync leaves the others out. Every
 * schema chosen is every schema: then none is singled out.
 */
export async function setSourceSchemas(core: Core, actor: Actor, id: string, input: { schemas: readonly string[]; labels: Readonly<Record<string, string>> }): Promise<string> {
  const all = await listSourceSchemas(core, actor, id)
  const open = all.filter((s) => !s.system).map((s) => s.name)
  const wanted = new Set(input.schemas.map((s) => s.toLowerCase()))
  const schemas = open.filter((s) => wanted.has(s.toLowerCase()))
  if (schemas.length === 0) throw invalid('Gardez au moins un schéma.')
  const labels = Object.fromEntries(Object.entries(input.labels).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v))
  const { row } = await settingsOf(core, id)
  const options: DatasourceOptions = { ...row.options, schemas: schemas.length === open.length ? [] : schemas, schema_labels: labels }
  await core.db.exec('UPDATE datasource SET options = $2, updated_at = now() WHERE id = $1', [id, options])
  core.changed()
  await audit(core, actor, 'datasource.schemas', { kind: 'datasource', id }, { schemas: options.schemas })
  // The schemas left out go now, those added come in: the structure follows at once.
  return requestSync(core, id, actor.userId, ['schema'])
}

/**
 * The owners of views allowed to read the source's catalog, and the identities Trino asked about
 * on it lately and was refused — the owner of a view made elsewhere, to allow in one click.
 */
export async function viewOwnersOf(core: Core, actor: Actor, id: string): Promise<{ owners: string[]; refused: { user: string; at: string }[] }> {
  await assertOwnSource(core, actor, id)
  const { row } = await settingsOf(core, id)
  const owners = [...(row.options?.view_owners ?? [])]
  // Its technical catalogs are read under its owners' names too: their refusals show here.
  const deps = await core.db.many<{ catalog: string }>('SELECT catalog FROM datasource WHERE id = ANY($1)', [[...(row.options?.dependencies ?? [])]])
  const seen = new Map<string, string>()
  for (const catalog of [row.catalog, ...deps.map((d) => d.catalog)]) {
    for (const r of refusedIdentities(catalog)) if (!owners.includes(r.user) && (seen.get(r.user) ?? '') < r.at) seen.set(r.user, r.at)
  }
  return { owners, refused: [...seen.entries()].map(([user, at]) => ({ user, at })) }
}

export async function setViewOwners(core: Core, actor: Actor, id: string, owners: readonly string[]): Promise<void> {
  await assertOwnSource(core, actor, id)
  const { row } = await settingsOf(core, id)
  const clean = [...new Set(owners.map((o) => o.trim()).filter(Boolean))]
  const options: DatasourceOptions = { ...row.options, view_owners: clean }
  await core.db.exec('UPDATE datasource SET options = $2, updated_at = now() WHERE id = $1', [id, options])
  core.changed()
  await audit(core, actor, 'datasource.view_owners', { kind: 'datasource', id }, { owners: clean })
}

/**
 * Stops the source's sync, queued or running — stuck on a huge table, say: its Trino queries are
 * cancelled, and the source is free to be synchronised again by hand. A status left « running »
 * by a process that died is released the same way.
 */
export async function stopSync(core: Core, actor: Actor, id: string): Promise<void> {
  await assertOwnSource(core, actor, id)
  const job = await core.db.one<{ id: string }>(`SELECT id::text FROM job WHERE dedupe_key = $1 AND status IN ('queued', 'running')`, [`sync:${id}`])
  const who = await core.db.one<{ name: string }>('SELECT name FROM app_user WHERE id = $1', [actor.userId])
  const reason = `Synchronisation arrêtée par ${who?.name ?? 'un administrateur'}.`
  if (job) await stopJob(core, job.id, reason)
  await core.db.exec(`UPDATE datasource SET sync_status = 'failed', sync_error = $2 WHERE id = $1 AND sync_status IN ('queued', 'running')`, [id, reason])
  core.changed()
  await audit(core, actor, 'datasource.sync_stop', { kind: 'datasource', id })
}

/** Recreates in Trino every catalog it lacks — at start, and when a statement finds one missing. */
export async function ensureCatalogs(core: Core): Promise<{ created: string[]; failed: { catalog: string; error: string }[] }> {
  const rows = await core.db.many<DatasourceRow>(`${SELECT}`)
  const defs: CatalogDefinition[] = []
  for (const row of rows) {
    const secrets = row.secret ? (JSON.parse(decrypt(core.config.secretKey, row.secret)) as Record<string, string>) : {}
    defs.push(catalogDefinition(row, { ...row.config, ...secrets }))
  }
  return core.engine.ensureCatalogs(defs)
}

/** Sources whose scheduled sync is due. */
export async function scheduleDueSyncs(core: Core): Promise<void> {
  const due = await core.db.many<{ id: string }>(
    `SELECT id FROM datasource WHERE sync_status NOT IN ('queued', 'running') AND NOT COALESCE((options->>'internal')::boolean, false) AND (
       last_sync_at IS NULL AND sync_status = 'never'
       OR schedule = 'hourly' AND last_sync_at < now() - interval '1 hour'
       OR schedule = 'daily' AND last_sync_at < now() - interval '1 day')`,
  )
  for (const d of due) await requestSync(core, d.id, null)
}
