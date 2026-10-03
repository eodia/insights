/** Accès au catalogue : `pg` brut, requêtes paramétrées, transactions explicites. */
import pg from 'pg'

// bigint and numeric as JS numbers: counts and sizes of the catalog stay far below 2^53.
pg.types.setTypeParser(20, (v) => Number(v))
pg.types.setTypeParser(1700, (v) => Number(v))

export type Row = Record<string, unknown>

export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<pg.QueryResult>
}

export class Db {
  readonly pool: pg.Pool

  constructor(url: string, readonly schema: string) {
    if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`Schéma de catalogue invalide : ${schema}`)
    this.pool = new pg.Pool({ connectionString: url, max: 15, idleTimeoutMillis: 30_000, options: `-c search_path=${schema},public` })
    this.pool.on('error', () => undefined)
  }

  async many<R extends object = Row>(sql: string, params: readonly unknown[] = [], q: Queryable = this.pool): Promise<R[]> {
    return (await q.query(sql, params as unknown[])).rows as R[]
  }

  async one<R extends object = Row>(sql: string, params: readonly unknown[] = [], q: Queryable = this.pool): Promise<R | undefined> {
    return (await q.query(sql, params as unknown[])).rows[0] as R | undefined
  }

  async exec(sql: string, params: readonly unknown[] = [], q: Queryable = this.pool): Promise<number> {
    return (await q.query(sql, params as unknown[])).rowCount ?? 0
  }

  async tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const out = await fn(client)
      await client.query('COMMIT')
      return out
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw err
    } finally {
      client.release()
    }
  }

  close(): Promise<void> {
    return this.pool.end()
  }
}
