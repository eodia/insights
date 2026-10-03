/**
 * « Synchroniser le schéma de la base de données », en trois passes comme Metabase :
 * 1. schéma — Trino (information_schema) plus le pilote natif (clés, commentaires, volumes),
 *    avec un diff : les nouveautés s'ajoutent, les disparitions sont marquées « retirée » sans
 *    perdre leurs métadonnées, les changements de type sont signalés ;
 * 2. empreinte — cardinalité, nulls, min/max sur un échantillon ; pré-devine le type sémantique ;
 * 3. valeurs — les valeurs distinctes des colonnes catégorielles.
 */
import { type Fingerprint, type SemanticType, type SyncReport, kindOfTrinoType } from '@eodia/contracts'
import { humanize } from '@eodia/compiler'
import { SYSTEM_SCHEMAS, introspect, type NativeIntrospection } from '@eodia/drivers'
import { quoteTrinoIdent as q, quoteTrinoString } from '@eodia/engine'
import type { Core } from '../context'
import type { JobHandler } from '../jobs'
import { datasourceSettings } from './datasources'
import { defaultFormat, guessSemantic, keepsValues } from './semantic'

const SAMPLE_ROWS = 10_000
const MAX_VALUES = 1000
const MAX_FINGERPRINT_TABLES = 500

type Progress = (step: string, done: number, total: number) => Promise<void>

interface DsRow {
  id: string
  catalog: string
  engine: Parameters<typeof introspect>[0]
  options: { excluded_schemas?: string[] }
}

const lower = (s: string) => s.toLowerCase()

export const syncJob: JobHandler = async (core, payload, progress) => {
  const id = String(payload.datasource)
  const passes = (payload.passes as string[] | undefined) ?? ['schema', 'fingerprint', 'values']
  const ds = await core.db.one<DsRow>('SELECT id, catalog, engine, options FROM datasource WHERE id = $1', [id])
  if (!ds) return null
  await core.db.exec(`UPDATE datasource SET sync_status = 'running', sync_error = NULL WHERE id = $1`, [id])
  const report: SyncReport = {
    schemas: { added: 0, removed: 0 },
    tables: { added: 0, removed: 0 },
    columns: { added: 0, removed: 0, retyped: 0 },
    fingerprinted: 0,
    values: 0,
  }
  try {
    if (passes.includes('schema')) Object.assign(report, await schemaPass(core, ds, progress))
    core.changed()
    if (passes.includes('fingerprint')) (report as { fingerprinted: number }).fingerprinted = await fingerprintPass(core, ds, progress)
    if (passes.includes('values')) (report as { values: number }).values = await valuesPass(core, ds, progress)
    await core.db.exec(`UPDATE datasource SET sync_status = 'ok', last_sync_at = now(), sync_error = NULL WHERE id = $1`, [id])
    core.changed()
    return report
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await core.db.exec(`UPDATE datasource SET sync_status = 'failed', last_sync_at = now(), sync_error = $2 WHERE id = $1`, [id, message])
    throw err
  }
}

// ── Passe 1 : schéma ─────────────────────────────────────────────────────────

async function schemaPass(core: Core, ds: DsRow, progress: Progress): Promise<Partial<SyncReport>> {
  await progress('Lecture du schéma dans Trino', 0, 3)
  const excluded = new Set([...SYSTEM_SCHEMAS[ds.engine], ...(ds.options?.excluded_schemas ?? [])].map(lower))
  const cols = await core.engine.run(
    `SELECT table_schema, table_name, column_name, ordinal_position, data_type, is_nullable
     FROM ${q(ds.catalog)}.information_schema.columns WHERE table_schema <> 'information_schema'`,
    { timeoutMs: 300_000 },
  )
  const trinoColumns = cols.data
    .map((r) => ({
      schema: String(r[0]),
      table: String(r[1]),
      name: String(r[2]),
      position: Number(r[3]),
      type: String(r[4]),
      nullable: r[5] !== 'NO',
    }))
    .filter((c) => !excluded.has(lower(c.schema)))

  await progress('Clés, commentaires et volumes (pilote natif)', 1, 3)
  let native: NativeIntrospection = { tables: [], columns: [], foreignKeys: [] }
  try {
    native = await introspect(ds.engine, await datasourceSettings(core, ds.id))
  } catch {
    // Trino alone is enough to sync: keys and comments simply stay unknown this time.
  }
  const nativeTable = new Map(native.tables.map((t) => [lower(`${t.schema}.${t.name}`), t]))
  const nativeColumn = new Map(native.columns.map((c) => [lower(`${c.schema}.${c.table}.${c.name}`), c]))

  await progress('Comparaison avec la structure connue', 2, 3)
  const report = {
    schemas: { added: 0, removed: 0 },
    tables: { added: 0, removed: 0 },
    columns: { added: 0, removed: 0, retyped: 0 },
  }

  await core.db.tx(async (c) => {
    // Schemas.
    const schemaNames = [...new Set(trinoColumns.map((x) => x.schema))]
    const knownSchemas = new Map(
      (await core.db.many<{ name: string; status: string }>('SELECT name, status FROM db_schema WHERE datasource_id = $1', [ds.id], c)).map((r) => [r.name, r.status]),
    )
    for (const s of schemaNames) {
      if (!knownSchemas.has(s)) report.schemas.added++
      await core.db.exec(
        `INSERT INTO db_schema (datasource_id, name) VALUES ($1, $2) ON CONFLICT (datasource_id, name) DO UPDATE SET status = 'active'`,
        [ds.id, s],
        c,
      )
    }
    report.schemas.removed = await core.db.exec(
      `UPDATE db_schema SET status = 'removed' WHERE datasource_id = $1 AND status = 'active' AND NOT (name = ANY($2))`,
      [ds.id, schemaNames],
      c,
    )

    // Tables.
    const byTable = new Map<string, typeof trinoColumns>()
    for (const col of trinoColumns) {
      const key = `${col.schema}\u0000${col.table}`
      const list = byTable.get(key) ?? []
      list.push(col)
      byTable.set(key, list)
    }
    const knownTables = new Map(
      (
        await core.db.many<{ id: string; schema_name: string; name: string; status: string }>(
          'SELECT id, schema_name, name, status FROM db_table WHERE datasource_id = $1',
          [ds.id],
          c,
        )
      ).map((t) => [`${t.schema_name}\u0000${t.name}`, t]),
    )
    const seenTables: string[] = []
    for (const [key, columns] of byTable) {
      const [schema, table] = key.split('\u0000') as [string, string]
      const nt = nativeTable.get(lower(`${schema}.${table}`))
      const existing = knownTables.get(key)
      if (!existing) report.tables.added++
      const row = await core.db.one<{ id: string }>(
        `INSERT INTO db_table (datasource_id, schema_name, name, label, native_comment, row_count, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (datasource_id, schema_name, name) DO UPDATE SET status = 'active', native_comment = EXCLUDED.native_comment,
           row_count = coalesce(EXCLUDED.row_count, db_table.row_count), synced_at = now()
         RETURNING id`,
        [ds.id, schema, table, humanize(table), nt?.comment ?? null, nt?.rowEstimate ?? null],
        c,
      )
      const tableId = row?.id as string
      seenTables.push(tableId)

      const knownCols = new Map(
        (
          await core.db.many<{ id: string; name: string; data_type: string; status: string }>(
            'SELECT id, name, data_type, status FROM db_column WHERE table_id = $1',
            [tableId],
            c,
          )
        ).map((k) => [k.name, k]),
      )
      const seenCols: string[] = []
      for (const col of columns) {
        const nc = nativeColumn.get(lower(`${schema}.${table}.${col.name}`))
        const known = knownCols.get(col.name)
        if (!known) report.columns.added++
        else if (known.data_type !== col.type) report.columns.retyped++
        await core.db.exec(
          `INSERT INTO db_column (table_id, name, position, data_type, native_type, label, native_comment, is_pk, nullable)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (table_id, name) DO UPDATE SET status = 'active', position = EXCLUDED.position,
             type_changed_from = CASE WHEN db_column.data_type <> EXCLUDED.data_type THEN db_column.data_type ELSE db_column.type_changed_from END,
             data_type = EXCLUDED.data_type, native_type = coalesce(EXCLUDED.native_type, db_column.native_type),
             native_comment = EXCLUDED.native_comment, is_pk = EXCLUDED.is_pk OR (db_column.is_pk AND EXCLUDED.native_type IS NULL),
             nullable = EXCLUDED.nullable, updated_at = now()`,
          [tableId, col.name, col.position, col.type, nc?.nativeType ?? null, humanize(col.name), nc?.comment ?? null, nc?.pk ?? (col.name === '_id' || (ds.engine !== 'postgresql' && col.name === 'id')), col.nullable],
          c,
        )
        seenCols.push(col.name)
      }
      report.columns.removed += await core.db.exec(
        `UPDATE db_column SET status = 'removed' WHERE table_id = $1 AND status = 'active' AND NOT (name = ANY($2))`,
        [tableId, seenCols],
        c,
      )
    }
    report.tables.removed = await core.db.exec(
      `UPDATE db_table SET status = 'removed' WHERE datasource_id = $1 AND status = 'active' AND NOT (id = ANY($2))`,
      [ds.id, seenTables],
      c,
    )

    // Relations: declared foreign keys, or — for engines without — `client_id` → `clients.id`.
    const colIndex = new Map(
      (
        await core.db.many<{ id: string; schema_name: string; table_name: string; name: string; is_pk: boolean }>(
          `SELECT c.id, t.schema_name, t.name AS table_name, c.name, c.is_pk FROM db_column c JOIN db_table t ON t.id = c.table_id
           WHERE t.datasource_id = $1 AND c.status = 'active' AND t.status = 'active'`,
          [ds.id],
          c,
        )
      ).map((r) => [lower(`${r.schema_name}.${r.table_name}.${r.name}`), r]),
    )
    const links: [string, string][] = []
    for (const fk of native.foreignKeys) {
      const from = colIndex.get(lower(`${fk.schema}.${fk.table}.${fk.column}`))
      const to = colIndex.get(lower(`${fk.refSchema}.${fk.refTable}.${fk.refColumn}`))
      if (from && to) links.push([from.id, to.id])
    }
    if (native.foreignKeys.length === 0) {
      const tablesBySchema = new Map<string, Set<string>>()
      for (const v of colIndex.values()) {
        const set = tablesBySchema.get(lower(v.schema_name)) ?? new Set()
        set.add(lower(v.table_name))
        tablesBySchema.set(lower(v.schema_name), set)
      }
      for (const v of colIndex.values()) {
        const m = /^(.+)_id$/.exec(lower(v.name))
        if (!m) continue
        const base = m[1] as string
        const candidates = [base, `${base}s`, `${base}x`, base.replace(/y$/, 'ies')]
        const schemaTables = tablesBySchema.get(lower(v.schema_name)) ?? new Set()
        const target = candidates.find((t) => schemaTables.has(t) && t !== lower(v.table_name))
        if (!target) continue
        const to =
          colIndex.get(lower(`${v.schema_name}.${target}.id`)) ??
          colIndex.get(lower(`${v.schema_name}.${target}.${m[0]}`)) ??
          colIndex.get(lower(`${v.schema_name}.${target}._id`))
        if (to) links.push([v.id, to.id])
      }
    }
    for (const [from, to] of links) {
      await core.db.exec(
        `INSERT INTO db_relation (from_column_id, to_column_id, origin) VALUES ($1, $2, 'detected')
         ON CONFLICT (from_column_id) DO UPDATE SET to_column_id = EXCLUDED.to_column_id WHERE db_relation.origin = 'detected'`,
        [from, to],
        c,
      )
    }
  })
  return report
}

// ── Passe 2 : empreinte ──────────────────────────────────────────────────────

interface ColRow {
  id: string
  name: string
  data_type: string
  is_pk: boolean
  semantic_type: SemanticType | null
  semantic_source: string
  format: Record<string, unknown>
  fk: boolean
}

async function fingerprintPass(core: Core, ds: DsRow, progress: Progress): Promise<number> {
  const tables = await core.db.many<{ id: string; schema_name: string; name: string }>(
    `SELECT id, schema_name, name FROM db_table WHERE datasource_id = $1 AND status = 'active' ORDER BY schema_name, name LIMIT $2`,
    [ds.id, MAX_FINGERPRINT_TABLES],
  )
  let done = 0
  for (const t of tables) {
    await progress(`Empreinte de ${t.schema_name}.${t.name}`, done, tables.length)
    done++
    const columns = await core.db.many<ColRow>(
      `SELECT c.id, c.name, c.data_type, c.is_pk, c.semantic_type, c.semantic_source, c.format,
              EXISTS (SELECT 1 FROM db_relation r WHERE r.from_column_id = c.id) AS fk
       FROM db_column c WHERE c.table_id = $1 AND c.status = 'active' ORDER BY c.position`,
      [t.id],
    )
    if (columns.length === 0) continue
    const exprs: string[] = ['count(*)']
    for (const c of columns) {
      const col = q(c.name)
      const kind = kindOfTrinoType(c.data_type)
      exprs.push(`count(${col})`)
      if (kind === 'json' || kind === 'other') {
        exprs.push('NULL', 'NULL', 'NULL', 'NULL', 'NULL')
        continue
      }
      exprs.push(`approx_distinct(${col})`)
      if (kind === 'number') exprs.push(`CAST(min(${col}) AS double)`, `CAST(max(${col}) AS double)`, `avg(CAST(${col} AS double))`, 'NULL')
      else if (kind === 'date' || kind === 'datetime' || kind === 'time') exprs.push(`CAST(min(${col}) AS varchar)`, `CAST(max(${col}) AS varchar)`, 'NULL', 'NULL')
      else if (kind === 'text') exprs.push('NULL', 'NULL', 'NULL', `avg(length(CAST(${col} AS varchar)))`)
      else exprs.push('NULL', 'NULL', 'NULL', 'NULL')
    }
    const from = `${q(ds.catalog)}.${q(t.schema_name)}.${q(t.name)}`
    let row: unknown[] | undefined
    try {
      row = (await core.engine.run(`SELECT ${exprs.join(', ')} FROM (SELECT * FROM ${from} LIMIT ${SAMPLE_ROWS})`, { timeoutMs: 120_000 })).data[0]
    } catch {
      continue
    }
    if (!row) continue
    const sample = Number(row[0] ?? 0)
    for (const [i, c] of columns.entries()) {
      const base = 1 + i * 6
      const nonNull = Number(row[base] ?? 0)
      const fp: Fingerprint = {
        sample,
        nulls: sample - nonNull,
        distinct: Number(row[base + 1] ?? 0),
        min: (row[base + 2] as string | number | null) ?? null,
        max: (row[base + 3] as string | number | null) ?? null,
        avg: row[base + 4] === null ? null : Number(row[base + 4]),
        avg_length: row[base + 5] === null ? null : Number(row[base + 5]),
      }
      const semantic = c.semantic_source === 'guess' ? guessSemantic({ name: c.name, type: c.data_type, pk: c.is_pk, fk: c.fk, fingerprint: fp }) : c.semantic_type
      const format = c.semantic_source === 'guess' && Object.keys(c.format ?? {}).length === 0 ? defaultFormat(semantic, c.name) : c.format
      await core.db.exec(
        'UPDATE db_column SET fingerprint = $2, semantic_type = $3, format = $4, has_values = $5 WHERE id = $1',
        [c.id, fp, semantic, format, keepsValues(kindOfTrinoType(c.data_type), semantic, fp)],
      )
    }
    // A display column for the table, if none was chosen.
    await core.db.exec(
      `UPDATE db_table SET display_column = (
         SELECT name FROM db_column WHERE table_id = $1 AND status = 'active' AND semantic_type IN ('entity_name', 'title')
         ORDER BY CASE semantic_type WHEN 'entity_name' THEN 0 ELSE 1 END, position LIMIT 1)
       WHERE id = $1 AND display_column IS NULL`,
      [t.id],
    )
  }
  return done
}

// ── Passe 3 : valeurs ────────────────────────────────────────────────────────

async function valuesPass(core: Core, ds: DsRow, progress: Progress): Promise<number> {
  const columns = await core.db.many<{ id: string; name: string; schema_name: string; table_name: string }>(
    `SELECT c.id, c.name, t.schema_name, t.name AS table_name FROM db_column c JOIN db_table t ON t.id = c.table_id
     WHERE t.datasource_id = $1 AND t.status = 'active' AND c.status = 'active' AND c.has_values ORDER BY t.name, c.position`,
    [ds.id],
  )
  let done = 0
  for (const c of columns) {
    await progress(`Valeurs de ${c.table_name}.${c.name}`, done, columns.length)
    done++
    const col = q(c.name)
    let rows: unknown[][]
    try {
      rows = (
        await core.engine.run(
          `SELECT CAST(${col} AS varchar), count(*) FROM ${q(ds.catalog)}.${q(c.schema_name)}.${q(c.table_name)}
           WHERE ${col} IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT ${MAX_VALUES + 1}`,
          { timeoutMs: 120_000 },
        )
      ).data
    } catch {
      continue
    }
    if (rows.length > MAX_VALUES) {
      await core.db.exec('UPDATE db_column SET has_values = false WHERE id = $1', [c.id])
      continue
    }
    const values = rows.map((r) => String(r[0]))
    await core.db.tx(async (tx) => {
      for (const [i, r] of rows.entries()) {
        await core.db.exec(
          `INSERT INTO column_value (column_id, value, position, count) VALUES ($1, $2, $3, $4)
           ON CONFLICT (column_id, value) DO UPDATE SET count = EXCLUDED.count`,
          [c.id, String(r[0]), i, Number(r[1])],
          tx,
        )
      }
      // Values gone from the data leave, unless someone described them.
      await core.db.exec(
        `DELETE FROM column_value WHERE column_id = $1 AND NOT (value = ANY($2)) AND label IS NULL AND color IS NULL AND icon IS NULL AND image_url IS NULL`,
        [c.id, values],
        tx,
      )
    })
  }
  return done
}

/** Distinct values of a column straight from Trino, under the reader's rights (filter lists). */
export async function liveValues(core: Core, userId: string, columnId: string, search: string, limit = 100): Promise<string[]> {
  const c = await core.db.one<{ name: string; schema_name: string; table_name: string; catalog: string }>(
    `SELECT c.name, t.schema_name, t.name AS table_name, d.catalog FROM db_column c JOIN db_table t ON t.id = c.table_id
     JOIN datasource d ON d.id = t.datasource_id WHERE c.id = $1`,
    [columnId],
  )
  if (!c) return []
  const col = q(c.name)
  const where = search
    ? `WHERE strpos(lower(CAST(${col} AS varchar)), lower(${quoteTrinoString(search)})) > 0`
    : `WHERE ${col} IS NOT NULL`
  const res = await core.engine.run(
    `SELECT DISTINCT CAST(${col} AS varchar) FROM ${q(c.catalog)}.${q(c.schema_name)}.${q(c.table_name)} ${where} ORDER BY 1 LIMIT ${Math.min(limit, 500)}`,
    { user: userId, timeoutMs: 30_000 },
  )
  return res.data.map((r) => String(r[0]))
}

/**
 * Values of a column restricted by the values chosen for other columns of the same table — a
 * dashboard's « ville » filter narrowed by its « pays ». Read live, under the reader's rights.
 */
export async function linkedValues(
  core: Core,
  userId: string,
  columnId: string,
  filters: readonly { column: string; values: readonly string[] }[],
  search = '',
  limit = 200,
): Promise<string[]> {
  const ids = [columnId, ...filters.map((f) => f.column)]
  const cols = await core.db.many<{ id: string; name: string; table_id: string; schema_name: string; table_name: string; catalog: string }>(
    `SELECT c.id, c.name, c.table_id, t.schema_name, t.name AS table_name, d.catalog FROM db_column c JOIN db_table t ON t.id = c.table_id
     JOIN datasource d ON d.id = t.datasource_id WHERE c.id = ANY($1)`,
    [ids],
  )
  const target = cols.find((c) => c.id === columnId)
  if (!target) return []
  const col = q(target.name)
  const where = [`${col} IS NOT NULL`]
  for (const f of filters) {
    const other = cols.find((c) => c.id === f.column)
    // Only the filters on the same table narrow the list; the others say nothing about it.
    if (!other || other.table_id !== target.table_id || other.id === target.id || f.values.length === 0) continue
    where.push(`CAST(${q(other.name)} AS varchar) IN (${f.values.map((v) => quoteTrinoString(String(v))).join(', ')})`)
  }
  if (search) where.push(`strpos(lower(CAST(${col} AS varchar)), lower(${quoteTrinoString(search)})) > 0`)
  const res = await core.engine.run(
    `SELECT DISTINCT CAST(${col} AS varchar) FROM ${q(target.catalog)}.${q(target.schema_name)}.${q(target.table_name)} WHERE ${where.join(' AND ')} ORDER BY 1 LIMIT ${Math.min(limit, 1000)}`,
    { user: userId, timeoutMs: 30_000 },
  )
  return res.data.map((r) => String(r[0]))
}
