/** Historique des requêtes et snippets SQL. */
import type { QueryExecution, Snippet } from '@eodia/contracts'
import { isAdmin } from '../access/decide'
import { audit } from '../audit'
import { summaryOf } from '../auth/users'
import { type Actor, type Core, principalOf } from '../context'
import { AppError, notFound } from '../errors'

export async function history(
  core: Core,
  actor: Actor,
  opts: { all?: boolean; origin?: string; limit?: number; before?: number; errors?: boolean } = {},
): Promise<QueryExecution[]> {
  const snap = await core.snapshot()
  // The executions of the space; everyone's there for its administrators.
  const where: string[] = []
  const params: unknown[] = [actor.workspaceId]
  where.push('workspace_id = $1')
  if (!(opts.all && isAdmin(snap, principalOf(actor)))) {
    params.push(actor.userId)
    where.push(`user_id = $${params.length}`)
  }
  if (opts.origin) {
    params.push(opts.origin)
    where.push(`origin = $${params.length}`)
  }
  if (opts.before) {
    params.push(opts.before)
    where.push(`id < $${params.length}`)
  }
  if (opts.errors) where.push('error IS NOT NULL')
  params.push(Math.min(opts.limit ?? 100, 500))
  const rows = await core.db.many<{
    id: number
    user_id: string | null
    origin: QueryExecution['origin']
    question_id: string | null
    sql: string
    duration_ms: number
    row_count: number | null
    error: string | null
    cached: boolean
    at: Date
  }>(
    `SELECT id, user_id, origin, question_id, sql, duration_ms, row_count, error, cached, at FROM query_execution
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT $${params.length}`,
    params,
  )
  const users = await summaryOf(core, rows.map((r) => r.user_id))
  return rows.map((r) => ({
    id: String(r.id),
    user: (r.user_id && users.get(r.user_id)) || null,
    origin: r.origin,
    question: r.question_id,
    sql: r.sql,
    duration_ms: r.duration_ms,
    rows: r.row_count,
    error: r.error,
    cached: r.cached,
    at: r.at.toISOString(),
  }))
}

/** The snippets of the actor's space. */
export async function listSnippets(core: Core, actor: Actor): Promise<Snippet[]> {
  return core.db.many<Snippet & Record<string, unknown>>('SELECT id, name, description, content FROM snippet WHERE workspace_id = $1 ORDER BY name', [
    actor.workspaceId,
  ])
}

export async function saveSnippet(core: Core, actor: Actor, input: { id?: string; name: string; description?: string | null; content: string }): Promise<Snippet> {
  const name = input.name.trim()
  if (!/^[\p{L}\p{N} _-]{1,80}$/u.test(name)) throw new AppError('INVALID_INPUT', 'Nom de snippet invalide (lettres, chiffres, espaces, - et _).')
  const row = input.id
    ? await core.db.one<Snippet & Record<string, unknown>>(
        'UPDATE snippet SET name = $2, description = $3, content = $4, updated_at = now() WHERE id = $1 AND workspace_id = $5 RETURNING id, name, description, content',
        [input.id, name, input.description ?? null, input.content, actor.workspaceId],
      )
    : await core.db.one<Snippet & Record<string, unknown>>(
        'INSERT INTO snippet (name, description, content, created_by, workspace_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, description, content',
        [name, input.description ?? null, input.content, actor.userId, actor.workspaceId],
      )
  if (!row) throw notFound('Snippet introuvable.')
  await audit(core, actor, 'snippet.save', { kind: 'snippet', id: row.id }, { name })
  return row
}

export async function deleteSnippet(core: Core, actor: Actor, id: string): Promise<void> {
  await core.db.exec('DELETE FROM snippet WHERE id = $1 AND workspace_id = $2', [id, actor.workspaceId])
  await audit(core, actor, 'snippet.delete', { kind: 'snippet', id })
}
