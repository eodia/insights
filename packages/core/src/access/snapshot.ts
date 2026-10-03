/**
 * L'instantané des permissions : tout ce que `decide()` lit, chargé en mémoire en une fois et
 * rechargé à chaque changement (et au plus tard toutes les 30 s, pour les autres répliques).
 * Trino appelle l'endpoint OPA plusieurs fois par requête : aucune décision ne doit attendre
 * la base.
 */
import type {
  AdminRight,
  ColumnAccess,
  DataAccess,
  Engine,
  QueryLevel,
  RowCondition,
} from '@eodia/contracts'
import type { Db } from '../db'

export interface SnapUser {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly active: boolean
  readonly groups: ReadonlySet<string>
  readonly attributes: Readonly<Record<string, string>>
}

export interface SnapDatasource {
  readonly id: string
  readonly catalog: string
  readonly engine: Engine
  readonly nativeSql: boolean
}

export interface SnapColumn {
  readonly id: string
  readonly name: string
  readonly type: string
}

export interface SnapTable {
  readonly id: string
  readonly datasource: string
  readonly schema: string
  readonly name: string
  readonly columns: ReadonlyMap<string, SnapColumn>
}

export interface SnapDataPermission {
  readonly datasource: string
  readonly schema: string | null
  readonly table: string | null
  readonly access: DataAccess
}

export interface SnapRowPolicy {
  readonly match: 'all' | 'any'
  readonly conditions: readonly RowCondition[]
}

export interface Snapshot {
  readonly version: number
  readonly loadedAt: number
  readonly adminGroup: string
  readonly allGroup: string
  readonly users: ReadonlyMap<string, SnapUser>
  readonly rights: ReadonlyMap<string, ReadonlySet<AdminRight>>
  readonly datasources: ReadonlyMap<string, SnapDatasource>
  readonly byCatalog: ReadonlyMap<string, SnapDatasource>
  readonly tables: ReadonlyMap<string, SnapTable>
  /** `catalog.schema.table`, lower-cased → table. */
  readonly tableByName: ReadonlyMap<string, SnapTable>
  readonly dataPermissions: ReadonlyMap<string, readonly SnapDataPermission[]>
  readonly queryPermissions: ReadonlyMap<string, ReadonlyMap<string, QueryLevel>>
  readonly columnRules: ReadonlyMap<string, ReadonlyMap<string, { access: ColumnAccess; mask: string | null }>>
  readonly rowPolicies: ReadonlyMap<string, ReadonlyMap<string, SnapRowPolicy>>
}

export const tableKey = (catalog: string, schema: string, table: string) =>
  `${catalog}.${schema}.${table}`.toLowerCase()

function groupBy<T, K, V>(rows: readonly T[], key: (r: T) => K, value: (r: T) => V): Map<K, V[]> {
  const out = new Map<K, V[]>()
  for (const r of rows) {
    const k = key(r)
    const list = out.get(k)
    if (list) list.push(value(r))
    else out.set(k, [value(r)])
  }
  return out
}

export async function loadSnapshot(db: Db, version: number): Promise<Snapshot> {
  const [groups, users, members, attributes, rights, sources, tables, columns, data, query, cols, rows] =
    await Promise.all([
      db.many<{ id: string; kind: string }>('SELECT id, kind FROM user_group'),
      db.many<{ id: string; email: string; name: string; active: boolean }>('SELECT id, email, name, active FROM app_user'),
      db.many<{ group_id: string; user_id: string }>('SELECT group_id, user_id FROM group_member'),
      db.many<{ user_id: string; key: string; value: string }>('SELECT user_id, key, value FROM user_attribute'),
      db.many<{ group_id: string; right_name: AdminRight }>('SELECT group_id, right_name FROM admin_right'),
      db.many<{ id: string; catalog: string; engine: Engine; options: { native_sql?: boolean } }>(
        'SELECT id, catalog, engine, options FROM datasource',
      ),
      db.many<{ id: string; datasource_id: string; schema_name: string; name: string }>(
        `SELECT id, datasource_id, schema_name, name FROM db_table WHERE status = 'active'`,
      ),
      db.many<{ id: string; table_id: string; name: string; data_type: string }>(
        `SELECT c.id, c.table_id, c.name, c.data_type FROM db_column c JOIN db_table t ON t.id = c.table_id
         WHERE c.status = 'active' AND t.status = 'active'`,
      ),
      db.many<{ group_id: string; datasource_id: string; schema_name: string | null; table_id: string | null; access: DataAccess }>(
        'SELECT group_id, datasource_id, schema_name, table_id, access FROM data_permission',
      ),
      db.many<{ group_id: string; datasource_id: string; level: QueryLevel }>('SELECT group_id, datasource_id, level FROM query_permission'),
      db.many<{ group_id: string; column_id: string; access: ColumnAccess; mask: string | null }>(
        'SELECT group_id, column_id, access, mask FROM column_permission',
      ),
      db.many<{ group_id: string; table_id: string; match: 'all' | 'any'; conditions: RowCondition[] }>(
        'SELECT group_id, table_id, match, conditions FROM row_policy',
      ),
    ])

  const adminGroup = groups.find((g) => g.kind === 'admin')?.id ?? ''
  const allGroup = groups.find((g) => g.kind === 'all')?.id ?? ''
  const memberOf = groupBy(members, (m) => m.user_id, (m) => m.group_id)
  const attrsOf = groupBy(attributes, (a) => a.user_id, (a) => [a.key, a.value] as const)

  const snapUsers = new Map<string, SnapUser>()
  for (const u of users) {
    const g = new Set(memberOf.get(u.id) ?? [])
    if (allGroup) g.add(allGroup)
    snapUsers.set(u.id, {
      id: u.id,
      email: u.email,
      name: u.name,
      active: u.active,
      groups: g,
      attributes: Object.fromEntries(attrsOf.get(u.id) ?? []),
    })
  }

  const datasources = new Map<string, SnapDatasource>()
  const byCatalog = new Map<string, SnapDatasource>()
  for (const s of sources) {
    const d = { id: s.id, catalog: s.catalog, engine: s.engine, nativeSql: s.options?.native_sql !== false }
    datasources.set(s.id, d)
    byCatalog.set(s.catalog, d)
  }

  const colsOf = groupBy(columns, (c) => c.table_id, (c) => c)
  const snapTables = new Map<string, SnapTable>()
  const tableByName = new Map<string, SnapTable>()
  for (const t of tables) {
    const ds = datasources.get(t.datasource_id)
    if (!ds) continue
    const table: SnapTable = {
      id: t.id,
      datasource: t.datasource_id,
      schema: t.schema_name,
      name: t.name,
      columns: new Map((colsOf.get(t.id) ?? []).map((c) => [c.name.toLowerCase(), { id: c.id, name: c.name, type: c.data_type }])),
    }
    snapTables.set(t.id, table)
    tableByName.set(tableKey(ds.catalog, t.schema_name, t.name), table)
  }

  const rightsMap = new Map<string, Set<AdminRight>>()
  for (const r of rights) {
    const set = rightsMap.get(r.group_id) ?? new Set<AdminRight>()
    set.add(r.right_name)
    rightsMap.set(r.group_id, set)
  }

  const queryPermissions = new Map<string, Map<string, QueryLevel>>()
  for (const q of query) {
    const m = queryPermissions.get(q.group_id) ?? new Map<string, QueryLevel>()
    m.set(q.datasource_id, q.level)
    queryPermissions.set(q.group_id, m)
  }

  const columnRules = new Map<string, Map<string, { access: ColumnAccess; mask: string | null }>>()
  for (const c of cols) {
    const m = columnRules.get(c.group_id) ?? new Map()
    m.set(c.column_id, { access: c.access, mask: c.mask })
    columnRules.set(c.group_id, m)
  }

  const rowPolicies = new Map<string, Map<string, SnapRowPolicy>>()
  for (const r of rows) {
    const m = rowPolicies.get(r.group_id) ?? new Map()
    m.set(r.table_id, { match: r.match, conditions: r.conditions })
    rowPolicies.set(r.group_id, m)
  }

  return {
    version,
    loadedAt: Date.now(),
    adminGroup,
    allGroup,
    users: snapUsers,
    rights: rightsMap,
    datasources,
    byCatalog,
    tables: snapTables,
    tableByName,
    dataPermissions: groupBy(data, (d) => d.group_id, (d) => ({
      datasource: d.datasource_id,
      schema: d.schema_name,
      table: d.table_id,
      access: d.access,
    })),
    queryPermissions,
    columnRules,
    rowPolicies,
  }
}

/**
 * Holds the current snapshot. `invalidate()` after any change to users, groups, sources,
 * structure or permissions; a reload is coalesced when several land at once.
 */
export class AccessCache {
  private current: Snapshot | null = null
  private loading: Promise<Snapshot> | null = null
  private version = 0
  private stale = true

  constructor(
    private readonly db: Db,
    private readonly maxAgeMs = 30_000,
  ) {}

  invalidate(): void {
    this.stale = true
  }

  async get(): Promise<Snapshot> {
    const fresh = this.current && !this.stale && Date.now() - this.current.loadedAt < this.maxAgeMs
    if (fresh && this.current) return this.current
    if (this.loading) return this.loading
    this.stale = false
    this.version += 1
    this.loading = loadSnapshot(this.db, this.version)
      .then((s) => {
        this.current = s
        return s
      })
      .finally(() => {
        this.loading = null
      })
    return this.loading
  }
}
