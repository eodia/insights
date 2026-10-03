/**
 * Pilotes natifs — administration seulement : tester une connexion avant de créer son
 * catalogue Trino, et lire ce que Trino n'expose pas (clés primaires et étrangères,
 * commentaires, volumétrie estimée). Aucune requête d'utilisateur ne passe par ici.
 *
 * Chaque pilote est importé à la demande : une instance sans Oracle ne charge pas oracledb.
 */
import type { Engine } from '@eodia/contracts'

export type Settings = Readonly<Record<string, string | number | boolean | undefined>>

export interface NativeTable {
  readonly schema: string
  readonly name: string
  readonly comment: string | null
  readonly rowEstimate: number | null
}

export interface NativeColumn {
  readonly schema: string
  readonly table: string
  readonly name: string
  readonly comment: string | null
  readonly nativeType: string | null
  readonly pk: boolean
  readonly nullable: boolean
}

export interface NativeForeignKey {
  readonly schema: string
  readonly table: string
  readonly column: string
  readonly refSchema: string
  readonly refTable: string
  readonly refColumn: string
}

export interface NativeIntrospection {
  readonly tables: NativeTable[]
  readonly columns: NativeColumn[]
  readonly foreignKeys: NativeForeignKey[]
}

export interface TestResult {
  readonly ok: boolean
  readonly version?: string
  readonly error?: string
  readonly ms: number
}

const TIMEOUT_MS = 10_000
const s = (v: unknown) => (v === undefined || v === null ? '' : String(v))
const b = (v: unknown) => v === true || v === 'true' || v === 1
const n = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d)

/** The schemas of an engine that hold its own machinery, never synchronised. */
export const SYSTEM_SCHEMAS: Readonly<Record<Engine, readonly string[]>> = {
  postgresql: ['pg_catalog', 'information_schema', 'pg_toast'],
  mysql: ['mysql', 'information_schema', 'performance_schema', 'sys'],
  sqlserver: ['sys', 'information_schema', 'guest', 'db_owner', 'db_accessadmin', 'db_securityadmin', 'db_ddladmin', 'db_backupoperator', 'db_datareader', 'db_datawriter', 'db_denydatareader', 'db_denydatawriter'],
  oracle: ['sys', 'system', 'outln', 'xdb', 'mdsys', 'ctxsys', 'ordsys', 'wmsys', 'appqossys', 'dbsnmp', 'gsmadmin_internal', 'lbacsys', 'ojvmsys', 'olapsys', 'dvsys', 'audsys'],
  snowflake: ['information_schema'],
  mongodb: ['admin', 'local', 'config', 'information_schema'],
  trino: ['information_schema'],
}

function errorText(err: unknown): string {
  if (err instanceof AggregateError && err.errors.length > 0) return errorText(err.errors[0])
  if (err instanceof Error) return err.message || err.name
  return String(err)
}

async function timed(fn: () => Promise<string | undefined>): Promise<TestResult> {
  const start = Date.now()
  try {
    const version = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Délai dépassé (${TIMEOUT_MS / 1000} s).`)), TIMEOUT_MS).unref(),
      ),
    ])
    return { ok: true, ...(version ? { version } : {}), ms: Date.now() - start }
  } catch (err) {
    return { ok: false, error: errorText(err), ms: Date.now() - start }
  }
}

// ── PostgreSQL ──────────────────────────────────────────────────────────────

async function pgClient(st: Settings) {
  const pg = (await import('pg')).default
  const client = new pg.Client({
    host: s(st.host),
    port: n(st.port, 5432),
    database: s(st.database),
    user: s(st.user),
    password: s(st.password),
    ssl: b(st.ssl) ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: TIMEOUT_MS,
    statement_timeout: 60_000,
  })
  await client.connect()
  return client
}

async function pgIntrospect(st: Settings): Promise<NativeIntrospection> {
  const client = await pgClient(st)
  try {
    const tables = await client.query(`
      SELECT n.nspname AS schema, c.relname AS name, obj_description(c.oid, 'pg_class') AS comment,
             CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::bigint END AS rows
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'`)
    const columns = await client.query(`
      SELECT n.nspname AS schema, c.relname AS table, a.attname AS name,
             col_description(c.oid, a.attnum) AS comment, format_type(a.atttypid, a.atttypmod) AS type,
             NOT a.attnotnull AS nullable,
             EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY(i.indkey)) AS pk
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'`)
    const fks = await client.query(`
      SELECT ns.nspname AS schema, cl.relname AS table, att.attname AS column,
             nr.nspname AS ref_schema, clr.relname AS ref_table, attr.attname AS ref_column
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      JOIN pg_class clr ON clr.oid = con.confrelid JOIN pg_namespace nr ON nr.oid = clr.relnamespace
      JOIN LATERAL unnest(con.conkey, con.confkey) AS k(col, refcol) ON true
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.col
      JOIN pg_attribute attr ON attr.attrelid = con.confrelid AND attr.attnum = k.refcol
      WHERE con.contype = 'f' AND array_length(con.conkey, 1) = 1`)
    return {
      tables: tables.rows.map((r) => ({ schema: r.schema, name: r.name, comment: r.comment, rowEstimate: r.rows === null ? null : Number(r.rows) })),
      columns: columns.rows.map((r) => ({ schema: r.schema, table: r.table, name: r.name, comment: r.comment, nativeType: r.type, pk: r.pk, nullable: r.nullable })),
      foreignKeys: fks.rows.map((r) => ({ schema: r.schema, table: r.table, column: r.column, refSchema: r.ref_schema, refTable: r.ref_table, refColumn: r.ref_column })),
    }
  } finally {
    await client.end().catch(() => undefined)
  }
}

// ── MySQL ───────────────────────────────────────────────────────────────────

async function mysqlConn(st: Settings) {
  const mysql = await import('mysql2/promise')
  return mysql.createConnection({
    host: s(st.host),
    port: n(st.port, 3306),
    user: s(st.user),
    password: s(st.password),
    ...(s(st.database) ? { database: s(st.database) } : {}),
    connectTimeout: TIMEOUT_MS,
    ...(b(st.ssl) ? { ssl: { rejectUnauthorized: false } } : {}),
  })
}

async function mysqlIntrospect(st: Settings): Promise<NativeIntrospection> {
  const conn = await mysqlConn(st)
  try {
    const where = `NOT IN ('mysql','information_schema','performance_schema','sys')`
    const [tables] = await conn.query(
      `SELECT TABLE_SCHEMA AS s, TABLE_NAME AS t, TABLE_COMMENT AS c, TABLE_ROWS AS r FROM information_schema.TABLES WHERE TABLE_SCHEMA ${where}`,
    )
    const [columns] = await conn.query(
      `SELECT TABLE_SCHEMA AS s, TABLE_NAME AS t, COLUMN_NAME AS n, COLUMN_COMMENT AS c, COLUMN_TYPE AS ty, IS_NULLABLE AS nu, COLUMN_KEY AS k FROM information_schema.COLUMNS WHERE TABLE_SCHEMA ${where}`,
    )
    const [fks] = await conn.query(
      `SELECT TABLE_SCHEMA AS s, TABLE_NAME AS t, COLUMN_NAME AS n, REFERENCED_TABLE_SCHEMA AS rs, REFERENCED_TABLE_NAME AS rt, REFERENCED_COLUMN_NAME AS rc
       FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_NAME IS NOT NULL AND TABLE_SCHEMA ${where}`,
    )
    type Row = Record<string, unknown>
    return {
      tables: (tables as Row[]).map((r) => ({ schema: s(r.s), name: s(r.t), comment: s(r.c) || null, rowEstimate: r.r === null ? null : Number(r.r) })),
      columns: (columns as Row[]).map((r) => ({ schema: s(r.s), table: s(r.t), name: s(r.n), comment: s(r.c) || null, nativeType: s(r.ty), pk: r.k === 'PRI', nullable: r.nu === 'YES' })),
      foreignKeys: (fks as Row[]).map((r) => ({ schema: s(r.s), table: s(r.t), column: s(r.n), refSchema: s(r.rs), refTable: s(r.rt), refColumn: s(r.rc) })),
    }
  } finally {
    await conn.end().catch(() => undefined)
  }
}

// ── SQL Server ──────────────────────────────────────────────────────────────

async function mssqlPool(st: Settings) {
  const mssql = (await import('mssql')).default
  return mssql.connect({
    server: s(st.host),
    port: n(st.port, 1433),
    database: s(st.database),
    user: s(st.user),
    password: s(st.password),
    connectionTimeout: TIMEOUT_MS,
    requestTimeout: 60_000,
    options: { encrypt: b(st.encrypt), trustServerCertificate: b(st.trust_server_certificate) },
  })
}

async function mssqlIntrospect(st: Settings): Promise<NativeIntrospection> {
  const pool = await mssqlPool(st)
  try {
    const tables = await pool.request().query(`
      SELECT s.name AS s, t.name AS t, CAST(ep.value AS nvarchar(4000)) AS c,
             (SELECT SUM(p.rows) FROM sys.partitions p WHERE p.object_id = t.object_id AND p.index_id IN (0, 1)) AS r
      FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
      LEFT JOIN sys.extended_properties ep ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'`)
    const columns = await pool.request().query(`
      SELECT s.name AS s, t.name AS t, c.name AS n, CAST(ep.value AS nvarchar(4000)) AS cm, ty.name AS ty, c.is_nullable AS nu,
             CASE WHEN EXISTS (SELECT 1 FROM sys.index_columns ic JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                               WHERE i.is_primary_key = 1 AND ic.object_id = c.object_id AND ic.column_id = c.column_id) THEN 1 ELSE 0 END AS pk
      FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id JOIN sys.schemas s ON s.schema_id = t.schema_id
      JOIN sys.types ty ON ty.user_type_id = c.user_type_id
      LEFT JOIN sys.extended_properties ep ON ep.major_id = c.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description'`)
    const fks = await pool.request().query(`
      SELECT sp.name AS s, tp.name AS t, cp.name AS n, sr.name AS rs, tr.name AS rt, cr.name AS rc
      FROM sys.foreign_key_columns fkc
      JOIN sys.tables tp ON tp.object_id = fkc.parent_object_id JOIN sys.schemas sp ON sp.schema_id = tp.schema_id
      JOIN sys.columns cp ON cp.object_id = fkc.parent_object_id AND cp.column_id = fkc.parent_column_id
      JOIN sys.tables tr ON tr.object_id = fkc.referenced_object_id JOIN sys.schemas sr ON sr.schema_id = tr.schema_id
      JOIN sys.columns cr ON cr.object_id = fkc.referenced_object_id AND cr.column_id = fkc.referenced_column_id`)
    return {
      tables: tables.recordset.map((r) => ({ schema: r.s, name: r.t, comment: r.c ?? null, rowEstimate: r.r === null ? null : Number(r.r) })),
      columns: columns.recordset.map((r) => ({ schema: r.s, table: r.t, name: r.n, comment: r.cm ?? null, nativeType: r.ty, pk: r.pk === 1, nullable: !!r.nu })),
      foreignKeys: fks.recordset.map((r) => ({ schema: r.s, table: r.t, column: r.n, refSchema: r.rs, refTable: r.rt, refColumn: r.rc })),
    }
  } finally {
    await pool.close().catch(() => undefined)
  }
}

// ── Oracle ──────────────────────────────────────────────────────────────────

async function oracleConn(st: Settings) {
  const oracledb = (await import('oracledb')).default
  return oracledb.getConnection({
    user: s(st.user),
    password: s(st.password),
    connectString: `${s(st.host)}:${n(st.port, 1521)}/${s(st.service)}`,
    connectTimeout: TIMEOUT_MS / 1000,
  })
}

async function oracleIntrospect(st: Settings): Promise<NativeIntrospection> {
  const conn = await oracleConn(st)
  try {
    const exclude = SYSTEM_SCHEMAS.oracle.map((x) => `'${x.toUpperCase()}'`).join(',')
    const q = async (sql: string) =>
      ((await conn.execute(sql, [], { outFormat: 4002 /* OUT_FORMAT_OBJECT */ })).rows ?? []) as Record<string, unknown>[]
    const tables = await q(`SELECT t.OWNER AS S, t.TABLE_NAME AS T, c.COMMENTS AS C, t.NUM_ROWS AS R FROM ALL_TABLES t
      LEFT JOIN ALL_TAB_COMMENTS c ON c.OWNER = t.OWNER AND c.TABLE_NAME = t.TABLE_NAME WHERE t.OWNER NOT IN (${exclude})`)
    const columns = await q(`SELECT c.OWNER AS S, c.TABLE_NAME AS T, c.COLUMN_NAME AS N, cc.COMMENTS AS C, c.DATA_TYPE AS TY, c.NULLABLE AS NU,
        (SELECT COUNT(*) FROM ALL_CONSTRAINTS k JOIN ALL_CONS_COLUMNS kc ON kc.OWNER = k.OWNER AND kc.CONSTRAINT_NAME = k.CONSTRAINT_NAME
         WHERE k.CONSTRAINT_TYPE = 'P' AND k.OWNER = c.OWNER AND k.TABLE_NAME = c.TABLE_NAME AND kc.COLUMN_NAME = c.COLUMN_NAME) AS PK
      FROM ALL_TAB_COLUMNS c LEFT JOIN ALL_COL_COMMENTS cc ON cc.OWNER = c.OWNER AND cc.TABLE_NAME = c.TABLE_NAME AND cc.COLUMN_NAME = c.COLUMN_NAME
      WHERE c.OWNER NOT IN (${exclude})`)
    const fks = await q(`SELECT a.OWNER AS S, a.TABLE_NAME AS T, a.COLUMN_NAME AS N, b.OWNER AS RS, b.TABLE_NAME AS RT, b.COLUMN_NAME AS RC
      FROM ALL_CONSTRAINTS k JOIN ALL_CONS_COLUMNS a ON a.OWNER = k.OWNER AND a.CONSTRAINT_NAME = k.CONSTRAINT_NAME
      JOIN ALL_CONS_COLUMNS b ON b.OWNER = k.R_OWNER AND b.CONSTRAINT_NAME = k.R_CONSTRAINT_NAME AND b.POSITION = a.POSITION
      WHERE k.CONSTRAINT_TYPE = 'R' AND k.OWNER NOT IN (${exclude})`)
    return {
      tables: tables.map((r) => ({ schema: s(r.S), name: s(r.T), comment: (r.C as string) ?? null, rowEstimate: r.R === null ? null : Number(r.R) })),
      columns: columns.map((r) => ({ schema: s(r.S), table: s(r.T), name: s(r.N), comment: (r.C as string) ?? null, nativeType: s(r.TY), pk: Number(r.PK) > 0, nullable: r.NU === 'Y' })),
      foreignKeys: fks.map((r) => ({ schema: s(r.S), table: s(r.T), column: s(r.N), refSchema: s(r.RS), refTable: s(r.RT), refColumn: s(r.RC) })),
    }
  } finally {
    await conn.close().catch(() => undefined)
  }
}

// ── Snowflake ───────────────────────────────────────────────────────────────

async function snowflakeRun(st: Settings, sqls: string[]): Promise<Record<string, unknown>[][]> {
  const sf = (await import('snowflake-sdk')).default
  sf.configure({ logLevel: 'ERROR' })
  const conn = sf.createConnection({
    account: s(st.account).replace(/\.snowflakecomputing\.com$/i, ''),
    username: s(st.user),
    password: s(st.password),
    database: s(st.database),
    warehouse: s(st.warehouse),
    ...(s(st.role) ? { role: s(st.role) } : {}),
    timeout: TIMEOUT_MS,
  })
  await new Promise<void>((resolve, reject) => conn.connect((err) => (err ? reject(err) : resolve())))
  try {
    const out: Record<string, unknown>[][] = []
    for (const sqlText of sqls) {
      out.push(
        await new Promise((resolve, reject) =>
          conn.execute({
            sqlText,
            complete: (err, _stmt, rows) => (err ? reject(err) : resolve((rows ?? []) as Record<string, unknown>[])),
          }),
        ),
      )
    }
    return out
  } finally {
    conn.destroy(() => undefined)
  }
}

async function snowflakeIntrospect(st: Settings): Promise<NativeIntrospection> {
  const [tables = [], columns = [], pks = [], fks = []] = await snowflakeRun(st, [
    `SELECT TABLE_SCHEMA AS S, TABLE_NAME AS T, COMMENT AS C, ROW_COUNT AS R FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA <> 'INFORMATION_SCHEMA'`,
    `SELECT TABLE_SCHEMA AS S, TABLE_NAME AS T, COLUMN_NAME AS N, COMMENT AS C, DATA_TYPE AS TY, IS_NULLABLE AS NU FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA <> 'INFORMATION_SCHEMA'`,
    'SHOW PRIMARY KEYS IN DATABASE',
    'SHOW IMPORTED KEYS IN DATABASE',
  ])
  const pkSet = new Set(pks.map((r) => `${s(r.schema_name)}.${s(r.table_name)}.${s(r.column_name)}`.toLowerCase()))
  return {
    tables: tables.map((r) => ({ schema: s(r.S), name: s(r.T), comment: (r.C as string) ?? null, rowEstimate: r.R === null ? null : Number(r.R) })),
    columns: columns.map((r) => ({
      schema: s(r.S), table: s(r.T), name: s(r.N), comment: (r.C as string) ?? null, nativeType: s(r.TY),
      pk: pkSet.has(`${s(r.S)}.${s(r.T)}.${s(r.N)}`.toLowerCase()), nullable: r.NU === 'YES',
    })),
    foreignKeys: fks.map((r) => ({
      schema: s(r.fk_schema_name), table: s(r.fk_table_name), column: s(r.fk_column_name),
      refSchema: s(r.pk_schema_name), refTable: s(r.pk_table_name), refColumn: s(r.pk_column_name),
    })),
  }
}

// ── MongoDB ─────────────────────────────────────────────────────────────────

async function mongoClient(st: Settings) {
  const { MongoClient } = await import('mongodb')
  const client = new MongoClient(s(st.connection_url), { serverSelectionTimeoutMS: TIMEOUT_MS })
  await client.connect()
  return client
}

async function mongoIntrospect(st: Settings): Promise<NativeIntrospection> {
  const client = await mongoClient(st)
  try {
    const dbs = (await client.db('admin').admin().listDatabases()).databases.map((d) => d.name)
    const tables: NativeTable[] = []
    const columns: NativeColumn[] = []
    for (const dbName of dbs) {
      if (SYSTEM_SCHEMAS.mongodb.includes(dbName)) continue
      const db = client.db(dbName)
      for (const coll of await db.listCollections({}, { nameOnly: true }).toArray()) {
        if (coll.name.startsWith('system.') || coll.name === '_schema') continue
        const count = await db.collection(coll.name).estimatedDocumentCount().catch(() => null)
        tables.push({ schema: dbName, name: coll.name, comment: null, rowEstimate: count })
        columns.push({ schema: dbName, table: coll.name, name: '_id', comment: null, nativeType: 'ObjectId', pk: true, nullable: false })
      }
    }
    return { tables, columns, foreignKeys: [] }
  } finally {
    await client.close().catch(() => undefined)
  }
}

// ── Entrées ─────────────────────────────────────────────────────────────────

/** Opens a connection with the engine's own driver and reads its version. */
export function testConnection(engine: Engine, st: Settings): Promise<TestResult> {
  return timed(async () => {
    switch (engine) {
      case 'postgresql': {
        const c = await pgClient(st)
        try {
          return String((await c.query('SELECT version() AS v')).rows[0]?.v ?? '').split(' on ')[0]
        } finally {
          await c.end()
        }
      }
      case 'mysql': {
        const c = await mysqlConn(st)
        try {
          const [rows] = await c.query('SELECT VERSION() AS v')
          return `MySQL ${s((rows as { v: string }[])[0]?.v)}`
        } finally {
          await c.end()
        }
      }
      case 'sqlserver': {
        const p = await mssqlPool(st)
        try {
          return s((await p.request().query('SELECT @@VERSION AS v')).recordset[0]?.v).split('\n')[0]
        } finally {
          await p.close()
        }
      }
      case 'oracle': {
        const c = await oracleConn(st)
        try {
          return `Oracle ${c.oracleServerVersionString}`
        } finally {
          await c.close()
        }
      }
      case 'snowflake': {
        const [rows = []] = await snowflakeRun(st, ['SELECT CURRENT_VERSION() AS V'])
        return `Snowflake ${s(rows[0]?.V)}`
      }
      case 'mongodb': {
        const c = await mongoClient(st)
        try {
          const info = await c.db('admin').command({ buildInfo: 1 })
          return `MongoDB ${s(info.version)}`
        } finally {
          await c.close()
        }
      }
      case 'trino':
        // A raw Trino connector has no native driver: the catalog creation is the test.
        return undefined
    }
  })
}

/** What Trino does not tell: keys, comments, volumes. Empty for a bare Trino connector. */
export async function introspect(engine: Engine, st: Settings): Promise<NativeIntrospection> {
  switch (engine) {
    case 'postgresql':
      return pgIntrospect(st)
    case 'mysql':
      return mysqlIntrospect(st)
    case 'sqlserver':
      return mssqlIntrospect(st)
    case 'oracle':
      return oracleIntrospect(st)
    case 'snowflake':
      return snowflakeIntrospect(st)
    case 'mongodb':
      return mongoIntrospect(st)
    case 'trino':
      return { tables: [], columns: [], foreignKeys: [] }
  }
}
