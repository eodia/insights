/**
 * « Pourquoi ça bouge ? » — what explains the change of a figure between two periods.
 *
 * The figure is a card's built query (its source, its filters, the dashboard's, its first
 * measure). For each column of categories of its table — a region, a channel, a status — the
 * measure is read per value over both periods: each value's change, and its share of the whole
 * change. The columns whose values explain most come first; the AI, when there is one, writes the
 * conclusion. Every query runs in Trino under the person's identity: what they may not read does
 * not explain anything to them.
 */
import {
  type BuilderQuery,
  type ColumnMeta,
  type Constraint,
  type ExplainResult,
  type ResultColumn,
  type TemporalUnit,
  applyConstraints,
  kindOfTrinoType,
  resolveDateExpression,
} from '@eodia/contracts'
import { providerFor } from '../ai/providers'
import type { Actor, Core } from '../context'
import { invalid } from '../errors'
import { getTable } from '../sources/metadata'
import { runQuery } from './run'

export interface ExplainInput {
  readonly query: BuilderQuery
  readonly constraints?: readonly Constraint[]
  /** The date the figure moves along, and its grain. */
  readonly time: { readonly field: string; readonly join?: string; readonly unit: TemporalUnit }
  /** The two periods, as date expressions (`2026-05`, `2026-06`), and as they are read. */
  readonly previous: string
  readonly current: string
  readonly labels: { readonly previous: string; readonly current: string }
  readonly locale?: string
}

const CATEGORY_SEMANTICS = ['category', 'status', 'country', 'region', 'city']
const MAX_DIMENSIONS = 6
const SHOWN = 5

const num = (v: unknown) => (typeof v === 'number' ? v : v === null || v === undefined || v === '' ? 0 : Number(v)) || 0
const day = (v: unknown) => String(v ?? '').slice(0, 10)

export async function explainChange(core: Core, actor: Actor, input: ExplainInput): Promise<ExplainResult> {
  const base = input.constraints?.length ? applyConstraints(input.query, input.constraints) : input.query
  const measure = base.aggregations?.[0]
  if (!measure) throw invalid('Cette carte ne calcule rien à expliquer : il lui faut une mesure (somme, nombre…).')
  const today = new Date().toISOString().slice(0, 10)
  const p = resolveDateExpression(input.previous, today)
  const c = resolveDateExpression(input.current, today)
  if (!p?.start || !p.end || !c?.start || !c.end) throw invalid('Ces périodes ne se lisent pas.')
  const prev = { start: p.start, end: p.end }
  const cur = { start: c.start, end: c.end }
  const timeRef = { field: input.time.field, ...(input.time.join ? { join: input.time.join } : {}) }
  const span = { column: timeRef, op: 'date' as const, values: [`${prev.start}~${cur.end}`] }
  const inPrev = (d: string) => d >= prev.start && d <= prev.end
  const inCur = (d: string) => d >= cur.start && d <= cur.end
  const shape = (extra: { field: string; join?: string }[]): BuilderQuery => {
    const { sort: _s, limit: _l, fields: _f, ...rest } = base
    return { ...rest, filters: [...(base.filters ?? []), span], aggregations: [measure], breakouts: [{ ...timeRef, unit: input.time.unit }, ...extra], limit: 5000 }
  }
  const run = (query: BuilderQuery) => runQuery(core, actor, { query, origin: 'editor', adhoc: true })

  // The figure itself, over both periods.
  const total = await run(shape([]))
  let before = 0
  let after = 0
  for (const r of total.rows) {
    const d = day(r[0])
    if (inPrev(d)) before += num(r[1])
    else if (inCur(d)) after += num(r[1])
  }
  const change = after - before
  const measureColumn = total.columns[1] as ResultColumn

  // The columns that may explain it: the categories of its table, not those it is already cut to one value of.
  const pinned = new Set((base.filters ?? []).flatMap((f) => ('column' in f && f.op === 'is' && f.values.length === 1 && !f.column.join ? [f.column.field] : [])))
  const dims: ColumnMeta[] = []
  if (base.source.kind === 'table') {
    const table = (await getTable(core, actor, base.source.id)) as unknown as { columns?: ColumnMeta[] }
    for (const c of table.columns ?? []) {
      if (dims.length >= MAX_DIMENSIONS) break
      if (c.visibility !== 'normal' || c.pk || c.fk || pinned.has(c.name) || c.name === input.time.field) continue
      if (kindOfTrinoType(c.type) !== 'text') continue
      if (!c.has_values && !CATEGORY_SEMANTICS.includes(c.semantic ?? '')) continue
      dims.push(c)
    }
  }

  const dimensions = (
    await Promise.all(
      dims.map(async (c) => {
        const r = await run(shape([{ field: c.name }])).catch(() => null)
        if (!r) return null
        const by = new Map<string, { prev: number; cur: number }>()
        for (const row of r.rows) {
          const d = day(row[0])
          const key = row[1] === null || row[1] === undefined ? '' : String(row[1])
          const e = by.get(key) ?? { prev: 0, cur: 0 }
          if (inPrev(d)) e.prev += num(row[2])
          else if (inCur(d)) e.cur += num(row[2])
          by.set(key, e)
        }
        const contributors = [...by.entries()]
          .map(([value, e]) => ({ value, previous: e.prev, current: e.cur, change: e.cur - e.prev, share: change !== 0 ? (e.cur - e.prev) / change : 0 }))
          .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
        // How well the column explains: the share of the change its first value carries, in its direction.
        const score = change !== 0 ? Math.max(0, ...contributors.slice(0, 1).map((x) => x.share)) : 0
        return { column: { name: c.name, label: c.label || c.name }, score, contributors: contributors.slice(0, SHOWN), others: Math.max(0, contributors.length - SHOWN) }
      }),
    )
  )
    .filter((d): d is NonNullable<typeof d> => d !== null && d.contributors.length > 1)
    .sort((a, b) => b.score - a.score)

  const result: Omit<ExplainResult, 'summary' | 'ai'> = {
    measure: measureColumn,
    labels: input.labels,
    previous: before,
    current: after,
    change,
    ratio: before !== 0 ? change / Math.abs(before) : null,
    dimensions,
  }
  const written = await conclude(core, actor, result, input.locale ?? 'fr').catch(() => null)
  return { ...result, summary: written ?? plainSummary(result), ai: written !== null }
}

const fmt = (n: number, locale: string) => new Intl.NumberFormat(locale, { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 }).format(n)
const pct = (n: number, locale: string) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(n)

/** The conclusion without the AI: the change, and where most of it comes from. */
function plainSummary(r: Omit<ExplainResult, 'summary' | 'ai'>): string {
  const label = r.measure.label || r.measure.name
  if (r.change === 0) return `${label} ne bouge pas entre ${r.labels.previous} et ${r.labels.current}.`
  const way = r.change < 0 ? 'baisse' : 'hausse'
  const head = `${label} : ${way} de ${fmt(Math.abs(r.change), 'fr')}${r.ratio !== null ? ` (${pct(Math.abs(r.ratio), 'fr')})` : ''} entre ${r.labels.previous} et ${r.labels.current}.`
  const top = r.dimensions[0]?.contributors[0]
  const dim = r.dimensions[0]
  if (!top || !dim) return head
  return `${head} L’essentiel vient de ${dim.column.label} « ${top.value || '(vide)'} » (${top.change > 0 ? '+' : '−'}${fmt(Math.abs(top.change), 'fr')}, ${pct(Math.max(0, top.share), 'fr')} de l’écart).`
}

const SYSTEM = `Tu expliques à un lecteur de tableau de bord pourquoi un chiffre a bougé entre deux périodes, à partir d'une décomposition déjà calculée (par colonne, la variation de chaque valeur et sa part de l'écart total).
Règles : deux phrases au plus, concrètes ; cite le ou les deux facteurs principaux avec leurs chiffres arrondis (12,4 k, 18 %) ; ne cite que des chiffres fournis ; si rien ne se détache, dis que la variation est diffuse. Pas de préambule, pas de titre, pas de liste.`

const ANSWER_IN: Readonly<Record<string, string>> = { fr: 'Écris en français.', en: 'Write in English.', es: 'Escribe en español.' }

/** The conclusion written by the AI, when one is set — null otherwise. */
async function conclude(core: Core, actor: Actor, r: Omit<ExplainResult, 'summary' | 'ai'>, locale: string): Promise<string | null> {
  const provider = providerFor(core.config.ai)
  if (!provider) return null
  const lines = [
    `Mesure : ${r.measure.label || r.measure.name}`,
    `${r.labels.previous} : ${fmt(r.previous, 'fr')} ; ${r.labels.current} : ${fmt(r.current, 'fr')} ; écart : ${fmt(r.change, 'fr')}${r.ratio !== null ? ` (${pct(r.ratio, 'fr')})` : ''}`,
    ...r.dimensions.slice(0, 3).map(
      (d) => `Par ${d.column.label} : ${d.contributors.map((c) => `« ${c.value || '(vide)'} » ${c.change >= 0 ? '+' : ''}${fmt(c.change, 'fr')} (${pct(c.share, 'fr')} de l'écart)`).join(' ; ')}`,
    ),
    ANSWER_IN[locale] ?? ANSWER_IN.fr,
  ]
  const started = Date.now()
  let usage = { input: 0, output: 0 }
  let error: string | null = null
  try {
    const turn = await provider.turn({ system: SYSTEM, tools: [], messages: [{ role: 'user', content: lines.join('\n') }], onText: () => undefined })
    usage = turn.usage
    const text = turn.content
      .flatMap((b) => (b.type === 'text' ? [b.text] : []))
      .join('')
      .trim()
    return text || null
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    return null
  } finally {
    await core.db
      .exec(
        'INSERT INTO ai_call (user_id, provider, model, context_kind, input_tokens, output_tokens, tools, duration_ms, error) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [actor.userId, provider.name, provider.model, 'explain', usage.input, usage.output, [], Date.now() - started, error],
      )
      .catch(() => undefined)
  }
}
