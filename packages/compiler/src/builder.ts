/**
 * Le compilateur du builder : une question construite à la souris devient une requête Trino SQL.
 *
 * Il ne décide d'aucun droit — Trino les applique en interrogeant l'endpoint OPA sous
 * l'identité du lecteur. Il cite seulement des colonnes que le contexte lui fournit (celles
 * que la personne peut voir), et ne place jamais une valeur autrement qu'en littéral échappé.
 */
import {
  type Aggregation,
  type BuilderQuery,
  type ColumnFormat,
  type ColumnKind,
  type ColumnRef,
  type Constraint,
  type Filter,
  type OrderBy,
  type ResultColumn,
  type SourceRef,
  type TemporalUnit,
  addDays,
  columnName,
  kindOfTrinoType,
  resolveDateExpression,
  resultNames,
} from '@eodia/contracts'
import {
  CompileError,
  dateLiteral,
  ident,
  literalFor,
  numberLiteral,
  qualified,
  str,
  timestampLiteral,
} from './sql'

export interface ColumnInfo {
  readonly name: string
  /** Trino type. */
  readonly type: string
  readonly label?: string
  readonly id?: string
  readonly semantic?: string | null
  readonly format?: ColumnFormat
  readonly fingerprint?: { readonly min?: unknown; readonly max?: unknown } | null
}

export interface TableInfo {
  readonly id: string
  readonly catalog: string
  readonly schema: string
  readonly name: string
  readonly label?: string
  readonly columns: readonly ColumnInfo[]
}

/** A saved question or model, already compiled: usable as a source. */
export interface CompiledSource {
  readonly sql: string
  readonly label?: string
  readonly columns: readonly ColumnInfo[]
}

export interface MetricInfo {
  readonly id: string
  readonly name: string
  readonly source: SourceRef
  readonly aggregation: Aggregation
  readonly filters: readonly Filter[]
}

export interface CompileContext {
  table(id: string): TableInfo | undefined
  question(id: string): CompiledSource | undefined
  metric(id: string): MetricInfo | undefined
  /** `YYYY-MM-DD`, the day relative dates are read from. */
  readonly today: string
  readonly weekStart?: 0 | 1
  /** Custom SQL expressions and hand-written conditions are allowed (query level `sql`). */
  readonly allowSql: boolean
}

export interface Compiled {
  readonly sql: string
  readonly columns: ResultColumn[]
}

interface Relation {
  readonly from: string
  readonly label: string
  readonly table?: string
  readonly columns: readonly ColumnInfo[]
}

interface Resolved {
  readonly expr: string
  readonly info: ColumnInfo
  readonly kind: ColumnKind
  readonly table?: string
  readonly join?: string
}

const BASE = 's'

const UNIT_LABELS: Record<TemporalUnit, string> = {
  minute: 'minute',
  hour: 'heure',
  day: 'jour',
  week: 'semaine',
  month: 'mois',
  quarter: 'trimestre',
  year: 'année',
  hour_of_day: 'heure de la journée',
  day_of_week: 'jour de la semaine',
  day_of_month: 'jour du mois',
  week_of_year: "semaine de l'année",
  month_of_year: "mois de l'année",
  quarter_of_year: "trimestre de l'année",
}

const AGG_LABELS: Record<string, (col: string) => string> = {
  count: () => 'Nombre de lignes',
  distinct: (c) => `Valeurs distinctes de ${c}`,
  sum: (c) => `Somme de ${c}`,
  avg: (c) => `Moyenne de ${c}`,
  median: (c) => `Médiane de ${c}`,
  min: (c) => `Minimum de ${c}`,
  max: (c) => `Maximum de ${c}`,
  stddev: (c) => `Écart type de ${c}`,
  cum_count: () => 'Nombre cumulé de lignes',
  cum_sum: (c) => `Somme cumulée de ${c}`,
}

/** A readable label from a physical name: `montant_total` → `Montant total`. */
export function humanize(name: string): string {
  const spaced = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function relationOf(ref: SourceRef, ctx: CompileContext): Relation {
  if (ref.kind === 'table') {
    const t = ctx.table(ref.id)
    if (t === undefined) throw new CompileError('Table introuvable ou inaccessible.')
    return {
      from: qualified(t.catalog, t.schema, t.name),
      label: t.label ?? humanize(t.name),
      table: t.id,
      columns: t.columns,
    }
  }
  const q = ctx.question(ref.id)
  if (q === undefined) throw new CompileError('Question source introuvable ou inaccessible.')
  return { from: `(\n${q.sql}\n)`, label: q.label ?? 'Question', columns: q.columns }
}

function niceBinWidth(min: number, max: number): number {
  const span = max - min
  if (!(span > 0)) return 1
  const raw = span / 10
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= raw) ?? 10
  return step * magnitude
}

function likePattern(value: string, mode: 'contains' | 'starts' | 'ends'): string {
  const escaped = value.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)
  const pattern = mode === 'contains' ? `%${escaped}%` : mode === 'starts' ? `${escaped}%` : `%${escaped}`
  return `${str(pattern)} ESCAPE '\\'`
}

class Compilation {
  private readonly joins = new Map<string, Relation>()
  readonly base: Relation

  constructor(
    readonly query: BuilderQuery,
    readonly ctx: CompileContext,
  ) {
    let base = relationOf(query.source, ctx)
    if ((query.expressions ?? []).length > 0) {
      if (!ctx.allowSql) throw new CompileError('Les colonnes personnalisées demandent le droit SQL.')
      const extra = (query.expressions ?? []).map((e) => `(${e.expression}) AS ${ident(e.name)}`)
      base = {
        ...base,
        from: `(SELECT ${ident(BASE)}.*, ${extra.join(', ')} FROM ${base.from} AS ${ident(BASE)})`,
        columns: [
          ...base.columns,
          ...(query.expressions ?? []).map((e) => ({ name: e.name, type: 'unknown', label: e.name })),
        ],
      }
    }
    this.base = base
    for (const join of query.joins ?? []) {
      if (join.alias === BASE || this.joins.has(join.alias)) {
        throw new CompileError(`Alias de jointure en double : ${join.alias}`)
      }
      this.joins.set(join.alias, relationOf(join.source, ctx))
    }
  }

  resolve(ref: ColumnRef): Resolved {
    const rel = ref.join ? this.joins.get(ref.join) : this.base
    if (rel === undefined) throw new CompileError(`Jointure inconnue : ${ref.join}`)
    const info = rel.columns.find((c) => c.name === ref.field)
    if (info === undefined) {
      throw new CompileError(`Colonne inconnue ou inaccessible : ${columnName(ref)}`)
    }
    // Expressions added on the base have no Trino type until run: take them as numbers
    // only when used as such; text is the safest reading for filters.
    const kind = info.type === 'unknown' ? 'text' : kindOfTrinoType(info.type)
    return {
      expr: `${ident(ref.join ?? BASE)}.${ident(ref.field)}`,
      info,
      kind,
      ...(rel.table ? { table: rel.table } : {}),
      ...(ref.join ? { join: ref.join } : {}),
    }
  }

  columnLabel(r: Resolved): string {
    const own = r.info.label ?? humanize(r.info.name)
    if (!r.join) return own
    const rel = this.joins.get(r.join)
    return `${rel?.label ?? r.join} → ${own}`
  }

  fromClause(): string {
    const parts = [`${this.base.from} AS ${ident(BASE)}`]
    for (const join of this.query.joins ?? []) {
      const rel = this.joins.get(join.alias) as Relation
      const left = this.resolve(join.left)
      if (!rel.columns.some((c) => c.name === join.right)) {
        throw new CompileError(`Colonne de jointure inconnue : ${join.alias}.${join.right}`)
      }
      const kind = { left: 'LEFT', inner: 'INNER', right: 'RIGHT', full: 'FULL' }[join.kind]
      parts.push(
        `${kind} JOIN ${rel.from} AS ${ident(join.alias)} ON ${left.expr} = ${ident(join.alias)}.${ident(join.right)}`,
      )
    }
    return parts.join('\n')
  }

  /** A day span as a condition on a date or timestamp expression. */
  span(r: Resolved, start: string | null, end: string | null): string {
    const out: string[] = []
    if (r.kind === 'date') {
      if (start) out.push(`${r.expr} >= ${dateLiteral(start)}`)
      if (end) out.push(`${r.expr} <= ${dateLiteral(end)}`)
    } else {
      if (start) out.push(`${r.expr} >= ${timestampLiteral(start)}`)
      if (end) out.push(`${r.expr} < ${timestampLiteral(addDays(end, 1))}`)
    }
    return out.length === 0 ? 'TRUE' : out.join(' AND ')
  }

  condition(filter: Filter, onRelation?: (ref: ColumnRef) => Resolved): string {
    if ('sql' in filter) {
      if (!this.ctx.allowSql) throw new CompileError('Les conditions SQL demandent le droit SQL.')
      return `(${filter.sql})`
    }
    const r = (onRelation ?? ((ref) => this.resolve(ref)))(filter.column)
    const values = filter.values
    const lit = (v: unknown) => literalFor(r.kind, v)
    const first = values[0]
    const textual = r.kind === 'text'
    switch (filter.op) {
      case 'is':
      case 'eq':
        if (values.length === 0) return 'TRUE'
        return values.length === 1 ? `${r.expr} = ${lit(first)}` : `${r.expr} IN (${values.map(lit).join(', ')})`
      case 'is_not':
      case 'ne':
        if (values.length === 0) return 'TRUE'
        return values.length === 1
          ? `(${r.expr} <> ${lit(first)} OR ${r.expr} IS NULL)`
          : `(${r.expr} NOT IN (${values.map(lit).join(', ')}) OR ${r.expr} IS NULL)`
      case 'contains':
      case 'not_contains':
      case 'starts_with':
      case 'ends_with': {
        if (first === undefined || String(first) === '') return 'TRUE'
        const mode = filter.op === 'starts_with' ? 'starts' : filter.op === 'ends_with' ? 'ends' : 'contains'
        const test = `lower(CAST(${r.expr} AS varchar)) LIKE ${likePattern(String(first), mode)}`
        return filter.op === 'not_contains' ? `(NOT (${test}) OR ${r.expr} IS NULL)` : test
      }
      case 'gt':
        return `${r.expr} > ${lit(first)}`
      case 'gte':
        return `${r.expr} >= ${lit(first)}`
      case 'lt':
        return `${r.expr} < ${lit(first)}`
      case 'lte':
        return `${r.expr} <= ${lit(first)}`
      case 'between': {
        const [lo, hi] = values
        if (r.kind === 'date' || r.kind === 'datetime') {
          return this.span(r, lo ? String(lo).slice(0, 10) : null, hi ? String(hi).slice(0, 10) : null)
        }
        const out: string[] = []
        if (lo !== undefined && lo !== null && lo !== '') out.push(`${r.expr} >= ${lit(lo)}`)
        if (hi !== undefined && hi !== null && hi !== '') out.push(`${r.expr} <= ${lit(hi)}`)
        return out.length === 0 ? 'TRUE' : out.join(' AND ')
      }
      case 'date': {
        const span = resolveDateExpression(String(first ?? ''), this.ctx.today, this.ctx.weekStart ?? 1)
        if (span === null) throw new CompileError(`Expression de date illisible : ${String(first)}`)
        return this.span(r, span.start, span.end)
      }
      case 'before': {
        const day = String(first ?? '').slice(0, 10)
        return r.kind === 'date' ? `${r.expr} < ${dateLiteral(day)}` : `${r.expr} < ${timestampLiteral(day)}`
      }
      case 'after': {
        const day = String(first ?? '').slice(0, 10)
        return r.kind === 'date'
          ? `${r.expr} > ${dateLiteral(day)}`
          : `${r.expr} >= ${timestampLiteral(addDays(day, 1))}`
      }
      case 'true':
        return `${r.expr} = TRUE`
      case 'false':
        return `${r.expr} = FALSE`
      case 'has_any':
        return `arrays_overlap(${r.expr}, ARRAY[${values.map((v) => str(String(v))).join(', ')}])`
      case 'has_all':
        return `cardinality(array_except(ARRAY[${values.map((v) => str(String(v))).join(', ')}], ${r.expr})) = 0`
      case 'has_none':
        return `NOT arrays_overlap(${r.expr}, ARRAY[${values.map((v) => str(String(v))).join(', ')}])`
      case 'empty':
        return textual ? `(${r.expr} IS NULL OR ${r.expr} = '')` : `${r.expr} IS NULL`
      case 'not_empty':
        return textual ? `(${r.expr} IS NOT NULL AND ${r.expr} <> '')` : `${r.expr} IS NOT NULL`
    }
  }

  breakoutExpr(r: Resolved, unit: TemporalUnit | undefined, bin: number | 'auto' | undefined): { expr: string; kind: ColumnKind; bin?: number } {
    if (unit !== undefined && (r.kind === 'date' || r.kind === 'datetime')) {
      switch (unit) {
        case 'hour_of_day':
          return { expr: `hour(${r.expr})`, kind: 'number' }
        case 'day_of_week':
          return { expr: `day_of_week(${r.expr})`, kind: 'number' }
        case 'day_of_month':
          return { expr: `day(${r.expr})`, kind: 'number' }
        case 'week_of_year':
          return { expr: `week(${r.expr})`, kind: 'number' }
        case 'month_of_year':
          return { expr: `month(${r.expr})`, kind: 'number' }
        case 'quarter_of_year':
          return { expr: `quarter(${r.expr})`, kind: 'number' }
        default:
          if (r.kind === 'date' && (unit === 'minute' || unit === 'hour')) return { expr: r.expr, kind: 'date' }
          // A timestamp with time zone is cut in its own zone, then read as a local timestamp so the
          // result never carries a zone suffix the interface would have to strip.
          return r.kind === 'date'
            ? { expr: `date_trunc(${str(unit)}, ${r.expr})`, kind: 'date' }
            : unit === 'minute' || unit === 'hour'
              ? { expr: `CAST(date_trunc(${str(unit)}, ${r.expr}) AS timestamp(0))`, kind: 'datetime' }
              : { expr: `CAST(date_trunc(${str(unit)}, ${r.expr}) AS date)`, kind: 'date' }
      }
    }
    if (bin !== undefined && r.kind === 'number') {
      let width = typeof bin === 'number' ? bin : 0
      if (bin === 'auto') {
        const min = Number(r.info.fingerprint?.min)
        const max = Number(r.info.fingerprint?.max)
        width = Number.isFinite(min) && Number.isFinite(max) ? niceBinWidth(min, max) : 10
      }
      const w = numberLiteral(width)
      return { expr: `floor(${r.expr} / ${w}) * ${w}`, kind: 'number', bin: width }
    }
    return { expr: r.expr, kind: r.kind }
  }

  aggregationExpr(agg: Aggregation, order: string): { expr: string; resolved?: Resolved; label: string } {
    if (agg.fn === 'metric') {
      const metric = agg.metric ? this.ctx.metric(agg.metric) : undefined
      if (metric === undefined) throw new CompileError('Métrique introuvable ou inaccessible.')
      const same =
        metric.source.kind === this.query.source.kind && metric.source.id === this.query.source.id
      if (!same) {
        throw new CompileError(`La métrique « ${metric.name} » porte sur une autre source que la question.`)
      }
      const cond = metric.filters.map((f) => this.condition(f)).join(' AND ')
      const inner = this.aggregationExpr(metric.aggregation, order)
      if (cond === '') return { expr: inner.expr, ...(inner.resolved ? { resolved: inner.resolved } : {}), label: metric.name }
      const col = metric.aggregation.column ? this.resolve(metric.aggregation.column).expr : '1'
      const guarded = `CASE WHEN ${cond} THEN ${col} END`
      const expr = (() => {
        switch (metric.aggregation.fn) {
          case 'count':
            return `count_if(${cond})`
          case 'distinct':
            return `count(DISTINCT ${guarded})`
          case 'sum':
            return `sum(${guarded})`
          case 'avg':
            return `avg(${guarded})`
          case 'median':
            return `approx_percentile(${guarded}, 0.5)`
          case 'min':
            return `min(${guarded})`
          case 'max':
            return `max(${guarded})`
          case 'stddev':
            return `stddev(${guarded})`
          default:
            throw new CompileError('Une métrique ne peut pas être cumulée ni imbriquée.')
        }
      })()
      return { expr, ...(inner.resolved ? { resolved: inner.resolved } : {}), label: metric.name }
    }
    if (agg.fn === 'count') return { expr: 'count(*)', label: AGG_LABELS.count?.('') ?? 'Nombre' }
    if (agg.fn === 'cum_count') {
      return { expr: `sum(count(*)) OVER (${order} ROWS UNBOUNDED PRECEDING)`, label: AGG_LABELS.cum_count?.('') ?? '' }
    }
    if (agg.column === undefined) throw new CompileError(`L'agrégation ${agg.fn} demande une colonne.`)
    const r = this.resolve(agg.column)
    const label = (AGG_LABELS[agg.fn] ?? ((c: string) => c))(this.columnLabel(r))
    switch (agg.fn) {
      case 'distinct':
        return { expr: `count(DISTINCT ${r.expr})`, resolved: r, label }
      case 'sum':
        return { expr: `sum(${r.expr})`, resolved: r, label }
      case 'avg':
        return { expr: `avg(${r.expr})`, resolved: r, label }
      case 'median':
        return { expr: `approx_percentile(${r.expr}, 0.5)`, resolved: r, label }
      case 'min':
        return { expr: `min(${r.expr})`, resolved: r, label }
      case 'max':
        return { expr: `max(${r.expr})`, resolved: r, label }
      case 'stddev':
        return { expr: `stddev(${r.expr})`, resolved: r, label }
      case 'cum_sum':
        return { expr: `sum(sum(${r.expr})) OVER (${order} ROWS UNBOUNDED PRECEDING)`, resolved: r, label }
      default:
        throw new CompileError(`Agrégation inconnue : ${agg.fn}`)
    }
  }

  compile(): Compiled {
    const q = this.query
    const names = resultNames(q)
    const aggregations = q.aggregations ?? []
    const breakouts = q.breakouts ?? []
    const grouped = aggregations.length > 0 || breakouts.length > 0
    const columns: ResultColumn[] = []
    const select: string[] = []
    const breakoutExprs: string[] = []

    breakouts.forEach((b, i) => {
      const r = this.resolve(b)
      const out = this.breakoutExpr(r, b.unit, b.bin)
      const name = names.breakouts[i] as string
      breakoutExprs.push(out.expr)
      select.push(`${out.expr} AS ${ident(name)}`)
      const unitLabel = b.unit && (r.kind === 'date' || r.kind === 'datetime') ? ` : ${UNIT_LABELS[b.unit]}` : ''
      columns.push({
        name,
        label: `${this.columnLabel(r)}${unitLabel}`,
        role: 'dimension',
        type: out.kind,
        ...(b.unit && (r.kind === 'date' || r.kind === 'datetime') ? { unit: b.unit } : {}),
        ...(out.bin !== undefined ? { bin: out.bin } : {}),
        ...(r.table ? { source: { table: r.table, field: r.info.name, ...(r.info.id ? { column: r.info.id } : {}), ...(r.join ? { join: r.join } : {}) } } : {}),
        ...(r.info.semantic ? { semantic: r.info.semantic } : {}),
        ...(r.info.format ? { format: r.info.format } : {}),
      })
    })

    const order = breakoutExprs.length > 0 ? `ORDER BY ${breakoutExprs.join(', ')}` : ''
    aggregations.forEach((a, i) => {
      const out = this.aggregationExpr(a, order)
      const name = names.aggregations[i] as string
      select.push(`${out.expr} AS ${ident(name)}`)
      const keepsType = ['min', 'max'].includes(a.fn) && out.resolved && out.resolved.kind !== 'number'
      const keepsMeaning = ['sum', 'avg', 'median', 'min', 'max', 'cum_sum', 'metric'].includes(a.fn)
      columns.push({
        name,
        label: a.label ?? out.label,
        role: 'metric',
        type: keepsType && out.resolved ? out.resolved.kind : 'number',
        ...(keepsMeaning && out.resolved?.info.semantic ? { semantic: out.resolved.info.semantic } : {}),
        ...(keepsMeaning && out.resolved?.info.format ? { format: out.resolved.info.format } : {}),
      })
    })

    if (!grouped) {
      // By default, the source's columns, then those of each join the person added.
      const fields: ColumnRef[] =
        q.fields && q.fields.length > 0
          ? [...q.fields]
          : [
              ...this.base.columns.map((c) => ({ field: c.name })),
              ...(q.joins ?? [])
                .filter((j) => j.explicit)
                .flatMap((j) => (this.joins.get(j.alias)?.columns ?? []).map((c) => ({ join: j.alias, field: c.name }))),
            ]
      for (const f of fields) {
        const r = this.resolve(f)
        const name = columnName(f)
        select.push(`${r.expr} AS ${ident(name)}`)
        columns.push({
          name,
          label: this.columnLabel(r),
          role: 'field',
          type: r.kind,
          ...(r.table ? { source: { table: r.table, field: r.info.name, ...(r.info.id ? { column: r.info.id } : {}), ...(r.join ? { join: r.join } : {}) } } : {}),
          ...(r.info.semantic ? { semantic: r.info.semantic } : {}),
          ...(r.info.format ? { format: r.info.format } : {}),
        })
      }
    }

    const where = (q.filters ?? []).map((f) => this.condition(f)).filter((c) => c !== 'TRUE')
    const lines = [`SELECT ${select.join(',\n  ')}`, `FROM ${this.fromClause()}`]
    if (where.length > 0) lines.push(`WHERE ${where.join('\n  AND ')}`)
    if (breakouts.length > 0) lines.push(`GROUP BY ${breakouts.map((_, i) => i + 1).join(', ')}`)

    const sort = this.orderBy(q.sort ?? [], names, grouped)
    if (sort.length > 0) lines.push(`ORDER BY ${sort.join(', ')}`)
    else if (breakouts.length > 0) lines.push(`ORDER BY ${breakouts.map((_, i) => i + 1).join(', ')}`)
    if (q.limit !== undefined && q.limit !== null) lines.push(`LIMIT ${numberLiteral(Math.floor(q.limit))}`)
    return { sql: lines.join('\n'), columns }
  }

  orderBy(sort: readonly OrderBy[], names: ReturnType<typeof resultNames>, grouped: boolean): string[] {
    return sort.map((o) => {
      const dir = o.desc ? ' DESC' : ''
      if (o.target.kind === 'aggregation') {
        const name = names.aggregations[o.target.index]
        if (name === undefined) throw new CompileError('Tri sur une agrégation absente.')
        return `${ident(name)}${dir}`
      }
      if (o.target.kind === 'breakout') {
        const name = names.breakouts[o.target.index]
        if (name === undefined) throw new CompileError('Tri sur un regroupement absent.')
        return `${ident(name)}${dir}`
      }
      if (grouped) {
        const i = (this.query.breakouts ?? []).findIndex(
          (b) => b.field === (o.target as { column: ColumnRef }).column.field && (b.join ?? '') === ((o.target as { column: ColumnRef }).column.join ?? ''),
        )
        if (i < 0) throw new CompileError('On ne peut trier que par une colonne regroupée.')
        return `${ident(names.breakouts[i] as string)}${dir}`
      }
      return `${this.resolve(o.target.column).expr}${dir}${o.desc ? ' NULLS LAST' : ''}`
    })
  }
}

export function compileBuilder(query: BuilderQuery, ctx: CompileContext): Compiled {
  return new Compilation(query, ctx).compile()
}

/**
 * The dashboard filters of a card, as filters of its builder query — and, for a period filter,
 * as the unit of its grouping.
 */
export function applyConstraints(query: BuilderQuery, constraints: readonly Constraint[]): BuilderQuery {
  let filters = [...(query.filters ?? [])]
  let breakouts = [...(query.breakouts ?? [])]
  for (const c of constraints) {
    if (!('column' in c.target)) continue
    const column = c.target.column
    const v = c.value
    switch (c.type) {
      case 'date':
        filters.push({ column, op: 'date', values: [String(v)] })
        break
      case 'category':
        filters.push({ column, op: 'is', values: (Array.isArray(v) ? v : [v]).map(String) })
        break
      case 'text':
        filters.push({ column, op: 'contains', values: [String(Array.isArray(v) ? v[0] : v)] })
        break
      case 'number': {
        const [lo, hi] = (Array.isArray(v) ? v : [v]) as (number | null)[]
        if (c.operator === 'between') filters.push({ column, op: 'between', values: [lo ?? '', hi ?? ''] })
        else if (c.operator === 'gte' && lo !== null && lo !== undefined) filters.push({ column, op: 'gte', values: [lo] })
        else if (c.operator === 'lte' && lo !== null && lo !== undefined) filters.push({ column, op: 'lte', values: [lo] })
        else if (lo !== null && lo !== undefined) filters.push({ column, op: 'eq', values: [lo] })
        break
      }
      case 'temporal_unit': {
        const unit = String(Array.isArray(v) ? v[0] : v) as TemporalUnit
        breakouts = breakouts.map((b) =>
          b.field === column.field && (b.join ?? '') === (column.join ?? '') && b.unit !== undefined ? { ...b, unit } : b,
        )
        break
      }
    }
  }
  filters = filters.filter((f) => !('values' in f) || f.values.length > 0 || ['empty', 'not_empty', 'true', 'false'].includes(f.op))
  return { ...query, filters, breakouts }
}
