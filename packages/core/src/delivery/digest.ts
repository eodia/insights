/**
 * A dashboard written out: its key figures and the first rows of its tables, card after card —
 * what a subscription sends when no picture is asked for, or none can be made. Computed as the
 * reader, like every other query.
 */
import type { Dashboard, DashboardCard, ExportOptions, ParameterValue, QueryResult, ResultColumn } from '@eodia/contracts'
import type { Actor, Core } from '../context'
import { getQuestion } from '../content/items'
import { runCard } from '../query/run'
import { escapeHtml, word } from './words'

const MAX_CARDS = 30
const MAX_ROWS = 8
const MAX_COLUMNS = 6
const INTERACTIVE = new Set<DashboardCard['kind']>(['filter', 'buttons', 'variable', 'link', 'embed'])

export interface DigestCard {
  readonly title: string
  /** A single figure, when that is what the card shows. */
  readonly figure?: string
  readonly table?: { readonly head: readonly string[]; readonly rows: readonly (readonly string[])[]; readonly more: number }
  readonly text?: string
  readonly error?: string
  readonly heading?: boolean
}

/** A column's values as people read them: its currency, its decimals; a month as a month. */
function formatter(locale: string, column?: ResultColumn) {
  const f = column?.format
  const number = new Intl.NumberFormat(locale, {
    ...(f?.currency ? { style: 'currency' as const, currency: f.currency } : {}),
    ...(f?.number_style === 'percent' ? { style: 'percent' as const } : {}),
    maximumFractionDigits: f?.decimals ?? 2,
    ...(f?.decimals !== undefined && f?.decimals !== null ? { minimumFractionDigits: f.decimals } : {}),
  })
  const numberOf = (n: number) => {
    const ratio = f?.number_style === 'percent' && f.percent_ratio === false ? n / 100 : n
    return `${f?.prefix ?? ''}${number.format(ratio)}${f?.suffix ?? ''}`
  }
  const unit = column?.unit
  return (v: unknown): string => {
    if (v === null || v === undefined) return '—'
    if (typeof v === 'number') return numberOf(v)
    if (typeof v === 'bigint') return numberOf(Number(v))
    if (typeof v === 'string' && unit && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      const d = new Date(`${v.slice(0, 10)}T00:00:00`)
      if (unit === 'month') return d.toLocaleDateString(locale, { month: 'short', year: 'numeric' })
      if (unit === 'year') return String(d.getFullYear())
      if (unit === 'quarter') return `T${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
    }
    if (typeof v === 'boolean') return v ? '✓' : '✗'
    const s = typeof v === 'string' ? v : JSON.stringify(v)
    // A day, a timestamp: as people read it.
    if (/^\d{4}-\d{2}-\d{2}(T|\s|$)/.test(s)) {
      const d = new Date(s.length === 10 ? `${s}T00:00:00` : s)
      if (!Number.isNaN(d.getTime())) {
        return s.length === 10 || /T00:00(:00)?/.test(s)
          ? d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
          : d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
      }
    }
    return s.length > 80 ? `${s.slice(0, 77)}…` : s
  }
}

function digestOf(result: QueryResult, locale: string): Pick<DigestCard, 'figure' | 'table'> {
  const formats = result.columns.map((c) => formatter(locale, c))
  const fmt = (v: unknown, i: number) => (formats[i] ?? formatter(locale))(v)
  const metric = result.columns.findIndex((c) => c.role === 'metric')
  if (result.rows.length === 1 && (result.columns.length === 1 || (metric >= 0 && result.columns.length <= 2))) {
    const i = metric >= 0 ? metric : 0
    return { figure: fmt(result.rows[0]?.[i], i) }
  }
  const columns = result.columns.slice(0, MAX_COLUMNS)
  return {
    table: {
      head: columns.map((c) => c.label),
      rows: result.rows.slice(0, MAX_ROWS).map((r) => columns.map((_, i) => fmt(r[i], i))),
      more: Math.max(0, result.rows.length - MAX_ROWS) + (result.truncated ? 1 : 0),
    },
  }
}

const plain = (markdown: string) =>
  markdown
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

/** The cards of the tabs printed, in reading order, each written out. */
export async function digestDashboard(
  core: Core,
  actor: Actor,
  dashboard: Dashboard,
  values: Readonly<Record<string, ParameterValue | null>>,
  options: ExportOptions,
  locale: string,
): Promise<DigestCard[]> {
  const tabs = dashboard.tabs.length ? dashboard.tabs.filter((t) => !options.tabs?.length || options.tabs.includes(t.id)) : [null]
  const out: DigestCard[] = []
  for (const tab of tabs) {
    if (tab && tabs.length > 1) out.push({ title: tab.label, heading: true })
    const cards = dashboard.cards
      .filter((c) => (tab ? c.tab === tab.id : true))
      .filter((c) => options.interactive || !INTERACTIVE.has(c.kind))
      .sort((a, b) => a.y - b.y || a.x - b.x)
    for (const card of cards) {
      if (out.length >= MAX_CARDS) return out
      if (card.kind === 'heading') out.push({ title: card.text ?? '', heading: true })
      else if (card.kind === 'text' && card.text) out.push({ title: card.title ?? '', text: plain(card.text).slice(0, 600) })
      else if (card.kind === 'question') {
        const title = card.title || (card.question ? await getQuestion(core, actor, card.question).then((q) => q.name).catch(() => '') : '')
        try {
          const result = await runCard(core, actor, dashboard.id, card.id, values, { origin: 'subscription' })
          out.push({ title, ...digestOf(result, locale) })
        } catch (err) {
          out.push({ title, error: err instanceof Error ? err.message : String(err) })
        }
      }
    }
  }
  return out
}

/** The written dashboard as e-mail HTML — inline styles, what mail clients understand. */
export function digestHtml(cards: readonly DigestCard[], locale: string): string {
  return cards
    .map((c) => {
      if (c.heading) return `<h3 style="margin:24px 0 8px;font-size:16px;color:#18181b">${escapeHtml(c.title)}</h3>`
      const title = c.title ? `<div style="font-size:13px;font-weight:600;color:#3f3f46;margin-bottom:6px">${escapeHtml(c.title)}</div>` : ''
      let body = ''
      if (c.error) body = `<div style="font-size:12px;color:#b91c1c">${escapeHtml(word(locale, 'failed', { error: c.error }))}</div>`
      else if (c.figure !== undefined) body = `<div style="font-size:28px;font-weight:700;color:#18181b">${escapeHtml(c.figure)}</div>`
      else if (c.text) body = `<div style="font-size:13px;color:#52525b;line-height:1.5">${escapeHtml(c.text)}</div>`
      else if (c.table) {
        if (!c.table.rows.length) body = `<div style="font-size:12px;color:#71717a">${escapeHtml(word(locale, 'noRows'))}</div>`
        else {
          const th = c.table.head.map((h) => `<th style="text-align:left;padding:4px 8px;border-bottom:1px solid #e4e4e7;font-weight:600;color:#52525b">${escapeHtml(h)}</th>`).join('')
          const tr = c.table.rows
            .map((r) => `<tr>${r.map((v) => `<td style="padding:4px 8px;border-bottom:1px solid #f4f4f5;color:#18181b">${escapeHtml(v)}</td>`).join('')}</tr>`)
            .join('')
          const more = c.table.more ? `<div style="font-size:11px;color:#71717a;margin-top:4px">${escapeHtml(word(locale, 'more', { count: c.table.more }))}</div>` : ''
          body = `<table style="border-collapse:collapse;font-size:12px;width:100%"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>${more}`
        }
      }
      return `<div style="border:1px solid #e4e4e7;border-radius:10px;padding:12px 14px;margin:0 0 10px">${title}${body}</div>`
    })
    .join('')
}

/** The written dashboard as plain text, for the e-mail's text part. */
export function digestText(cards: readonly DigestCard[], locale: string): string {
  return cards
    .map((c) => {
      if (c.heading) return `\n## ${c.title}`
      if (c.error) return `${c.title}\n  ${word(locale, 'failed', { error: c.error })}`
      if (c.figure !== undefined) return `${c.title} : ${c.figure}`
      if (c.text) return c.text
      if (c.table) return `${c.title}\n${c.table.rows.map((r) => `  ${r.join(' · ')}`).join('\n')}`
      return c.title
    })
    .join('\n')
}

/** A few lines for a channel: the key figures, the first rows' heads. */
export function digestLines(cards: readonly DigestCard[], limit = 8): string[] {
  const lines: string[] = []
  for (const c of cards) {
    if (lines.length >= limit) break
    if (c.figure !== undefined) lines.push(`**${c.title}** : ${c.figure}`)
    else if (c.table?.rows.length) lines.push(`**${c.title}** : ${c.table.rows.slice(0, 3).map((r) => r.slice(0, 2).join(' ')).join(' · ')}`)
  }
  return lines
}
