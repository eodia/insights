/**
 * Sources : une connexion chiffrée en catalogue, un catalogue Trino créé à chaud.
 * L'application est la source de vérité ; Trino reste sans état.
 */
import {
  type Datasource,
  type DatasourceInput,
  type DatasourceOptions,
  ENGINE_SPECS,
  type Engine,
} from '@eodia/contracts'
import { type Settings, testConnection } from '@eodia/drivers'
import { type CatalogDefinition, catalogNameFor } from '@eodia/engine'
import { audit } from '../audit'
import type { Actor, Core } from '../context'
import { decrypt, encrypt } from '../crypto'
import type pg from 'pg'
import { AppError, invalid, notFound } from '../errors'
import { enqueue } from '../jobs'
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
    options: r.options,
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
  return (await core.db.many<DatasourceRow>(`${SELECT} WHERE ${IN_SPACE} ORDER BY d.name`, [actor.workspaceId])).map((r) => toDto(r, actor.workspaceId))
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
    if (v === undefined || v === '') continue
    if (field.secret) secrets[field.key] = String(v)
    else plain[field.key] = field.type === 'number' ? Number(v) : field.type === 'boolean' ? v === true || v === 'true' : v
  }
  return { plain, secrets }
}

function checkRequired(engine: Engine, settings: Settings): void {
  for (const field of ENGINE_SPECS[engine].fields) {
    const v = settings[field.key]
    if (field.required && (v === undefined || v === '')) throw invalid(`Le champ « ${field.label} » est obligatoire.`)
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
  try {
    await core.engine.putCatalog(catalogDefinition({ catalog, engine: input.engine, options }, { ...plain, ...secrets }))
  } catch (err) {
    throw new AppError('CONNECTION_FAILED', `Trino refuse le catalogue : ${err instanceof Error ? err.message : String(err)}`)
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
  await requestSync(core, id, actor.userId)
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
  try {
    await core.engine.putCatalog(catalogDefinition({ catalog: row.catalog, engine: row.engine, options }, settings))
  } catch (err) {
    throw new AppError('CONNECTION_FAILED', `Trino refuse le catalogue : ${err instanceof Error ? err.message : String(err)}`)
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
  core.changed()
  await audit(core, actor, 'datasource.delete', { kind: 'datasource', id }, { name: row.name })
}

export async function requestSync(core: Core, id: string, userId: string | null, passes: readonly string[] = ['schema', 'fingerprint', 'values']): Promise<string> {
  await core.db.exec(`UPDATE datasource SET sync_status = 'queued' WHERE id = $1 AND sync_status <> 'running'`, [id])
  return enqueue(core, 'sync', { datasource: id, passes }, { dedupe: `sync:${id}`, createdBy: userId })
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
    `SELECT id FROM datasource WHERE sync_status NOT IN ('queued', 'running') AND (
       last_sync_at IS NULL AND sync_status = 'never'
       OR schedule = 'hourly' AND last_sync_at < now() - interval '1 hour'
       OR schedule = 'daily' AND last_sync_at < now() - interval '1 day')`,
  )
  for (const d of due) await requestSync(core, d.id, null)
}
