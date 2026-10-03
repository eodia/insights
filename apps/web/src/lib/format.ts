/**
 * Affichage des valeurs : un nombre, une date, une durée lus selon le type sémantique et le
 * format choisis dans « Structure ». Dates et nombres par `Intl`, jamais en dur.
 */
import type { ColumnFormat, LookColor, ResultColumn, TemporalUnit } from '@eodia/contracts'
import { MONEY_TYPES, type SemanticType } from '@eodia/contracts'
import { $t, intlLocale } from './i18n'

const nf = new Map<string, Intl.NumberFormat>()
function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options)
  let f = nf.get(key)
  if (!f) {
    f = new Intl.NumberFormat(intlLocale(), options)
    nf.set(key, f)
  }
  return f
}

export interface FormatOptions {
  readonly compact?: boolean
  readonly decimals?: number | null
  readonly prefix?: string
  readonly suffix?: string
}

/** The format a column ends up with: its own, or what its semantic type implies. */
export function effectiveFormat(col: Pick<ResultColumn, 'semantic' | 'format'>): ColumnFormat {
  const f = col.format ?? {}
  if (f.number_style) return f
  const s = col.semantic as SemanticType | undefined
  if (s && MONEY_TYPES.has(s)) return { number_style: 'currency', currency: 'EUR', ...f }
  if (s === 'percentage') return { number_style: 'percent', percent_ratio: true, ...f }
  if (s === 'pk' || s === 'fk' || s === 'zip') return { separators: false, ...f }
  return f
}

export function formatNumber(value: number, format: ColumnFormat = {}, opts: FormatOptions = {}): string {
  if (!Number.isFinite(value)) return String(value)
  const decimals = opts.decimals ?? format.decimals ?? undefined
  const grouping = format.separators === false ? false : undefined
  const compact = opts.compact || format.number_style === 'compact'
  let out: string
  switch (format.number_style) {
    case 'currency':
      out = numberFormat({
        style: 'currency',
        currency: format.currency ?? 'EUR',
        ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : { minimumFractionDigits: decimals ?? 2, maximumFractionDigits: decimals ?? 2 }),
      }).format(value)
      break
    case 'percent': {
      const ratio = format.percent_ratio === false ? value / 100 : value
      out = numberFormat({ style: 'percent', maximumFractionDigits: decimals ?? 1, minimumFractionDigits: 0 }).format(ratio)
      break
    }
    case 'duration':
      out = formatDuration(value, format.duration_unit ?? 's')
      break
    case 'rating': {
      const max = format.rating_max ?? 5
      out = `${numberFormat({ maximumFractionDigits: decimals ?? 1 }).format(value)} / ${max}`
      break
    }
    case 'integer':
      out = numberFormat({ maximumFractionDigits: 0, ...(grouping === false ? { useGrouping: false } : {}) }).format(value)
      break
    default:
      out = numberFormat({
        ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: decimals ?? (Number.isInteger(value) ? 0 : 2), ...(decimals !== undefined ? { minimumFractionDigits: decimals } : {}) }),
        ...(grouping === false ? { useGrouping: false } : {}),
      }).format(value)
  }
  return `${opts.prefix ?? format.prefix ?? ''}${out}${opts.suffix ?? format.suffix ?? ''}`
}

function formatDuration(value: number, unit: NonNullable<ColumnFormat['duration_unit']>): string {
  const seconds = value * { ms: 0.001, s: 1, min: 60, h: 3600, d: 86400 }[unit]
  const abs = Math.abs(seconds)
  const n = (x: number, u: string, d = 1) => numberFormat({ style: 'unit', unit: u, unitDisplay: 'short', maximumFractionDigits: d }).format(x)
  if (abs < 1) return n(seconds * 1000, 'millisecond', 0)
  if (abs < 60) return n(seconds, 'second')
  if (abs < 3600) return n(seconds / 60, 'minute')
  if (abs < 86400) return n(seconds / 3600, 'hour')
  return n(seconds / 86400, 'day')
}

const MONTH = new Map<string, Intl.DateTimeFormat>()
function dateFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options)
  let f = MONTH.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(intlLocale(), options)
    MONTH.set(key, f)
  }
  return f
}

/** `2026-03-01` → a Date at local midnight; `2026-03-01T10:00:00` → local wall time. */
export function parseDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0))
}

const WEEKDAYS = () => Array.from({ length: 7 }, (_, i) => dateFormat({ weekday: 'long' }).format(new Date(2024, 0, 1 + i)))
const MONTHS = () => Array.from({ length: 12 }, (_, i) => dateFormat({ month: 'long' }).format(new Date(2024, i, 1)))

/** A date as its period says it: `mars 2026`, `T1 2026`, `sem. du 3 mars`. */
export function formatDate(value: unknown, kind: string, unit?: TemporalUnit, format: ColumnFormat = {}): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number' && unit) {
    switch (unit) {
      case 'day_of_week':
        return WEEKDAYS()[(value - 1 + 7) % 7] ?? String(value)
      case 'month_of_year':
        return MONTHS()[value - 1] ?? String(value)
      case 'quarter_of_year':
        return $t('T{quarter}', { quarter: value })
      case 'hour_of_day':
        return $t('{hour} h', { hour: String(value).padStart(2, '0') })
      default:
        return String(value)
    }
  }
  const d = parseDate(String(value))
  if (!d) return String(value)
  switch (unit) {
    case 'year':
      return String(d.getFullYear())
    case 'quarter':
      return $t('T{quarter} {year}', { quarter: Math.floor(d.getMonth() / 3) + 1, year: d.getFullYear() })
    case 'month':
      return dateFormat({ month: 'long', year: 'numeric' }).format(d)
    case 'week':
      return $t('sem. du {day}', { day: dateFormat({ day: 'numeric', month: 'short', year: 'numeric' }).format(d) })
    case 'day':
      return dateFormat({ day: 'numeric', month: 'short', year: 'numeric' }).format(d)
    case 'hour':
    case 'minute':
      return dateFormat({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d)
  }
  if (format.date_style === 'relative') return relative(d)
  if (format.date_style === 'custom' && format.date_pattern) return byPattern(d, format.date_pattern)
  const withTime = kind === 'datetime' && format.time !== 'none'
  const long = format.date_style === 'long'
  return dateFormat({
    day: 'numeric',
    month: long ? 'long' : format.date_style === 'short' ? '2-digit' : 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', ...(format.time === 'seconds' ? { second: '2-digit' } : {}) } : {}),
  }).format(d)
}

/** `dd/MM/yyyy HH:mm`, `d MMMM yyyy`… — the tokens of the Structure screen's format editor. */
function byPattern(d: Date, pattern: string): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  const tokens: Record<string, () => string> = {
    yyyy: () => String(d.getFullYear()),
    yy: () => pad(d.getFullYear() % 100),
    MMMM: () => dateFormat({ month: 'long' }).format(d),
    MMM: () => dateFormat({ month: 'short' }).format(d),
    MM: () => pad(d.getMonth() + 1),
    M: () => String(d.getMonth() + 1),
    dd: () => pad(d.getDate()),
    d: () => String(d.getDate()),
    EEEE: () => dateFormat({ weekday: 'long' }).format(d),
    EEE: () => dateFormat({ weekday: 'short' }).format(d),
    HH: () => pad(d.getHours()),
    mm: () => pad(d.getMinutes()),
    ss: () => pad(d.getSeconds()),
  }
  return pattern.replace(/yyyy|yy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|mm|ss/g, (t) => tokens[t]?.() ?? t)
}

function relative(d: Date): string {
  const rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' })
  const diff = (d.getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return rtf.format(Math.round(diff), 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 30 * 86400) return rtf.format(Math.round(diff / 86400), 'day')
  if (abs < 365 * 86400) return rtf.format(Math.round(diff / (30 * 86400)), 'month')
  return rtf.format(Math.round(diff / (365 * 86400)), 'year')
}

/** Any value of a result column, as text. */
export function formatValue(value: unknown, col: Pick<ResultColumn, 'type' | 'semantic' | 'format' | 'unit'>, opts: FormatOptions = {}): string {
  if (value === null || value === undefined) return ''
  if (col.type === 'date' || col.type === 'datetime' || (col.unit && col.type === 'number')) return formatDate(value, col.type, col.unit, col.format)
  if (typeof value === 'number') return formatNumber(value, effectiveFormat(col), opts)
  if (typeof value === 'boolean') return value ? $t('Oui') : $t('Non')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export const formatCount = (n: number) => numberFormat({}).format(n)

export function formatAgo(iso: string): string {
  const d = new Date(iso)
  return relative(d)
}

// ── Couleurs nommées ─────────────────────────────────────────────────────────

/** Badge classes for a named colour: soft background, readable text, in both themes. */
export const LOOK_CLASSES: Record<LookColor, string> = {
  gray: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  orange: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  yellow: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  lime: 'bg-lime-50 text-lime-700 dark:bg-lime-950 dark:text-lime-300',
  green: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  teal: 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  cyan: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
  sky: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  purple: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  pink: 'bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
}

/** The solid hue of a named colour, for dots, icons and chart series. */
export const LOOK_HEX: Record<LookColor, string> = {
  gray: '#71717a',
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  lime: '#84cc16',
  green: '#22a33a',
  emerald: '#10b981',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  sky: '#0ea5e9',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  purple: '#a855f7',
  pink: '#ec4899',
  rose: '#f43f5e',
}
