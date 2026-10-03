/**
 * La structure synchronisée et ses métadonnées : ce que l'écran « Structure » édite, ce que le
 * builder, l'éditeur SQL et le copilot lisent. Chaque lecture est filtrée par les droits du
 * lecteur : une table refusée n'existe pas pour lui, une colonne cachée non plus.
 */
import type {
  ColumnFormat,
  ColumnMeta,
  ColumnPatch,
  ColumnValue,
  LookColor,
  Relation,
  SemanticType,
  TableMeta,
  TablePatch,
  Visibility,
} from '@eodia/contracts'
import { columnAccess, tableAccess } from '../access/decide'
import type { Snapshot } from '../access/snapshot'
import { audit } from '../audit'
import type { Actor, Core } from '../context'
import { AppError, notFound } from '../errors'
import { liveValues, scopedValues } from './sync'

interface TableRow {
  id: string
  datasource_id: string
  catalog: string
  schema_name: string
  name: string
  label: string
  description: string | null
  native_comment: string | null
  visibility: Visibility
  entity: string | null
  color: LookColor | null
  icon: string | null
  display_column: string | null
  row_count: number | null
  status: 'active' | 'removed'
  synced_at: Date | null
}

interface ColumnRow {
  id: string
  table_id: string
  name: string
  position: number
  data_type: string
  native_type: string | null
  label: string
  description: string | null
  native_comment: string | null
  visibility: Visibility
  semantic_type: SemanticType | null
  format: ColumnFormat
  unit: string | null
  is_pk: boolean
  nullable: boolean
  fingerprint: ColumnMeta['fingerprint']
  has_values: boolean
  status: 'active' | 'removed'
  type_changed_from: string | null
  fk_column: string | null
  fk_table: string | null
  fk_name: string | null
}

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

function tableDto(r: TableRow, columns?: ColumnMeta[]): TableMeta {
  return {
    id: r.id,
    datasource: r.datasource_id,
    schema: r.schema_name,
    name: r.name,
    qualified: `${quote(r.catalog)}.${quote(r.schema_name)}.${quote(r.name)}`,
    label: r.label,
    description: r.description,
    native_comment: r.native_comment,
    visibility: r.visibility,
    entity: r.entity,
    color: r.color,
    icon: r.icon,
    display_column: r.display_column,
    row_count: r.row_count,
    status: r.status,
    synced_at: r.synced_at?.toISOString() ?? null,
    ...(columns ? { columns } : {}),
  }
}

function columnDto(r: ColumnRow): ColumnMeta {
  return {
    id: r.id,
    table: r.table_id,
    name: r.name,
    position: r.position,
    type: r.data_type,
    native_type: r.native_type,
    label: r.label,
    description: r.description,
    native_comment: r.native_comment,
    visibility: r.visibility,
    semantic: r.semantic_type,
    format: r.format ?? {},
    unit: r.unit,
    pk: r.is_pk,
    nullable: r.nullable,
    fk: r.fk_column ? { column: r.fk_column, table: r.fk_table as string, name: r.fk_name as string } : null,
    fingerprint: r.fingerprint,
    has_values: r.has_values,
    status: r.status,
    type_changed_from: r.type_changed_from,
  }
}

const TABLE_SELECT = `SELECT t.*, d.catalog FROM db_table t JOIN datasource d ON d.id = t.datasource_id`
const COLUMN_SELECT = `
  SELECT c.*, r.to_column_id AS fk_column, tc.table_id AS fk_table, tc.name AS fk_name
  FROM db_column c
  LEFT JOIN db_relation r ON r.from_column_id = c.id
  LEFT JOIN db_column tc ON tc.id = r.to_column_id`

function readable(snap: Snapshot, userId: string, t: Pick<TableRow, 'id' | 'datasource_id' | 'schema_name'>): boolean {
  return tableAccess(snap, userId, t.datasource_id, t.schema_name, t.id).access !== 'none'
}

/** The columns a person may cite: hidden ones removed, masked ones kept (they read a mask). */
function visibleColumns(snap: Snapshot, userId: string, tableId: string, columns: ColumnMeta[]): ColumnMeta[] {
  const t = snap.tables.get(tableId)
  if (!t) return columns
  return columns.filter((c) => columnAccess(snap, userId, t, c.name).access !== 'hidden')
}

export async function listTables(
  core: Core,
  actor: Actor,
  opts: { datasource?: string; includeRemoved?: boolean; withColumns?: boolean } = {},
): Promise<TableMeta[]> {
  const snap = await core.snapshot()
  const params: unknown[] = []
  const where: string[] = []
  if (opts.datasource) {
    params.push(opts.datasource)
    where.push(`t.datasource_id = $${params.length}`)
  }
  if (!opts.includeRemoved) where.push(`t.status = 'active'`)
  const rows = (await core.db.many<TableRow>(`${TABLE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.schema_name, t.label`, params)).filter(
    (t) => readable(snap, actor.userId, t),
  )
  if (!opts.withColumns) return rows.map((r) => tableDto(r))
  const cols = await core.db.many<ColumnRow>(
    `${COLUMN_SELECT} WHERE c.table_id = ANY($1) ${opts.includeRemoved ? '' : `AND c.status = 'active'`} ORDER BY c.position`,
    [rows.map((r) => r.id)],
  )
  const byTable = new Map<string, ColumnMeta[]>()
  for (const c of cols) {
    const list = byTable.get(c.table_id) ?? []
    list.push(columnDto(c))
    byTable.set(c.table_id, list)
  }
  return rows.map((r) => tableDto(r, visibleColumns(snap, actor.userId, r.id, byTable.get(r.id) ?? [])))
}

export async function getTable(core: Core, actor: Actor, id: string, opts: { includeRemoved?: boolean } = {}): Promise<TableMeta> {
  const snap = await core.snapshot()
  const row = await core.db.one<TableRow>(`${TABLE_SELECT} WHERE t.id = $1`, [id])
  if (!row || !readable(snap, actor.userId, row)) throw notFound('Table introuvable.')
  const cols = await core.db.many<ColumnRow>(
    `${COLUMN_SELECT} WHERE c.table_id = $1 ${opts.includeRemoved ? '' : `AND c.status = 'active'`} ORDER BY c.status, c.position`,
    [id],
  )
  return tableDto(row, visibleColumns(snap, actor.userId, id, cols.map(columnDto)))
}

export async function patchTable(core: Core, actor: Actor, id: string, patch: TablePatch): Promise<TableMeta> {
  const fields = Object.entries(patch).filter(([, v]) => v !== undefined)
  if (fields.length > 0) {
    const sets = fields.map(([k], i) => `${k} = $${i + 2}`)
    const n = await core.db.exec(`UPDATE db_table SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [id, ...fields.map(([, v]) => v)])
    if (n === 0) throw notFound('Table introuvable.')
    await audit(core, actor, 'metadata.table', { kind: 'table', id }, { fields: fields.map(([k]) => k) })
  }
  return getTable(core, actor, id, { includeRemoved: true })
}

export async function patchColumn(core: Core, actor: Actor, id: string, patch: ColumnPatch): Promise<ColumnMeta> {
  const { fk, semantic, ...rest } = patch
  await core.db.tx(async (c) => {
    const exists = await core.db.one<{ table_id: string }>('SELECT table_id FROM db_column WHERE id = $1', [id], c)
    if (!exists) throw notFound('Colonne introuvable.')
    const fields: [string, unknown][] = Object.entries(rest).filter(([, v]) => v !== undefined)
    if (semantic !== undefined) fields.push(['semantic_type', semantic], ['semantic_source', 'user'])
    if (fields.length > 0) {
      const sets = fields.map(([k], i) => `${k} = $${i + 2}`)
      await core.db.exec(`UPDATE db_column SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [id, ...fields.map(([, v]) => v)], c)
    }
    if (fk !== undefined) {
      if (fk === null) await core.db.exec('DELETE FROM db_relation WHERE from_column_id = $1', [id], c)
      else {
        await core.db.exec(
          `INSERT INTO db_relation (from_column_id, to_column_id, origin) VALUES ($1, $2, 'manual')
           ON CONFLICT (from_column_id) DO UPDATE SET to_column_id = EXCLUDED.to_column_id, origin = 'manual'`,
          [id, fk],
          c,
        )
        if (semantic === undefined) {
          await core.db.exec(`UPDATE db_column SET semantic_type = 'fk', semantic_source = 'user' WHERE id = $1`, [id], c)
        }
      }
    }
  })
  await audit(core, actor, 'metadata.column', { kind: 'column', id }, { fields: Object.keys(patch) })
  const row = await core.db.one<ColumnRow>(`${COLUMN_SELECT} WHERE c.id = $1`, [id])
  return columnDto(row as ColumnRow)
}

// ── Valeurs ──────────────────────────────────────────────────────────────────

export async function columnValues(core: Core, actor: Actor, columnId: string, search = ''): Promise<{ values: ColumnValue[]; complete: boolean }> {
  const snap = await core.snapshot()
  const col = await core.db.one<{ table_id: string; datasource_id: string; schema_name: string; name: string; has_values: boolean }>(
    `SELECT c.table_id, t.datasource_id, t.schema_name, c.name, c.has_values FROM db_column c JOIN db_table t ON t.id = c.table_id WHERE c.id = $1`,
    [columnId],
  )
  if (!col) throw notFound('Colonne introuvable.')
  const decision = tableAccess(snap, actor.userId, col.datasource_id, col.schema_name, col.table_id)
  if (decision.access === 'none') throw notFound('Colonne introuvable.')
  const t = snap.tables.get(col.table_id)
  if (t && columnAccess(snap, actor.userId, t, col.name).access !== 'read') return { values: [], complete: true }
  const stored = await core.db.many<ColumnValue & { position: number }>(
    'SELECT value, label, color, icon, image_url, count, position FROM column_value WHERE column_id = $1 ORDER BY position, value',
    [columnId],
  )
  const looks = new Map(stored.map((v) => [v.value, v]))
  // Restricted readers only see the values of their own rows: read live, under their identity.
  if (decision.access === 'restricted' || !col.has_values || search) {
    const live = await liveValues(core, actor.userId, columnId, search).catch(() => [] as string[])
    return {
      values: live.map((value) => {
        const look = looks.get(value)
        return look ? { value, label: look.label, color: look.color, icon: look.icon, image_url: look.image_url } : { value }
      }),
      complete: live.length < 100,
    }
  }
  // Described values the data no longer holds (no count while the others have one) are not offered.
  const counted = stored.some((v) => v.count !== null && v.count !== undefined)
  return {
    values: stored.filter((v) => !counted || (v.count !== null && v.count !== undefined)).map(({ position: _p, ...v }) => v),
    complete: true,
  }
}

/** A value of an associative filter list: its look, its rows, and its rows within the other filters. */
export interface ScopedValue extends ColumnValue {
  readonly count: number
  readonly scoped: number
}

/**
 * The values of a column for a dashboard filter, read live under the reader's identity — the
 * values the data holds, not those described in « Structure » —, with their looks and counts.
 */
export async function scopedColumnValues(
  core: Core,
  actor: Actor,
  columnId: string,
  filters: readonly { column: string; values: readonly string[] }[],
  search = '',
): Promise<{ values: ScopedValue[]; complete: boolean }> {
  const snap = await core.snapshot()
  const col = await core.db.one<{ table_id: string; datasource_id: string; schema_name: string; name: string }>(
    'SELECT c.table_id, t.datasource_id, t.schema_name, c.name FROM db_column c JOIN db_table t ON t.id = c.table_id WHERE c.id = $1',
    [columnId],
  )
  if (!col) throw notFound('Colonne introuvable.')
  const reader = actor.dataUser ?? actor.userId
  if (tableAccess(snap, reader, col.datasource_id, col.schema_name, col.table_id).access === 'none') throw notFound('Colonne introuvable.')
  const t = snap.tables.get(col.table_id)
  if (t && columnAccess(snap, reader, t, col.name).access !== 'read') return { values: [], complete: true }
  const limit = 500
  const live = await scopedValues(core, reader, columnId, filters, search, limit)
  const looks = new Map(
    (await core.db.many<ColumnValue>('SELECT value, label, color, icon, image_url FROM column_value WHERE column_id = $1', [columnId])).map((v) => [v.value, v]),
  )
  return {
    values: live.map((v) => {
      const look = looks.get(v.value)
      return { ...v, ...(look ? { label: look.label, color: look.color, icon: look.icon, image_url: look.image_url } : {}) }
    }),
    complete: live.length < limit,
  }
}

export async function putColumnValues(core: Core, actor: Actor, columnId: string, values: readonly ColumnValue[]): Promise<void> {
  await core.db.tx(async (c) => {
    for (const [i, v] of values.entries()) {
      await core.db.exec(
        `INSERT INTO column_value (column_id, value, label, color, icon, image_url, position) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (column_id, value) DO UPDATE SET label = EXCLUDED.label, color = EXCLUDED.color, icon = EXCLUDED.icon,
           image_url = EXCLUDED.image_url, position = EXCLUDED.position`,
        [columnId, v.value, v.label ?? null, v.color ?? null, v.icon ?? null, v.image_url ?? null, i],
        c,
      )
    }
  })
  await audit(core, actor, 'metadata.values', { kind: 'column', id: columnId }, { count: values.length })
}

/** The looks of several columns' values at once: what a result needs to draw its badges. */
export async function valueLooks(core: Core, columnIds: readonly string[]): Promise<Record<string, ColumnValue[]>> {
  if (columnIds.length === 0) return {}
  const rows = await core.db.many<ColumnValue & { column_id: string }>(
    `SELECT column_id, value, label, color, icon, image_url FROM column_value
     WHERE column_id = ANY($1) AND (label IS NOT NULL OR color IS NOT NULL OR icon IS NOT NULL OR image_url IS NOT NULL)`,
    [columnIds],
  )
  const out: Record<string, ColumnValue[]> = {}
  for (const { column_id, ...v } of rows) (out[column_id] ??= []).push(v)
  return out
}

// ── Relations ────────────────────────────────────────────────────────────────

export async function listRelations(core: Core, actor: Actor, datasource: string): Promise<Relation[]> {
  const snap = await core.snapshot()
  const rows = await core.db.many<{ id: string; from_table: string; from_column: string; to_table: string; to_column: string; origin: 'detected' | 'manual'; fs: string; ts: string }>(
    `SELECT r.id, fc.table_id AS from_table, r.from_column_id AS from_column, tc.table_id AS to_table, r.to_column_id AS to_column, r.origin,
            ft.schema_name AS fs, tt.schema_name AS ts
     FROM db_relation r JOIN db_column fc ON fc.id = r.from_column_id JOIN db_column tc ON tc.id = r.to_column_id
     JOIN db_table ft ON ft.id = fc.table_id JOIN db_table tt ON tt.id = tc.table_id
     WHERE ft.datasource_id = $1 AND fc.status = 'active' AND tc.status = 'active'`,
    [datasource],
  )
  return rows
    .filter((r) => readable(snap, actor.userId, { id: r.from_table, datasource_id: datasource, schema_name: r.fs }) && readable(snap, actor.userId, { id: r.to_table, datasource_id: datasource, schema_name: r.ts }))
    .map((r) => ({ id: r.id, from: { table: r.from_table, column: r.from_column }, to: { table: r.to_table, column: r.to_column }, origin: r.origin }))
}

// ── Copier / coller en JSON ──────────────────────────────────────────────────

export interface TableConfig {
  readonly kind: 'eodia.table'
  readonly table: TablePatch
  readonly columns: Record<string, ColumnPatch & { values?: ColumnValue[] }>
}

export interface ColumnConfig {
  readonly kind: 'eodia.column'
  readonly column: ColumnPatch & { values?: ColumnValue[] }
}

async function columnConfig(core: Core, c: ColumnMeta): Promise<ColumnPatch & { values?: ColumnValue[] }> {
  const values = await core.db.many<ColumnValue>(
    `SELECT value, label, color, icon, image_url FROM column_value WHERE column_id = $1
     AND (label IS NOT NULL OR color IS NOT NULL OR icon IS NOT NULL OR image_url IS NOT NULL) ORDER BY position`,
    [c.id],
  )
  return {
    label: c.label,
    description: c.description,
    visibility: c.visibility,
    semantic: c.semantic,
    format: c.format,
    unit: c.unit,
    ...(values.length ? { values: values.map((v) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null)) as ColumnValue) } : {}),
  }
}

export async function exportTableConfig(core: Core, actor: Actor, id: string): Promise<TableConfig> {
  const t = await getTable(core, actor, id)
  const columns: TableConfig['columns'] = {}
  for (const c of t.columns ?? []) columns[c.name] = await columnConfig(core, c)
  return {
    kind: 'eodia.table',
    table: {
      label: t.label,
      description: t.description,
      visibility: t.visibility,
      entity: t.entity,
      color: t.color,
      icon: t.icon,
      display_column: t.display_column,
    },
    columns,
  }
}

export async function exportColumnConfig(core: Core, actor: Actor, id: string): Promise<ColumnConfig> {
  const row = await core.db.one<ColumnRow>(`${COLUMN_SELECT} WHERE c.id = $1`, [id])
  if (!row) throw notFound('Colonne introuvable.')
  await getTable(core, actor, row.table_id)
  return { kind: 'eodia.column', column: await columnConfig(core, columnDto(row)) }
}

/** Applies a pasted configuration; columns are matched by name, those absent are left alone. */
export async function importConfig(core: Core, actor: Actor, target: { table?: string; column?: string }, config: unknown): Promise<{ applied: number }> {
  const cfg = config as { kind?: string; table?: TablePatch; columns?: TableConfig['columns']; column?: ColumnConfig['column'] }
  const { values: _ignored, ...columnOnly } = (cfg.column ?? {}) as ColumnPatch & { values?: ColumnValue[] }
  if (cfg.kind === 'eodia.column' && target.column) {
    await patchColumn(core, actor, target.column, columnOnly)
    if (cfg.column?.values) await putColumnValues(core, actor, target.column, cfg.column.values)
    return { applied: 1 }
  }
  if (cfg.kind === 'eodia.table' && target.table) {
    const t = await getTable(core, actor, target.table)
    if (cfg.table) await patchTable(core, actor, target.table, cfg.table)
    let applied = 1
    for (const c of t.columns ?? []) {
      const conf = cfg.columns?.[c.name]
      if (!conf) continue
      const { values, ...patch } = conf
      await patchColumn(core, actor, c.id, patch)
      if (values) await putColumnValues(core, actor, c.id, values)
      applied++
    }
    return { applied }
  }
  throw new AppError('INVALID_INPUT', 'Configuration non reconnue : attendu un export de table ou de colonne eodia insights.')
}

// ── Arbre pour l'éditeur SQL et les sélecteurs ───────────────────────────────

export interface SchemaTree {
  readonly datasources: readonly {
    readonly id: string
    readonly name: string
    readonly engine: string
    readonly catalog: string
    readonly tables: readonly { readonly id: string; readonly schema: string; readonly name: string; readonly label: string; readonly columns: readonly { readonly name: string; readonly type: string; readonly label: string }[] }[]
  }[]
}

export async function schemaTree(core: Core, actor: Actor): Promise<SchemaTree> {
  const tables = await listTables(core, actor, { withColumns: true })
  const sources = await core.db.many<{ id: string; name: string; engine: string; catalog: string }>('SELECT id, name, engine, catalog FROM datasource ORDER BY name')
  return {
    datasources: sources
      .map((d) => ({
        ...d,
        tables: tables
          .filter((t) => t.datasource === d.id && t.visibility !== 'hidden')
          .map((t) => ({
            id: t.id,
            schema: t.schema,
            name: t.name,
            label: t.label,
            columns: (t.columns ?? []).filter((c) => c.visibility !== 'hidden').map((c) => ({ name: c.name, type: c.type, label: c.label })),
          })),
      }))
      .filter((d) => d.tables.length > 0),
  }
}
