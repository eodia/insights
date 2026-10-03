import type { Actor, Core } from './context'

/** Writes one line of the audit log. Never fails the action it records. */
export async function audit(
  core: Core,
  actor: Actor | null,
  action: string,
  target?: { kind: string; id: string | null },
  details: Record<string, unknown> = {},
): Promise<void> {
  await core.db
    .exec(
      'INSERT INTO audit_log (actor_id, action, target_kind, target_id, details, ip) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        actor && actor.via !== 'system' ? actor.userId : null,
        action,
        target?.kind ?? null,
        target?.id ?? null,
        JSON.stringify({ ...details, ...(actor && actor.via !== 'session' ? { via: actor.via } : {}) }),
        actor?.ip ?? null,
      ],
    )
    .catch(() => undefined)
}

export async function listAudit(
  core: Core,
  opts: { limit?: number; before?: number; action?: string; actor?: string } = {},
) {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.before) {
    params.push(opts.before)
    where.push(`a.id < $${params.length}`)
  }
  if (opts.action) {
    params.push(`${opts.action}%`)
    where.push(`a.action LIKE $${params.length}`)
  }
  if (opts.actor) {
    params.push(opts.actor)
    where.push(`a.actor_id = $${params.length}`)
  }
  params.push(Math.min(opts.limit ?? 100, 500))
  return core.db.many(
    `SELECT a.id, a.at, a.action, a.target_kind, a.target_id, a.details, a.ip,
            u.id AS actor_id, u.name AS actor_name, u.email AS actor_email
     FROM audit_log a LEFT JOIN app_user u ON u.id = a.actor_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY a.id DESC LIMIT $${params.length}`,
    params,
  )
}
