/**
 * Alerts: a question checked on a schedule, its owner told — by e-mail, in a Teams or Slack
 * channel — when it says what they wait for: rows come back, or none, or a value crosses a
 * threshold. Checked as its owner, like everything they read.
 */
import { type Alert, type AlertCondition, type AlertInput, type AlertMode, type Schedule, alertHolds, nextRun } from '@eodia/contracts'
import { isAdmin } from '../access/decide'
import { summaryOf } from '../auth/users'
import { getQuestion } from '../content/items'
import type { Actor, Core } from '../context'
import { forbidden, invalid, notFound } from '../errors'
import { mailEnabled, sendMail } from '../mailer'
import { runQuestion } from '../query/run'
import { channelsOf, postToChannel, saveChannels } from './channels'
import { OP_SIGNS, escapeHtml, word } from './words'

interface AlertRow {
  id: string
  workspace_id: string
  question_id: string
  user_id: string
  name: string
  condition: AlertCondition
  schedule: Schedule
  mode: AlertMode
  email: boolean
  message: string
  enabled: boolean
  triggered: boolean
  last_value: number | null
  checked_at: Date | null
  notified_at: Date | null
  next_run_at: Date | null
  last_error: string | null
  created_at: Date
}

const SELECT = 'SELECT a.*, q.name AS question_name FROM alert a JOIN question q ON q.id = a.question_id'

async function toAlerts(core: Core, actor: Actor, rows: (AlertRow & { question_name: string })[]): Promise<Alert[]> {
  const people = await summaryOf(core, rows.map((r) => r.user_id))
  const channels = await channelsOf(core, 'alert_id', rows.map((r) => r.id))
  return rows.map((r) => ({
    id: r.id,
    question: r.question_id,
    question_name: r.question_name,
    name: r.name,
    owner: people.get(r.user_id) ?? null,
    mine: r.user_id === actor.userId,
    condition: r.condition,
    schedule: r.schedule,
    mode: r.mode,
    email: r.email,
    channels: (channels.get(r.id) ?? []).map(({ url: _url, ...c }) => c),
    message: r.message,
    enabled: r.enabled,
    triggered: r.triggered,
    last_value: r.last_value,
    checked_at: r.checked_at?.toISOString() ?? null,
    notified_at: r.notified_at?.toISOString() ?? null,
    next_run_at: r.next_run_at?.toISOString() ?? null,
    last_error: r.last_error,
    created_at: r.created_at.toISOString(),
  }))
}

const isWorkspaceAdmin = async (core: Core, actor: Actor) => isAdmin(await core.snapshot(), `${actor.userId}@${actor.workspaceId}`)

/** One's alerts — on a question, or all; an administrator sees everyone's in the space. */
export async function listAlerts(core: Core, actor: Actor, filter: { question?: string } = {}): Promise<Alert[]> {
  const admin = await isWorkspaceAdmin(core, actor)
  const rows = await core.db.many<AlertRow & { question_name: string }>(
    `${SELECT} WHERE a.workspace_id = $1 AND ($2::boolean OR a.user_id = $3) AND ($4::uuid IS NULL OR a.question_id = $4) ORDER BY a.created_at DESC`,
    [actor.workspaceId, admin, actor.userId, filter.question ?? null],
  )
  return toAlerts(core, actor, rows)
}

async function ownRow(core: Core, actor: Actor, id: string): Promise<AlertRow & { question_name: string }> {
  const row = await core.db.one<AlertRow & { question_name: string }>(`${SELECT} WHERE a.id = $1 AND a.workspace_id = $2`, [id, actor.workspaceId])
  if (!row) throw notFound('Alerte introuvable.')
  if (row.user_id !== actor.userId && !(await isWorkspaceAdmin(core, actor))) throw forbidden('Cette alerte est à quelqu’un d’autre.')
  return row
}

export async function saveAlert(core: Core, actor: Actor, input: AlertInput, id?: string): Promise<Alert> {
  const previous = id ? await ownRow(core, actor, id) : undefined
  await getQuestion(core, actor, input.question)
  if (!input.email && !input.channels.length) throw invalid('Choisissez comment être prévenu : par e-mail, ou dans un canal.')
  const next = input.enabled ? nextRun(input.schedule, new Date()) : null
  // A changed condition starts over: it may hold at once, and say so.
  const reset = !previous || JSON.stringify(previous.condition) !== JSON.stringify(input.condition)
  const saved = await core.db.tx(async (client) => {
    const row = previous
      ? await core.db.one<{ id: string }>(
          `UPDATE alert SET question_id = $2, name = $3, condition = $4, schedule = $5, mode = $6, email = $7, message = $8, enabled = $9, next_run_at = $10,
             triggered = CASE WHEN $11 THEN false ELSE triggered END
           WHERE id = $1 RETURNING id`,
          [previous.id, input.question, input.name.trim(), input.condition, input.schedule, input.mode, input.email, input.message.trim(), input.enabled, next, reset],
          client,
        )
      : await core.db.one<{ id: string }>(
          `INSERT INTO alert (workspace_id, question_id, user_id, name, condition, schedule, mode, email, message, enabled, next_run_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
          [actor.workspaceId, input.question, actor.userId, input.name.trim(), input.condition, input.schedule, input.mode, input.email, input.message.trim(), input.enabled, next],
          client,
        )
    await saveChannels(core, { alert: row?.id as string }, input.channels, client)
    return row?.id as string
  })
  const [out] = await toAlerts(core, actor, [await ownRow(core, actor, saved)])
  return out as Alert
}

export async function deleteAlert(core: Core, actor: Actor, id: string): Promise<void> {
  const row = await ownRow(core, actor, id)
  await core.db.exec('DELETE FROM alert WHERE id = $1', [row.id])
}

export interface AlertCheck {
  readonly holds: boolean
  readonly value: number | null
  readonly rows: number
  readonly notified: boolean
  readonly error?: string
}

/**
 * Checks an alert: runs its question as its owner, says whether it holds, and tells them when
 * it starts holding (`change`) or each time (`always`). `force`: a check by hand, which tells
 * them whenever it holds — to see what the message looks like.
 */
export async function checkAlert(core: Core, id: string, opts: { force?: boolean } = {}): Promise<AlertCheck> {
  const alert = await core.db.one<AlertRow & { question_name: string }>(`${SELECT} WHERE a.id = $1`, [id])
  if (!alert) throw notFound('Alerte introuvable.')
  const owner = await core.db.one<{ name: string; email: string; locale: string; active: boolean }>('SELECT name, email, locale, active FROM app_user WHERE id = $1', [alert.user_id])
  if (!owner?.active) return { holds: false, value: null, rows: 0, notified: false }
  const actor: Actor = { userId: alert.user_id, workspaceId: alert.workspace_id, via: 'system' }
  let check: { holds: boolean; value: number | null; rows: number }
  let labelOf = (name: string) => name
  try {
    const result = await runQuestion(core, actor, alert.question_id, { origin: 'alert', fresh: true })
    check = alertHolds(alert.condition, result)
    labelOf = (name) => result.columns.find((c) => c.name === name)?.label ?? name
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await core.db.exec('UPDATE alert SET checked_at = now(), last_error = $2 WHERE id = $1', [alert.id, error.slice(0, 1000)])
    await core.db.exec('INSERT INTO delivery (alert_id, status, detail, error) VALUES ($1, $2, $3, $4)', [alert.id, 'failed', { check: true }, error.slice(0, 2000)])
    return { holds: false, value: null, rows: 0, notified: false, error }
  }
  const tell = check.holds && (opts.force || alert.mode === 'always' || !alert.triggered)
  const errors: string[] = []
  let sent = 0
  if (tell) {
    const locale = owner.locale
    const title = alert.name || alert.question_name
    const subject = word(locale, 'alertSubject', { name: title })
    const condition = alert.condition
    const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
    const said =
      condition.kind === 'rows'
        ? condition.test === 'some'
          ? word(locale, 'alertRows', { question: alert.question_name, count: check.rows })
          : word(locale, 'alertNoRows', { question: alert.question_name })
        : word(locale, 'alertValue', { column: labelOf(condition.column), value: check.value === null ? '—' : fmt.format(check.value), op: OP_SIGNS[condition.op], threshold: fmt.format(condition.value) })
    const link = `${core.config.publicUrl}/question/${alert.question_id}`
    if (alert.email) {
      if (!mailEnabled(core)) errors.push('Aucun serveur d’envoi d’e-mails (SMTP_URL) n’est configuré.')
      else {
        const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:auto;padding:24px;color:#18181b">
          <div style="display:inline-block;background:#fef3c7;color:#92400e;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600;margin-bottom:12px">⚠ ${escapeHtml(title)}</div>
          ${alert.message ? `<p style="margin:0 0 12px;font-size:14px;white-space:pre-wrap">${escapeHtml(alert.message)}</p>` : ''}
          <p style="margin:0 0 8px;font-size:16px;font-weight:600">${escapeHtml(said)}</p>
          <p style="margin:20px 0"><a href="${escapeHtml(link)}" style="background:#2da31e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(word(locale, 'openQuestion'))}</a></p>
          <p style="color:#a1a1aa;font-size:11px;margin-top:24px">${escapeHtml(word(locale, 'alertWhy', { name: owner.name }))}</p></div>`
        try {
          if (await sendMail(core, owner.email, subject, `${alert.message ? `${alert.message}\n\n` : ''}${said}\n\n${link}`, html)) sent++
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err))
        }
      }
    }
    for (const ch of (await channelsOf(core, 'alert_id', [alert.id])).get(alert.id) ?? []) {
      try {
        await postToChannel(ch.kind, ch.url, { title: `⚠ ${subject}`, lines: [...(alert.message ? [alert.message] : []), `**${said}**`], link: { url: link, label: word(locale, 'openQuestion') } })
        sent++
      } catch (err) {
        errors.push(`${ch.label} : ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    const status = errors.length === 0 ? 'ok' : sent > 0 ? 'partial' : 'failed'
    await core.db.exec('INSERT INTO delivery (alert_id, status, detail, error) VALUES ($1, $2, $3, $4)', [alert.id, status, { sent, value: check.value, rows: check.rows, forced: !!opts.force }, errors.join(' ; ').slice(0, 2000) || null])
  }
  await core.db.exec(
    `UPDATE alert SET checked_at = now(), triggered = $2, last_value = $3, last_error = $4, notified_at = CASE WHEN $5 THEN now() ELSE notified_at END WHERE id = $1`,
    [alert.id, check.holds, check.value, errors.length ? errors.join(' ; ').slice(0, 1000) : null, tell && sent > 0],
  )
  return { ...check, notified: tell && sent > 0, ...(errors.length ? { error: errors.join(' ; ') } : {}) }
}

/** Alerts whose time has come: their next time set at once, their check queued. */
export async function scheduleDueAlerts(core: Core): Promise<void> {
  const due = await core.db.many<{ id: string; schedule: Schedule }>(
    `UPDATE alert SET next_run_at = NULL WHERE id IN (
       SELECT id FROM alert WHERE enabled AND next_run_at IS NOT NULL AND next_run_at <= now() ORDER BY next_run_at LIMIT 100 FOR UPDATE SKIP LOCKED
     ) RETURNING id, schedule`,
  )
  if (!due.length) return
  const { enqueue } = await import('../jobs')
  for (const a of due) {
    await core.db.exec('UPDATE alert SET next_run_at = $2 WHERE id = $1', [a.id, nextRun(a.schedule, new Date())])
    await enqueue(core, 'check_alert', { id: a.id }, { dedupe: `alert:${a.id}` })
  }
}

/** Old deliveries and the pictures channels showed: a month for pictures, three for the log. */
export async function purgeDeliveries(core: Core): Promise<void> {
  await core.db.exec(`DELETE FROM delivery_file WHERE created_at < now() - interval '31 days'`)
  await core.db.exec(`DELETE FROM delivery WHERE at < now() - interval '90 days'`)
}
