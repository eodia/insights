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
import { AppError, invalid, notFound } from '../errors'
import { enqueue } from '../jobs'

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
}

const SELECT = `
  SELECT d.*,
    (SELECT count(*) FROM db_schema s WHERE s.datasource_id = d.id AND s.status = 'active')::int AS schemas,
    (SELECT count(*) FROM db_table t WHERE t.datasource_id = d.id AND t.status = 'active')::int AS tables,
    (SELECT count(*) FROM db_column c JOIN db_table t ON t.id = c.table_id WHERE t.datasource_id = d.id AND c.status = 'active')::int AS columns
  FROM datasource d`

function toDto(r: DatasourceRow): Datasource {
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
  }
}

export async function listDatasources(core: Core): Promise<Datasource[]> {
  return (await core.db.many<DatasourceRow>(`${SELECT} ORDER BY d.name`)).map(toDto)
}

export async function getDatasource(core: Core, id: string): Promise<Datasource> {
  const row = await core.db.one<DatasourceRow>(`${SELECT} WHERE d.id = $1`, [id])
  if (!row) throw notFound('Source introuvable.')
  return toDto(row)
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
export async function testDatasource(core: Core, input: DatasourceInput, existingId?: string) {
  let settings: Settings = { ...input.config }
  if (existingId) {
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
      `INSERT INTO datasource (name, engine, catalog, description, config, secret, secret_keys, options, schedule, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
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
      ],
      c,
    )
    const dsId = row?.id as string
    // Everyone reads a new source and may write SQL on it, as in Metabase; narrowed in Permissions.
    await core.db.exec(
      `INSERT INTO data_permission (group_id, datasource_id, access) SELECT id, $1, 'read' FROM user_group WHERE kind = 'all'`,
      [dsId],
      c,
    )
    await core.db.exec(
      `INSERT INTO query_permission (group_id, datasource_id, level) SELECT id, $1, 'sql' FROM user_group WHERE kind = 'all'`,
      [dsId],
      c,
    )
    return dsId
  })
  core.changed()
  await audit(core, actor, 'datasource.create', { kind: 'datasource', id }, { engine: input.engine, catalog })
  await requestSync(core, id, actor.userId)
  return getDatasource(core, id)
}

export async function updateDatasource(core: Core, actor: Actor, id: string, input: DatasourceInput): Promise<Datasource> {
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
  return getDatasource(core, id)
}

export async function deleteDatasource(core: Core, actor: Actor, id: string): Promise<void> {
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
