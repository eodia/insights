import { describe, expect, it } from 'vitest'
import { type BuilderQuery, type QueryResult, comparedQuery, mergeCompared } from '@eodia/contracts'

const query: BuilderQuery = {
  kind: 'builder',
  source: { kind: 'table', id: 't' },
  aggregations: [{ fn: 'count' }],
  breakouts: [{ field: 'passee_le', unit: 'month' }],
  filters: [{ column: { field: 'passee_le' }, op: 'date', values: ['2026-01-01~2026-03-31'] }],
}
const TODAY = '2026-11-04'

describe('comparing periods', () => {
  it('moves the date filters back a year', () => {
    const c = comparedQuery(query, [], 'previous_year', TODAY)
    expect(c?.shift).toEqual({ months: 12 })
    expect(c?.query.filters?.[0]).toMatchObject({ op: 'date', values: ['2025-01-01~2025-03-31'] })
  })

  it('moves them back by the period itself: whole months by months, other spans by days', () => {
    expect(comparedQuery(query, [], 'previous_period', TODAY)?.query.filters?.[0]).toMatchObject({ values: ['2025-10-01~2025-12-31'] })
    const week = { ...query, filters: [{ column: { field: 'passee_le' }, op: 'date' as const, values: ['2026-03-02~2026-03-08'] }] }
    const c = comparedQuery(week, [], 'previous_period', TODAY)
    expect(c?.shift).toEqual({ days: 7 })
    expect(c?.query.filters?.[0]).toMatchObject({ values: ['2026-02-23~2026-03-01'] })
  })

  it('moves a dashboard’s date filter too, and gives up on an unbounded previous period', () => {
    const bare = { ...query, filters: [] }
    const c = comparedQuery(bare, [{ target: { column: { field: 'passee_le' } }, type: 'date', value: 'thisyear' }], 'previous_year', TODAY)
    expect(c?.constraints[0]?.value).toBe('2025-01-01~2025-12-31')
    expect(comparedQuery(bare, [], 'previous_period', TODAY)).toBeNull()
  })

  it('sets the past beside the present, at the same groupings', () => {
    const columns = [
      { name: 'passee_le', label: 'Mois', role: 'dimension' as const, type: 'date', unit: 'month' as const },
      { name: 'count', label: 'Commandes', role: 'metric' as const, type: 'number' },
    ]
    const current: QueryResult = { columns, rows: [['2026-01-01', 120], ['2026-02-01', 90]], truncated: false, duration_ms: 1 }
    const previous: QueryResult = { columns, rows: [['2025-01-01', 100], ['2025-03-01', 70]], truncated: false, duration_ms: 1 }
    const merged = mergeCompared(current, previous, { months: 12 }, 'N-1')
    expect(merged.columns.at(-1)).toMatchObject({ name: 'count__compared', compared: { of: 'count' } })
    expect(merged.rows).toEqual([
      ['2026-01-01', 120, 100],
      ['2026-02-01', 90, null],
    ])
  })
})
