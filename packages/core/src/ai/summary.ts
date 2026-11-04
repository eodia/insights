/**
 * The summary card: a few lines the assistant writes from a dashboard's cards — their results as
 * the reader sees them, the filters applied —, as the card's prompt asks.
 *
 * What it reads is bounded: a handful of cards, a few dozen rows each, a few thousand characters
 * in all. Every card runs as the reader, through the dashboard: the summary knows nothing they
 * could not see. Its text is kept a few minutes for the same filters, not paid for twice.
 */
import { createHash } from 'node:crypto'
import { type CardSummary, type DashboardCard, type ParameterValue, SUMMARY_LIMITS, parameterHasValue } from '@eodia/contracts'
import { getDashboard, getQuestion } from '../content/items'
import type { Actor, Core } from '../context'
import { AppError, invalid, notFound } from '../errors'
import { runCard } from '../query/run'
import { providerFor } from './providers'

const SYSTEM = `Tu rédiges le résumé d'un tableau de bord d'eodia insights, un outil de BI, pour les personnes qui le lisent.
On te donne la consigne de l'auteur du tableau, les filtres appliqués et les résultats de quelques cartes (en CSV, parfois tronqués).
Règles :
- Suis la consigne. Sans consigne de forme : trois à cinq phrases ou puces, les chiffres qui comptent, une tendance, un point d'attention.
- Ne cite que des chiffres présents dans les données ; arrondis-les comme un lecteur pressé (12,4 k€, 18 %). N'invente rien ; si les données ne suffisent pas, dis-le en une phrase.
- Markdown simple : **gras** pour les chiffres clés, des puces au besoin, pas de titre.
- Pas de préambule (« Voici le résumé… ») ni de conclusion générique.`

const ANSWER_IN: Readonly<Record<string, string>> = {
  fr: 'Écris en français.',
  en: 'Write in English.',
  es: 'Escribe en español.',
}

const KEPT_MS = 10 * 60_000
const kept = new Map<string, { text: string; at: string; until: number }>()

/** A cell as text in CSV: quoted when it must be. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export interface SummaryText {
  readonly text: string
  /** When it was written. */
  readonly at: string
}

/**
 * Writes the summary of a card of kind `summary`, the filters at `values`. An editor may send the
 * card as it is being set (`draft`): it is read, the dashboard being theirs to change.
 */
export async function summarizeCard(
  core: Core,
  actor: Actor,
  dashboardId: string,
  cardId: string,
  values: Readonly<Record<string, ParameterValue | null>>,
  opts: { locale?: string; draft?: DashboardCard; fresh?: boolean; locked?: Readonly<Record<string, ParameterValue | null>> } = {},
): Promise<SummaryText> {
  const provider = providerFor(core.config.ai)
  if (!provider) throw new AppError('AI_DISABLED', "L'assistant n'est pas configuré sur cette instance (clé de fournisseur absente).")
  const d = await getDashboard(core, actor, dashboardId)
  const saved = d.cards.find((c) => c.id === cardId)
  const card = opts.draft && opts.draft.id === cardId && d.access !== 'view' ? opts.draft : saved
  if (!card || card.kind !== 'summary' || !card.summary) throw notFound('Carte introuvable.')
  const summary: CardSummary = card.summary
  if (!summary.prompt.trim() && !summary.cards.length) throw invalid('Donnez une consigne et choisissez les cartes à résumer.')
  const merged = { ...values, ...(opts.locked ?? {}) }

  const key = createHash('sha256')
    .update(JSON.stringify([d.id, d.updated_at, card, merged, opts.locale ?? 'fr', actor.userId]))
    .digest('hex')
  const hit = kept.get(key)
  if (hit && hit.until > Date.now() && !opts.fresh) return { text: hit.text, at: hit.at }

  // The filters as the reader reads them.
  const filters = d.parameters
    .filter((p) => parameterHasValue(merged[p.id]))
    .map((p) => `- ${p.label || p.id} : ${JSON.stringify(merged[p.id])}`)
    .join('\n')

  // Each card as CSV, a few rows: what the summary reads.
  let budget: number = SUMMARY_LIMITS.chars
  const blocks: string[] = []
  for (const id of summary.cards.slice(0, SUMMARY_LIMITS.cards)) {
    const source = d.cards.find((c) => c.id === id && c.kind === 'question')
    if (!source || budget <= 0) continue
    const title = source.title || (source.question ? await getQuestion(core, actor, source.question).then((q) => q.name).catch(() => '') : '') || 'Carte'
    try {
      const result = await runCard(core, actor, d.id, id, merged, { origin: 'card', ...(opts.locked ? { locked: opts.locked } : {}) })
      const columns = result.columns.filter((c) => !c.hidden)
      const index = columns.map((c) => result.columns.indexOf(c))
      const rows = result.rows.slice(0, SUMMARY_LIMITS.rows)
      let csv = [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => index.map((i) => cell(r[i])).join(','))].join('\n')
      if (csv.length > budget) csv = `${csv.slice(0, budget)}\n…`
      budget -= csv.length
      const more = result.rows.length > rows.length ? ` (${rows.length} premières lignes sur ${result.rows.length})` : ''
      blocks.push(`### ${title}${more}\n\`\`\`csv\n${csv}\n\`\`\``)
    } catch (err) {
      // A card the reader may not read stays out, said so.
      blocks.push(`### ${title}\n(illisible : ${err instanceof Error ? err.message : String(err)})`)
    }
  }

  const message = [
    `Consigne : ${summary.prompt.trim() || 'Résume ce que montrent ces cartes.'}`,
    `Tableau de bord : ${d.name}${d.description ? ` — ${d.description}` : ''}`,
    filters ? `Filtres appliqués :\n${filters}` : 'Aucun filtre appliqué.',
    blocks.length ? `Données :\n\n${blocks.join('\n\n')}` : 'Aucune carte choisie : réponds à la consigne sans données, ou dis qu’il en faut.',
    ANSWER_IN[opts.locale ?? 'fr'] ?? ANSWER_IN.fr,
  ].join('\n\n')

  const started = Date.now()
  let usage = { input: 0, output: 0 }
  let error: string | null = null
  try {
    const turn = await provider.turn({ system: SYSTEM, tools: [], messages: [{ role: 'user', content: message }], onText: () => undefined })
    usage = turn.usage
    const text = turn.content
      .flatMap((b) => (b.type === 'text' ? [b.text] : []))
      .join('')
      .trim()
    const at = new Date().toISOString()
    for (const [k, v] of kept) if (v.until < Date.now()) kept.delete(k)
    if (kept.size < 500) kept.set(key, { text, at, until: Date.now() + KEPT_MS })
    return { text, at }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    throw err
  } finally {
    await core.db
      .exec(
        'INSERT INTO ai_call (user_id, provider, model, context_kind, input_tokens, output_tokens, tools, duration_ms, error) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [actor.userId, provider.name, provider.model, 'summary', usage.input, usage.output, [], Date.now() - started, error],
      )
      .catch(() => undefined)
  }
}
