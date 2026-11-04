/**
 * What leaves the application on its own: a dashboard sent on a schedule (a subscription), a
 * question watched until it says something (an alert) — and how a dashboard is laid out on
 * paper, for an export as for a sending.
 */
import { z } from 'zod'
import type { ParameterValue, QueryResult } from './analytics'
import type { UserSummary } from './domain'

// ── Paper ───────────────────────────────────────────────────────────────────

export const PAPER_SIZES = ['A4', 'A3', 'Letter'] as const
export type PaperSize = (typeof PAPER_SIZES)[number]

/**
 * How a dashboard is put on paper. Unset, each choice is the theme's (orientation, cover) or
 * the obvious one: every tab, filters said, pages numbered, interactive cards left out.
 */
export interface ExportOptions {
  /** The tabs printed, in the dashboard's order; all of them when absent. */
  readonly tabs?: readonly string[]
  readonly orientation?: 'portrait' | 'landscape'
  readonly paper?: PaperSize
  readonly cover?: boolean
  /** A title of its own, in place of the dashboard's name. */
  readonly title?: string
  /** A few words on the cover: « Chiffres arrêtés au 3 », « Pour le comité du lundi ». */
  readonly note?: string
  /** The filters applied, said on the cover (or above the first page). */
  readonly filters?: boolean
  /** Each tab's name above its first page. */
  readonly tab_titles?: boolean
  readonly page_numbers?: boolean
  /** Filter panes, buttons, variables, links: what one clicks — left out unless asked. */
  readonly interactive?: boolean
}

export const ExportOptionsSchema = z.object({
  tabs: z.array(z.string().max(60)).max(50).optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
  paper: z.enum(PAPER_SIZES).optional(),
  cover: z.boolean().optional(),
  title: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
  filters: z.boolean().optional(),
  tab_titles: z.boolean().optional(),
  page_numbers: z.boolean().optional(),
  interactive: z.boolean().optional(),
})

// ── Schedules ───────────────────────────────────────────────────────────────

export const FREQUENCIES = ['quarter_hour', 'hourly', 'daily', 'weekly', 'monthly'] as const
export type Frequency = (typeof FREQUENCIES)[number]

/** When something runs, in a time zone: « chaque lundi à 8 h », « le 1er du mois à 7 h 30 ». */
export interface Schedule {
  readonly frequency: Frequency
  /** 0–23, for a daily, weekly or monthly schedule. */
  readonly hour: number
  /** 0–59; for an hourly schedule, the minute of each hour. */
  readonly minute: number
  /** ISO days, Monday 1 … Sunday 7: a weekly schedule's days (a daily one may skip some too). */
  readonly weekdays?: readonly number[]
  /** A monthly schedule's day, 1–28, or -1 for the month's last day. */
  readonly day?: number
  /** An IANA zone: `Europe/Paris`. */
  readonly timezone: string
}

export const ScheduleSchema = z.object({
  frequency: z.enum(FREQUENCIES),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  day: z.number().int().min(-1).max(28).refine((d) => d !== 0).optional(),
  timezone: z.string().min(1).max(64),
})

interface Wall {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  /** ISO day of the week. */
  readonly weekday: number
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

/** What a clock in `zone` reads at `at`. */
function wallOf(at: Date, zone: string): Wall {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
  }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: WEEKDAYS[get('weekday')] ?? 1,
  }
}

/** The instant a clock in `zone` reads this date and time — the earlier one on a fall-back night. */
function instantOf(year: number, month: number, day: number, hour: number, minute: number, zone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  // The zone's offset at the guess, then at the corrected instant: twice settles a change of time.
  let at = guess
  for (let i = 0; i < 2; i++) {
    const w = wallOf(new Date(at), zone)
    const seen = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute)
    at = at - (seen - guess)
  }
  return new Date(at)
}

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** A zone the runtime knows, or Paris. */
export function knownZone(zone: string | undefined): string {
  try {
    if (zone) {
      new Intl.DateTimeFormat('en-US', { timeZone: zone })
      return zone
    }
  } catch {}
  return 'Europe/Paris'
}

/** The first time after `after` the schedule says, to the minute. */
export function nextRun(schedule: Schedule, after: Date): Date {
  const zone = knownZone(schedule.timezone)
  const start = new Date(Math.floor(after.getTime() / 60_000) * 60_000 + 60_000)
  if (schedule.frequency === 'quarter_hour') {
    const m = start.getUTCMinutes()
    const add = (15 - (m % 15)) % 15
    return new Date(start.getTime() + add * 60_000)
  }
  if (schedule.frequency === 'hourly') {
    // Minute `minute` of each hour, as the zone's clock reads it (a half-hour zone included).
    for (let i = 0; i < 61; i++) {
      const at = new Date(start.getTime() + i * 60_000)
      if (wallOf(at, zone).minute === schedule.minute) return at
    }
    return start
  }
  const today = wallOf(start, zone)
  for (let offset = 0; offset < 400; offset++) {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + offset))
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth() + 1
    const day = d.getUTCDate()
    const weekday = ((d.getUTCDay() + 6) % 7) + 1
    if (schedule.frequency === 'weekly' || (schedule.frequency === 'daily' && schedule.weekdays?.length)) {
      const days = schedule.weekdays?.length ? schedule.weekdays : [1]
      if (!days.includes(weekday)) continue
    }
    if (schedule.frequency === 'monthly') {
      const wanted = schedule.day === -1 ? daysIn(year, month) : Math.min(schedule.day ?? 1, daysIn(year, month))
      if (day !== wanted) continue
    }
    const at = instantOf(year, month, day, schedule.hour, schedule.minute, zone)
    if (at.getTime() >= start.getTime()) return at
  }
  return new Date(start.getTime() + 86_400_000)
}

// ── Channels ────────────────────────────────────────────────────────────────

export const CHANNEL_KINDS = ['teams', 'slack'] as const
export type ChannelKind = (typeof CHANNEL_KINDS)[number]

/** A channel a message is posted to, by its incoming webhook — its address kept secret. */
export interface DeliveryChannel {
  readonly id: string
  readonly kind: ChannelKind
  /** « #ventes », « Équipe commerciale » */
  readonly label: string
}

export const ChannelInputSchema = z.object({
  /** An existing channel, kept with its address when `url` is absent. */
  id: z.string().max(60).optional(),
  kind: z.enum(CHANNEL_KINDS),
  label: z.string().min(1).max(120),
  url: z.string().url().max(2000).optional(),
})

export const DELIVERY_STATUSES = ['ok', 'partial', 'failed'] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

// ── Subscriptions ───────────────────────────────────────────────────────────

/** `pdf` and `png` are pictures of the dashboard; `summary`, its figures written in the e-mail. */
export const SUBSCRIPTION_FORMATS = ['pdf', 'png', 'summary'] as const
export type SubscriptionFormat = (typeof SUBSCRIPTION_FORMATS)[number]

export const DELIVERY_LIMITS = { recipients: 50, channels: 5 } as const

export interface Subscription {
  readonly id: string
  readonly dashboard: string
  readonly dashboard_name: string
  readonly name: string
  readonly owner: UserSummary | null
  readonly mine: boolean
  readonly schedule: Schedule
  readonly format: SubscriptionFormat
  readonly options: ExportOptions
  /** The filters it is sent with; the dashboard's defaults where absent. */
  readonly values: Readonly<Record<string, ParameterValue | null>>
  /** People of the space: each receives the dashboard as they would see it. */
  readonly recipients: readonly UserSummary[]
  readonly channels: readonly DeliveryChannel[]
  /** A word of its own, at the top of the message. */
  readonly message: string
  readonly enabled: boolean
  readonly next_run_at: string | null
  readonly last_run_at: string | null
  readonly last_status: DeliveryStatus | null
  readonly last_error: string | null
  readonly created_at: string
}

export const SubscriptionInputSchema = z.object({
  dashboard: z.string().uuid(),
  name: z.string().max(200).default(''),
  schedule: ScheduleSchema,
  format: z.enum(SUBSCRIPTION_FORMATS),
  options: ExportOptionsSchema.default({}),
  values: z.record(z.string(), z.any()).default({}),
  recipients: z.array(z.string().uuid()).max(DELIVERY_LIMITS.recipients).default([]),
  channels: z.array(ChannelInputSchema).max(DELIVERY_LIMITS.channels).default([]),
  message: z.string().max(2000).default(''),
  enabled: z.boolean().default(true),
})
export type SubscriptionInput = z.infer<typeof SubscriptionInputSchema>

// ── Alerts ──────────────────────────────────────────────────────────────────

export const ALERT_OPS = ['lt', 'lte', 'gt', 'gte', 'eq', 'ne'] as const
export type AlertOp = (typeof ALERT_OPS)[number]

/** Which value of the column is compared: the first row's, the last's, or all rows'. */
export const ALERT_READS = ['first', 'last', 'sum', 'min', 'max'] as const
export type AlertRead = (typeof ALERT_READS)[number]

export type AlertCondition =
  /** The question returns rows (`some`), or none (`none`). */
  | { readonly kind: 'rows'; readonly test: 'some' | 'none' }
  /** « Le CA du jour passe sous 10 000 » : a value of a column against a threshold. */
  | { readonly kind: 'threshold'; readonly column: string; readonly read: AlertRead; readonly op: AlertOp; readonly value: number }

export const AlertConditionSchema = z.union([
  z.object({ kind: z.literal('rows'), test: z.enum(['some', 'none']) }),
  z.object({ kind: z.literal('threshold'), column: z.string().min(1).max(256), read: z.enum(ALERT_READS), op: z.enum(ALERT_OPS), value: z.number().finite() }),
])

const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

const compare = (a: number, op: AlertOp, b: number): boolean =>
  op === 'lt' ? a < b : op === 'lte' ? a <= b : op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'eq' ? a === b : a !== b

/** Whether a result says what the alert waits for — and the value it read. */
export function alertHolds(condition: AlertCondition, result: Pick<QueryResult, 'columns' | 'rows'>): { holds: boolean; value: number | null; rows: number } {
  const rows = result.rows.length
  if (condition.kind === 'rows') return { holds: condition.test === 'some' ? rows > 0 : rows === 0, value: rows, rows }
  const index = result.columns.findIndex((c) => c.name === condition.column)
  if (index < 0 || rows === 0) return { holds: false, value: null, rows }
  const values = result.rows.map((r) => toNumber(r[index])).filter((v): v is number => v !== null)
  if (values.length === 0) return { holds: false, value: null, rows }
  const value =
    condition.read === 'first'
      ? (toNumber(result.rows[0]?.[index]) ?? null)
      : condition.read === 'last'
        ? (toNumber(result.rows[rows - 1]?.[index]) ?? null)
        : condition.read === 'sum'
          ? values.reduce((s, v) => s + v, 0)
          : condition.read === 'min'
            ? Math.min(...values)
            : Math.max(...values)
  if (value === null) return { holds: false, value: null, rows }
  return { holds: compare(value, condition.op, condition.value), value, rows }
}

/** `change`: once, when it becomes true; `always`: at each check while it holds. */
export const ALERT_MODES = ['change', 'always'] as const
export type AlertMode = (typeof ALERT_MODES)[number]

export interface Alert {
  readonly id: string
  readonly question: string
  readonly question_name: string
  readonly name: string
  readonly owner: UserSummary | null
  readonly mine: boolean
  readonly condition: AlertCondition
  readonly schedule: Schedule
  readonly mode: AlertMode
  /** Its owner hears of it by e-mail. */
  readonly email: boolean
  readonly channels: readonly DeliveryChannel[]
  readonly message: string
  readonly enabled: boolean
  readonly triggered: boolean
  readonly last_value: number | null
  readonly checked_at: string | null
  readonly notified_at: string | null
  readonly next_run_at: string | null
  readonly last_error: string | null
  readonly created_at: string
}

export const AlertInputSchema = z.object({
  question: z.string().uuid(),
  name: z.string().max(200).default(''),
  condition: AlertConditionSchema,
  schedule: ScheduleSchema,
  mode: z.enum(ALERT_MODES).default('change'),
  email: z.boolean().default(true),
  channels: z.array(ChannelInputSchema).max(DELIVERY_LIMITS.channels).default([]),
  message: z.string().max(2000).default(''),
  enabled: z.boolean().default(true),
})
export type AlertInput = z.infer<typeof AlertInputSchema>

/** What can leave the instance: e-mail (SMTP set), pictures (a renderer set). */
export interface DeliveryCapabilities {
  readonly email: boolean
  readonly render: boolean
}
