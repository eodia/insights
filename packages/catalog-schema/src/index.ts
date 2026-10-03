/**
 * Migrations du catalogue : fichiers SQL numérotés, chacun exécuté dans sa transaction et
 * enregistré avec sa somme de contrôle. Une migration publiée (dans `sealed.json`) ne change
 * plus jamais : une installation dont la somme diffère refuse de démarrer.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type pg from 'pg'

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

export interface Migration {
  readonly id: number
  readonly name: string
  readonly sql: string
  readonly checksum: string
}

export function listMigrations(dir = MIGRATIONS_DIR): Migration[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((file) => {
      const sql = readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n')
      return {
        id: Number(file.slice(0, 4)),
        name: file.slice(5, -4),
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      }
    })
}

export class CatalogChecksumMismatch extends Error {
  constructor(readonly migration: string) {
    super(
      `CATALOG_CHECKSUM_MISMATCH : la migration ${migration} a changé depuis son application. Une migration appliquée ne se modifie pas : créez-en une nouvelle.`,
    )
  }
}

/** Applies the pending migrations, in order, each in its own transaction. Returns their names. */
export async function migrate(pool: pg.Pool, schema = 'eodia'): Promise<string[]> {
  const client = await pool.connect()
  const applied: string[] = []
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
    await client.query(`SET search_path TO ${schema}, public`)
    await client.query(`CREATE TABLE IF NOT EXISTS catalog_migration (
      id int PRIMARY KEY, name text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`)
    // One migrator at a time, whatever the number of API replicas.
    await client.query('SELECT pg_advisory_lock(727274)')
    try {
      const done = new Map<number, string>(
        (await client.query('SELECT id, checksum FROM catalog_migration')).rows.map((r) => [
          r.id as number,
          r.checksum as string,
        ]),
      )
      for (const m of listMigrations()) {
        const known = done.get(m.id)
        if (known !== undefined) {
          if (known !== m.checksum) throw new CatalogChecksumMismatch(`${m.id}_${m.name}`)
          continue
        }
        await client.query('BEGIN')
        try {
          await client.query(m.sql)
          await client.query('INSERT INTO catalog_migration (id, name, checksum) VALUES ($1, $2, $3)', [
            m.id,
            m.name,
            m.checksum,
          ])
          await client.query('COMMIT')
          applied.push(`${m.id}_${m.name}`)
        } catch (err) {
          await client.query('ROLLBACK')
          throw err
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(727274)')
    }
  } finally {
    client.release()
  }
  return applied
}
