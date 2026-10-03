/**
 * Le point de décision : des fonctions pures de l'instantané. L'endpoint OPA, le compilateur
 * (colonnes proposées), le copilot et l'interface lisent tous les mêmes réponses.
 *
 * Règles :
 * - l'accès d'une personne est l'union de ceux de ses groupes ; pour un groupe, la permission
 *   la plus précise l'emporte (table, puis schéma, puis source) ;
 * - `read` l'emporte sur `restricted` : les règles de ligne et de colonne ne s'appliquent
 *   que si aucun groupe ne donne la lecture complète ;
 * - un attribut manquant ferme (aucune ligne), jamais n'ouvre.
 */
import {
  ADMIN_RIGHTS,
  type AdminRight,
  COLUMN_ACCESS,
  type ColumnAccess,
  DATA_ACCESS,
  type DataAccess,
  QUERY_LEVELS,
  type QueryLevel,
  atLeast,
  widest,
} from '@eodia/contracts'
import { rowPolicySql, unionOfPolicies } from '@eodia/compiler'
import { createHash } from 'node:crypto'
import type { SnapTable, SnapUser, Snapshot } from './snapshot'

/** The order of data access, from the narrowest: `restricted` is less than `read`. */
const DATA_ORDER: readonly DataAccess[] = ['none', 'restricted', 'read']

export function userOf(snap: Snapshot, userId: string): SnapUser | undefined {
  const u = snap.users.get(userId)
  return u?.active ? u : undefined
}

export function isAdmin(snap: Snapshot, userId: string): boolean {
  return userOf(snap, userId)?.groups.has(snap.adminGroup) ?? false
}

export function rightsOf(snap: Snapshot, userId: string): Set<AdminRight> {
  const u = userOf(snap, userId)
  if (!u) return new Set()
  if (u.groups.has(snap.adminGroup)) return new Set(ADMIN_RIGHTS)
  const out = new Set<AdminRight>()
  for (const g of u.groups) for (const r of snap.rights.get(g) ?? []) out.add(r)
  return out
}

/** A group's access to a table (or, without table, to a schema), by its most precise permission. */
function groupAccess(
  snap: Snapshot,
  group: string,
  datasource: string,
  schema: string | null,
  table: string | null,
): DataAccess {
  const perms = (snap.dataPermissions.get(group) ?? []).filter((p) => p.datasource === datasource)
  if (table) {
    const t = perms.find((p) => p.table === table)
    if (t) return t.access
  }
  if (schema !== null) {
    const s = perms.find((p) => p.table === null && p.schema !== null && p.schema.toLowerCase() === schema.toLowerCase())
    if (s) return s.access
  }
  return perms.find((p) => p.table === null && p.schema === null)?.access ?? 'none'
}

export interface TableDecision {
  readonly access: DataAccess
  /** The groups through which the access is `restricted` — whose rules apply. */
  readonly restrictedBy: readonly string[]
}

export function tableAccess(
  snap: Snapshot,
  userId: string,
  datasource: string,
  schema: string,
  table: string | null,
): TableDecision {
  const u = userOf(snap, userId)
  if (!u) return { access: 'none', restrictedBy: [] }
  if (u.groups.has(snap.adminGroup)) return { access: 'read', restrictedBy: [] }
  let access: DataAccess = 'none'
  const restrictedBy: string[] = []
  for (const g of u.groups) {
    const a = groupAccess(snap, g, datasource, schema, table)
    access = widest(DATA_ORDER, access, a)
    if (a === 'restricted') restrictedBy.push(g)
  }
  return { access, restrictedBy: access === 'restricted' ? restrictedBy : [] }
}

/** Whether a person can reach anything in a source: its catalog is then visible. */
export function datasourceVisible(snap: Snapshot, userId: string, datasource: string): boolean {
  const u = userOf(snap, userId)
  if (!u) return false
  if (u.groups.has(snap.adminGroup)) return true
  for (const g of u.groups) {
    for (const p of snap.dataPermissions.get(g) ?? []) {
      if (p.datasource === datasource && p.access !== 'none') return true
    }
  }
  return false
}

export function schemaVisible(snap: Snapshot, userId: string, datasource: string, schema: string): boolean {
  const u = userOf(snap, userId)
  if (!u) return false
  if (u.groups.has(snap.adminGroup)) return true
  if (tableAccess(snap, userId, datasource, schema, null).access !== 'none') return true
  // A table granted on its own makes its schema visible.
  for (const g of u.groups) {
    for (const p of snap.dataPermissions.get(g) ?? []) {
      if (p.datasource !== datasource || p.table === null || p.access === 'none') continue
      const t = snap.tables.get(p.table)
      if (t && t.schema.toLowerCase() === schema.toLowerCase()) return true
    }
  }
  return false
}

export interface ColumnDecision {
  readonly access: ColumnAccess
  readonly mask: string | null
}

const COLUMN_ORDER: readonly ColumnAccess[] = COLUMN_ACCESS

export function columnAccess(snap: Snapshot, userId: string, table: SnapTable, column: string): ColumnDecision {
  const decision = tableAccess(snap, userId, table.datasource, table.schema, table.id)
  if (decision.access === 'none') return { access: 'hidden', mask: null }
  if (decision.access === 'read') return { access: 'read', mask: null }
  const col = table.columns.get(column.toLowerCase())
  if (!col) return { access: 'read', mask: null }
  let access: ColumnAccess = 'hidden'
  let mask: string | null = null
  for (const g of decision.restrictedBy) {
    const rule = snap.columnRules.get(g)?.get(col.id) ?? { access: 'read' as const, mask: null }
    if (rule.access === 'masked' && access !== 'read') mask = mask ?? rule.mask
    access = widest(COLUMN_ORDER, access, rule.access)
  }
  return { access, mask: access === 'masked' ? mask : null }
}

/** The SQL condition Trino adds to every read of the table, or null for none. */
export function rowFilter(snap: Snapshot, userId: string, table: SnapTable): string | null {
  const decision = tableAccess(snap, userId, table.datasource, table.schema, table.id)
  if (decision.access !== 'restricted') return null
  const u = userOf(snap, userId)
  if (!u) return 'FALSE'
  const attributes = { ...u.attributes, id: u.id, email: u.email, name: u.name }
  const typeOf = (name: string) => table.columns.get(name.toLowerCase())?.type
  const parts: string[] = []
  for (const g of decision.restrictedBy) {
    const policy = snap.rowPolicies.get(g)?.get(table.id)
    // A restricted group without a rule on this table lets every row through.
    if (!policy) return null
    try {
      parts.push(rowPolicySql(policy, typeOf, attributes))
    } catch {
      // A rule that no longer compiles (a column gone) closes rather than opens.
      parts.push('FALSE')
    }
  }
  return unionOfPolicies(parts)
}

export function queryLevel(snap: Snapshot, userId: string, datasource: string): QueryLevel {
  const u = userOf(snap, userId)
  if (!u) return 'none'
  if (u.groups.has(snap.adminGroup)) return 'native'
  let level: QueryLevel = 'none'
  for (const g of u.groups) {
    const l = snap.queryPermissions.get(g)?.get(datasource)
    if (l) level = widest(QUERY_LEVELS, level, l)
  }
  return level
}

/**
 * Native SQL escapes Trino's row and column rules: only for people who read the whole source
 * without any restriction, on a source that allows it.
 */
export function nativeAllowed(snap: Snapshot, userId: string, datasource: string): boolean {
  const ds = snap.datasources.get(datasource)
  if (!ds?.nativeSql) return false
  if (queryLevel(snap, userId, datasource) !== 'native') return false
  if (isAdmin(snap, userId)) return true
  if (tableAccess(snap, userId, datasource, '', null).access !== 'read') return false
  // No schema nor table of the source narrowed below `read` for any of the person's groups.
  const u = userOf(snap, userId)
  for (const g of u?.groups ?? []) {
    for (const p of snap.dataPermissions.get(g) ?? []) {
      if (p.datasource !== datasource || (p.schema === null && p.table === null) || p.access === 'read') continue
      const schema = p.table ? (snap.tables.get(p.table)?.schema ?? '') : (p.schema ?? '')
      if (tableAccess(snap, userId, datasource, schema, p.table).access !== 'read') return false
    }
  }
  return true
}

export function canQuery(snap: Snapshot, userId: string, datasource: string, min: QueryLevel): boolean {
  return atLeast(QUERY_LEVELS, queryLevel(snap, userId, datasource), min)
}

/**
 * What makes two people see the same rows: their groups and attributes. Two people with the
 * same fingerprint may share a cached result; nobody else.
 */
export function accessFingerprint(snap: Snapshot, userId: string): string {
  const u = userOf(snap, userId)
  if (!u) return 'none'
  const groups = [...u.groups].sort().join(',')
  const attrs = Object.entries(u.attributes).sort(([a], [b]) => a.localeCompare(b))
  // Row rules may cite the person's own id, e-mail or name: include them only when cited.
  const citesSelf = [...u.groups].some((g) =>
    [...(snap.rowPolicies.get(g)?.values() ?? [])].some((p) =>
      p.conditions.some((c) => c.values.some((v) => typeof v === 'string' && /\{\{\s*user\.(id|email|name)\s*\}\}/.test(v))),
    ),
  )
  return createHash('sha256')
    .update(JSON.stringify([groups, attrs, citesSelf ? u.id : '']))
    .digest('hex')
    .slice(0, 24)
}

export { DATA_ACCESS }
