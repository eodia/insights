import type { ColumnFormat } from './metadata'

/**
 * Analyse : les questions posées aux sources, leur affichage, et les tableaux de bord qui
 * les rassemblent. Un seul vocabulaire pour le noyau, qui compile vers Trino SQL et exécute,
 * et pour l'interface, qui construit à la souris.
 *
 * Repris de BaseDB (AGPL-3.0-or-later) et adapté : une question construite à la souris cite
 * une table synchronisée (ou une question, un modèle) par identifiant et ses colonnes par leur
 * nom physique ; elle ne contient jamais de SQL. Aucune ne porte de droit : chacun lit avec
 * les siens, appliqués par Trino via l'endpoint OPA.
 */

// ── Dates ───────────────────────────────────────────────────────────────────

/** What a date is cut to when grouped: the period it falls in. */
export const TEMPORAL_UNITS = ['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'] as const

/** What is read off a date when grouped: a rank that repeats — the day of the week. */
export const TEMPORAL_EXTRACTIONS = [
  'hour_of_day',
  'day_of_week',
  'day_of_month',
  'week_of_year',
  'month_of_year',
  'quarter_of_year',
] as const

export type TemporalTruncation = (typeof TEMPORAL_UNITS)[number]
export type TemporalExtraction = (typeof TEMPORAL_EXTRACTIONS)[number]
export type TemporalUnit = TemporalTruncation | TemporalExtraction

export const isTemporalUnit = (value: unknown): value is TemporalUnit =>
  (TEMPORAL_UNITS as readonly unknown[]).includes(value) ||
  (TEMPORAL_EXTRACTIONS as readonly unknown[]).includes(value)

/** The next finer period, for a drill into a point: a month opens on its weeks. */
export function finerUnit(unit: TemporalUnit): TemporalTruncation | null {
  switch (unit) {
    case 'year':
      return 'quarter'
    case 'quarter':
      return 'month'
    case 'month':
      return 'week'
    case 'week':
      return 'day'
    case 'day':
      return 'hour'
    case 'hour':
      return 'minute'
    default:
      return null
  }
}

// ── Questions built with the mouse ──────────────────────────────────────────

/** A column of the query: a field of the source table, or of one of its joins. */
export interface ColumnRef {
  /** The alias of the join the column comes from; absent: the source table. */
  readonly join?: string
  /** Physical name of the field, or a system column (`_created_at`…). */
  readonly field: string
}

/** A column the rows are grouped by. */
export interface Breakout extends ColumnRef {
  /** For a date: the period it is cut to, or the rank read off it. */
  readonly unit?: TemporalUnit
  /** For a number: the width of each bin, or `auto` for about ten bins. */
  readonly bin?: number | 'auto'
}

export const AGGREGATION_FNS = [
  'count',
  'distinct',
  'sum',
  'avg',
  'median',
  'min',
  'max',
  'stddev',
  'cum_count',
  'cum_sum',
  'metric',
] as const
export type AggregationFn = (typeof AGGREGATION_FNS)[number]

/** The functions that read no column. */
export const COLUMNLESS_FNS: ReadonlySet<AggregationFn> = new Set(['count', 'cum_count', 'metric'])

export interface Aggregation {
  readonly fn: AggregationFn
  /** Absent for `count` and `cum_count`. */
  readonly column?: ColumnRef
  /** For `metric`: the identifier of the saved metric. */
  readonly metric?: string
  /** What the result column is called; the kernel names it when absent. */
  readonly label?: string
}

/** Where rows come from: a synchronised table, or a saved question / model. */
export type SourceRef =
  | { readonly kind: 'table'; readonly id: string }
  | { readonly kind: 'question'; readonly id: string }

/** A column computed per row with a Trino SQL expression (needs the SQL query level). */
export interface CustomColumn {
  readonly name: string
  readonly expression: string
}

export const JOIN_KINDS = ['left', 'inner', 'right', 'full'] as const
export type JoinKind = (typeof JOIN_KINDS)[number]

/**
 * Another table of the base, joined to the rows: `left` is a column of the source or of
 * an earlier join, `right` a field of the joined table — `_id` when `left` is a link.
 */
export interface Join {
  readonly alias: string
  /** The joined table, or a saved question / model. */
  readonly source: SourceRef
  readonly kind: JoinKind
  readonly left: ColumnRef
  readonly right: string
  /**
   * Added by the person, not through a key for a column they picked: it stays when no step
   * cites it, and its columns are shown with the source's.
   */
  readonly explicit?: boolean
}

/**
 * What the builder offers to filter by, per kind of column. Each is translated by the
 * kernel into the filter grammar of chapter 08 §4, whose rules — bound values, the
 * reader's mask — therefore apply unchanged.
 */
export const FILTER_OPS = [
  'is',
  'is_not',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'date',
  'before',
  'after',
  'true',
  'false',
  'has_any',
  'has_all',
  'has_none',
  'empty',
  'not_empty',
] as const
export type FilterOp = (typeof FILTER_OPS)[number]

export type FilterValue = string | number | boolean

export type Filter =
  | {
      readonly column: ColumnRef
      readonly op: FilterOp
      /**
       * `date` takes one date expression (`thismonth`, `past30days`, `2026-01-01~2026-03-31`,
       * see `resolveDateExpression`); `before` and `after` a day; `between` two bounds.
       */
      readonly values: readonly FilterValue[]
    }
  | {
      /** A Trino SQL condition written by hand (needs the SQL query level). */
      readonly sql: string
    }

export type SortTarget =
  | { readonly kind: 'aggregation'; readonly index: number }
  | { readonly kind: 'breakout'; readonly index: number }
  | { readonly kind: 'column'; readonly column: ColumnRef }

export interface OrderBy {
  readonly target: SortTarget
  readonly desc?: boolean
}

export interface BuilderQuery {
  readonly kind: 'builder'
  readonly source: SourceRef
  /** Columns computed per row, usable as any other column (`{ field: name }`). */
  readonly expressions?: readonly CustomColumn[]
  readonly joins?: readonly Join[]
  readonly filters?: readonly Filter[]
  readonly aggregations?: readonly Aggregation[]
  readonly breakouts?: readonly Breakout[]
  /** Without aggregation nor grouping: the columns shown. Absent: every one read. */
  readonly fields?: readonly ColumnRef[]
  readonly sort?: readonly OrderBy[]
  readonly limit?: number | null
}

// ── SQL questions ───────────────────────────────────────────────────────────

/**
 * `text`, `number`, `date`: `{{nom}}` becomes a literal. `filter`: `{{nom}}` becomes a whole
 * condition on the expression `column` — `TRUE` when no value is given —, so that a filter of
 * a dashboard can narrow the rows of a SQL question as it narrows the others.
 */
export const SQL_VARIABLE_TYPES = ['text', 'number', 'date', 'filter'] as const
export type SqlVariableType = (typeof SQL_VARIABLE_TYPES)[number]

/** What the column of a `filter` variable holds. */
export const SQL_FILTER_KINDS = ['date', 'datetime', 'number', 'text'] as const
export type SqlFilterKind = (typeof SQL_FILTER_KINDS)[number]

export interface SqlVariable {
  readonly name: string
  readonly label: string
  readonly type: SqlVariableType
  readonly required?: boolean
  readonly default?: ParameterValue | null
  /** For `filter`: the SQL expression the condition bears on, `c.date_commande`. */
  readonly column?: string
  /** For `filter`: what that expression holds. */
  readonly column_kind?: SqlFilterKind
}

export interface SqlQuery {
  readonly kind: 'sql'
  readonly sql: string
  readonly variables?: readonly SqlVariable[]
}

/**
 * Native SQL, in the source's own dialect, sent through `system.query`: only for people
 * without any row or column restriction on that source.
 */
export interface NativeQuery {
  readonly kind: 'native'
  readonly datasource: string
  readonly sql: string
  readonly variables?: readonly SqlVariable[]
}

export type QuestionQuery = BuilderQuery | SqlQuery | NativeQuery

const VARIABLE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

/** The variables a SQL text cites, in the order of their first appearance. */
export function sqlVariableNames(sql: string): string[] {
  const names: string[] = []
  for (const match of sql.matchAll(VARIABLE)) {
    const name = match[1] as string
    if (!names.includes(name)) names.push(name)
  }
  return names
}

// ── Visualizations ──────────────────────────────────────────────────────────

export const VISUALIZATIONS = [
  'table',
  'scalar',
  'trend',
  'progress',
  'gauge',
  'bar',
  'row',
  'line',
  'area',
  'combo',
  'pie',
  'scatter',
  'funnel',
  'radar',
  'bar_race',
  'line_race',
  'pivot',
  'map',
] as const
export type VisualizationType = (typeof VISUALIZATIONS)[number]

/** How a series of a line, bar or combo chart is drawn. */
export interface SeriesSettings {
  readonly display?: 'bar' | 'line' | 'area'
  readonly axis?: 'left' | 'right'
  readonly color?: string
  readonly label?: string
}

export const MAP_REGIONS = ['fr-regions', 'fr-departements', 'world'] as const
export type MapRegion = (typeof MAP_REGIONS)[number]

/**
 * The settings of a visualization. Columns are cited by the names of the result
 * (`resultName`): a setting survives a change of period or of filter.
 */
/** The named palettes of the charts (`apps/web/src/lib/palettes.ts`), or one's own. */
export const COLOR_SCHEMES = ['eodia', 'vif', 'ocean', 'terre', 'doux', 'degrade', 'custom'] as const
export type ColorScheme = (typeof COLOR_SCHEMES)[number]

export interface VisualizationSettings {
  /** Dimensions: the first on the axis, the second splitting it into series. */
  readonly dimensions?: readonly string[]
  /** Measures drawn. */
  readonly metrics?: readonly string[]
  readonly stack?: 'none' | 'stacked' | 'percent'
  readonly values?: boolean
  readonly legend?: boolean
  readonly series?: Readonly<Record<string, SeriesSettings>>
  readonly goal?: number | null
  readonly goal_label?: string
  readonly x_label?: string
  readonly y_label?: string
  /** Numbers: 1,2 k rather than 1 234. */
  readonly compact?: boolean
  readonly decimals?: number | null
  readonly prefix?: string
  readonly suffix?: string
  /** A pie: a ring, and the total in its middle. */
  readonly donut?: boolean
  /** The trend: which earlier value the last one is compared with. */
  readonly comparison?: 'previous' | 'year' | 'both'
  readonly min?: number | null
  readonly max?: number | null
  /** A pivot table: its rows, its columns, its cells. */
  readonly pivot_rows?: readonly string[]
  readonly pivot_columns?: readonly string[]
  readonly pivot_values?: readonly string[]
  readonly totals?: boolean
  /** A map: which regions, the column naming them, or the two holding coordinates. */
  readonly region?: MapRegion
  readonly latitude?: string
  readonly longitude?: string
  /** A table: the columns shown, in their order. */
  readonly columns?: readonly string[]

  // ── Pies and rings ──
  /** What each slice says on itself. */
  readonly slice_labels?: 'none' | 'percent' | 'value' | 'name' | 'name_percent' | 'name_value'
  /** The labels beside the ring, a line to their slice, rather than on it. */
  readonly labels_outside?: boolean
  /** How many slices before the rest is « Autres » (2 to 12, 8 by default). */
  readonly slices_max?: number
  /** A ring's thickness, in percent of its radius (10 to 70). */
  readonly ring_width?: number
  /** Half a ring, flat side down. */
  readonly half?: boolean
  /** Slices as long as their value, not as wide. */
  readonly rose?: boolean
  /** The total in the middle of a ring — shown by default. */
  readonly total?: boolean
  /** The largest slice first — by default; otherwise in the result's order. */
  readonly sort_slices?: boolean
  /** Each entry of the legend with its share — by default. */
  readonly legend_values?: boolean
  readonly legend_position?: 'auto' | 'top' | 'bottom' | 'left' | 'right'

  // ── Axes ──
  /** The labels of the horizontal and the vertical axis. */
  readonly x_axis?: boolean
  readonly y_axis?: boolean
  readonly grid_lines?: boolean
  readonly y_min?: number | null
  readonly y_max?: number | null
  readonly y_scale?: 'linear' | 'log'
  /** Degrees the labels of the horizontal axis turn by. */
  readonly x_rotate?: number
  readonly line_style?: 'straight' | 'smooth' | 'step'
  readonly markers?: 'auto' | 'always' | 'never'
  readonly bar_width?: 'thin' | 'normal' | 'wide'
  /** The total above each stack. */
  readonly stack_totals?: boolean
  /** The categories by their value rather than in the result's order. */
  readonly sort_values?: 'none' | 'asc' | 'desc'
  /** Periods without a row drawn at zero — by default. */
  readonly fill_periods?: boolean

  // ── Colours ──
  /** The palette the series take, in its order; `custom` reads `colors`. */
  readonly scheme?: ColorScheme
  /** A palette of one's own: up to eight colours, in order. */
  readonly colors?: readonly string[]
  /** One colour: a number's, a bar of progress's, a gauge's, a single series'. */
  readonly color?: string

  // ── Reading aids ──
  /** One mark stands out, the others recede: the highest, the lowest, the last. */
  readonly highlight?: 'none' | 'max' | 'min' | 'last'
  /** Lines across the chart at the series' average or median. */
  readonly ref_lines?: readonly ('average' | 'median')[]
  /** Only the largest categories, the rest summed into « Autres ». */
  readonly top_n?: number | null
  /** An area fades towards its base — by default. */
  readonly gradient?: boolean
  /** Lines named at their end rather than only in the legend — by default for 2 to 4 lines. */
  readonly end_labels?: boolean

  // ── Forecast ──
  /** Periods drawn beyond the last one, extrapolated from the series (0 or absent: none). */
  readonly forecast?: number | null
  /** How: a straight line, a smoothed trend, a trend with its season — or chosen from the data. */
  readonly forecast_method?: 'auto' | 'linear' | 'smooth' | 'seasonal'
  /** The 80 % interval around a single forecast line — shown by default. */
  readonly forecast_band?: boolean

  // ── Races ──
  /** How long each period stays on screen, in milliseconds (300 to 5 000; 1 000 by default). */
  readonly race_speed?: number
  /** Each period adds to the ones before: a running total rather than the period's value. */
  readonly race_cumulative?: boolean
  /** The race starts by itself — by default; otherwise on the play button. */
  readonly race_autoplay?: boolean
  /** Colours by value: a number, the cells of a table or a pivot. */
  readonly rules?: readonly ColorRule[]
  /** The trend: a fall is good news — a cost, a delay. */
  readonly invert?: boolean
  /** A line under a number. */
  readonly caption?: string

  // ── Tables ──
  /** The columns renamed, by result name. */
  readonly column_labels?: Readonly<Record<string, string>>
  /** Numbers drawn with a bar in their cell. */
  readonly cell_bars?: readonly string[]
  readonly density?: 'compact' | 'normal' | 'comfortable'
  readonly page_size?: number
  readonly row_numbers?: boolean
  /** A pivot: each cell tinted by its value. */
  readonly heatmap?: boolean

  // ── Maps ──
  readonly palette?: 'blue' | 'green' | 'orange' | 'violet' | 'red'
  readonly region_labels?: boolean
}

/**
 * A colour given by a value: `montant gt 1000` in green. Without a column, it reads the
 * number shown; `row` colours the whole line of a table.
 */
export interface ColorRule {
  readonly column?: string
  readonly op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne' | 'between'
  readonly value: number
  readonly value2?: number
  readonly color: string
  readonly row?: boolean
}

/** Whether a number meets a rule. */
export function ruleHolds(rule: ColorRule, value: unknown): boolean {
  const n = typeof value === 'number' ? value : Number(value)
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return false
  switch (rule.op) {
    case 'gt':
      return n > rule.value
    case 'gte':
      return n >= rule.value
    case 'lt':
      return n < rule.value
    case 'lte':
      return n <= rule.value
    case 'eq':
      return n === rule.value
    case 'ne':
      return n !== rule.value
    case 'between':
      return (
        n >= Math.min(rule.value, rule.value2 ?? rule.value) &&
        n <= Math.max(rule.value, rule.value2 ?? rule.value)
      )
  }
}

/** The colour the first rule that holds gives a value, for a column or for the number. */
export function ruleColor(
  rules: readonly ColorRule[] | undefined,
  column: string | undefined,
  value: unknown,
): string | null {
  for (const rule of rules ?? []) {
    if ((rule.column ?? null) !== (column ?? null) && rule.column !== undefined) continue
    if (ruleHolds(rule, value)) return rule.color
  }
  return null
}

export interface Visualization {
  readonly type: VisualizationType
  readonly settings?: VisualizationSettings
}

// ── Results ─────────────────────────────────────────────────────────────────

export interface ResultColumn {
  /** Stable name — what the settings cite. */
  readonly name: string
  readonly label: string
  /** `dimension`: a grouping; `metric`: an aggregate; `field`: a column read as it is. */
  readonly role: 'dimension' | 'metric' | 'field'
  /**
   * The kind of its values: a field's kind (`select`, `date`, `user`…) for a grouping or a
   * column read, `number` for an aggregate; for SQL, `number`, `text`, `date`, `datetime`,
   * `boolean` or `json`.
   */
  readonly type: string
  readonly unit?: TemporalUnit
  readonly bin?: number
  /** Where the column comes from, to format it and to drill into it. */
  readonly source?: {
    /** db_table identifier. */
    readonly table: string
    /** db_column identifier, when known. */
    readonly column?: string
    readonly field: string
    readonly join?: string
  }
  /** Semantic type and display format, from the Structure screen. */
  readonly semantic?: string
  readonly format?: ColumnFormat
  /** What a link's identifiers read as, when its table and its display column are read. */
  readonly labels?: Readonly<Record<string, string>>
  /** Read for the screen's own use — the identifier of each row —, not shown. */
  readonly hidden?: boolean
}

export interface QueryResult {
  readonly columns: readonly ResultColumn[]
  readonly rows: ReadonlyArray<readonly unknown[]>
  /** More rows exist than are returned. */
  readonly truncated: boolean
  readonly duration_ms: number
  /** Rows read as they are, of one table: the column holding each row's identifier. */
  readonly record?: { readonly table: string; readonly column: number }
  /** The Trino SQL actually sent. */
  readonly sql?: string
  /** When the result comes from the cache: when it was computed. */
  readonly cached_at?: string
}

/** The name of a column of the query in its result: `champ`, or `jointure.champ`. */
export const columnName = (ref: ColumnRef): string =>
  ref.join === undefined || ref.join === '' ? ref.field : `${ref.join}.${ref.field}`

const sameColumn = (a: ColumnRef, b: ColumnRef) =>
  a.field === b.field && (a.join ?? '') === (b.join ?? '')

export { sameColumn as sameColumnRef }

/**
 * The names of a grouped result, in order: its groupings then its aggregates. A second use
 * of one name is suffixed `#2`: a date grouped by year and by month is two columns.
 */
export function resultNames(query: Pick<BuilderQuery, 'aggregations' | 'breakouts'>): {
  readonly breakouts: string[]
  readonly aggregations: string[]
} {
  const taken = new Map<string, number>()
  const unique = (name: string) => {
    const n = (taken.get(name) ?? 0) + 1
    taken.set(name, n)
    return n === 1 ? name : `${name}#${n}`
  }
  const breakouts = (query.breakouts ?? []).map((b) => unique(columnName(b)))
  const aggregations = (query.aggregations ?? []).map((a) =>
    unique(
      a.column === undefined || COLUMNLESS_FNS.has(a.fn) ? a.fn : `${a.fn}:${columnName(a.column)}`,
    ),
  )
  return { breakouts, aggregations }
}

// ── Dashboard filters ───────────────────────────────────────────────────────

export const PARAMETER_TYPES = ['date', 'category', 'text', 'number', 'temporal_unit'] as const
export type ParameterType = (typeof PARAMETER_TYPES)[number]

export const NUMBER_OPERATORS = ['eq', 'between', 'gte', 'lte'] as const
export type NumberOperator = (typeof NUMBER_OPERATORS)[number]

/**
 * A filter's value: a date expression, a period (`month`), a text; the values of a
 * category; the bounds of a number, `null` for an open one.
 */
export type ParameterValue = string | readonly string[] | readonly (number | null)[]

export interface DashboardParameter {
  readonly id: string
  readonly label: string
  readonly type: ParameterType
  readonly default?: ParameterValue | null
  /** A category: several values at once. */
  readonly multiple?: boolean
  readonly operator?: NumberOperator
  /** A period: those offered. */
  readonly units?: readonly TemporalTruncation[]
}

/** What a filter is tied to on a card: a column of its question, or a SQL variable. */
export type ParameterTarget = { readonly column: ColumnRef } | { readonly variable: string }

export interface CardMapping {
  readonly parameter: string
  readonly target: ParameterTarget
}

/** A filter with its value, as a card asks the kernel to apply it. */
export interface Constraint {
  readonly target: ParameterTarget
  readonly type: ParameterType
  readonly operator?: NumberOperator
  readonly value: ParameterValue
}

/** Whether a filter's value says anything: an empty text or list filters nothing. */
export function parameterHasValue(
  value: ParameterValue | null | undefined,
): value is ParameterValue {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  return value.some((v) => v !== null && v !== '')
}

/**
 * The filters a card applies: each filter tied to it that has a value. The application
 * sends them with the card; a shared dashboard's page sends only the values, and the
 * kernel ties them itself — a visitor never chooses what a card filters.
 */
export function cardConstraints(
  mappings: readonly CardMapping[] | undefined,
  parameters: readonly DashboardParameter[],
  values: Readonly<Record<string, ParameterValue | null | undefined>>,
): Constraint[] {
  const out: Constraint[] = []
  for (const mapping of mappings ?? []) {
    const parameter = parameters.find((p) => p.id === mapping.parameter)
    if (parameter === undefined) continue
    const value = values[parameter.id]
    if (!parameterHasValue(value)) continue
    out.push({
      target: mapping.target,
      type: parameter.type,
      value,
      ...(parameter.operator === undefined ? {} : { operator: parameter.operator }),
    })
  }
  return out
}

/** Kinds of field a filter of each type may be tied to. */
const PARAMETER_KINDS: Readonly<Record<ParameterType, ReadonlySet<ColumnKind>>> = {
  date: new Set(['date', 'datetime']),
  category: new Set(['text', 'boolean', 'number']),
  text: new Set(['text']),
  number: new Set(['number']),
  temporal_unit: new Set(['date', 'datetime']),
}

/** What a column holds, read off its Trino type. */
export type ColumnKind =
  | 'number'
  | 'text'
  | 'date'
  | 'datetime'
  | 'time'
  | 'boolean'
  | 'json'
  | 'other'

/** The kind of a Trino type: `decimal(10,2)` → number, `timestamp(3) with time zone` → datetime. */
export function kindOfTrinoType(type: string): ColumnKind {
  const t = type.toLowerCase()
  if (/^(tinyint|smallint|integer|int|bigint|real|double|decimal)/.test(t)) return 'number'
  if (/^(varchar|char|uuid|ipaddress|varbinary)/.test(t)) return 'text'
  if (t === 'date') return 'date'
  if (t.startsWith('timestamp')) return 'datetime'
  if (t.startsWith('time')) return 'time'
  if (t === 'boolean') return 'boolean'
  if (t === 'json' || t.startsWith('row') || t.startsWith('array') || t.startsWith('map')) return 'json'
  return 'other'
}

/** Whether a filter of this type can bear on a column of this kind. */
export const parameterFits = (type: ParameterType, kind: ColumnKind): boolean =>
  PARAMETER_KINDS[type].has(kind)

/** Whether a filter of this type can feed a SQL variable of this type. */
export function parameterFitsVariable(type: ParameterType, variable: SqlVariableType): boolean {
  if (variable === 'filter') return type !== 'temporal_unit'
  if (variable === 'date') return type === 'date'
  if (variable === 'number') return type === 'number'
  return type === 'text' || type === 'category' || type === 'temporal_unit'
}

// ── Dashboards ──────────────────────────────────────────────────────────────

/** Columns of a dashboard's grid. */
export const DASHBOARD_COLUMNS = 24

export const DASHBOARD_LIMITS = {
  cards: 60,
  tabs: 12,
  parameters: 16,
  label: 120,
  text: 5000,
  /** A rich text's HTML, its tags counted. */
  html: 20_000,
  /** The values one text cites. */
  variables: 20,
  height: 60,
} as const

export interface DashboardTab {
  readonly id: string
  readonly label: string
}

export const CARD_KINDS = ['question', 'heading', 'text', 'embed'] as const
export type CardKind = (typeof CARD_KINDS)[number]

export interface DashboardCard {
  readonly id: string
  /** The tab it sits in; `null` when the dashboard has none. */
  readonly tab: string | null
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly kind: CardKind
  /** Shown above the card; for a question, its label when empty. */
  readonly title?: string
  /** A saved question, by identifier… */
  readonly question?: string
  /** …or a question kept in the card alone. */
  readonly query?: QuestionQuery
  /** How the card shows its question — the question's own way when absent. */
  readonly visualization?: Visualization
  readonly mappings?: readonly CardMapping[]
  /** A heading, or a text: in Markdown, or in HTML when `rich`. */
  readonly text?: string
  /** A text in HTML — the rich text of chapter 04 §2.2 —, as its editor writes it. */
  readonly rich?: boolean
  /** What a text cites, `{{nom}}`, by the name it cites it with. */
  readonly variables?: readonly TextVariable[]
  /** A page from elsewhere (chapter 18 §2). */
  readonly url?: string
}

/**
 * A value a text card cites — `{{nom}}` in its text: what a query gives, the value its
 * number would show — a saved query of the whole base, by reference; a query kept in the
 * text, as a card keeps one; or a question card of the dashboard, under its own filters —,
 * or the value of one of the dashboard's filters, as its control says it.
 */
export type TextVariable =
  | {
      readonly name: string
      readonly question: string
      readonly mappings?: readonly CardMapping[]
    }
  | {
      readonly name: string
      readonly query: QuestionQuery
      /** What the query was called, for its pill. */
      readonly label?: string
      readonly visualization?: Visualization
      readonly mappings?: readonly CardMapping[]
    }
  | { readonly name: string; readonly card: string }
  | { readonly name: string; readonly parameter: string }

/** A variable that runs a query of its own, tied to the filters by the text itself. */
export type TiedVariable = Extract<
  TextVariable,
  { readonly question: string } | { readonly query: QuestionQuery }
>

export const tiesItself = (variable: TextVariable): variable is TiedVariable =>
  'question' in variable || 'query' in variable

/** The names a text cites, `{{nom}}`, each once, in the order they come. */
export function citedNames(text: string): string[] {
  const names = [...text.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g)].map((m) => m[1] as string)
  return [...new Set(names)]
}

/**
 * What a text runs for a value it cites, as a card: the card it names among `cards`, or
 * the query it names or keeps — in the text's place, tied as the variable ties it. `null`
 * for a filter's value, which runs nothing, and for a card that is not there.
 */
export function variableCard(
  card: DashboardCard,
  variable: TextVariable,
  cards: readonly DashboardCard[] = [],
): DashboardCard | null {
  if ('parameter' in variable) return null
  if ('card' in variable) {
    return cards.find((c) => c.id === variable.card && c.kind === 'question') ?? null
  }
  return {
    id: card.id,
    tab: card.tab,
    x: card.x,
    y: card.y,
    w: card.w,
    h: card.h,
    kind: 'question',
    ...('question' in variable
      ? { question: variable.question }
      : {
          query: variable.query,
          ...(variable.visualization === undefined
            ? {}
            : { visualization: variable.visualization }),
        }),
    ...(variable.mappings === undefined ? {} : { mappings: variable.mappings }),
  }
}

/**
 * Every question a dashboard runs, as a card: its question cards, and the queries its
 * texts run themselves — where a filter finds its values, what a click on a point filters.
 * A text citing a card runs that card, already there.
 */
export function questionCards(cards: readonly DashboardCard[]): DashboardCard[] {
  return cards.flatMap((card) => {
    if (card.kind === 'question') return [card]
    if (card.kind !== 'text') return []
    return (card.variables ?? []).filter(tiesItself).flatMap((v) => variableCard(card, v) ?? [])
  })
}

/**
 * A text without some of the values it cites — a filter or a card gone: their variables
 * go, and their citations leave its words with them.
 */
export function withoutVariables(
  card: DashboardCard,
  gone: (variable: TextVariable) => boolean,
): DashboardCard {
  const leaving = new Set((card.variables ?? []).filter(gone).map((v) => v.name))
  if (leaving.size === 0) return card
  const variables = (card.variables ?? []).filter((v) => !leaving.has(v.name))
  const text = (card.text ?? '').replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (whole, name: string) =>
    leaving.has(name) ? '' : whole,
  )
  const { variables: _old, ...rest } = card
  return { ...rest, text, ...(variables.length === 0 ? {} : { variables }) }
}

// ── Relative dates ──────────────────────────────────────────────────────────

/** A span of days, bounds included; `null` for an open bound. */
export interface DaySpan {
  readonly start: string | null
  readonly end: string | null
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

const toDate = (day: string) => new Date(`${day}T00:00:00Z`)
const toDay = (date: Date) => date.toISOString().slice(0, 10)

export function addDays(day: string, days: number): string {
  const d = toDate(day)
  d.setUTCDate(d.getUTCDate() + days)
  return toDay(d)
}

function addMonths(day: string, months: number): string {
  const d = toDate(day)
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1))
  return toDay(target)
}

type Period = 'day' | 'week' | 'month' | 'quarter' | 'year'

/** The first day of the period `day` falls in. */
export function startOfPeriod(day: string, period: Period, weekStart: 0 | 1 = 1): string {
  const d = toDate(day)
  switch (period) {
    case 'day':
      return day
    case 'week': {
      const back = (d.getUTCDay() - weekStart + 7) % 7
      return addDays(day, -back)
    }
    case 'month':
      return toDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))
    case 'quarter':
      return toDay(
        new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (d.getUTCMonth() % 3), 1)),
      )
    case 'year':
      return toDay(new Date(Date.UTC(d.getUTCFullYear(), 0, 1)))
  }
}

/** The first day of the period `n` periods after the one starting on `start`. */
function shift(start: string, period: Period, n: number): string {
  switch (period) {
    case 'day':
      return addDays(start, n)
    case 'week':
      return addDays(start, 7 * n)
    case 'month':
      return addMonths(start, n)
    case 'quarter':
      return addMonths(start, 3 * n)
    case 'year':
      return addMonths(start, 12 * n)
  }
}

const RELATIVE = /^(past|last|next)(\d{0,4})(day|week|month|quarter|year)s?$/
const THIS = /^this(day|week|month|quarter|year)$/

/**
 * The days a date expression covers, seen from `today` — or `null` when it reads as none.
 *
 * - `today`, `yesterday`, `tomorrow`; `thisweek`, `thismonth`, `thisquarter`, `thisyear`;
 * - `pastNunits`: the N periods ending with the current one — `past7days` is today and the
 *   six days before it; `lastNunits`: the N complete periods before the current one —
 *   `lastmonth` is the month before this one; `nextNunits`: the N periods after it;
 * - a day `2026-03-15`, a month `2026-03`, a quarter `2026-Q1`, a year `2026`;
 * - a span `2026-01-01~2026-03-31`, open on one side: `2026-01-01~`, `~2026-03-31`.
 */
export function resolveDateExpression(
  expression: string,
  today: string,
  weekStart: 0 | 1 = 1,
): DaySpan | null {
  const text = expression.trim().toLowerCase()
  if (text === 'today') return { start: today, end: today }
  if (text === 'yesterday') return { start: addDays(today, -1), end: addDays(today, -1) }
  if (text === 'tomorrow') return { start: addDays(today, 1), end: addDays(today, 1) }

  const current = THIS.exec(text)
  if (current !== null) {
    const period = current[1] as Period
    const start = startOfPeriod(today, period, weekStart)
    return { start, end: addDays(shift(start, period, 1), -1) }
  }

  const relative = RELATIVE.exec(text)
  if (relative !== null) {
    const [, direction, count, unit] = relative
    const n = count === '' ? 1 : Number(count)
    if (n < 1) return null
    const period = unit as Period
    const start = startOfPeriod(today, period, weekStart)
    if (direction === 'past') {
      return { start: shift(start, period, -(n - 1)), end: addDays(shift(start, period, 1), -1) }
    }
    if (direction === 'last') {
      return { start: shift(start, period, -n), end: addDays(start, -1) }
    }
    return { start: shift(start, period, 1), end: addDays(shift(start, period, n + 1), -1) }
  }

  if (text.includes('~')) {
    const [from = '', to = ''] = text.split('~')
    // An unreadable side is not an open one: `2026-13-45~` reads as nothing.
    const start = from === '' ? null : resolveDateExpression(from, today, weekStart)?.start
    const end = to === '' ? null : resolveDateExpression(to, today, weekStart)?.end
    if (start === undefined || end === undefined || (start === null && end === null)) return null
    return { start, end }
  }

  if (DAY.test(text)) {
    return Number.isNaN(toDate(text).getTime()) ? null : { start: text, end: text }
  }
  const month = /^(\d{4})-(\d{2})$/.exec(text)
  if (month !== null) {
    const start = `${month[1]}-${month[2]}-01`
    if (Number(month[2]) < 1 || Number(month[2]) > 12) return null
    return { start, end: addDays(addMonths(start, 1), -1) }
  }
  const quarter = /^(\d{4})-q([1-4])$/.exec(text)
  if (quarter !== null) {
    const start = `${quarter[1]}-${String((Number(quarter[2]) - 1) * 3 + 1).padStart(2, '0')}-01`
    return { start, end: addDays(addMonths(start, 3), -1) }
  }
  const year = /^(\d{4})$/.exec(text)
  if (year !== null) return { start: `${year[1]}-01-01`, end: `${year[1]}-12-31` }
  return null
}

/**
 * The date expression naming the period a grouped value stands for — what a click on a
 * point of a chart filters by. `null` for a rank (a weekday) or a period finer than a day.
 */
export function periodExpression(
  value: string,
  unit: TemporalUnit,
  weekStart: 0 | 1 = 1,
): string | null {
  const day = value.slice(0, 10)
  if (!DAY.test(day)) return null
  switch (unit) {
    case 'day':
      return day
    case 'week':
      return `${day}~${addDays(startOfPeriod(day, 'week', weekStart), 6)}`
    case 'month':
      return day.slice(0, 7)
    case 'quarter':
      return `${day.slice(0, 4)}-Q${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1}`
    case 'year':
      return day.slice(0, 4)
    default:
      return null
  }
}

// ── Grid ─────────────────────────────────────────────────────────────────────

/** Rows of the grid, in pixels — the height of one unit of `h`. */
export const DASHBOARD_ROW_HEIGHT = 40

/**
 * Places cards one after the other, left to right then row after row — how blocks lay on
 * their old three columns, and where a card is added at the end.
 */
export function flowLayout<T extends { readonly w: number; readonly h: number }>(
  items: readonly T[],
  startY = 0,
): Array<T & { x: number; y: number }> {
  let x = 0
  let y = startY
  let rowHeight = 0
  return items.map((item) => {
    const w = Math.min(Math.max(1, item.w), DASHBOARD_COLUMNS)
    if (x + w > DASHBOARD_COLUMNS) {
      x = 0
      y += rowHeight
      rowHeight = 0
    }
    const placed = { ...item, w, x, y }
    x += w
    rowHeight = Math.max(rowHeight, item.h)
    return placed
  })
}

/** The size a card starts at, by what it shows. */
export function cardSize(
  kind: CardKind,
  viz?: VisualizationType,
): { readonly w: number; readonly h: number } {
  if (kind === 'heading') return { w: DASHBOARD_COLUMNS, h: 2 }
  if (kind === 'text') return { w: 12, h: 4 }
  if (kind === 'embed') return { w: 12, h: 8 }
  switch (viz) {
    case 'scalar':
    case 'trend':
    case 'progress':
      return { w: 6, h: 4 }
    case 'gauge':
      return { w: 8, h: 6 }
    case 'table':
    case 'pivot':
      return { w: 12, h: 8 }
    default:
      return { w: 12, h: 7 }
  }
}

/**
 * Where new cards go: under the cards of their tab, side by side while the row has room —
 * four numbers make one row, two charts another.
 */
export function placedAfter<T extends { readonly w: number; readonly h: number }>(
  cards: ReadonlyArray<Pick<DashboardCard, 'tab' | 'y' | 'h'>>,
  tab: string | null,
  items: readonly T[],
): Array<T & { x: number; y: number }> {
  const bottom = cards.filter((c) => c.tab === tab).reduce((max, c) => Math.max(max, c.y + c.h), 0)
  return flowLayout(items, bottom)
}

// ── Bounds ──────────────────────────────────────────────────────────────────

export const QUERY_LIMITS = {
  joins: 4,
  filters: 24,
  aggregations: 12,
  breakouts: 3,
  fields: 80,
  sort: 6,
  rows: 2000,
  sql: 100_000,
  variables: 20,
  bytes: 200_000,
} as const
