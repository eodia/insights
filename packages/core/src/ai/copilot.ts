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
  resolveDateExpression,
} from '@eodia/contracts'
import { z } from 'zod'
import { audit } from '../audit'
import type { Actor, Core } from '../context'
import { listByType, metricDefinition } from '../content/items'
import { AppError } from '../errors'
import { runQuery } from '../query/run'
import { columnValues, getTable, listRelations, listTables } from '../sources/metadata'
import { type ContentBlock, type MessageParam, type ToolSpec, providerFor } from './providers'

export type CopilotContext =
  | { readonly kind: 'general' }
  | { readonly kind: 'sql'; readonly sql?: string; readonly error?: string }
  | { readonly kind: 'question'; readonly id?: string; readonly query?: unknown }
  | { readonly kind: 'dashboard'; readonly id: string; readonly filters?: readonly DashboardFilterContext[] }
  | { readonly kind: 'structure'; readonly table: string }
  /** The assistant's own screen: it answers, and shows data as charts, within the chosen sources. */
  | { readonly kind: 'assistant'; readonly sources?: readonly string[] }

/**
 * A filter of the dashboard one looks at, as the page tells it: what it is called, what it takes,
 * what it holds now, and — for a list of values — the column its values come from.
 */
export interface DashboardFilterContext {
  readonly id: string
  readonly label: string
  readonly type: string
  readonly multiple?: boolean
  readonly operator?: string
  readonly units?: readonly string[]
  readonly value?: unknown
  readonly column?: string | null
}

export type CopilotEvent =
  | { type: 'conversation'; id: string }
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; ok: boolean; summary: string }
  | { type: 'proposal'; proposal: Proposal }
  | { type: 'chart'; chart: Chart }
  /** Filters to set on the dashboard one looks at — by filter id; null clears one. */
  | { type: 'filters'; values: Record<string, unknown>; summary: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export type Proposal =
  | { id: string; kind: 'question'; name: string; description?: string; query: unknown; visualization: unknown }
  | { id: string; kind: 'dashboard'; dashboard?: string; name: string; cards: unknown[]; parameters?: unknown[] }
  | { id: string; kind: 'metadata'; table: string; patch: unknown; columns: unknown[] }

/** A chart the assistant shows in the conversation: the screen runs its query under the person's identity. */
export interface Chart {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly query: unknown
  readonly visualization: { readonly type: string; readonly settings?: Record<string, unknown> }
}

const MAX_STEPS = 12
const ROWS_SHOWN = 40

const SYSTEM = `Tu es le copilot d'eodia insights, un outil de BI open source. Tu aides des personnes à explorer leurs données, écrire du SQL, construire des questions et des tableaux de bord, et décrire la structure de leurs bases.

Moteur : toutes les requêtes passent par Trino. Écris du Trino SQL (ANSI), en citant les tables par leur nom complet "catalogue"."schéma"."table" tel que les outils le donnent. Donne à chaque colonne du SELECT un alias unique et parlant, surtout après une jointure où deux tables ont une colonne du même nom (c.name AS client, p.name AS produit). Fonctions utiles : date_trunc('month', x), date_add, date_diff, approx_distinct, approx_percentile, format_datetime, CAST(x AS date). Pas de point-virgule final.

Règles :
- Commence par chercher les tables (search_schema) puis lis leur description (describe_table) avant d'écrire une requête : n'invente jamais un nom de table ou de colonne.
- Les descriptions, types sémantiques et valeurs fournis par l'équipe font foi : appuie-toi dessus (unités, statuts, montants). Dans un filtre, écris la valeur exacte que donne describe_table, jamais son libellé.
- N'invente jamais un chiffre : ne cite que ceux que run_query ou show_chart t'ont renvoyés. Si tu ne les vois pas, décris ce que montre le graphique sans chiffrer.
- Tu ne modifies rien toi-même. Pour créer une question, un tableau de bord ou décrire une table, utilise les outils propose_* : la personne verra la proposition et décidera de l'appliquer.
- run_query n'est disponible que si la personne y a consenti ; il lit sous ses propres droits. Garde les requêtes légères (agrégats, LIMIT).
- Pour une proposition de question, valide d'abord ton SQL avec run_query quand c'est permis.
- Réponds dans la langue de la personne (celle de son dernier message), de façon concise et concrète. Formate le SQL dans des blocs \`\`\`sql.
- Visualisations disponibles : ${VISUALIZATIONS.join(', ')}. Choisis « line » ou « area » pour une évolution dans le temps, « bar »/« row » pour comparer des catégories, « scalar » pour un seul chiffre, « pie » pour une répartition de moins de 8 parts, « bubble » pour trois mesures (x, y, taille) ou des parts en bulles, « treemap » pour des parts imbriquées sur plusieurs niveaux (un « pie » à plusieurs dimensions donne des anneaux), « calendar » pour une valeur par jour, « bar_race » ou « line_race » pour rejouer dans le temps la compétition entre plusieurs valeurs (une date, une seconde dimension, une mesure), « table » sinon.`

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
    name: 'show_chart',
    description:
      "Montre des données dans la conversation, en graphique ou en tableau : la requête s'exécute sous les droits de la personne et le résultat s'affiche, interactif, sous ta réponse. Préfère-le à un long tableau Markdown dès qu'il y a des chiffres à montrer. Forme du résultat : d'abord la dimension (le mois, la catégorie…), éventuellement une seconde pour découper en séries, puis la ou les mesures ; aucune colonne qui répète la même valeur sur toutes les lignes (l'année d'une requête par mois, par exemple).",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Titre court du graphique' },
        description: { type: 'string', description: 'Une phrase sous le titre (facultatif)' },
        sql: { type: 'string' },
        visualization: { type: 'string', enum: [...VISUALIZATIONS] },
      },
      required: ['title', 'sql', 'visualization'],
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

/** Filtering the dashboard one looks at: what the page applies at once, the person keeping Back to undo it. */
const FILTER_TOOLS: readonly ToolSpec[] = [
  {
    name: 'find_filter_values',
    description:
      "Cherche les valeurs réelles d'un filtre de liste du tableau de bord (ex. « bretagne » → « Bretagne »). À appeler avant set_filters pour toute valeur dont tu n'es pas sûr de l'écriture exacte.",
    input_schema: {
      type: 'object',
      properties: { filter: { type: 'string', description: 'id du filtre' }, search: { type: 'string', description: 'texte cherché, vide pour les plus fréquentes' } },
      required: ['filter'],
    },
  },
  {
    name: 'set_filters',
    description:
      "Pose des filtres sur le tableau de bord que la personne regarde : ils s'appliquent aussitôt, sans rien enregistrer. Clé : l'id du filtre ; valeur : liste de valeurs exactes pour une liste, expression de période pour une date (lastquarter, past12months, 2026-Q1, 2026-01-01~2026-03-31…), [min, max] pour un nombre (null pour une borne ouverte), une unité (day, week, month, quarter, year) pour un pas de temps ; null retire le filtre. Ne touche pas aux filtres dont la demande ne parle pas.",
    input_schema: {
      type: 'object',
      properties: {
        values: { type: 'object', description: 'id du filtre → valeur, ou null', additionalProperties: true },
        summary: { type: 'string', description: 'ce que les filtres montrent, en quelques mots (« Bretagne, trimestre dernier »)' },
      },
      required: ['values', 'summary'],
    },
  },
]

const Inputs = {
  search_schema: z.object({ query: z.string() }),
  describe_table: z.object({ table_id: z.string() }),
  list_metrics: z.object({}).passthrough(),
  run_query: z.object({ sql: z.string().min(1) }),
  propose_question: z.object({ name: z.string(), description: z.string().optional(), sql: z.string(), visualization: z.enum(VISUALIZATIONS) }),
  show_chart: z.object({ title: z.string(), description: z.string().optional(), sql: z.string().min(1), visualization: z.enum(VISUALIZATIONS) }),
  propose_dashboard: z.object({
    name: z.string(),
    cards: z.array(z.object({ title: z.string(), sql: z.string(), visualization: z.enum(VISUALIZATIONS), width: z.number().int().min(2).max(24).optional() })).min(1).max(20),
  }),
  find_filter_values: z.object({ filter: z.string(), search: z.string().optional() }),
  set_filters: z.object({ values: z.record(z.string(), z.unknown()), summary: z.string().max(200) }),
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
  /** The id of the tool call being run: a chart keeps it, to be found again in the history. */
  callId?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A table as the model names it: its id, or its full name (`boutique.public.commandes`, quoted or not). */
async function tableIdOf(core: Core, actor: Actor, ref: string): Promise<string> {
  if (UUID.test(ref.trim())) {
    // A model or a metric is a question, not a table: say so, rather than « introuvable ».
    const q = await core.db.one<{ type: string; name: string }>("SELECT type, name FROM question WHERE id = $1 AND type IN ('model', 'metric')", [ref.trim()])
    if (q) throw new AppError('INVALID_INPUT', `« ${q.name} » est ${q.type === 'model' ? 'un modèle' : 'une métrique'}, pas une table : décris les tables sur lesquelles ${q.type === 'model' ? 'il' : 'elle'} repose (search_schema les donne) et écris ta requête sur elles.`)
    return ref.trim()
  }
  const bare = (s: string) => s.replace(/"/g, '').trim().toLowerCase()
  const found = (await listTables(core, actor)).find((t) => bare(t.qualified) === bare(ref))
  if (!found) throw new AppError('NOT_FOUND', `Table « ${ref} » introuvable : passe l'identifiant que donne search_schema.`)
  return found.id
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
      const only = env.context.kind === 'assistant' && env.context.sources?.length ? new Set(env.context.sources) : null
      const tables = (await listTables(core, actor, { withColumns: true })).filter((t) => !only || only.has(t.datasource))
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
      const t = await getTable(core, actor, await tableIdOf(core, actor, table_id))
      const relations = await listRelations(core, actor, t.datasource)
      const tables = new Map((await listTables(core, actor, { datasource: t.datasource })).map((x) => [x.id, x]))
      const values = await core.db.many<{ column_id: string; values: string[] }>(
        `SELECT column_id, array_agg(quote_literal(value) || CASE WHEN label IS NOT NULL AND label <> value THEN ' « ' || label || ' »' ELSE '' END ORDER BY position) FILTER (WHERE position < 25) AS values
         FROM column_value WHERE column_id = ANY($1) GROUP BY column_id`,
        [(t.columns ?? []).map((c) => c.id)],
      )
      const byCol = new Map(values.map((v) => [v.column_id, v.values]))
      const lines = [`Table ${t.qualified} « ${t.label} »`, t.description ?? t.native_comment ?? '', 'Colonnes :']
      for (const c of t.columns ?? []) {
        const rel = c.fk ? tables.get(c.fk.table) : undefined
        const v = byCol.get(c.id)
        lines.push(
          `- "${c.name}" ${c.type}${c.label !== c.name ? ` « ${c.label} »` : ''}${c.semantic ? ` [${SEMANTIC_LABELS[c.semantic]}]` : ''}${c.pk ? ' [clé primaire]' : ''}${rel ? ` → ${rel.qualified}."${c.fk?.name}"` : ''}${c.description ? ` — ${c.description}` : ''}${v ? ` ; valeurs exactes (à écrire telles quelles dans le SQL, libellé entre « ») : ${v.join(', ')}` : ''}`,
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
    case 'show_chart': {
      const p = parsed.data as z.infer<typeof Inputs.show_chart>
      const query = QuestionQuerySchema.parse({ kind: 'sql', sql: p.sql.trim().replace(/;+\s*$/, '') })
      // Run first, under the person's rights: a chart that fails or shows nothing is not shown, and
      // the model learns why — rather than commenting figures it never saw.
      let r: QueryResult
      try {
        r = await runQuery(core, actor, { query, origin: 'copilot', adhoc: true, limit: 200 })
      } catch (err) {
        return { ok: false, text: `Erreur : ${err instanceof Error ? err.message : String(err)}. Corrige la requête puis rappelle show_chart.`, summary: 'erreur' }
      }
      if (r.rows.length === 0 || r.rows.every((row) => row.every((v) => v === null))) {
        return {
          ok: false,
          text: `La requête ne renvoie ${r.rows.length === 0 ? 'aucune ligne' : 'que des valeurs vides'} : rien n'a été affiché. Vérifie les filtres — les valeurs exactes sont celles de describe_table, pas leurs libellés — et les dates, puis rappelle show_chart.`,
          summary: 'vide',
        }
      }
      const chart: Chart = {
        id: env.callId ?? proposalId(),
        title: p.title,
        ...(p.description ? { description: p.description } : {}),
        query,
        visualization: { type: p.visualization },
      }
      env.emit({ type: 'chart', chart })
      const seen = env.allowRun
        ? `Voici ce qu'il montre, pour le commenter :\n${resultText(r)}`
        : "Tu ne vois pas ses chiffres (la personne n'a pas autorisé leur lecture) : décris ce qu'il montre sans en citer."
      return { ok: true, text: `Graphique « ${p.title} » affiché sous ta réponse (${r.rows.length} ligne(s)) ; ne recopie pas ses chiffres en tableau. ${seen}`, summary: p.title }
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
  if (name === 'find_filter_values' || name === 'set_filters') return filterTool(env, name, parsed.data)
  return { ok: false, text: 'Outil non géré.', summary: '' }
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

/** The values a list filter offers that match a text, read under the person's rights. */
async function filterValues(env: ToolEnv, f: DashboardFilterContext, search: string) {
  if (!f.column) return []
  const { values } = await columnValues(env.core, env.actor, f.column, search)
  return values
}

async function filterTool(env: ToolEnv, name: 'find_filter_values' | 'set_filters', data: unknown): Promise<{ ok: boolean; text: string; summary: string }> {
  if (env.context.kind !== 'dashboard') return { ok: false, text: "Ces outils ne servent que sur un tableau de bord ouvert.", summary: 'hors tableau de bord' }
  const filters = env.context.filters ?? []
  const byId = new Map(filters.map((f) => [f.id, f]))
  if (name === 'find_filter_values') {
    const { filter, search } = data as z.infer<typeof Inputs.find_filter_values>
    const f = byId.get(filter)
    if (!f) return { ok: false, text: `Filtre « ${filter} » inconnu : ids possibles ${filters.map((x) => x.id).join(', ')}.`, summary: 'filtre inconnu' }
    const values = await filterValues(env, f, search ?? '')
    if (!values.length) return { ok: true, text: f.column ? 'Aucune valeur trouvée.' : "Ce filtre n'a pas de liste de valeurs connue : écris la valeur telle que la donnée l'écrit.", summary: '0 valeur' }
    return { ok: true, text: values.slice(0, 30).map((v) => (v.label && v.label !== v.value ? `${v.value} (${v.label})` : v.value)).join('\n'), summary: `${values.length} valeur(s)` }
  }
  const { values, summary } = data as z.infer<typeof Inputs.set_filters>
  const out: Record<string, unknown> = {}
  const problems: string[] = []
  const today = new Date().toISOString().slice(0, 10)
  for (const [id, raw] of Object.entries(values)) {
    const f = byId.get(id) ?? filters.find((x) => fold(x.label) === fold(id))
    if (!f) {
      problems.push(`« ${id} » n'est pas un filtre de ce tableau de bord.`)
      continue
    }
    if (raw === null) {
      out[f.id] = null
      continue
    }
    switch (f.type) {
      case 'category': {
        const asked = (Array.isArray(raw) ? raw : [raw]).map(String)
        const exact: string[] = []
        for (const a of asked) {
          // The value as the data writes it: « bretagne » is « Bretagne », a label gives its value.
          const found = (await filterValues(env, f, a)).find((v) => fold(v.value) === fold(a) || (v.label && fold(v.label) === fold(a)))
          if (found) exact.push(found.value)
          else if (!f.column) exact.push(a)
          else problems.push(`« ${a} » n'est pas une valeur de « ${f.label} » (find_filter_values les donne).`)
        }
        if (exact.length) out[f.id] = f.multiple === false ? exact.slice(0, 1) : exact
        break
      }
      case 'date': {
        const text = String(raw).trim()
        if (resolveDateExpression(text, today) === null) problems.push(`« ${text} » n'est pas une période lisible pour « ${f.label} ».`)
        else out[f.id] = text
        break
      }
      case 'number': {
        const pair = Array.isArray(raw) ? raw : [raw, raw]
        const nums = pair.slice(0, 2).map((x) => (x === null || x === undefined || x === '' ? null : Number(x)))
        if (nums.some((n) => n !== null && !Number.isFinite(n))) problems.push(`« ${JSON.stringify(raw)} » n'est pas un intervalle de nombres.`)
        else out[f.id] = nums
        break
      }
      case 'temporal_unit': {
        const unit = String(raw)
        if (f.units?.length && !f.units.includes(unit)) problems.push(`« ${unit} » n'est pas proposé par « ${f.label} » (${f.units.join(', ')}).`)
        else out[f.id] = unit
        break
      }
      default:
        out[f.id] = String(raw)
    }
  }
  if (!Object.keys(out).length) return { ok: false, text: problems.join('\n') || 'Aucun filtre à poser.', summary: 'aucun filtre' }
  env.emit({ type: 'filters', values: out, summary })
  const done = Object.entries(out)
    .map(([id, v]) => `${byId.get(id)?.label ?? id} = ${v === null ? 'tous' : JSON.stringify(v)}`)
    .join(' ; ')
  return { ok: true, text: `Filtres posés sur le tableau de bord : ${done}.${problems.length ? `\nNon posés : ${problems.join(' ')}` : ''}`, summary }
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
    case 'dashboard': {
      parts.push(`La personne regarde le tableau de bord ${context.id} ; propose des cartes avec propose_dashboard.`)
      const filters = context.filters ?? []
      if (filters.length) {
        parts.push(
          "Quand elle demande de changer ce qu'affiche le tableau de bord — n'en voir qu'une partie (« seulement la Bretagne le trimestre dernier »), une autre période, retirer un filtre —, pose ses filtres avec set_filters (après find_filter_values pour une valeur de liste) : ils s'appliquent aussitôt ; réponds alors en une phrase. Pour une simple question sur les données (« quel canal vend le plus ? »), réponds sans toucher aux filtres. Pour « toutes les valeurs », retire le filtre (null) plutôt que de les choisir une à une.",
        )
        parts.push(
          `Ses filtres :\n${filters
            .map((f) => `- id ${f.id} : « ${f.label} », ${f.type}${f.multiple === false ? ' (une seule valeur)' : ''}${f.units?.length ? ` (unités : ${f.units.join(', ')})` : ''} — actuellement ${f.value === null || f.value === undefined ? 'tous' : JSON.stringify(f.value)}`)
            .join('\n')}`,
        )
      }
      break
    }
    case 'assistant': {
      parts.push(
        "La personne te parle dans l’assistant IA. Réponds en Markdown soigné (titres courts, listes, tableaux quand c'est utile) ; dès qu'il y a des données à montrer, exécute la requête puis affiche-la avec show_chart, et commente ce qu'on y voit.",
      )
      if (context.sources?.length) {
        const names = await core.db.many<{ name: string; catalog: string }>('SELECT name, catalog FROM datasource WHERE id = ANY($1)', [context.sources])
        parts.push(`Limite-toi à ces sources (catalogues Trino) : ${names.map((n) => `${n.name} (« ${n.catalog} »)`).join(', ')}.`)
      }
      break
    }
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
    const row = await core.db.one<{ messages: MessageParam[] }>('SELECT messages FROM ai_conversation WHERE id = $1 AND user_id = $2 AND workspace_id = $3', [
      conversationId,
      actor.userId,
      actor.workspaceId,
    ])
    if (!row) throw new AppError('NOT_FOUND', 'Conversation introuvable.')
    messages = row.messages
  } else {
    const row = await core.db.one<{ id: string }>(
      `INSERT INTO ai_conversation (user_id, context_kind, context_id, title, workspace_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        actor.userId,
        input.context.kind,
        'id' in input.context ? (input.context.id ?? null) : 'table' in input.context ? input.context.table : null,
        input.message.slice(0, 80),
        actor.workspaceId,
      ],
    )
    conversationId = row?.id as string
  }
  emit({ type: 'conversation', id: conversationId })

  // The screen's context rides with the person's message: the system prompt stays frozen (cached).
  messages.push({ role: 'user', content: [{ type: 'text', text: `${await contextText(core, actor, input.context)}\n\n${input.message}` }] })

  // In its own screen, the assistant runs its queries — under the person's identity, as always.
  const env: ToolEnv = { core, actor, allowRun: input.allowRun || input.context.kind === 'assistant', context: input.context, emit }
  const usedTools: string[] = []
  // On a dashboard with filters, the model may also set them.
  const tools = input.context.kind === 'dashboard' && input.context.filters?.length ? [...TOOLS, ...FILTER_TOOLS] : TOOLS
  const started = Date.now()
  let usage = { input: 0, output: 0 }
  let error: string | null = null
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const turn = await provider.turn({ system: SYSTEM, tools, messages, onText: (delta) => emit({ type: 'text', delta }), ...(signal ? { signal } : {}) })
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
        env.callId = call.id
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

/** The conversations of a person, newest first — the assistant's, or the panel's. */
export async function listConversations(core: Core, actor: Actor, kind?: 'assistant' | 'panel') {
  const where = kind === 'assistant' ? "AND context_kind = 'assistant'" : kind === 'panel' ? "AND context_kind <> 'assistant'" : ''
  return core.db.many(
    `SELECT id, context_kind, context_id, title, updated_at FROM ai_conversation WHERE user_id = $1 AND workspace_id = $2 ${where}
     ORDER BY updated_at DESC LIMIT 200`,
    [actor.userId, actor.workspaceId],
  )
}

/** What a conversation shows, turn by turn: the person's words, and the assistant's text, steps, charts and proposals in order. */
export type ShownPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool'; readonly name: string; readonly ok: boolean; readonly summary?: string }
  | { readonly type: 'chart'; readonly chart: Chart }
  | { readonly type: 'proposal'; readonly proposal: Proposal }

export async function readConversation(core: Core, actor: Actor, id: string) {
  const row = await core.db.one<{ id: string; title: string; context_kind: string; messages: MessageParam[] }>(
    'SELECT id, title, context_kind, messages FROM ai_conversation WHERE id = $1 AND user_id = $2 AND workspace_id = $3',
    [id, actor.userId, actor.workspaceId],
  )
  if (!row) throw new AppError('NOT_FOUND', 'Conversation introuvable.')
  const turns: ({ role: 'user'; text: string } | { role: 'assistant'; parts: ShownPart[] })[] = []
  const failed = new Set<string>()
  for (const m of row.messages) {
    if (m.role !== 'user' || typeof m.content === 'string') continue
    for (const b of m.content as { type: string; tool_use_id?: string; is_error?: boolean }[]) if (b.type === 'tool_result' && b.is_error && b.tool_use_id) failed.add(b.tool_use_id)
  }
  for (const m of row.messages) {
    const blocks = (typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content) as { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[]
    if (m.role === 'user') {
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
      if (text) turns.push({ role: 'user', text: text.replace(/^\[Contexte\][\s\S]*?\n\n/, '') })
      continue
    }
    let last = turns[turns.length - 1]
    if (!last || last.role !== 'assistant') {
      last = { role: 'assistant', parts: [] }
      turns.push(last)
    }
    for (const b of blocks) {
      if (b.type === 'text' && b.text) last.parts.push({ type: 'text', text: b.text })
      else if (b.type === 'tool_use' && b.name) {
        const input = b.input ?? {}
        const ok = !failed.has(b.id ?? '')
        last.parts.push({ type: 'tool', name: b.name, ok })
        if (b.name === 'show_chart' && ok && typeof input.sql === 'string') {
          last.parts.push({
            type: 'chart',
            chart: { id: b.id ?? '', title: String(input.title ?? ''), ...(input.description ? { description: String(input.description) } : {}), query: { kind: 'sql', sql: input.sql }, visualization: { type: String(input.visualization ?? 'table') } },
          })
        } else if (b.name === 'propose_question' && ok && typeof input.sql === 'string') {
          last.parts.push({ type: 'proposal', proposal: { id: b.id ?? '', kind: 'question', name: String(input.name ?? ''), query: { kind: 'sql', sql: input.sql }, visualization: { type: String(input.visualization ?? 'table') } } })
        }
      }
    }
  }
  // The panel's flat form, kept for it.
  const messages = turns.map((t) => (t.role === 'user' ? t : { role: 'assistant' as const, text: t.parts.filter((p) => p.type === 'text').map((p) => (p as { text: string }).text).join('') }))
  return { id: row.id, title: row.title, kind: row.context_kind, turns, messages }
}

export async function renameConversation(core: Core, actor: Actor, id: string, title: string) {
  await core.db.exec('UPDATE ai_conversation SET title = $3 WHERE id = $1 AND user_id = $2', [id, actor.userId, title.trim().slice(0, 120)])
}

/** Which model answers, for the assistant to say so. */
export function assistantInfo(core: Core) {
  const provider = providerFor(core.config.ai)
  return provider ? { enabled: true, provider: provider.name, model: provider.model } : { enabled: false }
}

export async function deleteConversation(core: Core, actor: Actor, id: string) {
  await core.db.exec('DELETE FROM ai_conversation WHERE id = $1 AND user_id = $2', [id, actor.userId])
  await audit(core, actor, 'copilot.delete_conversation', { kind: 'conversation', id })
}
