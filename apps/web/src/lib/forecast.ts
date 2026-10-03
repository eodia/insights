/**
 * Prévision d'une série chronologique, sans dépendance : de quoi prolonger une courbe de
 * quelques périodes, avec un intervalle qui s'élargit avec l'horizon.
 *
 * - `linear` : la droite des moindres carrés ;
 * - `smooth` : le lissage exponentiel double de Holt (niveau + tendance), paramètres choisis
 *   en minimisant l'erreur de prévision à un pas ;
 * - `seasonal` : Holt-Winters additif, quand la série couvre au moins deux saisons ;
 * - `auto` : la saison si la période en a une (12 mois, 4 trimestres, 7 jours) et que la série
 *   en couvre deux, sinon Holt à partir de 6 points, sinon la droite.
 */
import type { TemporalUnit } from '@eodia/contracts'

export type ForecastMethod = 'auto' | 'linear' | 'smooth' | 'seasonal'

export interface Forecast {
  readonly values: number[]
  /** An 80 % interval around each value. */
  readonly lower: number[]
  readonly upper: number[]
  readonly method: Exclude<ForecastMethod, 'auto'>
}

const SEASONS: Partial<Record<TemporalUnit, number>> = { month: 12, quarter: 4, day: 7 }
const Z80 = 1.2816

function sd(errors: readonly number[]): number {
  if (errors.length < 2) return 0
  return Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / (errors.length - 1))
}

function linear(y: readonly number[], h: number): { values: number[]; errors: number[] } {
  const n = y.length
  const mx = (n - 1) / 2
  const my = y.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  y.forEach((v, i) => {
    num += (i - mx) * (v - my)
    den += (i - mx) ** 2
  })
  const slope = den ? num / den : 0
  const at = (i: number) => my + slope * (i - mx)
  return {
    values: Array.from({ length: h }, (_, k) => at(n + k)),
    errors: y.map((v, i) => v - at(i)),
  }
}

function holt(y: readonly number[], h: number): { values: number[]; errors: number[] } {
  let best: { sse: number; values: number[]; errors: number[] } | null = null
  for (let a = 0.1; a < 0.95; a += 0.1) {
    for (let b = 0.05; b < 0.6; b += 0.1) {
      let level = y[0] as number
      let trend = (y[1] as number) - (y[0] as number)
      const errors: number[] = []
      for (let i = 1; i < y.length; i++) {
        const predicted = level + trend
        errors.push((y[i] as number) - predicted)
        const prev = level
        level = a * (y[i] as number) + (1 - a) * (level + trend)
        trend = b * (level - prev) + (1 - b) * trend
      }
      const sse = errors.reduce((s, e) => s + e * e, 0)
      if (!best || sse < best.sse)
        best = { sse, errors, values: Array.from({ length: h }, (_, k) => level + (k + 1) * trend) }
    }
  }
  return best as { values: number[]; errors: number[] }
}

function holtWinters(
  y: readonly number[],
  p: number,
  h: number,
): { values: number[]; errors: number[] } {
  const mean = (from: number) => y.slice(from, from + p).reduce((a, b) => a + b, 0) / p
  let best: { sse: number; values: number[]; errors: number[] } | null = null
  const grid = [0.1, 0.3, 0.5, 0.7]
  for (const a of grid) {
    for (const b of [0.05, 0.15, 0.3]) {
      for (const g of grid) {
        // Start at the end of the first season, its trend taken out of the seasonal terms.
        let trend = (mean(p) - mean(0)) / p
        const centre = (p - 1) / 2
        let level = mean(0) + trend * centre
        const season = y.slice(0, p).map((v, i) => v - (mean(0) + trend * (i - centre)))
        const errors: number[] = []
        for (let i = p; i < y.length; i++) {
          const s = season[i % p] as number
          errors.push((y[i] as number) - (level + trend + s))
          const prev = level
          level = a * ((y[i] as number) - s) + (1 - a) * (level + trend)
          trend = b * (level - prev) + (1 - b) * trend
          season[i % p] = g * ((y[i] as number) - level) + (1 - g) * s
        }
        const sse = errors.reduce((s, e) => s + e * e, 0)
        if (!best || sse < best.sse) {
          const n = y.length
          best = {
            sse,
            errors,
            values: Array.from(
              { length: h },
              (_, k) => level + (k + 1) * trend + (season[(n + k) % p] as number),
            ),
          }
        }
      }
    }
  }
  return best as { values: number[]; errors: number[] }
}

/** The next `h` values of a series (its nulls left out), or null when it is too short. */
export function forecast(
  series: readonly (number | null)[],
  h: number,
  method: ForecastMethod = 'auto',
  unit?: TemporalUnit,
): Forecast | null {
  const y = series.filter((v): v is number => v !== null && Number.isFinite(v))
  if (y.length < 3 || h < 1) return null
  const p = unit ? SEASONS[unit] : undefined
  const chosen: Forecast['method'] =
    method === 'seasonal'
      ? p && y.length >= 2 * p
        ? 'seasonal'
        : 'smooth'
      : method === 'auto'
        ? p && y.length >= 2 * p
          ? 'seasonal'
          : y.length >= 6
            ? 'smooth'
            : 'linear'
        : method
  const fit =
    chosen === 'seasonal'
      ? holtWinters(y, p as number, h)
      : chosen === 'smooth'
        ? holt(y, h)
        : linear(y, h)
  const sigma = sd(fit.errors)
  // A series that never goes below zero (sales, visits…) is not forecast below it either.
  const floor = y.every((v) => v >= 0) ? 0 : Number.NEGATIVE_INFINITY
  const values = fit.values.map((v) => Math.max(floor, v))
  return {
    values,
    lower: values.map((v, k) => Math.max(floor, v - Z80 * sigma * Math.sqrt(k + 1))),
    upper: values.map((v, k) => v + Z80 * sigma * Math.sqrt(k + 1)),
    method: chosen,
  }
}

/** The periods after `last` (a date, as a result gives it), in the same unit. */
export function nextPeriods(last: unknown, unit: TemporalUnit, h: number): string[] | null {
  const s = last instanceof Date ? last.toISOString() : String(last ?? '')
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])]
  const out: string[] = []
  for (let k = 1; k <= h; k++) {
    const date =
      unit === 'year'
        ? new Date(Date.UTC(y + k, mo, d))
        : unit === 'quarter'
          ? new Date(Date.UTC(y, mo + 3 * k, d))
          : unit === 'month'
            ? new Date(Date.UTC(y, mo + k, d))
            : unit === 'week'
              ? new Date(Date.UTC(y, mo, d + 7 * k))
              : unit === 'day'
                ? new Date(Date.UTC(y, mo, d + k))
                : null
    if (!date) return null
    out.push(date.toISOString().slice(0, 10))
  }
  return out
}

export const FORECAST_UNITS: readonly TemporalUnit[] = ['day', 'week', 'month', 'quarter', 'year']
