import type { Config } from './config'
import { Core } from './context'
import { demoContent, seedDemo } from './demo'
import { Worker } from './jobs'
import { cachePurgeExpired } from './query/cache'
import { prewarmDashboards } from './query/run'
import { ensureCatalogs, scheduleDueSyncs } from './sources/datasources'
import { syncJob } from './sources/sync'

export * from './access/decide'
export * from './access/opa'
export * from './access/snapshot'
export * from './admin/permissions'
export * from './ai/copilot'
export * from './audit'
export * from './auth/oidc'
export * from './auth/users'
export * from './config'
export * from './content/access'
export * from './content/folders'
export * from './content/items'
export * from './context'
export * from './crypto'
export * from './demo'
export * from './env'
export * from './errors'
export * from './i18n'
export * from './jobs'
export * from './mailer'
export * from './query/cache'
export * from './query/export'
export * from './query/history'
export * from './query/run'
export * from './sharing/links'
export * from './sources/datasources'
export * from './sources/metadata'
export * from './sources/sync'

export const JOB_HANDLERS = {
  sync: syncJob,
  demo_content: (core: Core, payload: Record<string, unknown>) => demoContent(core, payload),
  prewarm: (core: Core) => prewarmDashboards(core),
}

let lastHousekeeping = 0

/** What the worker does between jobs: due syncs, cache expiry, preloaded dashboards. */
export async function housekeeping(core: Core): Promise<void> {
  if (Date.now() - lastHousekeeping < 60_000) return
  lastHousekeeping = Date.now()
  await scheduleDueSyncs(core)
  await cachePurgeExpired(core)
  // Catalogs lost by a Trino restart come back without waiting for a query to miss them.
  await ensureCatalogs(core).catch(() => undefined)
  const minute = new Date().getMinutes()
  if (minute % 15 === 0) {
    const { enqueue } = await import('./jobs')
    await enqueue(core, 'prewarm', {}, { dedupe: 'prewarm' })
  }
}

export interface Booted {
  readonly core: Core
  readonly worker: Worker | null
}

/** Opens the catalog database and applies its migrations. Nothing touches Trino yet. */
export async function prepare(config: Config, log: (m: string) => void = defaultLog): Promise<Core> {
  const core = new Core(config)
  const applied = await core.migrate()
  if (applied.length) log(`catalogue : ${applied.join(', ')} appliquée(s)`)
  return core
}

const defaultLog = (m: string) => console.log(`[eodia] ${m}`)

/**
 * Starts what needs Trino — catalogs, demo content — and, in development, the worker. Call it
 * once the OPA endpoint answers: Trino asks it before every statement, the service's included.
 */
export async function start(core: Core, opts: { worker?: boolean; log?: (m: string) => void } = {}): Promise<Booted> {
  const log = opts.log ?? defaultLog
  const config = core.config
  const trino = await core.engine.info()
  if (trino.up) {
    try {
      const { created, failed } = await ensureCatalogs(core)
      if (created.length) log(`Trino ${trino.version} : catalogues recréés (${created.join(', ')})`)
      for (const f of failed) log(`catalogue ${f.catalog} non recréé : ${f.error}`)
    } catch (err) {
      log(`Trino répond mais refuse les requêtes : ${err instanceof Error ? err.message : String(err)}`)
    }
  } else {
    log(`Trino injoignable (${config.trinoUrl}) : les requêtes échoueront jusqu'à son démarrage.`)
  }
  if (config.demo && trino.up) {
    if (await seedDemo(core)) log('instance de démonstration créée (admin@eodia.local / eodia-insights)')
  }
  let worker: Worker | null = null
  if (opts.worker ?? config.inProcessWorker) {
    worker = new Worker(core, JOB_HANDLERS, () => housekeeping(core))
    worker.start()
  }
  return { core, worker }
}

export { Core }
