/**
 * File de jobs dans le catalogue (`SELECT … FOR UPDATE SKIP LOCKED`) : synchronisations,
 * préchauffage, nettoyage. Le worker la vide ; en développement il tourne dans l'API.
 */
import type { JobState } from '@eodia/contracts'
import type { Core } from './context'

export type JobHandler = (
  core: Core,
  payload: Record<string, unknown>,
  progress: (step: string, done: number, total: number) => Promise<void>,
) => Promise<unknown>

export async function enqueue(
  core: Core,
  kind: string,
  payload: Record<string, unknown>,
  opts: { dedupe?: string; createdBy?: string | null; runAfter?: Date } = {},
): Promise<string> {
  if (opts.dedupe) {
    const existing = await core.db.one<{ id: string }>(
      `SELECT id::text FROM job WHERE dedupe_key = $1 AND status IN ('queued', 'running')`,
      [opts.dedupe],
    )
    if (existing) return existing.id
  }
  const row = await core.db.one<{ id: string }>(
    `INSERT INTO job (kind, payload, dedupe_key, created_by, run_after) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (dedupe_key) WHERE status IN ('queued', 'running') DO UPDATE SET dedupe_key = EXCLUDED.dedupe_key
     RETURNING id::text`,
    [kind, payload, opts.dedupe ?? null, opts.createdBy ?? null, opts.runAfter ?? new Date()],
  )
  return row?.id as string
}

export async function jobState(core: Core, id: string): Promise<JobState | null> {
  const row = await core.db.one<{
    id: string
    kind: string
    status: JobState['status']
    progress: JobState['progress']
    error: string | null
    result: unknown
    created_at: Date
    finished_at: Date | null
  }>('SELECT id::text, kind, status, progress, error, result, created_at, finished_at FROM job WHERE id = $1', [id])
  if (!row) return null
  return { ...row, created_at: row.created_at.toISOString(), finished_at: row.finished_at?.toISOString() ?? null }
}

export class Worker {
  private timer: NodeJS.Timeout | null = null
  private busy = false
  private stopped = false

  constructor(
    private readonly core: Core,
    private readonly handlers: Record<string, JobHandler>,
    private readonly onTick?: () => Promise<void>,
  ) {}

  start(intervalMs = 1500): void {
    this.stopped = false
    // Jobs left running by a stopped process go back to the queue.
    void this.core.db.exec(
      `UPDATE job SET status = 'queued', started_at = NULL WHERE status = 'running' AND heartbeat_at < now() - interval '2 minutes'`,
    )
    this.timer = setInterval(() => void this.tick(), intervalMs)
    this.timer.unref()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
  }

  async tick(): Promise<void> {
    if (this.busy || this.stopped) return
    this.busy = true
    try {
      await this.onTick?.().catch(() => undefined)
      for (;;) {
        const job = await this.core.db.one<{ id: string; kind: string; payload: Record<string, unknown> }>(
          `UPDATE job SET status = 'running', started_at = now(), heartbeat_at = now()
           WHERE id = (SELECT id FROM job WHERE status = 'queued' AND run_after <= now() ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
           RETURNING id::text, kind, payload`,
        )
        if (!job) break
        await this.run(job)
      }
    } finally {
      this.busy = false
    }
  }

  private async run(job: { id: string; kind: string; payload: Record<string, unknown> }): Promise<void> {
    const handler = this.handlers[job.kind]
    const progress = async (step: string, done: number, total: number) => {
      await this.core.db.exec('UPDATE job SET progress = $2, heartbeat_at = now() WHERE id = $1', [job.id, { step, done, total }])
    }
    try {
      if (!handler) throw new Error(`Job inconnu : ${job.kind}`)
      const result = await handler(this.core, job.payload, progress)
      await this.core.db.exec(`UPDATE job SET status = 'done', finished_at = now(), result = $2 WHERE id = $1`, [
        job.id,
        JSON.stringify(result ?? null),
      ])
    } catch (err) {
      await this.core.db.exec(`UPDATE job SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1`, [
        job.id,
        err instanceof Error ? err.message : String(err),
      ])
    }
  }
}
