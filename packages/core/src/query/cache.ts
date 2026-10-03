/**
 * Cache de résultats : clé = hash(SQL compilé + empreinte des droits effectifs), pour que deux
 * personnes aux droits différents ne partagent jamais une entrée. Un LRU en mémoire devant une
 * table du catalogue (partagée par les répliques et le worker de préchauffage).
 */
import { createHash } from 'node:crypto'
import type { QueryResult } from '@eodia/contracts'
import type { Core } from '../context'

const MAX_ENTRY_BYTES = 5_000_000
const LRU_ENTRIES = 200

interface Entry {
  readonly result: QueryResult
  readonly expires: number
  readonly at: number
}

const lru = new Map<string, Entry>()

export const cacheKey = (sql: string, fingerprint: string, limit: number) =>
  createHash('sha256').update(`${fingerprint}\u0000${limit}\u0000${sql}`).digest('hex')

export async function cacheGet(core: Core, key: string): Promise<(QueryResult & { cached_at: string }) | null> {
  const mem = lru.get(key)
  if (mem && mem.expires > Date.now()) {
    lru.delete(key)
    lru.set(key, mem)
    return { ...mem.result, cached_at: new Date(mem.at).toISOString() }
  }
  const row = await core.db.one<{ payload: QueryResult; created_at: Date; expires_at: Date }>(
    'SELECT payload, created_at, expires_at FROM result_cache WHERE key = $1 AND expires_at > now()',
    [key],
  )
  if (!row) return null
  remember(key, { result: row.payload, expires: row.expires_at.getTime(), at: row.created_at.getTime() })
  return { ...row.payload, cached_at: row.created_at.toISOString() }
}

function remember(key: string, entry: Entry): void {
  lru.set(key, entry)
  while (lru.size > LRU_ENTRIES) lru.delete(lru.keys().next().value as string)
}

/**
 * Stores a result. `ttl` in seconds; `adaptive`: proportional to how long it took — a query
 * that took 10 s is kept longer than one that took 50 ms, as Metabase does.
 */
export async function cachePut(core: Core, key: string, result: QueryResult, ttl: number | 'adaptive'): Promise<void> {
  const seconds = ttl === 'adaptive' ? Math.min(Math.max(Math.round(result.duration_ms / 10), 60), 86_400) : ttl
  if (seconds <= 0) return
  const payload = JSON.stringify(result)
  if (payload.length > MAX_ENTRY_BYTES) return
  const expires = Date.now() + seconds * 1000
  remember(key, { result, expires, at: Date.now() })
  await core.db
    .exec(
      `INSERT INTO result_cache (key, payload, bytes, duration_ms, expires_at) VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, bytes = EXCLUDED.bytes, duration_ms = EXCLUDED.duration_ms,
         created_at = now(), expires_at = EXCLUDED.expires_at`,
      [key, payload, payload.length, result.duration_ms, expires],
    )
    .catch(() => undefined)
}

/** Empties the cache — after a permission change, or on demand. */
export async function cacheClear(core: Core): Promise<number> {
  lru.clear()
  return core.db.exec('DELETE FROM result_cache')
}

export async function cachePurgeExpired(core: Core): Promise<void> {
  await core.db.exec('DELETE FROM result_cache WHERE expires_at < now()')
}

export async function cacheStats(core: Core) {
  return core.db.one<{ entries: number; bytes: number }>('SELECT count(*)::int AS entries, coalesce(sum(bytes), 0)::bigint AS bytes FROM result_cache WHERE expires_at > now()')
}
