/**
 * How the queries fare: the costliest of a period — a question's runs together, or the same SQL
 * run again —, and the assistant's advice on one, read off Trino's plan.
 */
import type { PerformanceReport, QueryAdvice } from '@eodia/contracts'
import { isAdmin } from '../access/decide'
import { providerFor } from '../ai/providers'
import { type Actor, type Core, principalOf } from '../context'
import { AppError, invalid } from '../errors'

/** A run past this is slow: the time a reader stops waiting and starts wondering. */
export const SLOW_MS = 5000

export async function performance(core: Core, actor: Actor, opts: { days?: number; all?: boolean } = {}): Promise<PerformanceReport> {
  const days = Math.min(Math.max(Math.round(opts.days ?? 7), 1), 90)
  const snap = await core.snapshot()
  // A space's administrators see everyone's; a person, their own.
  const everyone = !!opts.all && isAdmin(snap, principalOf(actor))
  const params: unknown[] = [actor.workspaceId, days]
  if (!everyone) params.push(actor.userId)
  const scope = `workspace_id = $1 AND at > now() - make_interval(days => $2::int)${everyone ? '' : ' AND user_id = $3'}`
  const totals = await core.db.one<{ runs: number; cached: number; errors: number; avg_ms: number | null; p95_ms: number | null; slow: number }>(
    `SELECT count(*)::int AS runs,
            count(*) FILTER (WHERE cached)::int AS cached,
            count(*) FILTER (WHERE error IS NOT NULL)::int AS errors,
            avg(duration_ms) FILTER (WHERE NOT cached)::float AS avg_ms,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE NOT cached)::float AS p95_ms,
            count(*) FILTER (WHERE NOT cached AND duration_ms >= ${SLOW_MS})::int AS slow
       FROM query_execution WHERE ${scope}`,
    params,
  )
  const rows = await core.db.many<{
    key: string
    question_id: string | null
    question_name: string | null
    sql: string
    runs: number
    cached: number
    errors: number
    avg_ms: number | null
    p95_ms: number | null
    max_ms: number | null
    total_ms: number | null
    last_at: Date
  }>(
    `SELECT g.*, q.name AS question_name FROM (
       SELECT COALESCE(question_id::text, md5(sql)) AS key,
              (array_agg(question_id))[1] AS question_id,
              (array_agg(sql ORDER BY at DESC))[1] AS sql,
              count(*)::int AS runs,
              count(*) FILTER (WHERE cached)::int AS cached,
              count(*) FILTER (WHERE error IS NOT NULL)::int AS errors,
              avg(duration_ms) FILTER (WHERE NOT cached)::float AS avg_ms,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE NOT cached)::float AS p95_ms,
              max(duration_ms) FILTER (WHERE NOT cached)::int AS max_ms,
              sum(duration_ms) FILTER (WHERE NOT cached)::float AS total_ms,
              max(at) AS last_at
         FROM query_execution WHERE ${scope}
        GROUP BY 1
     ) g LEFT JOIN question q ON q.id = g.question_id
     ORDER BY g.total_ms DESC NULLS LAST, g.runs DESC
     LIMIT 60`,
    params,
  )
  return {
    days,
    runs: totals?.runs ?? 0,
    cached: totals?.cached ?? 0,
    errors: totals?.errors ?? 0,
    avg_ms: Math.round(totals?.avg_ms ?? 0),
    p95_ms: Math.round(totals?.p95_ms ?? 0),
    slow: totals?.slow ?? 0,
    slow_ms: SLOW_MS,
    queries: rows.map((r) => ({
      key: r.key,
      question: r.question_id && r.question_name ? { id: r.question_id, name: r.question_name } : null,
      sql: r.sql,
      runs: r.runs,
      cached: r.cached,
      errors: r.errors,
      avg_ms: Math.round(r.avg_ms ?? 0),
      p95_ms: Math.round(r.p95_ms ?? 0),
      max_ms: r.max_ms ?? 0,
      total_ms: Math.round(r.total_ms ?? 0),
      last_at: r.last_at.toISOString(),
    })),
  }
}

const ADVICE_SYSTEM = `Tu es l'expert des performances de Trino au sein d'eodia insights, un outil de BI où toute requête passe par Trino (connecteurs PostgreSQL, MySQL, SQL Server, Oracle, Snowflake, MongoDB, Iceberg…).
On te donne une requête SQL Trino, son plan (EXPLAIN, estimations) et ses temps mesurés. Réponds en français, en Markdown, brièvement :

## Diagnostic
Deux ou trois phrases : ce qui coûte, d'après le plan (scans complets, jointures, agrégations, échanges entre nœuds, filtres non poussés à la source…).

## Actions
Une liste numérotée, de la plus rentable à la moins, chacune concrète et applicable : filtrer plus tôt ou sur une colonne de partition, ne lire que les colonnes utiles, filtres poussés à la source (types compatibles, pas de fonction sur la colonne filtrée), ordre et type des jointures, approx_distinct et consorts, index ou partitionnement côté source, table Iceberg ou vue matérialisée pour un calcul répété, cache des résultats d'insights (durée de cache de la question ou du tableau de bord), préchargement d'un tableau de bord.
N'invente rien que le plan ou la requête ne montre pas ; dis-le quand la requête est déjà raisonnable.

## Requête réécrite
Seulement si une réécriture aide : la requête complète dans un bloc \`\`\`sql, même résultat, mêmes colonnes. Sinon, omets cette section.`

/** A query the plan may be asked of: one statement that reads. */
function readOnly(sql: string): string {
  const body = sql.trim().replace(/;\s*$/, '')
  const bare = body.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, ' ').trim()
  if (!/^(select|with|values|table|\()/i.test(bare) || body.includes(';')) throw invalid('Seule une requête de lecture (SELECT, WITH…) peut être analysée.')
  return body
}

/**
 * The assistant's advice on a query: its plan read by Trino under the person's own name — what
 * they cannot read, they cannot have analysed —, its times from the history, then the advice.
 */
/** The language the advice is written in: the reader's. */
const ANSWER_IN: Readonly<Record<string, string>> = {
  fr: 'Réponds en français.',
  en: 'Answer in English, headings included (Diagnosis, Actions, Rewritten query).',
  es: 'Responde en español, títulos incluidos (Diagnóstico, Acciones, Consulta reescrita).',
}

export async function adviseQuery(core: Core, actor: Actor, sql: string, locale = 'fr'): Promise<QueryAdvice> {
  const provider = providerFor(core.config.ai)
  if (!provider) throw new AppError('AI_DISABLED', "L'assistant n'est pas configuré sur cette instance (clé de fournisseur absente).")
  const body = readOnly(sql)
  let plan: string | null = null
  let planError: string | null = null
  try {
    const res = await core.engine.run(`EXPLAIN ${body}`, { user: principalOf(actor), timeoutMs: 60_000 })
    plan = res.data.map((r) => String(r[0] ?? '')).join('\n')
  } catch (err) {
    planError = err instanceof Error ? err.message : String(err)
    if (/access denied|permission|not allowed|cannot (select|access)/i.test(planError)) throw new AppError('DATA_ACCESS_DENIED', 'Vous ne pouvez pas lire toutes les tables de cette requête : elle ne peut pas être analysée.')
  }
  const stats = await core.db.one<{ runs: number; avg_ms: number | null; max_ms: number | null; rows: number | null }>(
    `SELECT count(*)::int AS runs, avg(duration_ms) FILTER (WHERE NOT cached)::float AS avg_ms, max(duration_ms)::int AS max_ms, max(row_count)::int AS rows
       FROM query_execution WHERE workspace_id = $1 AND md5(sql) = md5($2) AND at > now() - interval '30 days'`,
    [actor.workspaceId, body],
  )
  const measured = stats?.runs
    ? `Exécutée ${stats.runs} fois en 30 jours : ${Math.round(stats.avg_ms ?? 0)} ms en moyenne, ${stats.max_ms ?? 0} ms au plus, jusqu'à ${stats.rows ?? '?'} lignes.`
    : 'Pas encore de mesure dans l’historique.'
  // The plan is long on big queries: its head says the most.
  const shownPlan = plan ? (plan.length > 24_000 ? `${plan.slice(0, 24_000)}\n…` : plan) : `(plan indisponible : ${planError ?? 'inconnu'})`
  const started = Date.now()
  let error: string | null = null
  let usage = { input: 0, output: 0 }
  try {
    const turn = await provider.turn({
      system: ADVICE_SYSTEM,
      tools: [],
      messages: [{ role: 'user', content: `Requête :\n\`\`\`sql\n${body}\n\`\`\`\n\nTemps : ${measured}\n\nPlan :\n\`\`\`\n${shownPlan}\n\`\`\`\n\n${ANSWER_IN[locale] ?? ANSWER_IN.fr}` }],
      onText: () => undefined,
    })
    usage = turn.usage
    const advice = turn.content
      .flatMap((b) => (b.type === 'text' ? [b.text] : []))
      .join('')
      .trim()
    return { advice: advice || 'Aucun conseil : la requête semble déjà raisonnable.', plan }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    throw err
  } finally {
    await core.db
      .exec(
        'INSERT INTO ai_call (user_id, provider, model, context_kind, input_tokens, output_tokens, tools, duration_ms, error) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [actor.userId, provider.name, provider.model, 'performance', usage.input, usage.output, [], Date.now() - started, error],
      )
      .catch(() => undefined)
  }
}
