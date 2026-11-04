/**
 * Subscriptions: a dashboard sent on a schedule, by e-mail to people of the space and posted
 * to Teams or Slack channels.
 *
 * Security: each person who receives it receives it as they would see it — every card is
 * computed under their own identity, their row filters and masks applied; one who can no longer
 * open the dashboard receives nothing. A channel is read by people the instance does not know:
 * what is posted there is what the subscription's owner sees, their choice to publish it.
 */
import {
  type Dashboard,
  type DeliveryStatus,
  type ExportOptions,
  type ParameterValue,
  type Schedule,
  type Subscription,
  type SubscriptionFormat,
  type SubscriptionInput,
  nextRun,
} from '@eodia/contracts'
import { isAdmin } from '../access/decide'
import { summaryOf } from '../auth/users'
import { getDashboard } from '../content/items'
import type { Actor, Core } from '../context'
import { forbidden, invalid, notFound } from '../errors'
import { mailEnabled, sendMail } from '../mailer'
import { channelsOf, postToChannel, saveChannels, storeFile } from './channels'
import { digestDashboard, digestHtml, digestLines, digestText } from './digest'
import { renderDashboard, renderEnabled } from './render'
import { escapeHtml, periodLabel, word } from './words'

interface SubscriptionRow {
  id: string
  workspace_id: string
  dashboard_id: string
  user_id: string
  name: string
  schedule: Schedule
  format: SubscriptionFormat
  options: ExportOptions
  filter_values: Record<string, ParameterValue | null>
  recipients: string[]
  message: string
  enabled: boolean
  next_run_at: Date | null
  last_run_at: Date | null
  last_status: DeliveryStatus | null
  last_error: string | null
  created_at: Date
}

const SELECT = 'SELECT s.*, d.name AS dashboard_name FROM subscription s JOIN dashboard d ON d.id = s.dashboard_id'

async function toSubscriptions(core: Core, actor: Actor, rows: (SubscriptionRow & { dashboard_name: string })[]): Promise<Subscription[]> {
  const people = await summaryOf(core, rows.flatMap((r) => [r.user_id, ...r.recipients]))
  const channels = await channelsOf(core, 'subscription_id', rows.map((r) => r.id))
  return rows.map((r) => ({
    id: r.id,
    dashboard: r.dashboard_id,
    dashboard_name: r.dashboard_name,
    name: r.name,
    owner: people.get(r.user_id) ?? null,
    mine: r.user_id === actor.userId,
    schedule: r.schedule,
    format: r.format,
    options: r.options,
    values: r.filter_values,
    recipients: r.recipients.flatMap((id) => {
      const p = people.get(id)
      return p ? [p] : []
    }),
    // The addresses stay here: a browser learns a channel's name, never its webhook.
    channels: (channels.get(r.id) ?? []).map(({ url: _url, ...c }) => c),
    message: r.message,
    enabled: r.enabled,
    next_run_at: r.next_run_at?.toISOString() ?? null,
    last_run_at: r.last_run_at?.toISOString() ?? null,
    last_status: r.last_status,
    last_error: r.last_error,
    created_at: r.created_at.toISOString(),
  }))
}

const isWorkspaceAdmin = async (core: Core, actor: Actor) => isAdmin(await core.snapshot(), `${actor.userId}@${actor.workspaceId}`)

/** One's subscriptions — of a dashboard, or all; an administrator sees everyone's in the space. */
export async function listSubscriptions(core: Core, actor: Actor, filter: { dashboard?: string } = {}): Promise<Subscription[]> {
  const admin = await isWorkspaceAdmin(core, actor)
  const rows = await core.db.many<SubscriptionRow & { dashboard_name: string }>(
    `${SELECT} WHERE s.workspace_id = $1 AND ($2::boolean OR s.user_id = $3) AND ($4::uuid IS NULL OR s.dashboard_id = $4) ORDER BY s.created_at DESC`,
    [actor.workspaceId, admin, actor.userId, filter.dashboard ?? null],
  )
  return toSubscriptions(core, actor, rows)
}

async function ownRow(core: Core, actor: Actor, id: string): Promise<SubscriptionRow & { dashboard_name: string }> {
  const row = await core.db.one<SubscriptionRow & { dashboard_name: string }>(`${SELECT} WHERE s.id = $1 AND s.workspace_id = $2`, [id, actor.workspaceId])
  if (!row) throw notFound('Abonnement introuvable.')
  if (row.user_id !== actor.userId && !(await isWorkspaceAdmin(core, actor))) throw forbidden('Cet abonnement est à quelqu’un d’autre.')
  return row
}

/** The people among `ids` who belong to the space — the only ones a subscription may name. */
async function members(core: Core, workspaceId: string, ids: readonly string[]): Promise<string[]> {
  if (!ids.length) return []
  const rows = await core.db.many<{ user_id: string }>(
    `SELECT m.user_id FROM workspace_member m JOIN app_user u ON u.id = m.user_id WHERE m.workspace_id = $1 AND m.user_id = ANY($2::uuid[]) AND u.active`,
    [workspaceId, [...new Set(ids)]],
  )
  return ids.filter((id) => rows.some((r) => r.user_id === id))
}

export async function saveSubscription(core: Core, actor: Actor, input: SubscriptionInput, id?: string): Promise<Subscription> {
  const previous = id ? await ownRow(core, actor, id) : undefined
  if (previous && previous.dashboard_id !== input.dashboard) throw invalid('Un abonnement garde son tableau de bord.')
  await getDashboard(core, actor, input.dashboard)
  if (!input.recipients.length && !input.channels.length) throw invalid('Choisissez au moins un destinataire ou un canal.')
  const recipients = await members(core, actor.workspaceId, input.recipients)
  if (recipients.length !== new Set(input.recipients).size) throw invalid('Un destinataire n’est pas membre de cet espace.')
  const next = input.enabled ? nextRun(input.schedule, new Date()) : null
  const saved = await core.db.tx(async (client) => {
    const row = previous
      ? await core.db.one<{ id: string }>(
          `UPDATE subscription SET name = $2, schedule = $3, format = $4, options = $5, filter_values = $6, recipients = $7, message = $8, enabled = $9, next_run_at = $10
           WHERE id = $1 RETURNING id`,
          [previous.id, input.name.trim(), input.schedule, input.format, input.options, input.values, recipients, input.message.trim(), input.enabled, next],
          client,
        )
      : await core.db.one<{ id: string }>(
          `INSERT INTO subscription (workspace_id, dashboard_id, user_id, name, schedule, format, options, filter_values, recipients, message, enabled, next_run_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
          [actor.workspaceId, input.dashboard, actor.userId, input.name.trim(), input.schedule, input.format, input.options, input.values, recipients, input.message.trim(), input.enabled, next],
          client,
        )
    await saveChannels(core, { subscription: row?.id as string }, input.channels, client)
    return row?.id as string
  })
  const [out] = await toSubscriptions(core, actor, [await ownRow(core, actor, saved)])
  return out as Subscription
}

export async function deleteSubscription(core: Core, actor: Actor, id: string): Promise<void> {
  const row = await ownRow(core, actor, id)
  await core.db.exec('DELETE FROM subscription WHERE id = $1', [row.id])
}

/** The dashboard's filters as sent: the subscription's, the dashboard's defaults elsewhere. */
function valuesFor(dashboard: Dashboard, kept: Readonly<Record<string, ParameterValue | null>>): Record<string, ParameterValue | null> {
  return Object.fromEntries(dashboard.parameters.map((p) => [p.id, p.id in kept ? (kept[p.id] ?? null) : (p.default ?? null)]))
}

function filtersSaid(dashboard: Dashboard, values: Readonly<Record<string, ParameterValue | null>>, locale: string): string {
  return dashboard.parameters
    .filter((p) => {
      const v = values[p.id]
      return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
    })
    .map((p) => {
      const v = values[p.id]
      const said = Array.isArray(v) ? v.join(', ') : p.type === 'date' ? periodLabel(String(v), locale) : String(v)
      return `${p.label} : ${said}`
    })
    .join(' · ')
}

interface Content {
  readonly subject: string
  readonly html: string
  readonly text: string
  readonly attachments: { filename: string; content: Buffer; contentType: string; cid?: string }[]
  readonly lines: string[]
  readonly picture?: { mime: string; data: Buffer }
}

/** What one reader receives: the dashboard as they see it, pictured or written. */
async function contentFor(core: Core, reader: Actor, sub: SubscriptionRow, ownerName: string, locale: string, test: boolean, channel: boolean): Promise<Content> {
  const dashboard = await getDashboard(core, reader, sub.dashboard_id)
  const values = valuesFor(dashboard, sub.filter_values)
  const link = `${core.config.publicUrl}/dashboard/${dashboard.id}`
  const title = sub.options.title || dashboard.name
  const subject = `${test ? word(locale, 'test') : ''}${sub.name || title}`
  const filters = sub.options.filters === false ? '' : filtersSaid(dashboard, values, locale)
  const intro = [
    sub.message ? `<p style="margin:0 0 14px;font-size:14px;color:#18181b;white-space:pre-wrap">${escapeHtml(sub.message)}</p>` : '',
    `<h2 style="margin:0 0 4px;font-size:20px;color:#18181b">${escapeHtml(title)}</h2>`,
    filters ? `<p style="margin:0 0 14px;font-size:12px;color:#71717a">${escapeHtml(word(locale, 'filters'))} — ${escapeHtml(filters)}</p>` : '',
  ].join('')
  const button = `<p style="margin:20px 0"><a href="${escapeHtml(link)}" style="background:#2da31e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(word(locale, 'open'))}</a></p>`
  const footer = `<p style="color:#a1a1aa;font-size:11px;margin-top:24px">${escapeHtml(word(locale, channel ? 'sentChannel' : 'sentBy', { name: ownerName }))}</p>`
  const wrap = (body: string) => `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:720px;margin:auto;padding:24px;color:#18181b">${intro}${body}${button}${footer}</div>`

  const pictured = (sub.format === 'pdf' || sub.format === 'png') && renderEnabled(core)
  if (pictured) {
    const data = await renderDashboard(core, { userId: reader.userId, workspaceId: reader.workspaceId, dashboardId: dashboard.id }, { format: sub.format as 'pdf' | 'png', values, options: sub.options, locale })
    const safe = title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 80) || 'tableau-de-bord'
    if (sub.format === 'png') {
      return {
        subject,
        html: wrap(`<img src="cid:dashboard" alt="${escapeHtml(title)}" style="width:100%;border:1px solid #e4e4e7;border-radius:8px" />`),
        text: `${sub.message ? `${sub.message}\n\n` : ''}${title}\n${link}`,
        attachments: [{ filename: `${safe}.png`, content: data, contentType: 'image/png', cid: 'dashboard' }],
        lines: sub.message ? [sub.message] : [],
        picture: { mime: 'image/png', data },
      }
    }
    return {
      subject,
      html: wrap(`<p style="font-size:14px;color:#3f3f46">${escapeHtml(word(locale, 'attached'))}</p>`),
      text: `${sub.message ? `${sub.message}\n\n` : ''}${title}\n${word(locale, 'attached')}\n${link}`,
      attachments: [{ filename: `${safe}.pdf`, content: data, contentType: 'application/pdf' }],
      lines: sub.message ? [sub.message] : [],
      picture: { mime: 'application/pdf', data },
    }
  }
  const cards = await digestDashboard(core, reader, dashboard, values, sub.options, locale)
  return {
    subject,
    html: wrap(digestHtml(cards, locale)),
    text: `${sub.message ? `${sub.message}\n\n` : ''}${title}\n${filters}\n\n${digestText(cards, locale)}\n\n${link}`,
    attachments: [],
    lines: [...(sub.message ? [sub.message] : []), ...digestLines(cards)],
  }
}

/**
 * Sends a subscription now: to each person (as they see it), then to each channel (as its
 * owner sees it). `onlyTo`: a trial, to that person alone.
 */
export async function deliverSubscription(core: Core, id: string, opts: { onlyTo?: string } = {}): Promise<{ status: DeliveryStatus; sent: number; failed: number }> {
  const sub = await core.db.one<SubscriptionRow>('SELECT * FROM subscription WHERE id = $1', [id])
  if (!sub) throw notFound('Abonnement introuvable.')
  const owner = await core.db.one<{ id: string; name: string; email: string; locale: string; active: boolean }>('SELECT id, name, email, locale, active FROM app_user WHERE id = $1', [sub.user_id])
  const test = !!opts.onlyTo
  const errors: string[] = []
  let sent = 0
  const people = opts.onlyTo ? [opts.onlyTo] : await members(core, sub.workspace_id, sub.recipients)
  if (people.length && !mailEnabled(core)) errors.push('Aucun serveur d’envoi d’e-mails (SMTP_URL) n’est configuré.')
  else {
    for (const userId of people) {
      const person = await core.db.one<{ email: string; locale: string; active: boolean }>('SELECT email, locale, active FROM app_user WHERE id = $1', [userId])
      if (!person?.active) continue
      const reader: Actor = { userId, workspaceId: sub.workspace_id, via: 'system' }
      try {
        const c = await contentFor(core, reader, sub, owner?.name ?? '', person.locale, test, false)
        if (await sendMail(core, person.email, c.subject, c.text, c.html, c.attachments)) sent++
      } catch (err) {
        errors.push(`${person.email} : ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
  const channels = test ? [] : ((await channelsOf(core, 'subscription_id', [sub.id])).get(sub.id) ?? [])
  if (channels.length && owner?.active) {
    const reader: Actor = { userId: sub.user_id, workspaceId: sub.workspace_id, via: 'system' }
    try {
      const c = await contentFor(core, reader, sub, owner.name, owner.locale, false, true)
      const file = c.picture ? await storeFile(core, c.picture.mime, c.picture.data) : undefined
      const link = { url: `${core.config.publicUrl}/dashboard/${sub.dashboard_id}`, label: word(owner.locale, 'open') }
      for (const ch of channels) {
        try {
          await postToChannel(ch.kind, ch.url, {
            title: c.subject,
            lines: c.lines,
            link,
            ...(file && c.picture?.mime === 'image/png' ? { image: file } : {}),
            ...(file && c.picture?.mime === 'application/pdf' ? { file: { url: file, label: word(owner.locale, 'pdf') } } : {}),
          })
          sent++
        } catch (err) {
          errors.push(`${ch.label} : ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }
  const status: DeliveryStatus = errors.length === 0 ? 'ok' : sent > 0 ? 'partial' : 'failed'
  const error = errors.length ? errors.join(' ; ').slice(0, 2000) : null
  await core.db.exec('INSERT INTO delivery (subscription_id, status, detail, error) VALUES ($1, $2, $3, $4)', [sub.id, status, { sent, test }, error])
  if (!test) await core.db.exec('UPDATE subscription SET last_run_at = now(), last_status = $2, last_error = $3 WHERE id = $1', [sub.id, status, error])
  return { status, sent, failed: errors.length }
}

/** Subscriptions whose time has come: their next time set at once, their sending queued. */
export async function scheduleDueSubscriptions(core: Core): Promise<void> {
  // Taken at once (their next time cleared), so two workers never send the same one twice.
  const due = await core.db.many<{ id: string; schedule: Schedule }>(
    `UPDATE subscription SET next_run_at = NULL WHERE id IN (
       SELECT id FROM subscription WHERE enabled AND next_run_at IS NOT NULL AND next_run_at <= now() ORDER BY next_run_at LIMIT 50 FOR UPDATE SKIP LOCKED
     ) RETURNING id, schedule`,
  )
  if (!due.length) return
  const { enqueue } = await import('../jobs')
  for (const s of due) {
    await core.db.exec('UPDATE subscription SET next_run_at = $2 WHERE id = $1', [s.id, nextRun(s.schedule, new Date())])
    await enqueue(core, 'deliver_subscription', { id: s.id }, { dedupe: `subscription:${s.id}` })
  }
}
