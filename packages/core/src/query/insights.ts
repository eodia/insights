/**
 * The home page's own exploration: in the tables the reader may query, the figures worth
 * watching — an amount summed, rows counted, a score averaged — month by month over the
 * twelve complete months that have data. Each one is an ordinary builder query run by
 * `runQuery` under the reader's identity: Trino applies their rights, the cache serves the
 * next visit.
 */
import type { BuilderQuery, ColumnMeta, HomeInsight, SemanticType, TableMeta } from '@eodia/contracts'
import type { Actor, Core } from '../context'
import { listTables } from '../sources/metadata'
import { runQuery } from './run'

const MONTHS = 12
/** Queries run at most for one home page. */
const TRIED = 8
const KEPT = 6

const TEMPORAL = /^(date|timestamp)/
const NUMERIC = /^(tinyint|smallint|integer|int|bigint|real|double|decimal)/
/** The dates a table's life is read by, the most telling first. */
const DATE_RANK: readonly (SemanticType | null)[] = ['created_at', 'event_at', null]
/** What adds up month after month… */
const SUMMED: readonly SemanticType[] = ['amount', 'quantity']
/** …and what only means something on average: a score first, then a price, a cost or a duration. */
const AVERAGED: readonly SemanticType[] = ['rating', 'score', 'percentage', 'price', 'cost', 'duration']

interface Candidate {
  readonly table: TableMeta
  readonly date: ColumnMeta
  readonly fn: HomeInsight['fn']
  readonly column: ColumnMeta | null
  readonly score: number
}

const shown = (c: ColumnMeta) => c.visibility === 'normal' && c.status === 'active'

function dateOf(t: TableMeta): ColumnMeta | undefined {
  const dates = (t.columns ?? []).filter((c) => shown(c) && TEMPORAL.test(c.type) && DATE_RANK.includes(c.semantic))
  return dates.sort((a, b) => DATE_RANK.indexOf(a.semantic) - DATE_RANK.indexOf(b.semantic))[0]
}

function candidates(tables: readonly TableMeta[]): Candidate[] {
  const out: Candidate[] = []
  for (const table of tables) {
    if (table.visibility !== 'normal' || table.status !== 'active' || table.row_count === 0) continue
    const date = dateOf(table)
    if (!date) continue
    const size = Math.log10((table.row_count ?? 10) + 1) / 10
    const measures = (table.columns ?? []).filter((c) => shown(c) && !c.pk && !c.fk && NUMERIC.test(c.type) && c.semantic)
    const summed = measures.filter((c) => SUMMED.includes(c.semantic as SemanticType)).sort((a, b) => SUMMED.indexOf(a.semantic as SemanticType) - SUMMED.indexOf(b.semantic as SemanticType))[0]
    const averaged = measures.filter((c) => AVERAGED.includes(c.semantic as SemanticType)).sort((a, b) => AVERAGED.indexOf(a.semantic as SemanticType) - AVERAGED.indexOf(b.semantic as SemanticType))[0]
    if (summed) out.push({ table, date, fn: 'sum', column: summed, score: (summed.semantic === 'amount' ? 3 : 2) + size })
    if (averaged) out.push({ table, date, fn: 'avg', column: averaged, score: (AVERAGED.indexOf(averaged.semantic as SemanticType) < 3 ? 2 : 1.2) + size })
    out.push({ table, date, fn: 'count', column: null, score: 1.5 + size })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, TRIED)
}

function queryOf(c: Candidate): BuilderQuery {
  const field = c.column ? { field: c.column.name } : undefined
  return {
    kind: 'builder',
    source: { kind: 'table', id: c.table.id },
    // The month under way is not over: it would always look like a fall.
    filters: [{ column: { field: c.date.name }, op: 'date', values: ['before:thismonth'] }],
    aggregations: c.fn === 'count' ? [{ fn: 'count' }] : c.fn === 'avg' && field ? [{ fn: 'avg', column: field }, { fn: 'count' }] : field ? [{ fn: 'sum', column: field }] : [{ fn: 'count' }],
    breakouts: [{ field: c.date.name, unit: 'month' }],
    sort: [{ target: { kind: 'breakout', index: 0 }, desc: true }],
    limit: MONTHS,
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN
  return Number.isFinite(n) ? n : null
}

async function explore(core: Core, actor: Actor, c: Candidate): Promise<HomeInsight | null> {
  const query = queryOf(c)
  const res = await runQuery(core, actor, { query, origin: 'home', adhoc: true, limit: MONTHS })
  const [period, measure] = res.columns
  if (!period || !measure) return null
  const rows = [...res.rows].reverse()
  const points = rows.map((r) => ({ period: r[0], value: num(r[1]) ?? 0 }))
  if (points.length < 2 || points.every((p) => p.value === 0)) return null
  let value: number
  if (c.fn === 'avg') {
    let weight = 0
    let total = 0
    for (const r of rows) {
      const avg = num(r[1])
      const n = num(r[2]) ?? 0
      if (avg === null) continue
      total += avg * n
      weight += n
    }
    if (weight === 0) return null
    value = total / weight
  } else value = points.reduce((s, p) => s + p.value, 0)
  const last = points[points.length - 1]?.value ?? 0
  const before = points[points.length - 2]?.value ?? 0
  return {
    id: `${c.table.id}:${c.fn}:${c.column?.name ?? ''}`,
    table: { id: c.table.id, label: c.table.label, qualified: c.table.qualified },
    fn: c.fn,
    column: c.column ? { name: c.column.name, label: c.column.label } : null,
    value,
    delta: before === 0 ? null : (last - before) / Math.abs(before),
    points,
    value_column: measure,
    period_column: period,
    query,
    sql: res.sql,
  }
}

export async function homeInsights(core: Core, actor: Actor): Promise<HomeInsight[]> {
  const tables = await listTables(core, actor, { withColumns: true })
  const found = await Promise.allSettled(candidates(tables).map((c) => explore(core, actor, c)))
  const kept: HomeInsight[] = []
  const perTable = new Map<string, number>()
  for (const f of found) {
    if (f.status !== 'fulfilled' || !f.value) continue
    const n = perTable.get(f.value.table.id) ?? 0
    // No more than two figures of the same table: the page shows the base, not one table.
    if (n >= 2) continue
    perTable.set(f.value.table.id, n + 1)
    kept.push(f.value)
    if (kept.length === KEPT) break
  }
  return kept
}
