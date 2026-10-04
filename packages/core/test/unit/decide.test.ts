import { describe, expect, it } from 'vitest'
import type { QueryLevel } from '@eodia/contracts'
import { columnAccess, isAdmin, nativeAllowed, queryLevel, rowFilter, tableAccess, userOf } from '../../src/access/decide'
import { OpaDecider } from '../../src/access/opa'
import type { SnapDataPermission, SnapDatasource, SnapTable, SnapUser, Snapshot } from '../../src/access/snapshot'

const table: SnapTable = {
  id: 't-clients',
  datasource: 'ds',
  schema: 'public',
  name: 'clients',
  columns: new Map([
    ['region', { id: 'c-region', name: 'region', type: 'varchar' }],
    ['email', { id: 'c-email', name: 'email', type: 'varchar' }],
    ['ca', { id: 'c-ca', name: 'ca', type: 'decimal(12,2)' }],
  ]),
}

/** A person acting in the shop's space (`w1`); `in(…, 'w2')` in the customer service's. */
const in_ = (user: string, space = 'w1') => `${user}@${space}`

/** The source `ds` belongs to `w1`; `shared` adds the spaces it is shared with. */
const source = (shared: string[] = []): SnapDatasource => ({ id: 'ds', catalog: 'boutique', engine: 'postgresql', nativeSql: true, workspace: 'w1', workspaces: new Set(['w1', ...shared]) })

function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  const ds = over.datasources?.get('ds') ?? source()
  return {
    version: 1,
    loadedAt: Date.now(),
    adminGroup: 'g-admin',
    users: new Map<string, SnapUser>([
      ['admin', { id: 'admin', email: 'a@x', name: 'A', active: true, groups: new Set(['g-admin']), attributes: {} }],
      ['anna', { id: 'anna', email: 'anna@x', name: 'Anna', active: true, groups: new Set(['g-region']), attributes: { region: 'Bretagne' } }],
      ['bob', { id: 'bob', email: 'b@x', name: 'Bob', active: true, groups: new Set(['g-region', 'g-direction']), attributes: { region: 'Normandie' } }],
      ['nora', { id: 'nora', email: 'n@x', name: 'Nora', active: true, groups: new Set(['g-region']), attributes: {} }],
      ['off', { id: 'off', email: 'o@x', name: 'Off', active: false, groups: new Set(['g-admin']), attributes: {} }],
      ['carl', { id: 'carl', email: 'c@x', name: 'Carl', active: true, groups: new Set(['g-care']), attributes: {} }],
    ]),
    workspaces: new Map([
      ['w1', { id: 'w1', allGroup: 'g-all', archived: false }],
      ['w2', { id: 'w2', allGroup: 'g-all2', archived: false }],
    ]),
    members: new Map([
      ['anna', new Map([['w1', 'member' as const]])],
      ['bob', new Map([['w1', 'member' as const], ['w2', 'member' as const]])],
      ['nora', new Map([['w1', 'member' as const]])],
      ['carl', new Map([['w2', 'member' as const]])],
    ]),
    groupWorkspace: new Map([
      ['g-admin', null],
      ['g-all', 'w1'],
      ['g-region', 'w1'],
      ['g-direction', 'w1'],
      ['g-all2', 'w2'],
      ['g-care', 'w2'],
    ]),
    principals: new Map(),
    rights: new Map(),
    datasources: new Map([['ds', ds]]),
    byCatalog: new Map([['boutique', ds]]),
    tables: new Map([['t-clients', table]]),
    tableByName: new Map([['boutique.public.clients', table]]),
    dataPermissions: new Map<string, SnapDataPermission[]>([
      ['g-all', [{ datasource: 'ds', schema: null, table: null, access: 'none' }]],
      ['g-region', [{ datasource: 'ds', schema: null, table: null, access: 'restricted' }]],
      ['g-direction', [{ datasource: 'ds', schema: null, table: null, access: 'read' }]],
      ['g-all2', [{ datasource: 'ds', schema: null, table: null, access: 'read' }]],
    ]),
    queryPermissions: new Map<string, Map<string, QueryLevel>>([
      ['g-region', new Map([['ds', 'sql' as const]])],
      ['g-direction', new Map([['ds', 'native' as const]])],
      ['g-all2', new Map([['ds', 'sql' as const]])],
    ]),
    columnRules: new Map([['g-region', new Map([['c-email', { access: 'masked' as const, mask: null }]])]]),
    rowPolicies: new Map([['g-region', new Map([['t-clients', { match: 'all' as const, conditions: [{ column: 'region', op: 'eq' as const, values: ['{{user.region}}'] }] }]])]]),
    ...over,
  }
}

describe('decide', () => {
  const snap = snapshot()

  it('lets admins read everything, and nobody inactive read anything', () => {
    expect(tableAccess(snap, in_('admin'), 'ds', 'public', 't-clients').access).toBe('read')
    expect(tableAccess(snap, in_('off'), 'ds', 'public', 't-clients').access).toBe('none')
  })

  it('applies a restricted group’s rules', () => {
    expect(tableAccess(snap, in_('anna'), 'ds', 'public', 't-clients')).toEqual({ access: 'restricted', restrictedBy: ['g-region'] })
    expect(rowFilter(snap, in_('anna'), table)).toBe(`("region" = 'Bretagne')`)
    expect(columnAccess(snap, in_('anna'), table, 'email').access).toBe('masked')
    expect(columnAccess(snap, in_('anna'), table, 'ca').access).toBe('read')
  })

  it('lets « read » win over « restricted » across groups', () => {
    expect(tableAccess(snap, in_('bob'), 'ds', 'public', 't-clients').access).toBe('read')
    expect(rowFilter(snap, in_('bob'), table)).toBeNull()
    expect(columnAccess(snap, in_('bob'), table, 'email').access).toBe('read')
  })

  it('closes on a missing attribute', () => {
    expect(rowFilter(snap, in_('nora'), table)).toBe('(FALSE)')
  })

  it('takes the most precise permission of a group', () => {
    const s = snapshot({
      dataPermissions: new Map<string, SnapDataPermission[]>([['g-all', [{ datasource: 'ds', schema: null, table: null, access: 'read' }, { datasource: 'ds', schema: null, table: 't-clients', access: 'none' }]]]),
    })
    expect(tableAccess(s, in_('anna'), 'ds', 'public', 't-clients').access).toBe('none')
    expect(tableAccess(s, in_('anna'), 'ds', 'public', 'other').access).toBe('read')
  })

  it('reserves native SQL to people without restriction', () => {
    expect(queryLevel(snap, in_('anna'), 'ds')).toBe('sql')
    expect(nativeAllowed(snap, in_('anna'), 'ds')).toBe(false)
    expect(nativeAllowed(snap, in_('bob'), 'ds')).toBe(true)
  })
})

describe('spaces', () => {
  it('reads nothing outside a space: a bare person has no data', () => {
    const snap = snapshot()
    expect(tableAccess(snap, 'bob', 'ds', 'public', 't-clients').access).toBe('none')
    expect(queryLevel(snap, 'bob', 'ds')).toBe('none')
  })

  it('keeps a source closed to a space it is not shared with — its administrators and the instance’s included', () => {
    const snap = snapshot()
    expect(tableAccess(snap, in_('carl', 'w2'), 'ds', 'public', 't-clients').access).toBe('none')
    expect(tableAccess(snap, in_('admin', 'w2'), 'ds', 'public', 't-clients').access).toBe('none')
    expect(queryLevel(snap, in_('admin', 'w2'), 'ds')).toBe('none')
    expect(nativeAllowed(snap, in_('admin', 'w2'), 'ds')).toBe(false)
  })

  it('opens a shared source to the receiving space, under that space’s groups', () => {
    const snap = snapshot({ datasources: new Map([['ds', source(['w2'])]]) })
    expect(tableAccess(snap, in_('carl', 'w2'), 'ds', 'public', 't-clients').access).toBe('read')
    expect(queryLevel(snap, in_('carl', 'w2'), 'ds')).toBe('sql')
  })

  it('counts only the groups of the space acted in', () => {
    const snap = snapshot({ datasources: new Map([['ds', source(['w2'])]]) })
    // In w1, Bob's « Direction » reads the source fully, natively; in w2, only w2's « everyone » counts.
    expect(queryLevel(snap, in_('bob'), 'ds')).toBe('native')
    expect(queryLevel(snap, in_('bob', 'w2'), 'ds')).toBe('sql')
    expect([...(userOf(snap, in_('bob', 'w2'))?.groups ?? [])]).toEqual(['g-all2'])
  })

  it('lets nobody act in a space they are not a member of — except the instance’s administrators', () => {
    const snap = snapshot()
    expect(userOf(snap, in_('anna', 'w2'))).toBeUndefined()
    expect(isAdmin(snap, in_('admin', 'w2'))).toBe(true)
    expect(isAdmin(snap, in_('bob'))).toBe(false)
  })

  it('administers a space by its role there', () => {
    const snap = snapshot({ members: new Map([['carl', new Map([['w2', 'admin' as const]])]]) })
    expect(isAdmin(snap, in_('carl', 'w2'))).toBe(true)
    expect(tableAccess(snap, in_('carl', 'w2'), 'ds', 'public', 't-clients').access).toBe('none')
  })
})

describe('OPA endpoint', () => {
  const opa = new OpaDecider(snapshot(), 'eodia-service')
  const ctx = (user: string) => ({ identity: { user } })
  const tableRes = { catalogName: 'boutique', schemaName: 'public', tableName: 'clients' }

  it('allows the service everything, an unknown user nothing', () => {
    expect(opa.allow({ context: ctx('eodia-service'), action: { operation: 'CreateCatalog' } })).toBe(true)
    expect(opa.allow({ context: ctx('mallory'), action: { operation: 'ExecuteQuery' } })).toBe(false)
    expect(opa.allow({ context: ctx(in_('mallory')), action: { operation: 'ExecuteQuery' } })).toBe(false)
  })

  it('keeps people read-only', () => {
    expect(opa.allow({ context: ctx(in_('bob')), action: { operation: 'InsertIntoTable', resource: { table: tableRes } } })).toBe(false)
    expect(opa.allow({ context: ctx(in_('bob')), action: { operation: 'SelectFromColumns', resource: { table: { ...tableRes, columns: ['region'] } } } })).toBe(true)
  })

  it('serves row filters and column masks', () => {
    expect(opa.rowFilters({ context: ctx(in_('anna')), action: { operation: 'GetRowFilters', resource: { table: tableRes } } })).toEqual([{ expression: `("region" = 'Bretagne')` }])
    const masks = opa.columnMasks({
      context: ctx(in_('anna')),
      action: { operation: 'GetColumnMask', filterResources: [{ column: { ...tableRes, columnName: 'email', columnType: 'varchar' } }, { column: { ...tableRes, columnName: 'ca', columnType: 'decimal(12,2)' } }] },
    })
    expect(masks).toHaveLength(1)
    expect(masks[0]?.index).toBe(0)
  })

  it('hides a catalog nobody granted', () => {
    expect(opa.batch({ context: ctx(in_('nora')), action: { operation: 'FilterCatalogs', filterResources: [{ catalog: { name: 'boutique' } }, { catalog: { name: 'system' } }, { catalog: { name: 'secret' } }] } })).toEqual([0, 1])
  })

  it('hides the catalog of another space, from its administrator too', () => {
    const catalogs = { operation: 'FilterCatalogs', filterResources: [{ catalog: { name: 'boutique' } }, { catalog: { name: 'system' } }] }
    expect(opa.batch({ context: ctx(in_('admin', 'w2')), action: catalogs })).toEqual([1])
    expect(opa.allow({ context: ctx(in_('admin', 'w2')), action: { operation: 'SelectFromColumns', resource: { table: { ...tableRes, columns: ['region'] } } } })).toBe(false)
  })

  it('refuses system.query to a restricted person', () => {
    const fn = { function: { catalogName: 'boutique', schemaName: 'system', functionName: 'query' } }
    expect(opa.allow({ context: ctx(in_('anna')), action: { operation: 'ExecuteTableFunction', resource: fn } })).toBe(false)
    expect(opa.allow({ context: ctx(in_('bob')), action: { operation: 'ExecuteTableFunction', resource: fn } })).toBe(true)
  })
})
