import type { Config } from './config'
import { needsSetup } from './auth/users'
import { Core } from './context'
import { checkAlert, purgeDeliveries, scheduleDueAlerts } from './delivery/alerts'
import { deliverSubscription, scheduleDueSubscriptions } from './delivery/subscriptions'
import { demoContent, seedDemo } from './demo'
import { Worker } from './jobs'
import { cachePurgeExpired } from './query/cache'
import { prewarmDashboards } from './query/run'
import { ensureCatalogs, scheduleDueSyncs } from './sources/datasources'
import { refreshDueViews, refreshViewJob } from './sources/views'
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
export * from './content/home'
export * from './content/versions'
export * from './content/notifications'
export * from './content/items'
export * from './content/dashboard-views'
export * from './content/comments'
export * from './content/themes'
export * from './context'
export * from './crypto'
export * from './delivery/alerts'
export * from './delivery/channels'
export * from './delivery/render'
export * from './delivery/subscriptions'
export * from './demo'
export * from './env'
export * from './errors'
export * from './i18n'
export * from './jobs'
export * from './mailer'
export * from './query/cache'
export * from './query/export'
export * from './query/history'
export * from './query/performance'
export * from './ai/summary'
export * from './query/insights'
export * from './query/run'
export * from './sharing/links'
export * from './sources/datasources'
export * from './sources/views'
export * from './sources/metadata'
export * from './sources/sync'
export * from './workspaces'

export const JOB_HANDLERS = {
  sync: syncJob,
  demo_content: (core: Core, payload: Record<string, unknown>) => demoContent(core, payload),
  prewarm: (core: Core) => prewarmDashboards(core),
  refresh_view: (core: Core, payload: Record<string, unknown>) => refreshViewJob(core, payload),
  deliver_subscription: (core: Core, payload: Record<string, unknown>) =>
    deliverSubscription(core, String(payload.id), typeof payload.only_to === 'string' ? { onlyTo: payload.only_to } : {}),
  check_alert: (core: Core, payload: Record<string, unknown>) => checkAlert(core, String(payload.id), { force: payload.force === true }),
}

let lastHousekeeping = 0
let lastPurge = 0

/** What the worker does between jobs: due syncs, cache expiry, preloaded dashboards. */
export async function housekeeping(core: Core): Promise<void> {
  if (Date.now() - lastHousekeeping < 60_000) return
  lastHousekeeping = Date.now()
  await scheduleDueSyncs(core)
  await cachePurgeExpired(core)
  // Catalogs lost by a Trino restart come back without waiting for a query to miss them.
  await ensureCatalogs(core).catch(() => undefined)
  // Subscriptions and alerts whose time has come: checked every minute.
  await scheduleDueSubscriptions(core).catch(() => undefined)
  await scheduleDueAlerts(core).catch(() => undefined)
  const minute = new Date().getMinutes()
  // Old deliveries and channel pictures: a few times a day is plenty.
  if (Date.now() - lastPurge > 6 * 3_600_000) {
    lastPurge = Date.now()
    await purgeDeliveries(core).catch(() => undefined)
  }
  // Materialized views refreshed on a schedule: checked every five minutes.
  if (minute % 5 === 0) await refreshDueViews(core).catch(() => undefined)
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
  const runsWorker = opts.worker ?? config.inProcessWorker
  // The demo is created by the process that runs the jobs — its content is one —, once Trino
  // takes statements: in a single container (`all`), the worker may come up before Trino, or
  // before the API whose OPA endpoint Trino asks.
  const seeding = config.demo && runsWorker && (await needsSetup(core))
  const trino = seeding ? await trinoReady(core, log) : await core.engine.info()
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
  if (seeding && trino.up) {
    if (await seedDemo(core)) log('instance de démonstration créée (admin@eodia.local / eodia-insights)')
  }
  let worker: Worker | null = null
  if (runsWorker) {
    worker = new Worker(core, JOB_HANDLERS, () => housekeeping(core))
    worker.start()
  }
  return { core, worker }
}

/** Trino up and taking statements — its OPA endpoint answering —, waited for three minutes at most. */
async function trinoReady(core: Core, log: (m: string) => void): Promise<{ up: boolean; version?: string }> {
  for (let i = 0; i < 90; i++) {
    const info = await core.engine.info()
    if (info.up) {
      try {
        await core.engine.catalogs()
        return info
      } catch {
        // The OPA endpoint does not answer yet.
      }
    }
    if (i === 0) log('démo : en attente de Trino…')
    await new Promise((r) => setTimeout(r, 2000))
  }
  return core.engine.info()
}

export { Core }
