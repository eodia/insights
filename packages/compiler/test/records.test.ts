import { describe, expect, it } from 'vitest'
import { type BuilderQuery, recordsQuery } from '@eodia/contracts'
import { type CompileContext, compileBuilder } from '../src'

const byMonth: BuilderQuery = {
  kind: 'builder',
  source: { kind: 'table', id: 't-orders' },
  joins: [{ alias: 'client', source: { kind: 'table', id: 't-clients' }, kind: 'left', left: { field: 'client_id' }, right: 'id' }],
  filters: [{ column: { field: 'statut' }, op: 'is_not', values: ['annulée'] }],
  aggregations: [{ fn: 'sum', column: { field: 'montant_total' } }],
  breakouts: [{ field: 'passee_le', unit: 'month' }, { join: 'client', field: 'ville' }],
  sort: [{ target: { kind: 'aggregation', index: 0 }, desc: true }],
  limit: 10,
}

describe('recordsQuery', () => {
  it('reads the rows of a point: its filters kept, its groupings as conditions', () => {
    const q = recordsQuery(byMonth, [
      { name: 'passee_le', value: '2026-03-01' },
      { name: 'client.ville', value: 'Rennes' },
    ])
    expect(q?.aggregations).toBeUndefined()
    expect(q?.breakouts).toBeUndefined()
    expect(q?.limit).toBeUndefined()
    expect(q?.sort).toBeUndefined()
    expect(q?.joins).toEqual(byMonth.joins)
    expect(q?.filters).toEqual([
      { column: { field: 'statut' }, op: 'is_not', values: ['annulée'] },
      { column: { field: 'passee_le' }, op: 'date', values: ['2026-03'] },
      { column: { join: 'client', field: 'ville' }, op: 'is', values: ['Rennes'] },
    ])
  })

  it('reads a week, a quarter, an empty value, a boolean and a bin', () => {
    const q = (breakouts: BuilderQuery['breakouts'], value: string | number | boolean | null, width?: number) =>
      recordsQuery({ ...byMonth, breakouts }, [{ name: breakouts?.[0]?.field ?? '', value, ...(width ? { width } : {}) }])?.filters?.slice(1)
    expect(q([{ field: 'passee_le', unit: 'week' }], '2026-03-02')).toEqual([{ column: { field: 'passee_le' }, op: 'date', values: ['2026-03-02~2026-03-08'] }])
    expect(q([{ field: 'passee_le', unit: 'quarter' }], '2026-04-01')).toEqual([{ column: { field: 'passee_le' }, op: 'date', values: ['2026-Q2'] }])
    expect(q([{ field: 'statut' }], null)).toEqual([{ column: { field: 'statut' }, op: 'empty', values: [] }])
    expect(q([{ field: 'payee' }], true)).toEqual([{ column: { field: 'payee' }, op: 'true', values: [] }])
    expect(q([{ field: 'montant_total', bin: 50 }], 100)).toEqual([
      { column: { field: 'montant_total' }, op: 'gte', values: [100] },
      { column: { field: 'montant_total' }, op: 'lt', values: [150] },
    ])
    expect(q([{ field: 'montant_total', bin: 'auto' }], 20, 10)?.[1]).toEqual({ column: { field: 'montant_total' }, op: 'lt', values: [30] })
  })

  it('tells apart two groupings of one column by their names', () => {
    const q = recordsQuery({ ...byMonth, breakouts: [{ field: 'passee_le', unit: 'year' }, { field: 'passee_le', unit: 'month' }] }, [
      { name: 'passee_le#2', value: '2026-03-01' },
    ])
    expect(q?.filters?.at(-1)).toEqual({ column: { field: 'passee_le' }, op: 'date', values: ['2026-03'] })
  })

  it('refuses what is not a grouping, a rank and a bin without width', () => {
    expect(recordsQuery(byMonth, [{ name: 'montant_total', value: 3 }])).toBeNull()
    expect(recordsQuery({ ...byMonth, breakouts: [{ field: 'passee_le', unit: 'day_of_week' }] }, [{ name: 'passee_le', value: 2 }])).toBeNull()
    expect(recordsQuery({ ...byMonth, breakouts: [{ field: 'passee_le', unit: 'hour' }] }, [{ name: 'passee_le', value: '2026-03-01 10:00:00' }])).toBeNull()
    expect(recordsQuery({ ...byMonth, breakouts: [{ field: 'montant_total', bin: 'auto' }] }, [{ name: 'montant_total', value: 20 }])).toBeNull()
  })

  it('keeps the columns and the column sorts of a list of rows', () => {
    const list: BuilderQuery = {
      kind: 'builder',
      source: { kind: 'table', id: 't-orders' },
      fields: [{ field: 'id' }, { field: 'statut' }],
      sort: [{ target: { kind: 'column', column: { field: 'id' } } }],
    }
    const q = recordsQuery(list, [{ name: 'statut', value: 'payée' }])
    expect(q?.fields).toEqual(list.fields)
    expect(q?.sort).toEqual(list.sort)
    expect(q?.filters).toEqual([{ column: { field: 'statut' }, op: 'is', values: ['payée'] }])
    expect(recordsQuery(list, [{ name: 'ville', value: 'Brest' }])).toBeNull()
  })

  it('adds the filters of the one metric a question measures', () => {
    const q = recordsQuery({ ...byMonth, aggregations: [{ fn: 'metric', metric: 'ca' }] }, [{ name: 'passee_le', value: '2026-03-01' }], [
      { column: { field: 'statut' }, op: 'is', values: ['livrée'] },
    ])
    expect(q?.filters?.at(-1)).toEqual({ column: { field: 'statut' }, op: 'is', values: ['livrée'] })
  })

  it('compiles to a list of the rows, joins and filters kept', () => {
    const ctx: CompileContext = {
      table: (id) =>
        id === 't-orders'
          ? { id, catalog: 'boutique', schema: 'public', name: 'commandes', label: 'Commandes', columns: [{ name: 'statut', type: 'varchar' }, { name: 'client_id', type: 'integer' }, { name: 'passee_le', type: 'timestamp(6)' }, { name: 'montant_total', type: 'decimal(12,2)' }] }
          : id === 't-clients'
            ? { id, catalog: 'boutique', schema: 'public', name: 'clients', label: 'Clients', columns: [{ name: 'id', type: 'integer' }, { name: 'ville', type: 'varchar' }] }
            : undefined,
      question: () => undefined,
      metric: () => undefined,
      today: '2026-10-03',
      allowSql: false,
    }
    const q = recordsQuery(byMonth, [{ name: 'passee_le', value: '2026-03-01' }, { name: 'client.ville', value: 'Rennes' }])
    const { sql } = compileBuilder(q as BuilderQuery, ctx)
    expect(sql).not.toContain('GROUP BY')
    expect(sql).toContain(`"client"."ville" = 'Rennes'`)
    expect(sql).toContain(`TIMESTAMP '2026-03-01 00:00:00'`)
  })
})
