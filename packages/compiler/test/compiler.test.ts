import { describe, expect, it } from 'vitest'
import {
  type CompileContext,
  applyConstraints,
  compileBuilder,
  nativeSql,
  renderSql,
  rowPolicySql,
} from '../src'
import { resolveDateExpression } from '@eodia/contracts'

const orders = {
  id: 't-orders',
  catalog: 'boutique',
  schema: 'public',
  name: 'commandes',
  label: 'Commandes',
  columns: [
    { name: 'id', type: 'integer' },
    { name: 'client_id', type: 'integer' },
    { name: 'statut', type: 'varchar' },
    { name: 'montant_total', type: 'decimal(12,2)', label: 'Montant total', semantic: 'amount' },
    { name: 'passee_le', type: 'timestamp(6) with time zone', label: 'Passée le' },
  ],
}
const clients = {
  id: 't-clients',
  catalog: 'boutique',
  schema: 'public',
  name: 'clients',
  label: 'Clients',
  columns: [
    { name: 'id', type: 'integer' },
    { name: 'ville', type: 'varchar', label: 'Ville' },
  ],
}

const ctx: CompileContext = {
  table: (id) => [orders, clients].find((t) => t.id === id),
  question: () => undefined,
  metric: (id) =>
    id === 'ca'
      ? {
          id: 'ca',
          name: "Chiffre d'affaires",
          source: { kind: 'table', id: 't-orders' },
          aggregation: { fn: 'sum', column: { field: 'montant_total' } },
          filters: [{ column: { field: 'statut' }, op: 'is', values: ['livrée'] }],
        }
      : undefined,
  today: '2026-10-03',
  allowSql: false,
}

describe('compileBuilder', () => {
  it('groups by month with an implicit join', () => {
    const { sql, columns } = compileBuilder(
      {
        kind: 'builder',
        source: { kind: 'table', id: 't-orders' },
        joins: [{ alias: 'client', source: { kind: 'table', id: 't-clients' }, kind: 'left', left: { field: 'client_id' }, right: 'id' }],
        aggregations: [{ fn: 'sum', column: { field: 'montant_total' } }, { fn: 'count' }],
        breakouts: [{ field: 'passee_le', unit: 'month' }, { join: 'client', field: 'ville' }],
        filters: [{ column: { field: 'passee_le' }, op: 'date', values: ['thisyear'] }],
      },
      ctx,
    )
    expect(sql).toContain(`CAST(date_trunc('month', "s"."passee_le") AS date) AS "passee_le"`)
    expect(sql).toContain(`LEFT JOIN "boutique"."public"."clients" AS "client" ON "s"."client_id" = "client"."id"`)
    expect(sql).toContain(`"s"."passee_le" >= TIMESTAMP '2026-01-01 00:00:00' AND "s"."passee_le" < TIMESTAMP '2027-01-01 00:00:00'`)
    expect(sql).toContain('GROUP BY 1, 2')
    expect(columns.map((c) => c.name)).toEqual(['passee_le', 'client.ville', 'sum:montant_total', 'count'])
    expect(columns[0]?.label).toBe('Passée le : mois')
    expect(columns[1]?.label).toBe('Clients → Ville')
    expect(columns[2]?.semantic).toBe('amount')
  })

  it('shows the columns of a join the person added', () => {
    const { sql, columns } = compileBuilder(
      {
        kind: 'builder',
        source: { kind: 'table', id: 't-orders' },
        joins: [{ alias: 'clients', source: { kind: 'table', id: 't-clients' }, kind: 'inner', left: { field: 'client_id' }, right: 'id', explicit: true }],
      },
      ctx,
    )
    expect(sql).toContain(`INNER JOIN "boutique"."public"."clients" AS "clients" ON "s"."client_id" = "clients"."id"`)
    expect(columns.map((c) => c.name)).toEqual(['id', 'client_id', 'statut', 'montant_total', 'passee_le', 'clients.id', 'clients.ville'])
    expect(columns[6]?.label).toBe('Clients → Ville')
  })

  it('escapes every value', () => {
    const { sql } = compileBuilder(
      {
        kind: 'builder',
        source: { kind: 'table', id: 't-orders' },
        filters: [{ column: { field: 'statut' }, op: 'contains', values: ["l'été 100%"] }],
        limit: 10,
      },
      ctx,
    )
    expect(sql).toContain(`LIKE '%l''été 100\\%%' ESCAPE '\\'`)
    expect(sql).toMatch(/LIMIT 10$/)
  })

  it('expands a metric into a guarded aggregate', () => {
    const { sql, columns } = compileBuilder(
      { kind: 'builder', source: { kind: 'table', id: 't-orders' }, aggregations: [{ fn: 'metric', metric: 'ca' }] },
      ctx,
    )
    expect(sql).toContain(`sum(CASE WHEN "s"."statut" = 'livrée' THEN "s"."montant_total" END)`)
    expect(columns[0]?.label).toBe("Chiffre d'affaires")
  })

  it('refuses hand-written SQL without the right', () => {
    expect(() =>
      compileBuilder({ kind: 'builder', source: { kind: 'table', id: 't-orders' }, filters: [{ sql: '1=1' }] }, ctx),
    ).toThrow(/droit SQL/)
  })

  it('applies dashboard constraints', () => {
    const q = applyConstraints(
      { kind: 'builder', source: { kind: 'table', id: 't-orders' }, breakouts: [{ field: 'passee_le', unit: 'month' }] },
      [
        { target: { column: { field: 'statut' } }, type: 'category', value: ['payée', 'livrée'] },
        { target: { column: { field: 'passee_le' } }, type: 'temporal_unit', value: 'week' },
      ],
    )
    expect(q.breakouts?.[0]?.unit).toBe('week')
    expect(compileBuilder(q, ctx).sql).toContain(`"s"."statut" IN ('payée', 'livrée')`)
  })
})

describe('renderSql', () => {
  const opts = { today: '2026-10-03' }
  it('drops optional sections without value and quotes the others', () => {
    const sql = 'SELECT * FROM t WHERE 1=1 [[AND statut = {{statut}}]] [[AND n > {{n}}]]'
    expect(
      renderSql(sql, [{ name: 'statut', label: 'Statut', type: 'text' }, { name: 'n', label: 'N', type: 'number' }], { statut: "a'b" }, opts),
    ).toBe("SELECT * FROM t WHERE 1=1 AND statut = 'a''b' ")
  })
  it('turns a filter variable into a condition', () => {
    const sql = 'SELECT * FROM t WHERE {{periode}}'
    const vars = [{ name: 'periode', label: 'Période', type: 'filter' as const, column: 'passee_le', column_kind: 'date' as const }]
    expect(renderSql(sql, vars, {}, opts)).toBe('SELECT * FROM t WHERE TRUE')
    expect(renderSql(sql, vars, { periode: '2026-03' }, opts)).toBe(
      "SELECT * FROM t WHERE (passee_le >= DATE '2026-03-01' AND passee_le <= DATE '2026-03-31')",
    )
  })
  it('refuses a non-number', () => {
    expect(() => renderSql('SELECT {{n}}', [{ name: 'n', label: 'N', type: 'number' }], { n: '1; DROP' }, opts)).toThrow()
  })
  it('wraps native SQL', () => {
    expect(nativeSql('boutique', "select 'x';")).toBe(
      `SELECT * FROM TABLE("boutique".system.query(query => 'select ''x'''))`,
    )
  })
})

describe('rowPolicySql', () => {
  const types = (n: string) => ({ region: 'varchar', montant: 'decimal(10,2)' })[n]
  it('substitutes attributes, several values allowed', () => {
    expect(
      rowPolicySql({ match: 'all', conditions: [{ column: 'region', op: 'eq', values: ['{{user.region}}'] }] }, types, {
        region: 'Bretagne, Normandie',
      }),
    ).toBe(`("region" IN ('Bretagne', 'Normandie'))`)
  })
  it('closes on a missing attribute', () => {
    expect(
      rowPolicySql({ match: 'all', conditions: [{ column: 'region', op: 'eq', values: ['{{user.region}}'] }] }, types, {}),
    ).toBe('(FALSE)')
  })
})

describe('resolveDateExpression', () => {
  // A Sunday in the middle of October: weeks start on Monday.
  const today = '2026-10-04'
  const span = (e: string) => resolveDateExpression(e, today, 1)

  it('reads the current, the past and the next periods', () => {
    expect(span('thismonth')).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(span('lastmonth')).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(span('past3months')).toEqual({ start: '2026-08-01', end: '2026-10-31' })
    expect(span('last3months')).toEqual({ start: '2026-07-01', end: '2026-09-30' })
    expect(span('next2weeks')).toEqual({ start: '2026-10-05', end: '2026-10-18' })
  })

  it('reads one period some periods ago', () => {
    expect(span('2monthsago')).toEqual({ start: '2026-08-01', end: '2026-08-31' })
    expect(span('1yearago')).toEqual({ start: '2025-01-01', end: '2025-12-31' })
    expect(span('3daysago')).toEqual({ start: '2026-10-01', end: '2026-10-01' })
  })

  it('reads before and after a period', () => {
    expect(span('before:lastmonth')).toEqual({ start: null, end: '2026-08-31' })
    expect(span('after:lastmonth')).toEqual({ start: '2026-10-01', end: null })
    expect(span('before:2026-03-15')).toEqual({ start: null, end: '2026-03-14' })
    expect(span('before:2monthsago')).toEqual({ start: null, end: '2026-07-31' })
    expect(span('before:nonsense')).toBeNull()
  })

  it('reads spans whose sides are relative', () => {
    expect(span('thisyear~today')).toEqual({ start: '2026-01-01', end: '2026-10-04' })
    expect(span('lastmonth~')).toEqual({ start: '2026-09-01', end: null })
    expect(span('~lastyear')).toEqual({ start: null, end: '2025-12-31' })
  })
})
