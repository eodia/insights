import type { Trino } from 'trino-client'
import { type CatalogDefinition, createCatalogSql, dropCatalogSql } from './catalogs'
import {
  type RunOptions,
  type TrinoResult,
  createTrinoClient,
  runTrino,
} from './trino'

export * from './catalogs'
export * from './trino'

export interface EngineConfig {
  /** `http://localhost:58080` */
  readonly url: string
  /** The identity the application uses for its own statements: catalogs, sync. */
  readonly serviceUser: string
  readonly password?: string
  readonly localhostAlias?: string
}

/** Statements the service runs for itself are bounded by this, users' by their own limit. */
const SERVICE_TIMEOUT_MS = 120_000

/**
 * The query engine. One HTTP client, shared; every statement says whose it is (`X-Trino-User`),
 * which is what Trino hands to the OPA endpoint to decide.
 */
export class QueryEngine {
  private readonly client: Trino
  private readonly server: URL

  constructor(readonly config: EngineConfig) {
    this.server = new URL(config.url)
    this.client = createTrinoClient({
      host: this.server.hostname,
      port: Number(this.server.port) || (this.server.protocol === 'https:' ? 443 : 8080),
      ssl: this.server.protocol === 'https:',
      username: config.serviceUser,
      password: config.password,
    })
  }

  /** Runs a statement as `user` (an application user id) or as the service. */
  run(sql: string, opts: RunOptions & { catalog?: string; schema?: string } = {}): Promise<TrinoResult> {
    const { catalog, schema, ...rest } = opts
    return runTrino(
      this.client,
      sql,
      { ...(catalog ? { catalog } : {}), ...(schema ? { schema } : {}) },
      { timeoutMs: SERVICE_TIMEOUT_MS, ...rest, user: rest.user ?? this.config.serviceUser },
    )
  }

  async cancel(queryId: string): Promise<void> {
    await this.client.cancel(queryId).catch(() => undefined)
  }

  /** Whether the coordinator answers, and its version. */
  async info(): Promise<{ up: boolean; version?: string; starting?: boolean; error?: string }> {
    try {
      const res = await fetch(new URL('/v1/info', this.server), { signal: AbortSignal.timeout(3000) })
      const body = (await res.json()) as { nodeVersion?: { version?: string }; starting?: boolean }
      return { up: res.ok && body.starting !== true, version: body.nodeVersion?.version, starting: body.starting }
    } catch (err) {
      return { up: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async catalogs(): Promise<string[]> {
    const res = await this.run('SHOW CATALOGS')
    return res.data.map((r) => String(r[0]))
  }

  /** (Re)creates a catalog: dropped first when present, so a new password takes effect. */
  async putCatalog(def: CatalogDefinition): Promise<void> {
    await this.run(dropCatalogSql(def.catalog))
    await this.run(createCatalogSql({ ...def, localhostAlias: def.localhostAlias ?? this.config.localhostAlias }))
  }

  async dropCatalog(catalog: string): Promise<void> {
    await this.run(dropCatalogSql(catalog))
  }

  /** Creates the catalogs the coordinator lacks — after its restart, say. Returns their names. */
  async ensureCatalogs(defs: readonly CatalogDefinition[]): Promise<{ created: string[]; failed: { catalog: string; error: string }[] }> {
    const present = new Set(await this.catalogs())
    const created: string[] = []
    const failed: { catalog: string; error: string }[] = []
    for (const def of defs) {
      if (present.has(def.catalog)) continue
      try {
        await this.putCatalog(def)
        created.push(def.catalog)
      } catch (err) {
        failed.push({ catalog: def.catalog, error: err instanceof Error ? err.message : String(err) })
      }
    }
    return { created, failed }
  }
}
