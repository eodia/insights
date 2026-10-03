/**
 * Questions SQL : variables `{{nom}}`, sections optionnelles `[[ … ]]`, snippets `{{snippet: nom}}`.
 *
 * Une variable devient toujours un littéral échappé (ou, pour une variable `filter`, une
 * condition entière) : la valeur saisie ne peut jamais changer la forme de la requête.
 */
import {
  type Constraint,
  type ParameterValue,
  type SqlVariable,
  addDays,
  parameterHasValue,
  resolveDateExpression,
} from '@eodia/contracts'
import { CompileError, dateLiteral, ident, numberLiteral, str, timestampLiteral } from './sql'

const VARIABLE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g
const OPTIONAL = /\[\[([\s\S]*?)\]\]/g
const SNIPPET = /\{\{\s*snippet:\s*([^}]+?)\s*\}\}/g

/** Replaces `{{snippet: nom}}` by the snippet's text (one level: a snippet cites no snippet). */
export function expandSnippets(sql: string, snippet: (name: string) => string | undefined): string {
  return sql.replace(SNIPPET, (_, name: string) => {
    const text = snippet(name.trim())
    if (text === undefined) throw new CompileError(`Snippet introuvable : ${name.trim()}`)
    return text.replace(SNIPPET, '')
  })
}

export const snippetNames = (sql: string): string[] => [...sql.matchAll(SNIPPET)].map((m) => (m[1] as string).trim())

export interface RenderOptions {
  readonly today: string
  readonly weekStart?: 0 | 1
}

function first(value: ParameterValue): string {
  return Array.isArray(value) ? String(value[0] ?? '') : String(value)
}

function literal(variable: SqlVariable, value: ParameterValue, opts: RenderOptions): string {
  switch (variable.type) {
    case 'number':
      return numberLiteral(first(value))
    case 'date': {
      const span = resolveDateExpression(first(value), opts.today, opts.weekStart ?? 1)
      if (span?.start == null) throw new CompileError(`Date illisible pour {{${variable.name}}}`)
      return dateLiteral(span.start)
    }
    default:
      if (Array.isArray(value)) {
        if (value.length === 0) throw new CompileError(`Aucune valeur pour {{${variable.name}}}`)
        return value.map((v) => str(String(v))).join(', ')
      }
      return str(String(value))
  }
}

/** `{{nom}}` of a `filter` variable: a whole condition on its column, TRUE without value. */
function filterCondition(variable: SqlVariable, value: ParameterValue | null, opts: RenderOptions, constraint?: Constraint): string {
  if (!variable.column) throw new CompileError(`La variable {{${variable.name}}} n'a pas de colonne.`)
  if (!/^[A-Za-z0-9_."\s]+$/.test(variable.column)) {
    throw new CompileError(`Colonne invalide pour {{${variable.name}}} : ${variable.column}`)
  }
  if (value === null || !parameterHasValue(value)) return 'TRUE'
  const col = variable.column
  const kind = variable.column_kind ?? 'text'
  if (kind === 'date' || kind === 'datetime') {
    const span = resolveDateExpression(first(value), opts.today, opts.weekStart ?? 1)
    if (span === null) throw new CompileError(`Date illisible pour {{${variable.name}}}`)
    const out: string[] = []
    if (kind === 'date') {
      if (span.start) out.push(`${col} >= ${dateLiteral(span.start)}`)
      if (span.end) out.push(`${col} <= ${dateLiteral(span.end)}`)
    } else {
      if (span.start) out.push(`${col} >= ${timestampLiteral(span.start)}`)
      if (span.end) out.push(`${col} < ${timestampLiteral(addDays(span.end, 1))}`)
    }
    return out.length === 0 ? 'TRUE' : `(${out.join(' AND ')})`
  }
  if (kind === 'number') {
    const values = (Array.isArray(value) ? value : [value]) as (number | string | null)[]
    const op = constraint?.operator ?? 'eq'
    const [lo, hi] = values
    if (op === 'between') {
      const out: string[] = []
      if (lo !== null && lo !== undefined && lo !== '') out.push(`${col} >= ${numberLiteral(lo)}`)
      if (hi !== null && hi !== undefined && hi !== '') out.push(`${col} <= ${numberLiteral(hi)}`)
      return out.length === 0 ? 'TRUE' : `(${out.join(' AND ')})`
    }
    if (lo === null || lo === undefined || lo === '') return 'TRUE'
    const sign = op === 'gte' ? '>=' : op === 'lte' ? '<=' : '='
    return `${col} ${sign} ${numberLiteral(lo)}`
  }
  if (constraint?.type === 'text') {
    const pattern = `%${first(value).toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    return `lower(CAST(${col} AS varchar)) LIKE ${str(pattern)} ESCAPE '\\'`
  }
  const values = (Array.isArray(value) ? value : [value]).map((v) => str(String(v)))
  return `${col} IN (${values.join(', ')})`
}

/**
 * The SQL actually run: optional sections whose variables have no value are dropped, the
 * others lose their brackets; each variable becomes a literal.
 */
export function renderSql(
  sql: string,
  variables: readonly SqlVariable[],
  values: Readonly<Record<string, ParameterValue | null | undefined>>,
  opts: RenderOptions,
  constraints: readonly Constraint[] = [],
): string {
  const byName = new Map(variables.map((v) => [v.name, v]))
  const fromConstraint = new Map<string, Constraint>()
  for (const c of constraints) if ('variable' in c.target) fromConstraint.set(c.target.variable, c)

  const valueOf = (name: string): ParameterValue | null => {
    const c = fromConstraint.get(name)
    if (c && parameterHasValue(c.value)) return c.value
    const v = values[name]
    if (v !== undefined && v !== null && parameterHasValue(v)) return v
    const def = byName.get(name)?.default
    return def !== undefined && def !== null && parameterHasValue(def) ? def : null
  }

  // Optional sections first: kept only when every variable they cite has a value.
  const withSections = sql.replace(OPTIONAL, (_, inner: string) => {
    const names = [...inner.matchAll(VARIABLE)].map((m) => m[1] as string)
    const complete = names.every((n) => byName.get(n)?.type === 'filter' || valueOf(n) !== null)
    return complete ? inner : ''
  })

  return withSections.replace(VARIABLE, (whole, name: string) => {
    const variable = byName.get(name) ?? { name, label: name, type: 'text' as const }
    const value = valueOf(name)
    if (variable.type === 'filter') return filterCondition(variable, value, opts, fromConstraint.get(name))
    if (value === null) {
      throw new CompileError(`La variable {{${name}}} demande une valeur.`)
    }
    return literal(variable, value, opts)
  })
}

/** Native SQL, through the source's `system.query` table function. */
export function nativeSql(catalog: string, sql: string): string {
  const inner = sql.trim().replace(/;+\s*$/, '')
  return `SELECT * FROM TABLE(${ident(catalog)}.system.query(query => ${str(inner)}))`
}

/** Trino refuses a trailing `;`, and a lone comment is no statement. */
export function cleanStatement(sql: string): string {
  return sql.trim().replace(/;+\s*$/, '').trim()
}

/** Whether a statement only reads: the engine is read-only for people anyway (OPA), this is a courtesy. */
export function isReadStatement(sql: string): boolean {
  const stripped = sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim()
    .toLowerCase()
  return /^(select|with|show|describe|explain|values|table)\b/.test(stripped)
}
