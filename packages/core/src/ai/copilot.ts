/**
 * Le copilot : un seul panneau, un contexte qui dépend de l'écran (éditeur SQL, question,
 * tableau de bord, Structure). Principe BaseDB conservé : le modèle **propose**, la personne
 * **applique** — aucun outil n'écrit quoi que ce soit. La sécurité réelle reste celle de Trino :
 * `run_query` s'exécute sous l'identité de la personne, colonnes masquées comprises.
 */
import {
  type QueryResult,
  QuestionQuerySchema,
  SEMANTIC_LABELS,
  SEMANTIC_TYPES,
  VISUALIZATIONS,
} from '@eodia/contracts'
import { z } from 'zod'
import { audit } from '../audit'
import type { Actor, Core } from '../context'
import { listByType, metricDefinition } from '../content/items'
import { AppError } from '../errors'
import { runQuery } from '../query/run'
import { getTable, listRelations, listTables } from '../sources/metadata'
import { type ContentBlock, type MessageParam, type ToolSpec, providerFor } from './providers'

export type CopilotContext =
  | { readonly kind: 'general' }
  | { readonly kind: 'sql'; readonly sql?: string; readonly error?: string }
  | { readonly kind: 'question'; readonly id?: string; readonly query?: unknown }
  | { readonly kind: 'dashboard'; readonly id: string }
  | { readonly kind: 'structure'; readonly table: string }

export type CopilotEvent =
  | { type: 'conversation'; id: string }
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; ok: boolean; summary: string }
  | { type: 'proposal'; proposal: Proposal }
  | { type: 'done' }
  | { type: 'error'; message: string }

export type Proposal =
  | { id: string; kind: 'question'; name: string; description?: string; query: unknown; visualization: unknown }
  | { id: string; kind: 'dashboard'; dashboard?: string; name: string; cards: unknown[]; parameters?: unknown[] }
  | { id: string; kind: 'metadata'; table: string; patch: unknown; columns: unknown[] }

const MAX_STEPS = 12
const ROWS_SHOWN = 40

const SYSTEM = `Tu es le copilot d'eodia insights, un outil de BI open source. Tu aides des personnes à explorer leurs données, écrire du SQL, construire des questions et des tableaux de bord, et décrire la structure de leurs bases.

Moteur : toutes les requêtes passent par Trino. Écris du Trino SQL (ANSI), en citant les tables par leur nom complet "catalogue"."schéma"."table" tel que les outils le donnent. Fonctions utiles : date_trunc('month', x), date_add, date_diff, approx_distinct, approx_percentile, format_datetime, CAST(x AS date). Pas de point-virgule final.

Règles :
- Commence par chercher les tables (search_schema) puis lis leur description (describe_table) avant d'écrire une requête : n'invente jamais un nom de table ou de colonne.
- Les descriptions, types sémantiques et valeurs fournis par l'équipe font foi : appuie-toi dessus (unités, statuts, montants).
- Tu ne modifies rien toi-même. Pour créer une question, un tableau de bord ou décrire une table, utilise les outils propose_* : la personne verra la proposition et décidera de l'appliquer.
- run_query n'est disponible que si la personne y a consenti ; il lit sous ses propres droits. Garde les requêtes légères (agrégats, LIMIT).
- Pour une proposition de question, valide d'abord ton SQL avec run_query quand c'est permis.
- Réponds en français, de façon concise et concrète. Formate le SQL dans des blocs \`\`\`sql.
- Visualisations disponibles : ${VISUALIZATIONS.join(', ')}. Choisis « line » ou « area » pour une évolution dans le temps, « bar »/« row » pour comparer des catégories, « scalar » pour un seul chiffre, « pie » pour une répartition de moins de 8 parts, « table » sinon.`

const TOOLS: readonly ToolSpec[] = [
  {
    name: 'search_schema',
    description: "Cherche des tables, modèles et métriques par mots-clés (nom, libellé, description, colonnes). Renvoie leurs identifiants et noms complets.",
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Mots-clés, en français ou tels que dans la base' } }, required: ['query'] },
  },
  {
    name: 'describe_table',
    description: 'Décrit une table : colonnes, types Trino, types sémantiques, descriptions, valeurs connues, relations (clés étrangères).',
    input_schema: { type: 'object', properties: { table_id: { type: 'string' } }, required: ['table_id'] },
  },
  {
    name: 'list_metrics',
    description: "Liste les métriques définies par l'équipe (agrégations nommées et réutilisables) et les modèles.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'run_query',
    description: `Exécute une requête Trino SQL en lecture seule sous les droits de la personne et renvoie au plus ${ROWS_SHOWN} lignes.`,
    input_schema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] },
  },
  {
    name: 'propose_question',
    description: 'Propose une question (requête SQL + visualisation) que la personne pourra ouvrir ou enregistrer.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        sql: { type: 'string' },
        visualization: { type: 'string', enum: [...VISUALIZATIONS] },
      },
      required: ['name', 'sql', 'visualization'],
    },
  },
  {
    name: 'propose_dashboard',
    description: 'Propose un tableau de bord (nouveau, ou des cartes à ajouter au tableau ouvert) : une liste de cartes, chacune une requête SQL et sa visualisation, sur une grille de 24 colonnes.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        cards: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              sql: { type: 'string' },
              visualization: { type: 'string', enum: [...VISUALIZATIONS] },
              width: { type: 'integer', description: 'Largeur sur 24 colonnes : 6 pour un chiffre, 12 pour un graphique, 24 pour une table large' },
            },
            required: ['title', 'sql', 'visualization'],
          },
        },
      },
      required: ['name', 'cards'],
    },
  },
  {
    name: 'propose_metadata',
    description: "Propose des métadonnées pour une table : libellé et description de la table, et pour chaque colonne libellé, description et type sémantique.",
    input_schema: {
      type: 'object',
      properties: {
        table_id: { type: 'string' },
        label: { type: 'string' },
        description: { type: 'string' },
        columns: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              label: { type: 'string' },
              description: { type: 'string' },
              semantic: { type: 'string', enum: [...SEMANTIC_TYPES] },
            },
            required: ['name'],
          },
        },
      },
      required: ['table_id', 'columns'],
    },
  },
]

const Inputs = {
  search_schema: z.object({ query: z.string() }),
  describe_table: z.object({ table_id: z.string() }),
  list_metrics: z.object({}).passthrough(),
  run_query: z.object({ sql: z.string().min(1) }),
  propose_question: z.object({ name: z.string(), description: z.string().optional(), sql: z.string(), visualization: z.enum(VISUALIZATIONS) }),
  propose_dashboard: z.object({
    name: z.string(),
    cards: z.array(z.object({ title: z.string(), sql: z.string(), visualization: z.enum(VISUALIZATIONS), width: z.number().int().min(2).max(24).optional() })).min(1).max(20),
  }),
  propose_metadata: z.object({
    table_id: z.string(),
    label: z.string().optional(),
    description: z.string().optional(),
    columns: z.array(z.object({ name: z.string(), label: z.string().optional(), description: z.string().optional(), semantic: z.enum(SEMANTIC_TYPES as [string, ...string[]]).optional() })),
  }),
} as const

const resultText = (r: QueryResult) => {
  const head = r.columns.map((c) => c.name).join(' | ')
  const rows = r.rows.slice(0, ROWS_SHOWN).map((row) => row.map((v) => (v === null ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v))).join(' | '))
  return `${head}\n${rows.join('\n')}${r.rows.length > ROWS_SHOWN || r.truncated ? `\n… (${r.rows.length}${r.truncated ? '+' : ''} lignes)` : ''}`
}

interface ToolEnv {
  readonly core: Core
  readonly actor: Actor
  readonly allowRun: boolean
  readonly context: CopilotContext
  readonly emit: (e: CopilotEvent) => void
}

let proposalSeq = 0
const proposalId = () => `p${Date.now().toString(36)}${(proposalSeq++).toString(36)}`

async function runTool(env: ToolEnv, name: string, raw: unknown): Promise<{ ok: boolean; text: string; summary: string }> {
  const schema = Inputs[name as keyof typeof Inputs]
  if (!schema) return { ok: false, text: `Outil inconnu : ${name}`, summary: 'outil inconnu' }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { ok: false, text: `Entrée invalide : ${parsed.error.message}`, summary: 'entrée invalide' }
  const { core, actor } = env
  switch (name) {
    case 'search_schema': {
      const { query } = parsed.data as z.infer<typeof Inputs.search_schema>
      const words = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter((w) => w.length > 1)
      const fold = (s: string | null | undefined) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      const tables = await listTables(core, actor, { withColumns: true })
      const scored = tables
        .filter((t) => t.visibility !== 'hidden')
        .map((t) => {
          const hay = `${fold(t.name)} ${fold(t.label)} ${fold(t.description)} ${fold(t.native_comment)} ${(t.columns ?? []).map((c) => `${fold(c.name)} ${fold(c.label)} ${fold(c.description)}`).join(' ')}`
          return { t, score: words.length === 0 ? 1 : words.filter((w) => hay.includes(w)).length }
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
      const models = await listByType(core, actor, 'model')
      const metrics = await listByType(core, actor, 'metric')
      const lines = scored.map(({ t }) => `- table ${t.id} : ${t.qualified} « ${t.label} »${t.description || t.native_comment ? ` — ${t.description ?? t.native_comment}` : ''} (${t.columns?.length ?? 0} colonnes${t.row_count ? `, ~${t.row_count} lignes` : ''})`)
      for (const m of models) lines.push(`- modèle ${m.id} : « ${m.name} »${m.description ? ` — ${m.description}` : ''}`)
      for (const m of metrics) lines.push(`- métrique ${m.id} : « ${m.name} »${m.description ? ` — ${m.description}` : ''}`)
      return { ok: true, text: lines.length ? lines.join('\n') : 'Aucune table ne correspond.', summary: `${scored.length} table(s)` }
    }
    case 'describe_table': {
      const { table_id } = parsed.data as z.infer<typeof Inputs.describe_table>
      const t = await getTable(core, actor, table_id)
      const relations = await listRelations(core, actor, t.datasource)
      const tables = new Map((await listTables(core, actor, { datasource: t.datasource })).map((x) => [x.id, x]))
      const values = await core.db.many<{ column_id: string; values: string[] }>(
        `SELECT column_id, array_agg(coalesce(label || ' (' || value || ')', value) ORDER BY position) FILTER (WHERE position < 25) AS values
         FROM column_value WHERE column_id = ANY($1) GROUP BY column_id`,
        [(t.columns ?? []).map((c) => c.id)],
      )
      const byCol = new Map(values.map((v) => [v.column_id, v.values]))
      const lines = [`Table ${t.qualified} « ${t.label} »`, t.description ?? t.native_comment ?? '', 'Colonnes :']
      for (const c of t.columns ?? []) {
        const rel = c.fk ? tables.get(c.fk.table) : undefined
        const v = byCol.get(c.id)
        lines.push(
          `- "${c.name}" ${c.type}${c.label !== c.name ? ` « ${c.label} »` : ''}${c.semantic ? ` [${SEMANTIC_LABELS[c.semantic]}]` : ''}${c.pk ? ' [clé primaire]' : ''}${rel ? ` → ${rel.qualified}."${c.fk?.name}"` : ''}${c.description ? ` — ${c.description}` : ''}${v ? ` ; valeurs : ${v.join(', ')}` : ''}`,
        )
      }
      const incoming = relations.filter((r) => r.to.table === t.id).map((r) => tables.get(r.from.table)?.qualified).filter(Boolean)
      if (incoming.length) lines.push(`Référencée par : ${[...new Set(incoming)].join(', ')}`)
      return { ok: true, text: lines.filter(Boolean).join('\n'), summary: t.label }
    }
    case 'list_metrics': {
      const metrics = await listByType(core, actor, 'metric')
      const lines: string[] = []
      for (const m of metrics) {
        const def = await metricDefinition(core, actor, m.id)
        lines.push(`- ${m.name}${m.description ? ` — ${m.description}` : ''}${def ? ` : ${def.aggregation.fn}(${def.aggregation.column?.field ?? '*'})${def.filters.length ? ` avec ${def.filters.length} filtre(s)` : ''}` : ''}`)
      }
      return { ok: true, text: lines.length ? lines.join('\n') : 'Aucune métrique définie.', summary: `${metrics.length} métrique(s)` }
    }
    case 'run_query': {
      if (!env.allowRun) {
        return { ok: false, text: "La personne n'a pas autorisé l'exécution de requêtes dans cette conversation. Propose la requête sans l'exécuter.", summary: 'non autorisé' }
      }
      const { sql } = parsed.data as z.infer<typeof Inputs.run_query>
      try {
        const r = await runQuery(core, actor, { query: { kind: 'sql', sql }, origin: 'copilot', adhoc: true, limit: 200 })
        return { ok: true, text: resultText(r), summary: `${r.rows.length} ligne(s)` }
      } catch (err) {
        return { ok: false, text: `Erreur : ${err instanceof Error ? err.message : String(err)}`, summary: 'erreur' }
      }
    }
    case 'propose_question': {
      const p = parsed.data as z.infer<typeof Inputs.propose_question>
      const proposal: Proposal = {
        id: proposalId(),
        kind: 'question',
        name: p.name,
        ...(p.description ? { description: p.description } : {}),
        query: QuestionQuerySchema.parse({ kind: 'sql', sql: p.sql.trim().replace(/;+\s*$/, '') }),
        visualization: { type: p.visualization },
      }
      env.emit({ type: 'proposal', proposal })
      return { ok: true, text: `Proposition « ${p.name} » présentée à la personne.`, summary: p.name }
    }
    case 'propose_dashboard': {
      const p = parsed.data as z.infer<typeof Inputs.propose_dashboard>
      const proposal: Proposal = {
        id: proposalId(),
        kind: 'dashboard',
        ...(env.context.kind === 'dashboard' ? { dashboard: env.context.id } : {}),
        name: p.name,
        cards: p.cards.map((c) => ({ title: c.title, query: { kind: 'sql', sql: c.sql.trim().replace(/;+\s*$/, '') }, visualization: { type: c.visualization }, w: c.width ?? (c.visualization === 'scalar' || c.visualization === 'trend' ? 6 : 12) })),
      }
      env.emit({ type: 'proposal', proposal })
      return { ok: true, text: `Tableau de bord « ${p.name} » (${p.cards.length} cartes) présenté à la personne.`, summary: `${p.cards.length} carte(s)` }
    }
    case 'propose_metadata': {
      const p = parsed.data as z.infer<typeof Inputs.propose_metadata>
      await getTable(core, actor, p.table_id)
      const proposal: Proposal = {
        id: proposalId(),
        kind: 'metadata',
        table: p.table_id,
        patch: { ...(p.label ? { label: p.label } : {}), ...(p.description ? { description: p.description } : {}) },
        columns: p.columns,
      }
      env.emit({ type: 'proposal', proposal })
      return { ok: true, text: `Description de ${p.columns.length} colonne(s) présentée à la personne.`, summary: `${p.columns.length} colonne(s)` }
    }
  }
  return { ok: false, text: 'Outil non géré.', summary: '' }
}

async function contextText(core: Core, actor: Actor, context: CopilotContext): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)
  const parts = [`[Contexte] Date du jour : ${today}.`]
  switch (context.kind) {
    case 'sql':
      parts.push('La personne est dans l’éditeur SQL.')
      if (context.sql) parts.push(`Requête en cours :\n\`\`\`sql\n${context.sql.slice(0, 8000)}\n\`\`\``)
      if (context.error) parts.push(`Dernière erreur : ${context.error.slice(0, 1000)}`)
      break
    case 'question':
      parts.push('La personne construit une question.')
      if (context.query) parts.push(`Question en cours : ${JSON.stringify(context.query).slice(0, 6000)}`)
      break
    case 'dashboard':
      parts.push(`La personne regarde le tableau de bord ${context.id} ; propose des cartes avec propose_dashboard.`)
      break
    case 'structure': {
      const t = await getTable(core, actor, context.table).catch(() => null)
      if (t) parts.push(`La personne décrit la table ${t.qualified} (id ${t.id}) dans l’écran Structure : utilise describe_table puis propose_metadata.`)
      break
    }
  }
  return parts.join('\n')
}

async function checkQuota(core: Core, actor: Actor): Promise<void> {
  const row = await core.db.one<{ n: number }>(`SELECT count(*)::int AS n FROM ai_call WHERE user_id = $1 AND at > now() - interval '1 hour'`, [actor.userId])
  if ((row?.n ?? 0) >= core.config.ai.hourlyQuota) {
    throw new AppError('AI_QUOTA', `Quota du copilot atteint (${core.config.ai.hourlyQuota} appels par heure). Réessayez plus tard.`)
  }
}

/** One turn of a conversation: streams text, tool activity and proposals; persists the exchange. */
export async function copilotTurn(
  core: Core,
  actor: Actor,
  input: { conversation?: string; context: CopilotContext; message: string; allowRun: boolean },
  emit: (e: CopilotEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const provider = providerFor(core.config.ai)
  if (!provider) throw new AppError('AI_DISABLED', "Le copilot n'est pas configuré sur cette instance (clé de fournisseur absente).")
  await checkQuota(core, actor)

  let conversationId = input.conversation
  let messages: MessageParam[] = []
  if (conversationId) {
    const row = await core.db.one<{ messages: MessageParam[] }>('SELECT messages FROM ai_conversation WHERE id = $1 AND user_id = $2', [conversationId, actor.userId])
    if (!row) throw new AppError('NOT_FOUND', 'Conversation introuvable.')
    messages = row.messages
  } else {
    const row = await core.db.one<{ id: string }>(
      `INSERT INTO ai_conversation (user_id, context_kind, context_id, title) VALUES ($1, $2, $3, $4) RETURNING id`,
      [actor.userId, input.context.kind, 'id' in input.context ? (input.context.id ?? null) : 'table' in input.context ? input.context.table : null, input.message.slice(0, 80)],
    )
    conversationId = row?.id as string
  }
  emit({ type: 'conversation', id: conversationId })

  // The screen's context rides with the person's message: the system prompt stays frozen (cached).
  messages.push({ role: 'user', content: [{ type: 'text', text: `${await contextText(core, actor, input.context)}\n\n${input.message}` }] })

  const env: ToolEnv = { core, actor, allowRun: input.allowRun, context: input.context, emit }
  const usedTools: string[] = []
  const started = Date.now()
  let usage = { input: 0, output: 0 }
  let error: string | null = null
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const turn = await provider.turn({ system: SYSTEM, tools: TOOLS, messages, onText: (delta) => emit({ type: 'text', delta }), ...(signal ? { signal } : {}) })
      usage = { input: usage.input + turn.usage.input, output: usage.output + turn.usage.output }
      // Appended whole and unchanged — thinking blocks included — so the history stays append-only.
      messages.push({ role: 'assistant', content: turn.content })
      if (turn.stopReason === 'refusal') {
        emit({ type: 'text', delta: '\n\n_Le modèle a décliné cette demande._' })
        break
      }
      const calls = turn.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
      if (turn.stopReason !== 'tool_use' || calls.length === 0) break
      if (turn.stopReason === 'tool_use' && calls.length === 0) break
      const results: ContentBlock[] = []
      for (const call of calls) {
        usedTools.push(call.name)
        emit({ type: 'tool', name: call.name, input: call.input })
        const out = await runTool(env, call.name, call.input).catch((err: unknown) => ({ ok: false, text: err instanceof Error ? err.message : String(err), summary: 'erreur' }))
        emit({ type: 'tool_result', name: call.name, ok: out.ok, summary: out.summary })
        results.push({ type: 'tool_result', tool_use_id: call.id, content: out.text, ...(out.ok ? {} : { is_error: true }) })
      }
      messages.push({ role: 'user', content: results })
    }
    emit({ type: 'done' })
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    emit({ type: 'error', message: error })
  } finally {
    await core.db.exec('UPDATE ai_conversation SET messages = $2, updated_at = now() WHERE id = $1', [conversationId, JSON.stringify(messages)])
    await core.db.exec(
      'INSERT INTO ai_call (user_id, provider, model, context_kind, input_tokens, output_tokens, tools, duration_ms, error) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [actor.userId, provider.name, provider.model, input.context.kind, usage.input, usage.output, usedTools, Date.now() - started, error],
    )
  }
}

/** The conversations of a person, newest first; their messages rendered for the panel. */
export async function listConversations(core: Core, actor: Actor) {
  return core.db.many('SELECT id, context_kind, context_id, title, updated_at FROM ai_conversation WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50', [actor.userId])
}

export async function readConversation(core: Core, actor: Actor, id: string) {
  const row = await core.db.one<{ id: string; title: string; messages: MessageParam[] }>('SELECT id, title, messages FROM ai_conversation WHERE id = $1 AND user_id = $2', [id, actor.userId])
  if (!row) throw new AppError('NOT_FOUND', 'Conversation introuvable.')
  // What the panel shows: the person's words and the model's text, without tool plumbing.
  const shown = row.messages.flatMap((m) => {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : (m.content as { type: string; text?: string }[])
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
    if (!text) return []
    return [{ role: m.role, text: m.role === 'user' ? text.replace(/^\[Contexte\][\s\S]*?\n\n/, '') : text }]
  })
  return { id: row.id, title: row.title, messages: shown }
}

export async function deleteConversation(core: Core, actor: Actor, id: string) {
  await core.db.exec('DELETE FROM ai_conversation WHERE id = $1 AND user_id = $2', [id, actor.userId])
  await audit(core, actor, 'copilot.delete_conversation', { kind: 'conversation', id })
}
