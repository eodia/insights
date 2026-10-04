/**
 * Worker d'eodia insights, pour la production : il vide la file de jobs du catalogue
 * (synchronisations, préchauffage des tableaux de bord, contenu de démonstration) pendant que
 * l'API tourne avec `INPROCESS_WORKER=0`. Plusieurs workers peuvent tourner ensemble :
 * chacun prend ses jobs par `FOR UPDATE SKIP LOCKED`.
 */
import { loadConfig, prepare, start } from '@eodia/core'

const log = (m: string) => console.log(`[eodia-worker] ${m}`)

const config = loadConfig()
// Migrations run here too: whichever of the API and the worker starts first applies them,
// under the advisory lock of the catalog.
const core = await prepare(config, log)
const { worker } = await start(core, { worker: true, log })
log(`prêt (Trino ${config.trinoUrl})`)

// The worker's own timer does not hold the process open: this one does, until a signal.
const alive = setInterval(() => undefined, 60_000)

let stopping = false
async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true
  log(`${signal} reçu : arrêt`)
  worker?.stop()
  clearInterval(alive)
  // A job underway finishes or goes back to the queue: a stopped worker's running jobs are
  // requeued by the next one once their heartbeat is stale.
  await core.close().catch(() => undefined)
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
