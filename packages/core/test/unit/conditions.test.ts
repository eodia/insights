import { describe, expect, it } from 'vitest'
import {
  type DashboardCard,
  type DisplayCondition,
  DisplayConditionSchema,
  conditionAllowsRun,
  conditionCard,
  conditionHolds,
  filterRuleHolds,
  parseConditionCardId,
  savedConditionCard,
  truthy,
} from '@eodia/contracts'

const one: DisplayCondition = { match: 'all', rules: [{ kind: 'filter', parameter: 'statut', test: 'one' }] }
const sql = { kind: 'query' as const, sql: 'SELECT count(*) > 5000 FROM t WHERE {{statut}}', variables: [{ name: 'statut', label: 'statut', type: 'filter' as const, column: 'statut' }], mappings: [{ parameter: 'statut', target: { variable: 'statut' } }] }
const none = () => undefined

describe('display conditions', () => {
  it('reads a filter rule as Qlik’s GetSelectedCount', () => {
    const rule = { kind: 'filter' as const, parameter: 'statut', test: 'one' as const }
    expect(filterRuleHolds(rule, { statut: ['livrée'] })).toBe(true)
    expect(filterRuleHolds(rule, { statut: ['livrée', 'payée'] })).toBe(false)
    expect(filterRuleHolds(rule, { statut: null })).toBe(false)
    expect(filterRuleHolds({ ...rule, test: 'none' }, { statut: [] })).toBe(true)
    expect(filterRuleHolds({ ...rule, test: 'equals', value: 'payée' }, { statut: ['payée'] })).toBe(true)
    expect(filterRuleHolds({ ...rule, test: 'not_equals', value: 'payée' }, { statut: ['livrée'] })).toBe(true)
  })

  it('reads a query’s first value as yes or no', () => {
    expect([true, 1, '1', 'oui', 12.5].map(truthy)).toEqual([true, true, true, true, true])
    expect([false, 0, '0', 'false', '', null, undefined].map(truthy)).toEqual([false, false, false, false, false, false, false])
  })

  it('waits for what it does not know yet, and decides as soon as it can', () => {
    const both: DisplayCondition = { match: 'all', rules: [one.rules[0] as DisplayCondition['rules'][number], sql] }
    // A filter says no: hidden, without waiting for the query.
    expect(conditionHolds(both, { values: { statut: [] }, query: none })).toBe(false)
    // A filter says yes: the query decides.
    expect(conditionHolds(both, { values: { statut: ['payée'] }, query: none })).toBeUndefined()
    expect(conditionHolds(both, { values: { statut: ['payée'] }, query: () => true })).toBe(true)
    // « Au moins une » : one yes is enough.
    expect(conditionHolds({ ...both, match: 'any' }, { values: { statut: ['payée'] }, query: none })).toBe(true)
  })

  it('spares a card its query when a rule already says no — but runs it to count its rows', () => {
    expect(conditionAllowsRun(one, { values: { statut: [] }, query: none })).toBe(false)
    expect(conditionAllowsRun(one, { values: { statut: ['payée'] }, query: none })).toBe(true)
    const rows: DisplayCondition = { match: 'all', rules: [{ kind: 'rows', test: 'some' }] }
    expect(conditionAllowsRun(rows, { values: {}, query: none })).toBe(true)
    expect(conditionHolds(rows, { values: {}, query: none, rows: 0 })).toBe(false)
    expect(conditionHolds(rows, { values: {}, query: none, rows: 3 })).toBe(true)
    // A tab has no rows of its own: its `rows` rules are left out.
    expect(conditionHolds(rows, { values: {}, query: none, isTab: true })).toBe(true)
  })

  it('runs a query rule as a card the server finds back in the saved dashboard', () => {
    const card = conditionCard('big', 0, sql)
    expect(card.id).toBe('big~if0')
    expect(parseConditionCardId(card.id)).toEqual({ owner: 'big', index: 0 })
    expect(card.query).toEqual({ kind: 'sql', sql: sql.sql, variables: sql.variables })
    const saved = { tabs: [], cards: [{ id: 'big', tab: null, x: 0, y: 0, w: 6, h: 4, kind: 'question', condition: { match: 'all', rules: [sql] } } as DashboardCard] }
    expect(savedConditionCard(saved, card)).toBe(true)
    // A rule edited and not saved yet runs as a query of its own.
    expect(savedConditionCard(saved, conditionCard('big', 0, { ...sql, sql: 'SELECT true' }))).toBe(false)
  })

  it('refuses a condition out of shape', () => {
    expect(DisplayConditionSchema.safeParse(one).success).toBe(true)
    expect(DisplayConditionSchema.safeParse({ match: 'all', rules: [{ kind: 'filter', parameter: 'x', test: 'many' }] }).success).toBe(false)
    expect(DisplayConditionSchema.safeParse({ match: 'all', rules: Array.from({ length: 9 }, () => one.rules[0]) }).success).toBe(false)
  })
})
