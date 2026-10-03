/**
 * Règles de ligne → expression SQL rendue à Trino par l'endpoint `row-filters` d'OPA.
 * L'expression est évaluée dans le contexte de la table : les colonnes sont citées sans alias.
 */
import { type RowCondition, type RowPolicy, kindOfTrinoType, substituteAttributes } from '@eodia/contracts'
import { CompileError, ident, literalFor } from './sql'

/** One rule as a condition; FALSE when it cites an attribute the reader lacks. */
export function rowPolicySql(
  policy: Pick<RowPolicy, 'match' | 'conditions'>,
  columnType: (name: string) => string | undefined,
  attributes: Readonly<Record<string, string>>,
): string {
  const parts = policy.conditions.map((c) => conditionSql(c, columnType, attributes))
  if (parts.length === 0) return 'TRUE'
  return `(${parts.join(policy.match === 'any' ? ' OR ' : ' AND ')})`
}

function conditionSql(
  c: RowCondition,
  columnType: (name: string) => string | undefined,
  attributes: Readonly<Record<string, string>>,
): string {
  const type = columnType(c.column)
  if (type === undefined) throw new CompileError(`Règle de ligne : colonne inconnue ${c.column}`)
  const kind = kindOfTrinoType(type)
  const col = ident(c.column)
  if (c.op === 'empty') return `${col} IS NULL`
  if (c.op === 'not_empty') return `${col} IS NOT NULL`
  const values: string[] = []
  for (const raw of c.values) {
    const v = substituteAttributes(raw, attributes)
    // A missing attribute closes: never a row by default.
    if (v === null) return 'FALSE'
    // An attribute may hold several values, separated by commas: `region = Bretagne,Normandie`.
    const pieces = typeof raw === 'string' && raw.includes('{{') && typeof v === 'string' ? v.split(',').map((x) => x.trim()) : [v]
    for (const p of pieces) values.push(literalFor(kind, p))
  }
  if (values.length === 0) return 'FALSE'
  switch (c.op) {
    case 'eq':
    case 'in':
      return values.length === 1 ? `${col} = ${values[0]}` : `${col} IN (${values.join(', ')})`
    case 'ne':
    case 'not_in':
      return values.length === 1 ? `${col} <> ${values[0]}` : `${col} NOT IN (${values.join(', ')})`
    case 'gt':
      return `${col} > ${values[0]}`
    case 'gte':
      return `${col} >= ${values[0]}`
    case 'lt':
      return `${col} < ${values[0]}`
    case 'lte':
      return `${col} <= ${values[0]}`
    case 'contains':
      return `strpos(lower(CAST(${col} AS varchar)), lower(${values[0]})) > 0`
  }
}

/** The rules of several groups: a person sees the rows any one of them lets through. */
export function unionOfPolicies(expressions: readonly string[]): string {
  if (expressions.length === 0) return 'TRUE'
  if (expressions.length === 1) return expressions[0] as string
  return `(${expressions.join(' OR ')})`
}
