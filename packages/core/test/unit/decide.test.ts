import { describe, expect, it } from 'vitest'
import type { QueryLevel } from '@eodia/contracts'
import { columnAccess, nativeAllowed, queryLevel, rowFilter, tableAccess } from '../../src/access/decide'
import { OpaDecider } from '../../src/access/opa'
import type { SnapDataPermission, SnapTable, SnapUser, Snapshot } from '../../src/access/snapshot'

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

function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    version: 1,
    loadedAt: Date.now(),
    adminGroup: 'g-admin',
    allGroup: 'g-all',
    users: new Map<string, SnapUser>([
      ['admin', { id: 'admin', email: 'a@x', name: 'A', active: true, groups: new Set(['g-all', 'g-admin']), attributes: {} }],
      ['anna', { id: 'anna', email: 'anna@x', name: 'Anna', active: true, groups: new Set(['g-all', 'g-region']), attributes: { region: 'Bretagne' } }],
      ['bob', { id: 'bob', email: 'b@x', name: 'Bob', active: true, groups: new Set(['g-all', 'g-region', 'g-direction']), attributes: { region: 'Normandie' } }],
      ['nora', { id: 'nora', email: 'n@x', name: 'Nora', active: true, groups: new Set(['g-all', 'g-region']), attributes: {} }],
      ['off', { id: 'off', email: 'o@x', name: 'Off', active: false, groups: new Set(['g-all', 'g-admin']), attributes: {} }],
    ]),
    rights: new Map(),
    datasources: new Map([['ds', { id: 'ds', catalog: 'boutique', engine: 'postgresql', nativeSql: true }]]),
    byCatalog: new Map([['boutique', { id: 'ds', catalog: 'boutique', engine: 'postgresql', nativeSql: true }]]),
    tables: new Map([['t-clients', table]]),
    tableByName: new Map([['boutique.public.clients', table]]),
    dataPermissions: new Map<string, SnapDataPermission[]>([
      ['g-all', [{ datasource: 'ds', schema: null, table: null, access: 'none' }]],
      ['g-region', [{ datasource: 'ds', schema: null, table: null, access: 'restricted' }]],
      ['g-direction', [{ datasource: 'ds', schema: null, table: null, access: 'read' }]],
    ]),
    queryPermissions: new Map<string, Map<string, QueryLevel>>([
      ['g-region', new Map([['ds', 'sql' as const]])],
      ['g-direction', new Map([['ds', 'native' as const]])],
    ]),
    columnRules: new Map([['g-region', new Map([['c-email', { access: 'masked' as const, mask: null }]])]]),
    rowPolicies: new Map([['g-region', new Map([['t-clients', { match: 'all' as const, conditions: [{ column: 'region', op: 'eq' as const, values: ['{{user.region}}'] }] }]])]]),
    ...over,
  }
}

describe('decide', () => {
  const snap = snapshot()

  it('lets admins read everything, and nobody inactive read anything', () => {
    expect(tableAccess(snap, 'admin', 'ds', 'public', 't-clients').access).toBe('read')
    expect(tableAccess(snap, 'off', 'ds', 'public', 't-clients').access).toBe('none')
  })

  it('applies a restricted group’s rules', () => {
    expect(tableAccess(snap, 'anna', 'ds', 'public', 't-clients')).toEqual({ access: 'restricted', restrictedBy: ['g-region'] })
    expect(rowFilter(snap, 'anna', table)).toBe(`("region" = 'Bretagne')`)
    expect(columnAccess(snap, 'anna', table, 'email').access).toBe('masked')
    expect(columnAccess(snap, 'anna', table, 'ca').access).toBe('read')
  })

  it('lets « read » win over « restricted » across groups', () => {
    expect(tableAccess(snap, 'bob', 'ds', 'public', 't-clients').access).toBe('read')
    expect(rowFilter(snap, 'bob', table)).toBeNull()
    expect(columnAccess(snap, 'bob', table, 'email').access).toBe('read')
  })

  it('closes on a missing attribute', () => {
    expect(rowFilter(snap, 'nora', table)).toBe('(FALSE)')
  })

  it('takes the most precise permission of a group', () => {
    const s = snapshot({
      dataPermissions: new Map<string, SnapDataPermission[]>([['g-all', [{ datasource: 'ds', schema: null, table: null, access: 'read' }, { datasource: 'ds', schema: null, table: 't-clients', access: 'none' }]]]),
    })
    expect(tableAccess(s, 'anna', 'ds', 'public', 't-clients').access).toBe('none')
    expect(tableAccess(s, 'anna', 'ds', 'public', 'other').access).toBe('read')
  })

  it('reserves native SQL to people without restriction', () => {
    expect(queryLevel(snap, 'anna', 'ds')).toBe('sql')
    expect(nativeAllowed(snap, 'anna', 'ds')).toBe(false)
    expect(nativeAllowed(snap, 'bob', 'ds')).toBe(true)
  })
})

describe('OPA endpoint', () => {
  const opa = new OpaDecider(snapshot(), 'eodia-service')
  const ctx = (user: string) => ({ identity: { user } })
  const tableRes = { catalogName: 'boutique', schemaName: 'public', tableName: 'clients' }

  it('allows the service everything, an unknown user nothing', () => {
    expect(opa.allow({ context: ctx('eodia-service'), action: { operation: 'CreateCatalog' } })).toBe(true)
    expect(opa.allow({ context: ctx('mallory'), action: { operation: 'ExecuteQuery' } })).toBe(false)
  })

  it('keeps people read-only', () => {
    expect(opa.allow({ context: ctx('bob'), action: { operation: 'InsertIntoTable', resource: { table: tableRes } } })).toBe(false)
    expect(opa.allow({ context: ctx('bob'), action: { operation: 'SelectFromColumns', resource: { table: { ...tableRes, columns: ['region'] } } } })).toBe(true)
  })

  it('serves row filters and column masks', () => {
    expect(opa.rowFilters({ context: ctx('anna'), action: { operation: 'GetRowFilters', resource: { table: tableRes } } })).toEqual([{ expression: `("region" = 'Bretagne')` }])
    const masks = opa.columnMasks({
      context: ctx('anna'),
      action: { operation: 'GetColumnMask', filterResources: [{ column: { ...tableRes, columnName: 'email', columnType: 'varchar' } }, { column: { ...tableRes, columnName: 'ca', columnType: 'decimal(12,2)' } }] },
    })
    expect(masks).toHaveLength(1)
    expect(masks[0]?.index).toBe(0)
  })

  it('hides a catalog nobody granted', () => {
    expect(opa.batch({ context: ctx('nora'), action: { operation: 'FilterCatalogs', filterResources: [{ catalog: { name: 'boutique' } }, { catalog: { name: 'system' } }, { catalog: { name: 'secret' } }] } })).toEqual([0, 1])
  })

  it('refuses system.query to a restricted person', () => {
    const fn = { function: { catalogName: 'boutique', schemaName: 'system', functionName: 'query' } }
    expect(opa.allow({ context: ctx('anna'), action: { operation: 'ExecuteTableFunction', resource: fn } })).toBe(false)
    expect(opa.allow({ context: ctx('bob'), action: { operation: 'ExecuteTableFunction', resource: fn } })).toBe(true)
  })
})
