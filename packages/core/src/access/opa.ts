/**
 * L'API imite OPA : Trino lui envoie chaque question d'autorisation (`{ input: … }`) et attend
 * `{ result: … }`. Aucun serveur OPA à déployer ; les réponses viennent de `decide()`.
 *
 * Trino reçoit `X-Trino-User = <id de l'utilisateur>` pour chaque requête d'une personne, et
 * l'identité de service pour les opérations de l'application (catalogues, synchronisation).
 */
import { kindOfTrinoType } from '@eodia/contracts'
import {
  columnAccess,
  datasourceVisible,
  nativeAllowed,
  rowFilter,
  schemaVisible,
  tableAccess,
  userOf,
} from './decide'
import { type SnapTable, type Snapshot, tableKey } from './snapshot'

interface Identity {
  readonly user?: string
}
interface TableResource {
  readonly catalogName?: string
  readonly schemaName?: string
  readonly tableName?: string
  readonly columns?: readonly string[]
}
interface Resource {
  readonly catalog?: { readonly name?: string }
  readonly schema?: { readonly catalogName?: string; readonly schemaName?: string }
  readonly table?: TableResource
  readonly column?: TableResource & { readonly columnName?: string; readonly columnType?: string }
  readonly function?: { readonly catalogName?: string; readonly schemaName?: string; readonly functionName?: string }
  readonly user?: { readonly user?: string }
}
export interface OpaInput {
  readonly context?: { readonly identity?: Identity }
  readonly action?: {
    readonly operation?: string
    readonly resource?: Resource
    readonly filterResources?: readonly Resource[]
  }
}

/** Operations a person may perform: Trino is read-only for people. */
const READ_OPERATIONS = new Set([
  'ExecuteQuery',
  'AccessCatalog',
  'ShowSchemas',
  'ShowTables',
  'ShowColumns',
  'ShowFunctions',
  'ShowCreateTable',
  'ShowCreateSchema',
  'SelectFromColumns',
  'ExecuteFunction',
  'ExecuteTableFunction',
  'SetCatalogSessionProperty',
  'SetSystemSessionProperty',
])

const SYSTEM_CATALOG = 'system'
const INFO_SCHEMA = 'information_schema'

export class OpaDecider {
  constructor(
    private readonly snap: Snapshot,
    private readonly serviceUser: string,
  ) {}

  private isService(input: OpaInput): boolean {
    return input.context?.identity?.user === this.serviceUser
  }

  private userId(input: OpaInput): string | null {
    const u = input.context?.identity?.user
    return u && userOf(this.snap, u) ? u : null
  }

  private table(t: TableResource | undefined): SnapTable | undefined {
    if (!t?.catalogName || !t.schemaName || !t.tableName) return undefined
    return this.snap.tableByName.get(tableKey(t.catalogName, t.schemaName, t.tableName))
  }

  private catalogOk(user: string, catalog: string | undefined): boolean {
    if (!catalog) return false
    if (catalog === SYSTEM_CATALOG) return true
    const ds = this.snap.byCatalog.get(catalog)
    return ds !== undefined && datasourceVisible(this.snap, user, ds.id)
  }

  private schemaOk(user: string, catalog: string | undefined, schema: string | undefined): boolean {
    if (!catalog || !schema) return false
    if (catalog === SYSTEM_CATALOG) return true
    if (!this.catalogOk(user, catalog)) return false
    if (schema === INFO_SCHEMA) return true
    const ds = this.snap.byCatalog.get(catalog)
    return ds !== undefined && schemaVisible(this.snap, user, ds.id, schema)
  }

  private tableOk(user: string, t: TableResource | undefined): boolean {
    if (!t?.catalogName || !t.schemaName || !t.tableName) return false
    if (t.catalogName === SYSTEM_CATALOG) return true
    if (!this.catalogOk(user, t.catalogName)) return false
    if (t.schemaName === INFO_SCHEMA) return true
    const ds = this.snap.byCatalog.get(t.catalogName)
    if (!ds) return false
    const known = this.table(t)
    return tableAccess(this.snap, user, ds.id, t.schemaName, known?.id ?? null).access !== 'none'
  }

  private columnOk(user: string, t: TableResource, column: string): boolean {
    if (!this.tableOk(user, t)) return false
    const known = this.table(t)
    if (!known) return true
    return columnAccess(this.snap, user, known, column).access !== 'hidden'
  }

  /** `opa.policy.uri`: one yes or no. */
  allow(input: OpaInput): boolean {
    if (this.isService(input)) return true
    const user = this.userId(input)
    if (!user) return false
    const op = input.action?.operation ?? ''
    const r = input.action?.resource ?? {}
    switch (op) {
      case 'ExecuteQuery':
        return true
      case 'ViewQueryOwnedBy':
      case 'KillQueryOwnedBy':
        return r.user?.user === user
      case 'AccessCatalog':
        return this.catalogOk(user, r.catalog?.name)
      case 'ShowSchemas':
        return this.catalogOk(user, r.catalog?.name)
      case 'ShowTables':
      case 'ShowCreateSchema':
        return this.schemaOk(user, r.schema?.catalogName, r.schema?.schemaName)
      case 'ShowColumns':
      case 'ShowCreateTable':
        return this.tableOk(user, r.table)
      case 'SelectFromColumns': {
        const t = r.table
        if (!t || !this.tableOk(user, t)) return false
        return (t.columns ?? []).every((c) => this.columnOk(user, t, c))
      }
      case 'ExecuteFunction':
      case 'ExecuteTableFunction': {
        const f = r.function
        // Native SQL: `catalogue.system.query(...)` sends the text to the source untouched.
        if (f?.catalogName && f.catalogName !== SYSTEM_CATALOG && f.schemaName === 'system' && f.functionName === 'query') {
          const ds = this.snap.byCatalog.get(f.catalogName)
          return ds !== undefined && nativeAllowed(this.snap, user, ds.id)
        }
        return f?.catalogName === undefined || f.catalogName === SYSTEM_CATALOG || this.catalogOk(user, f.catalogName)
      }
      default:
        return READ_OPERATIONS.has(op) && op.startsWith('Set')
    }
  }

  /** `opa.policy.batched-uri`: the indexes of what the person may see. */
  batch(input: OpaInput): number[] {
    const resources = input.action?.filterResources ?? []
    const op = input.action?.operation ?? ''
    if (this.isService(input)) {
      if (op === 'FilterColumns' && resources.length === 1) {
        return (resources[0]?.table?.columns ?? []).map((_, i) => i)
      }
      return resources.map((_, i) => i)
    }
    const user = this.userId(input)
    if (!user) return []
    // FilterColumns batches the columns of one table: the indexes are those of the columns.
    if (op === 'FilterColumns' && resources.length === 1 && resources[0]?.table?.columns) {
      const t = resources[0].table
      return (t.columns ?? [])
        .map((c, i) => [c, i] as const)
        .filter(([c]) => this.columnOk(user, t, c))
        .map(([, i]) => i)
    }
    const out: number[] = []
    resources.forEach((r, i) => {
      let ok = false
      switch (op) {
        case 'FilterCatalogs':
          ok = this.catalogOk(user, r.catalog?.name)
          break
        case 'FilterSchemas':
          ok = this.schemaOk(user, r.schema?.catalogName, r.schema?.schemaName)
          break
        case 'FilterTables':
          ok = this.tableOk(user, r.table)
          break
        case 'FilterColumns':
          ok = r.table?.columns ? r.table.columns.every((c) => this.columnOk(user, r.table as TableResource, c)) : this.tableOk(user, r.table)
          break
        case 'FilterViewQueryOwnedBy':
          ok = r.user?.user === user
          break
        case 'FilterFunctions':
          ok = true
          break
        default:
          ok = false
      }
      if (ok) out.push(i)
    })
    return out
  }

  /** `opa.policy.row-filters-uri`: the conditions Trino adds to every read of a table. */
  rowFilters(input: OpaInput): { expression: string }[] {
    if (this.isService(input)) return []
    const user = this.userId(input)
    if (!user) return [{ expression: 'FALSE' }]
    const known = this.table(input.action?.resource?.table)
    if (!known) return []
    const filter = rowFilter(this.snap, user, known)
    return filter === null ? [] : [{ expression: filter }]
  }

  /** `opa.policy.batch-column-masking-uri`: the masked columns and what replaces them. */
  columnMasks(input: OpaInput): { index: number; viewExpression: { expression: string } }[] {
    if (this.isService(input)) return []
    const user = this.userId(input)
    const out: { index: number; viewExpression: { expression: string } }[] = []
    ;(input.action?.filterResources ?? []).forEach((r, index) => {
      const c = r.column
      if (!c?.columnName) return
      const known = this.table(c)
      if (!known || !user) return
      const decision = columnAccess(this.snap, user, known, c.columnName)
      if (decision.access !== 'masked') return
      const type = c.columnType ?? known.columns.get(c.columnName.toLowerCase())?.type ?? 'varchar'
      out.push({ index, viewExpression: { expression: decision.mask ?? defaultMask(c.columnName, type) } })
    })
    return out
  }
}

/** What a masked column shows by default: its end hidden for a text, NULL otherwise. */
function defaultMask(column: string, type: string): string {
  if (kindOfTrinoType(type) === 'text') {
    const col = `"${column.replace(/"/g, '""')}"`
    return `CAST(CASE WHEN ${col} IS NULL THEN NULL WHEN length(${col}) <= 3 THEN '•••' ELSE substr(${col}, 1, 2) || '•••' END AS ${type})`
  }
  return `CAST(NULL AS ${type})`
}
