/**
 * Mentions and the notifications they bring. A comment or an annotation calls on someone by
 * writing `@[Their name](their-id)`; that person — a member of the space who may open what it is
 * about, nobody else — is told so in the application, and by e-mail when SMTP is set.
 */
import type { AppNotification } from '@eodia/contracts'
import { summaryOf } from '../auth/users'
import type { Actor, Core } from '../context'
import { sendMail } from '../mailer'
import { getDashboard, getQuestion } from './items'

const MENTION = /@\[([^\]\n]{1,120})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi

/** The people a text calls on, once each. */
export function mentionsIn(text: string): string[] {
  return [...new Set([...text.matchAll(MENTION)].map((m) => (m[2] as string).toLowerCase()))]
}

/** A text as one reads it: `@[Marie](…)` becomes « @Marie ». */
export const readable = (text: string) => text.replace(MENTION, (_m, name: string) => `@${name}`)

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * Tells those a text mentions — on a dashboard's card, or on a question —, if they may open it.
 * Their access is checked under their own identity: one cannot learn a comment of a dashboard
 * one may not see by being mentioned in it.
 */
export async function notifyMentions(core: Core, actor: Actor, about: { dashboard?: string; question?: string; card?: string }, text: string): Promise<void> {
  const ids = mentionsIn(text).filter((id) => id !== actor.userId)
  if (!ids.length) return
  const members = await core.db.many<{ id: string; email: string; name: string }>(
    `SELECT u.id, u.email, u.name FROM app_user u JOIN workspace_member m ON m.user_id = u.id AND m.workspace_id = $2
     WHERE u.id = ANY($1::uuid[]) AND u.active`,
    [ids, actor.workspaceId],
  )
  const author = (await summaryOf(core, [actor.userId])).get(actor.userId)?.name ?? 'Quelqu’un'
  const excerpt = readable(text).slice(0, 280)
  for (const m of members) {
    const reader: Actor = { userId: m.id, workspaceId: actor.workspaceId, via: 'system' }
    let title: string
    let path: string
    try {
      if (about.dashboard) {
        title = (await getDashboard(core, reader, about.dashboard)).name
        path = `/dashboard/${about.dashboard}`
      } else if (about.question) {
        title = (await getQuestion(core, reader, about.question)).name
        path = `/question/${about.question}`
      } else continue
    } catch {
      continue
    }
    await core.db.exec(
      `INSERT INTO notification (user_id, workspace_id, kind, actor_id, dashboard_id, question_id, card_id, excerpt) VALUES ($1, $2, 'mention', $3, $4, $5, $6, $7)`,
      [m.id, actor.workspaceId, actor.userId, about.dashboard ?? null, about.dashboard ? null : (about.question ?? null), about.card ?? null, excerpt],
    )
    const url = `${core.config.publicUrl.replace(/\/+$/, '')}${path}`
    const subject = `${author} vous a mentionné sur « ${title} »`
    const textBody = `${author} vous a mentionné sur « ${title} » :\n\n${excerpt}\n\nOuvrir : ${url}`
    const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#18181b">
      <p style="margin:0 0 12px"><strong>${escape(author)}</strong> vous a mentionné sur « ${escape(title)} » :</p>
      <blockquote style="margin:0 0 20px;padding:10px 14px;border-left:3px solid #2da31e;background:#f4f7f3;border-radius:6px">${escape(excerpt)}</blockquote>
      <p><a href="${escape(url)}" style="background:#2da31e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Ouvrir</a></p></div>`
    // The e-mail is a courtesy: the notification is already there.
    void sendMail(core, m.email, subject, textBody, html).catch(() => undefined)
  }
}

/** The person's latest notifications, and how many are unread. */
export async function listNotifications(core: Core, actor: Actor): Promise<{ items: AppNotification[]; unread: number }> {
  const rows = await core.db.many<{
    id: string
    kind: string
    actor_id: string | null
    dashboard_id: string | null
    question_id: string | null
    card_id: string | null
    excerpt: string
    created_at: Date
    read_at: Date | null
    dashboard_name: string | null
    question_name: string | null
  }>(
    `SELECT n.id, n.kind, n.actor_id, n.dashboard_id, n.question_id, n.card_id, n.excerpt, n.created_at, n.read_at,
            d.name AS dashboard_name, q.name AS question_name
     FROM notification n LEFT JOIN dashboard d ON d.id = n.dashboard_id LEFT JOIN question q ON q.id = n.question_id
     WHERE n.user_id = $1 AND n.workspace_id = $2 ORDER BY n.created_at DESC LIMIT 50`,
    [actor.userId, actor.workspaceId],
  )
  const people = await summaryOf(core, rows.map((r) => r.actor_id))
  const unread = await core.db.one<{ n: number }>('SELECT count(*)::int AS n FROM notification WHERE user_id = $1 AND workspace_id = $2 AND read_at IS NULL', [
    actor.userId,
    actor.workspaceId,
  ])
  return {
    unread: unread?.n ?? 0,
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind as AppNotification['kind'],
      actor: (r.actor_id && people.get(r.actor_id)) || null,
      dashboard: r.dashboard_id ? { id: r.dashboard_id, name: r.dashboard_name ?? '' } : null,
      question: r.question_id ? { id: r.question_id, name: r.question_name ?? '' } : null,
      card: r.card_id,
      excerpt: r.excerpt,
      created_at: r.created_at.toISOString(),
      read: r.read_at !== null,
    })),
  }
}

/** Notifications read: those named, or all of them. */
export async function readNotifications(core: Core, actor: Actor, ids?: readonly string[]): Promise<void> {
  if (ids?.length) {
    await core.db.exec('UPDATE notification SET read_at = now() WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL', [actor.userId, ids])
  } else await core.db.exec('UPDATE notification SET read_at = now() WHERE user_id = $1 AND workspace_id = $2 AND read_at IS NULL', [actor.userId, actor.workspaceId])
}
