/**
 * Permissions — additives : l'accès effectif d'une personne est l'union de ceux de ses groupes.
 * Elles sont appliquées par Trino lui-même, qui interroge l'endpoint OPA de l'API : SQL libre,
 * builder, copilot, API et MCP passent tous par là.
 */

export const DATA_ACCESS = ['none', 'read', 'restricted'] as const
/**
 * `read`: every row and column. `restricted`: readable, under the row and column rules of
 * the group — and never in native SQL.
 */
export type DataAccess = (typeof DATA_ACCESS)[number]

export const QUERY_LEVELS = ['none', 'builder', 'sql', 'native'] as const
/** What a group may write against a source: nothing, the builder, Trino SQL, native SQL. */
export type QueryLevel = (typeof QUERY_LEVELS)[number]

export const COLUMN_ACCESS = ['hidden', 'masked', 'read'] as const
export type ColumnAccess = (typeof COLUMN_ACCESS)[number]

export const FOLDER_ACCESS = ['none', 'view', 'edit', 'manage'] as const
export type FolderAccess = (typeof FOLDER_ACCESS)[number]

export const ADMIN_RIGHTS = ['manage_sources', 'manage_metadata', 'manage_permissions'] as const
export type AdminRight = (typeof ADMIN_RIGHTS)[number]

export const DATA_ACCESS_LABELS: Record<DataAccess, string> = {
  none: 'Aucun accès',
  read: 'Lecture',
  restricted: 'Restreint',
}

export const QUERY_LEVEL_LABELS: Record<QueryLevel, string> = {
  none: 'Aucune requête',
  builder: 'Éditeur visuel',
  sql: 'SQL',
  native: 'SQL natif',
}

export const COLUMN_ACCESS_LABELS: Record<ColumnAccess, string> = {
  hidden: 'Cachée',
  masked: 'Masquée',
  read: 'Lisible',
}

export const FOLDER_ACCESS_LABELS: Record<FolderAccess, string> = {
  none: 'Aucun',
  view: 'Lecture',
  edit: 'Modification',
  manage: 'Gestion',
}

/** A data permission of a group, on a whole source, one of its schemas, or one table. */
export interface DataPermission {
  readonly group: string
  readonly datasource: string
  readonly schema: string | null
  readonly table: string | null
  readonly access: DataAccess
}

export interface ColumnRule {
  readonly group: string
  readonly column: string
  readonly access: ColumnAccess
  /** For `masked`: a Trino expression over the column, `NULL` when absent. */
  readonly mask?: string | null
}

export const ROW_OPS = ['eq', 'ne', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'contains', 'empty', 'not_empty'] as const
export type RowOp = (typeof ROW_OPS)[number]

/**
 * One condition of a row rule. A value may cite an attribute of the reader:
 * `{{user.region}}`, `{{user.email}}`, `{{user.id}}`.
 */
export interface RowCondition {
  readonly column: string
  readonly op: RowOp
  readonly values: readonly (string | number)[]
}

export interface RowPolicy {
  readonly id: string
  readonly group: string
  readonly table: string
  readonly match: 'all' | 'any'
  readonly conditions: readonly RowCondition[]
  readonly description: string | null
}

export interface QueryPermission {
  readonly group: string
  readonly datasource: string
  readonly level: QueryLevel
}

/** The attributes a row rule may cite, besides those set on the person. */
export const BUILTIN_ATTRIBUTES = ['id', 'email', 'name'] as const

const ATTRIBUTE = /\{\{\s*user\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

/** The attributes a row rule cites. */
export function citedAttributes(conditions: readonly RowCondition[]): string[] {
  const out = new Set<string>()
  for (const c of conditions) {
    for (const v of c.values) {
      if (typeof v !== 'string') continue
      for (const m of v.matchAll(ATTRIBUTE)) out.add(m[1] as string)
    }
  }
  return [...out]
}

/**
 * A value with the reader's attributes in place of `{{user.x}}`. `null` when it cites an
 * attribute the reader lacks: the condition then matches no row — a missing attribute never
 * opens access.
 */
export function substituteAttributes(
  value: string | number,
  attributes: Readonly<Record<string, string>>,
): string | number | null {
  if (typeof value === 'number') return value
  let missing = false
  const out = value.replace(ATTRIBUTE, (_, key: string) => {
    const v = attributes[key]
    if (v === undefined) {
      missing = true
      return ''
    }
    return v
  })
  return missing ? null : out
}

const rank = <T extends string>(order: readonly T[], value: T) => order.indexOf(value)

/** The more permissive of two levels, for the union of groups. */
export const widest = <T extends string>(order: readonly T[], a: T, b: T): T =>
  rank(order, a) >= rank(order, b) ? a : b

export const atLeast = <T extends string>(order: readonly T[], value: T, min: T): boolean =>
  rank(order, value) >= rank(order, min)
