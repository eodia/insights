/**
 * Le builder côté interface : quelles colonnes une question peut citer (celles de sa source et,
 * à travers chaque clé étrangère, celles de la table pointée — la jointure s'ajoute seule), et
 * comment dire une étape en français.
 */
import type {
  Aggregation,
  BuilderQuery,
  ColumnKind,
  ColumnMeta,
  ColumnRef,
  Filter,
  Join,
  TableMeta,
  TemporalUnit,
} from '@eodia/contracts'
import { SEMANTIC_LABELS, columnName, kindOfTrinoType } from '@eodia/contracts'
import { $t, msg } from './i18n'

export interface ColumnOption {
  readonly ref: ColumnRef
  readonly label: string
  /** The table (or the key it is reached through) the column belongs to. */
  readonly group: string
  readonly kind: ColumnKind
  readonly type: string
  readonly columnId?: string
  readonly semantic?: string | null
  readonly hasValues?: boolean
  /** The join that makes the column reachable, added when it is picked. */
  readonly join?: Join
}

const aliasOf = (fkColumn: string, table: TableMeta) => (fkColumn.replace(/_id$|Id$|_fk$/, '') || table.name).toLowerCase()

/** Columns a question built on `source` can use. */
export function columnOptions(
  source: TableMeta | null,
  tables: ReadonlyMap<string, TableMeta>,
  query: BuilderQuery | null,
  sourceColumns?: readonly { name: string; type: string; label: string }[],
): ColumnOption[] {
  const out: ColumnOption[] = []
  const own = (c: ColumnMeta, group: string, join?: Join): ColumnOption => ({
    ref: join ? { join: join.alias, field: c.name } : { field: c.name },
    label: c.label,
    group,
    kind: kindOfTrinoType(c.type),
    type: c.type,
    columnId: c.id,
    semantic: c.semantic,
    hasValues: c.has_values,
    ...(join ? { join } : {}),
  })
  if (source) {
    for (const c of source.columns ?? []) if (c.visibility !== 'hidden' && c.status === 'active') out.push(own(c, source.label))
    // Through each key, the table it points to: an implicit join.
    for (const c of source.columns ?? []) {
      if (!c.fk) continue
      const target = tables.get(c.fk.table)
      if (!target) continue
      const join: Join = { alias: aliasOf(c.name, target), source: { kind: 'table', id: target.id }, kind: 'left', left: { field: c.name }, right: c.fk.name }
      for (const tc of target.columns ?? []) {
        if (tc.visibility === 'hidden' || tc.status !== 'active') continue
        out.push(own(tc, `${target.label} (${c.label})`, join))
      }
    }
  } else if (sourceColumns) {
    for (const c of sourceColumns) out.push({ ref: { field: c.name }, label: c.label, group: $t('Modèle'), kind: kindOfTrinoType(c.type), type: c.type })
  }
  // Explicit joins already in the query whose table is not reached through a key.
  for (const j of query?.joins ?? []) {
    if (out.some((o) => o.join?.alias === j.alias)) continue
    const t = j.source.kind === 'table' ? tables.get(j.source.id) : undefined
    for (const c of t?.columns ?? []) out.push(own(c, `${t?.label} (${j.alias})`, j))
  }
  for (const e of query?.expressions ?? []) out.push({ ref: { field: e.name }, label: e.name, group: $t('Colonnes personnalisées'), kind: 'number', type: 'double' })
  return out
}

export const sameRef = (a: ColumnRef, b: ColumnRef) => a.field === b.field && (a.join ?? '') === (b.join ?? '')

export function findOption(options: readonly ColumnOption[], ref: ColumnRef): ColumnOption | undefined {
  return options.find((o) => sameRef(o.ref, ref))
}

/** The query with the join a picked column needs. */
export function withJoinFor(query: BuilderQuery, option: ColumnOption | undefined): BuilderQuery {
  if (!option?.join) return query
  if ((query.joins ?? []).some((j) => j.alias === option.join?.alias)) return query
  return { ...query, joins: [...(query.joins ?? []), option.join] }
}

/** Joins no step cites any more go away. */
export function pruneJoins(query: BuilderQuery): BuilderQuery {
  const used = new Set<string>()
  const cite = (r?: ColumnRef) => r?.join && used.add(r.join)
  for (const f of query.filters ?? []) if ('column' in f) cite(f.column)
  for (const a of query.aggregations ?? []) cite(a.column)
  for (const b of query.breakouts ?? []) cite(b)
  for (const f of query.fields ?? []) cite(f)
  for (const s of query.sort ?? []) if (s.target.kind === 'column') cite(s.target.column)
  // A join the person added stays, with the joins its condition goes through.
  for (const j of query.joins ?? []) {
    if (!j.explicit) continue
    used.add(j.alias)
    cite(j.left)
  }
  const joins = (query.joins ?? []).filter((j) => used.has(j.alias))
  return { ...query, joins }
}

export const AGG_FNS: { fn: Aggregation['fn']; label: string; needsColumn: boolean; numeric?: boolean }[] = [
  { fn: 'count', label: msg('Nombre de lignes'), needsColumn: false },
  { fn: 'distinct', label: msg('Valeurs distinctes'), needsColumn: true },
  { fn: 'sum', label: msg('Somme'), needsColumn: true, numeric: true },
  { fn: 'avg', label: msg('Moyenne'), needsColumn: true, numeric: true },
  { fn: 'median', label: msg('Médiane'), needsColumn: true, numeric: true },
  { fn: 'min', label: msg('Minimum'), needsColumn: true },
  { fn: 'max', label: msg('Maximum'), needsColumn: true },
  { fn: 'stddev', label: msg('Écart type'), needsColumn: true, numeric: true },
  { fn: 'cum_count', label: msg('Nombre cumulé'), needsColumn: false },
  { fn: 'cum_sum', label: msg('Somme cumulée'), needsColumn: true, numeric: true },
]

export const UNIT_LABELS: Record<TemporalUnit, string> = {
  minute: msg('Minute'),
  hour: msg('Heure'),
  day: msg('Jour'),
  week: msg('Semaine'),
  month: msg('Mois'),
  quarter: msg('Trimestre'),
  year: msg('Année'),
  hour_of_day: msg('Heure de la journée'),
  day_of_week: msg('Jour de la semaine'),
  day_of_month: msg('Jour du mois'),
  week_of_year: msg("Semaine de l'année"),
  month_of_year: msg("Mois de l'année"),
  quarter_of_year: msg("Trimestre de l'année"),
}

export const DATE_PRESETS: { value: string; label: string }[] = [
  { value: 'today', label: msg("Aujourd'hui") },
  { value: 'yesterday', label: msg('Hier') },
  { value: 'past7days', label: msg('7 derniers jours') },
  { value: 'past30days', label: msg('30 derniers jours') },
  { value: 'thisweek', label: msg('Cette semaine') },
  { value: 'lastweek', label: msg('Semaine dernière') },
  { value: 'thismonth', label: msg('Ce mois-ci') },
  { value: 'lastmonth', label: msg('Mois dernier') },
  { value: 'past3months', label: msg('3 derniers mois') },
  { value: 'past12months', label: msg('12 derniers mois') },
  { value: 'thisquarter', label: msg('Ce trimestre') },
  { value: 'lastquarter', label: msg('Trimestre dernier') },
  { value: 'thisyear', label: msg('Cette année') },
  { value: 'lastyear', label: msg("L'année dernière") },
]

export const OP_LABELS: Record<string, string> = {
  is: msg('est'),
  is_not: msg("n'est pas"),
  contains: msg('contient'),
  not_contains: msg('ne contient pas'),
  starts_with: msg('commence par'),
  ends_with: msg('finit par'),
  eq: '=',
  ne: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  between: msg('entre'),
  date: msg('période'),
  before: msg('avant le'),
  after: msg('après le'),
  true: msg('est vrai'),
  false: msg('est faux'),
  empty: msg('est vide'),
  not_empty: msg("n'est pas vide"),
}

export const OPS_BY_KIND: Record<string, string[]> = {
  text: ['is', 'is_not', 'contains', 'not_contains', 'starts_with', 'ends_with', 'empty', 'not_empty'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'empty', 'not_empty'],
  date: ['date', 'between', 'before', 'after', 'empty', 'not_empty'],
  datetime: ['date', 'between', 'before', 'after', 'empty', 'not_empty'],
  boolean: ['true', 'false', 'empty'],
}

export function filterLabel(f: Filter, options: readonly ColumnOption[]): string {
  if ('sql' in f) return f.sql
  const col = findOption(options, f.column)?.label ?? columnName(f.column)
  const op = $t(OP_LABELS[f.op] ?? f.op)
  if (['empty', 'not_empty', 'true', 'false'].includes(f.op)) return $t('{column} {operator}', { column: col, operator: op })
  if (f.op === 'date') {
    const preset = DATE_PRESETS.find((p) => p.value === f.values[0])
    return $t('{column} : {period}', { column: col, period: preset ? $t(preset.label) : String(f.values[0] ?? '') })
  }
  if (f.op === 'between') return $t('{column} entre {from} et {to}', { column: col, from: String(f.values[0] ?? '…'), to: String(f.values[1] ?? '…') })
  const values = f.values.map(String)
  return $t('{column} {operator} {values}', {
    column: col,
    operator: op,
    values: values.length > 2 ? $t('{first} +{more}', { first: values.slice(0, 2).join(', '), more: values.length - 2 }) : values.join(', '),
  })
}

export function aggregationLabel(a: Aggregation, options: readonly ColumnOption[], metrics: ReadonlyMap<string, string>): string {
  if (a.fn === 'metric') return metrics.get(a.metric ?? '') ?? $t('Métrique')
  const def = AGG_FNS.find((x) => x.fn === a.fn)
  const base = $t(def?.label ?? a.fn)
  if (!a.column) return base
  return $t('{aggregation} de {column}', { aggregation: base, column: findOption(options, a.column)?.label ?? columnName(a.column) })
}

export const semanticLabel = (s?: string | null) => {
  const label = s ? (SEMANTIC_LABELS as Record<string, string>)[s] : undefined
  return label ? $t(label) : (s ?? '')
}

/** An alias for a new join on `table`, free in the query and among the implicit ones. */
export function joinAlias(query: BuilderQuery, table: TableMeta, options: readonly ColumnOption[]): string {
  const taken = new Set([...(query.joins ?? []).map((j) => j.alias), ...options.flatMap((o) => (o.join ? [o.join.alias] : []))])
  const base = table.name.toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'jointure'
  let alias = base
  for (let i = 2; taken.has(alias); i++) alias = `${base}_${i}`
  return alias
}

/**
 * The condition a join on `target` most likely takes: a key of the source that points to it,
 * or a key of it that points to the source; otherwise, a column of the same name.
 */
export function suggestedCondition(source: TableMeta | null, target: TableMeta): { left: ColumnRef; right: string } | null {
  if (!source) return null
  const own = source.columns ?? []
  const theirs = target.columns ?? []
  const forward = own.find((c) => c.fk?.table === target.id)
  if (forward?.fk) return { left: { field: forward.name }, right: forward.fk.name }
  const backward = theirs.find((c) => c.fk?.table === source.id)
  if (backward?.fk) return { left: { field: backward.fk.name }, right: backward.name }
  const same = theirs.find((c) => own.some((o) => o.name === c.name) && /(^id$|_id$|^code)/i.test(c.name))
  if (same) return { left: { field: same.name }, right: same.name }
  return null
}

export const JOIN_LABELS: Record<Join['kind'], string> = {
  left: msg('Jointure à gauche'),
  inner: msg('Jointure interne'),
  right: msg('Jointure à droite'),
  full: msg('Jointure complète'),
}
