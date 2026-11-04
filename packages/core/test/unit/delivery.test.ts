import { describe, expect, it } from 'vitest'
import { type Schedule, alertHolds, nextRun } from '@eodia/contracts'

const paris = (s: Omit<Schedule, 'timezone'>): Schedule => ({ ...s, timezone: 'Europe/Paris' })

describe('schedules', () => {
  it('says the next Monday at 8, Paris time, summer or winter', () => {
    // Wednesday 4 November 2026, 10:00 in Paris (UTC+1).
    const at = new Date('2026-11-04T09:00:00Z')
    expect(nextRun(paris({ frequency: 'weekly', hour: 8, minute: 0, weekdays: [1] }), at).toISOString()).toBe('2026-11-09T07:00:00.000Z')
    // In July, Paris is UTC+2.
    expect(nextRun(paris({ frequency: 'weekly', hour: 8, minute: 0, weekdays: [1] }), new Date('2026-07-01T09:00:00Z')).toISOString()).toBe('2026-07-06T06:00:00.000Z')
  })

  it('runs later the same day when the hour is still to come', () => {
    const at = new Date('2026-11-04T06:00:00Z') // 7:00 in Paris
    expect(nextRun(paris({ frequency: 'daily', hour: 8, minute: 30 }), at).toISOString()).toBe('2026-11-04T07:30:00.000Z')
    // At the very minute, the next one is tomorrow's.
    expect(nextRun(paris({ frequency: 'daily', hour: 8, minute: 30 }), new Date('2026-11-04T07:30:00Z')).toISOString()).toBe('2026-11-05T07:30:00.000Z')
  })

  it('skips the days a daily schedule leaves out', () => {
    // Friday 6 November 2026, 9:00 in Paris: working days only, the next is Monday.
    expect(nextRun(paris({ frequency: 'daily', hour: 8, minute: 0, weekdays: [1, 2, 3, 4, 5] }), new Date('2026-11-06T08:00:00Z')).toISOString()).toBe('2026-11-09T07:00:00.000Z')
  })

  it('takes the month’s day, or its last', () => {
    const at = new Date('2026-11-04T09:00:00Z')
    expect(nextRun(paris({ frequency: 'monthly', hour: 7, minute: 0, day: 1 }), at).toISOString()).toBe('2026-12-01T06:00:00.000Z')
    expect(nextRun(paris({ frequency: 'monthly', hour: 7, minute: 0, day: -1 }), at).toISOString()).toBe('2026-11-30T06:00:00.000Z')
  })

  it('crosses the change of time', () => {
    // 29 March 2026: Paris goes from UTC+1 to UTC+2 at 2:00.
    expect(nextRun(paris({ frequency: 'daily', hour: 8, minute: 0 }), new Date('2026-03-28T12:00:00Z')).toISOString()).toBe('2026-03-29T06:00:00.000Z')
  })

  it('counts quarters of an hour and hours', () => {
    expect(nextRun(paris({ frequency: 'quarter_hour', hour: 0, minute: 0 }), new Date('2026-11-04T09:07:20Z')).toISOString()).toBe('2026-11-04T09:15:00.000Z')
    expect(nextRun(paris({ frequency: 'hourly', hour: 0, minute: 5 }), new Date('2026-11-04T09:07:00Z')).toISOString()).toBe('2026-11-04T10:05:00.000Z')
  })
})

describe('alerts', () => {
  const columns = [
    { name: 'jour', label: 'Jour', role: 'dimension' as const, type: 'date' },
    { name: 'ca', label: 'CA', role: 'metric' as const, type: 'number' },
  ]
  const result = { columns, rows: [['2026-11-02', 12000], ['2026-11-03', 8000]] }

  it('reads the rows a question returns', () => {
    expect(alertHolds({ kind: 'rows', test: 'some' }, result)).toMatchObject({ holds: true, rows: 2 })
    expect(alertHolds({ kind: 'rows', test: 'none' }, { columns, rows: [] })).toMatchObject({ holds: true, rows: 0 })
  })

  it('compares the chosen value to the threshold', () => {
    expect(alertHolds({ kind: 'threshold', column: 'ca', read: 'last', op: 'lt', value: 10000 }, result)).toEqual({ holds: true, value: 8000, rows: 2 })
    expect(alertHolds({ kind: 'threshold', column: 'ca', read: 'first', op: 'lt', value: 10000 }, result)).toMatchObject({ holds: false, value: 12000 })
    expect(alertHolds({ kind: 'threshold', column: 'ca', read: 'sum', op: 'gte', value: 20000 }, result)).toMatchObject({ holds: true, value: 20000 })
  })

  it('holds nothing without the column or without rows', () => {
    expect(alertHolds({ kind: 'threshold', column: 'absent', read: 'first', op: 'gt', value: 0 }, result).holds).toBe(false)
    expect(alertHolds({ kind: 'threshold', column: 'ca', read: 'first', op: 'gt', value: 0 }, { columns, rows: [] }).holds).toBe(false)
  })
})
