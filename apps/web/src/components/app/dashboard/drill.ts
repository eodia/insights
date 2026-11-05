import type { Breakout, BuilderQuery, Filter, ResultColumn, TemporalUnit } from '@eodia/contracts'
import { formatValue } from '@/lib/format'

/** One step down into a card: what it shows now, and how it is named in the card's trail. */
export interface DrillStep {
  readonly label: string
  readonly query: BuilderQuery
}

/** The grain below each: a year opens on its months, a month on its days. */
const FINER: Partial<Record<TemporalUnit, TemporalUnit>> = { year: 'month', quarter: 'month', month: 'day', week: 'day' }

const sameColumn = (b: Breakout, source: NonNullable<ResultColumn['source']>) => b.field === source.field && (b.join ?? '') === (source.join ?? '')

/** The grouping of the query the clicked value comes from. */
function breakoutOf(query: BuilderQuery, column: ResultColumn): Breakout | null {
  if (!column.source) return null
  return query.breakouts?.find((b) => sameColumn(b, column.source as NonNullable<ResultColumn['source']>)) ?? null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The period a value of a date grouping stands for, as a filter writes it: `2026`, `2026-Q1`, `2026-03`, a week's span. */
function periodOf(value: unknown, unit: TemporalUnit): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''))
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (unit === 'year') return String(y)
  if (unit === 'quarter') return `${y}-Q${Math.floor((mo - 1) / 3) + 1}`
  if (unit === 'month') return `${y}-${pad(mo)}`
  if (unit === 'week') {
    const end = new Date(Date.UTC(y, mo - 1, d + 6))
    return `${y}-${pad(mo)}-${pad(d)}~${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`
  }
  return null
}

/** Whether a clicked value can be opened on a finer grain of time. */
export function canDrillTime(query: BuilderQuery | null, column: ResultColumn): boolean {
  if (!query) return false
  const b = breakoutOf(query, column)
  return !!(b?.unit && FINER[b.unit as TemporalUnit])
}

/** Whether a clicked value can be broken down by another column. */
export function canDrillBy(query: BuilderQuery | null, column: ResultColumn): boolean {
  if (!query) return false
  const b = breakoutOf(query, column)
  return !!b && !b.unit && !b.bin && query.source.kind === 'table'
}

/**
 * The period clicked, opened: its rows only, on the finer grain — « 2026 » becomes its twelve
 * months, « mars 2026 » its days.
 */
export function drillTime(query: BuilderQuery, column: ResultColumn, value: unknown): DrillStep | null {
  const b = breakoutOf(query, column)
  const unit = b?.unit as TemporalUnit | undefined
  const finer = unit ? FINER[unit] : undefined
  const period = unit ? periodOf(value, unit) : null
  if (!b || !unit || !finer || !period) return null
  const ref = { field: b.field, ...(b.join ? { join: b.join } : {}) }
  const filter: Filter = { column: ref, op: 'date', values: [period] }
  return {
    label: formatValue(value, column),
    query: {
      ...query,
      filters: [...(query.filters ?? []), filter],
      breakouts: (query.breakouts ?? []).map((x) => (x === b ? { ...x, unit: finer } : x)),
    },
  }
}

/** The value clicked, broken down by another column: « Bretagne » by city, by product… */
export function drillBy(query: BuilderQuery, column: ResultColumn, value: unknown, by: { field: string; label: string }): DrillStep | null {
  const b = breakoutOf(query, column)
  if (!b) return null
  const ref = { field: b.field, ...(b.join ? { join: b.join } : {}) }
  const filter: Filter = value === null || value === undefined ? { column: ref, op: 'empty', values: [] } : { column: ref, op: 'is', values: [value as string | number | boolean] }
  return {
    label: `${formatValue(value, column)} › ${by.label}`,
    query: {
      ...query,
      filters: [...(query.filters ?? []), filter],
      breakouts: (query.breakouts ?? []).map((x) => (x === b ? { field: by.field, ...(b.join ? { join: b.join } : {}) } : x)),
    },
  }
}
