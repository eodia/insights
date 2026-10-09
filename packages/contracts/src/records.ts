/**
 * The rows behind a point of a chart — what « Voir les enregistrements » opens as a new
 * question: the question without its aggregates nor its groupings, narrowed to the values the
 * point stands for. Its filters, its joins and its computed columns stay.
 */
import {
  type BuilderQuery,
  type ColumnRef,
  type Filter,
  type FilterValue,
  type TemporalUnit,
  columnName,
  periodExpression,
  resultNames,
} from './analytics'

/** A value of a point: a grouping of the question, by its name in the result, and its value there. */
export interface RecordPick {
  readonly name: string
  readonly value: FilterValue | null
  /** For numbers grouped in bins of automatic width: the width the result was cut at. */
  readonly width?: number
}

/** The condition a value of a grouping stands for — its period, its bin, or itself —; `null`: none. */
function pickFilters(column: ColumnRef, unit: TemporalUnit | undefined, bin: number | 'auto' | undefined, pick: RecordPick): Filter[] | null {
  const v = pick.value
  if (v === null) return [{ column, op: 'empty', values: [] }]
  if (unit !== undefined) {
    // A rank (a weekday) or a period of less than a day names no span of days.
    const period = typeof v === 'string' ? periodExpression(v, unit) : null
    return period === null ? null : [{ column, op: 'date', values: [period] }]
  }
  if (bin !== undefined) {
    const width = typeof bin === 'number' ? bin : pick.width
    if (typeof v !== 'number' || width === undefined || !(width > 0)) return null
    return [
      { column, op: 'gte', values: [v] },
      { column, op: 'lt', values: [v + width] },
    ]
  }
  if (typeof v === 'boolean') return [{ column, op: v ? 'true' : 'false', values: [] }]
  return [{ column, op: 'is', values: [v] }]
}

/** `champ` or `jointure.champ`, back to the column it names. */
function refOf(name: string): ColumnRef {
  const dot = name.indexOf('.')
  return dot > 0 ? { join: name.slice(0, dot), field: name.slice(dot + 1) } : { field: name }
}

/**
 * The query reading the rows behind a point, or `null` when they cannot be read: a value that
 * is not a grouping of the question, a rank of a date, a bin of unknown width.
 *
 * @param metricFilters the filters of the one saved metric the question measures, if it does:
 *   its rows are those the metric counts, not every row of their groups.
 */
export function recordsQuery(query: BuilderQuery, picks: readonly RecordPick[], metricFilters: readonly Filter[] = []): BuilderQuery | null {
  const breakouts = query.breakouts ?? []
  const grouped = breakouts.length > 0 || (query.aggregations?.length ?? 0) > 0
  const names = resultNames(query).breakouts
  const filters: Filter[] = [...(query.filters ?? [])]
  for (const pick of picks) {
    let found: Filter[] | null
    if (grouped) {
      const b = breakouts[names.indexOf(pick.name)]
      if (b === undefined) return null
      found = pickFilters(b.join === undefined ? { field: b.field } : { join: b.join, field: b.field }, b.unit, b.bin, pick)
    } else {
      const fields = query.fields ?? []
      const field = fields.length ? fields.find((f) => columnName(f) === pick.name) : refOf(pick.name)
      found = field === undefined ? null : pickFilters(field, undefined, undefined, pick)
    }
    if (found === null) return null
    filters.push(...found)
  }
  filters.push(...metricFilters)
  const sort = (query.sort ?? []).filter((s) => s.target.kind === 'column')
  return {
    kind: 'builder',
    source: query.source,
    ...(query.expressions?.length ? { expressions: query.expressions } : {}),
    ...(query.joins?.length ? { joins: query.joins } : {}),
    ...(filters.length ? { filters } : {}),
    // A list of rows keeps the columns it showed; a grouped question shows them all.
    ...(!grouped && query.fields?.length ? { fields: query.fields } : {}),
    ...(sort.length ? { sort } : {}),
  }
}

/** The saved metric a question measures alone, whose filters its rows keep. */
export function soleMetric(query: BuilderQuery): string | null {
  const aggregations = query.aggregations ?? []
  const only = aggregations.length === 1 ? aggregations[0] : undefined
  return only?.fn === 'metric' && only.metric !== undefined ? only.metric : null
}
