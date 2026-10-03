/**
 * Les outils MCP d'eodia insights. Chacun appelle l'API REST sous le jeton de l'appelant :
 * ce que l'assistant voit est exactement ce que son propriétaire voit dans l'application,
 * lignes et colonnes filtrées par Trino comprises.
 */
import type {
  Breakout,
  BuilderQuery,
  ColumnMeta,
  ColumnRef,
  ColumnValue,
  Dashboard,
  Datasource,
  Filter,
  ItemSummary,
  Join,
  QueryResult,
  Question,
  TableMeta,
} from '@eodia/contracts'
import { FILTER_OPS, VISUALIZATIONS } from '@eodia/contracts'
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import { CHART_URI, registerChartApp } from './app'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { ApiCallError, type EodiaApi } from './api'
import { MAX_ROWS, cell, fold, resultMarkdown, table } from './format'

const TIME_UNITS = ['day', 'week', 'month', 'quarter', 'year'] as const
type TimeUnit = (typeof TIME_UNITS)[number]

const text = (body: string): CallToolResult => ({ content: [{ type: 'text', text: body }] })
const failure = (message: string): CallToolResult => ({ content: [{ type: 'text', text: message }], isError: true })

/** Errors become a readable tool result: the assistant can correct its call and retry. */
async function guarded(fn: () => Promise<string>): Promise<CallToolResult> {
  try {
    return text(await fn())
  } catch (err) {
    if (err instanceof ToolInputError) return failure(err.message)
    if (err instanceof ApiCallError) {
      const hint =
        err.status === 401
          ? ' Vérifiez que le jeton est valide et autorisé pour la surface MCP.'
          : err.status === 403
            ? " Le propriétaire du jeton n'a pas ce droit."
            : ''
      return failure(`Erreur ${err.code} : ${err.message}${hint}`)
    }
    return failure(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
  }
}

class ToolInputError extends Error {}

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const

// ── Structure ───────────────────────────────────────────────────────────────

/** Finds a column by its physical name or its label, accents and case aside. */
function findColumn(t: TableMeta, wanted: string): ColumnMeta {
  const cols = t.columns ?? []
  const w = fold(wanted.trim())
  const found = cols.find((c) => c.name === wanted) ?? cols.find((c) => fold(c.name) === w) ?? cols.find((c) => fold(c.label) === w)
  if (!found) {
    const names = cols.map((c) => c.name).join(', ')
    throw new ToolInputError(`Colonne « ${wanted} » introuvable dans ${t.label}. Colonnes : ${names}.`)
  }
  return found
}

const isTemporal = (c: ColumnMeta) => /^(date|timestamp)/.test(c.type)

function describeColumn(c: ColumnMeta): string[] {
  const notes = [
    c.pk ? 'clé primaire' : '',
    c.fk ? `→ ${c.fk.name} (table ${c.fk.table})` : '',
    c.visibility !== 'normal' ? c.visibility : '',
    c.description ?? c.native_comment ?? '',
  ].filter(Boolean)
  return [c.name, c.label, c.type, c.semantic ?? '', notes.join(' · ')]
}

// ── Métriques ───────────────────────────────────────────────────────────────

const FilterInput = z.object({
  column: z.string().describe('Nom ou libellé de la colonne'),
  table_id: z.string().optional().describe('Table de la colonne si ce n’est pas la table source de la métrique (liée par clé étrangère)'),
  op: z.enum(FILTER_OPS).describe('Opérateur : is, is_not, contains, eq, gt, gte, lt, lte, between, date (expression comme past30days, thismonth, 2026-01-01~2026-03-31), before, after, empty, not_empty…'),
  values: z.array(z.union([z.string(), z.number(), z.boolean()])).default([]).describe('Valeurs du filtre'),
})

/**
 * Builds the columns a metric query cites. The metric's own table is read once; another
 * table is reached by a foreign key of the source, joined once whatever the number of uses.
 */
class MetricQueryBuilder {
  private readonly tables = new Map<string, TableMeta>()
  readonly joins: Join[] = []

  constructor(
    private readonly api: EodiaApi,
    private readonly sourceTable: string | null,
  ) {}

  async table(id: string): Promise<TableMeta> {
    const known = this.tables.get(id)
    if (known) return known
    const t = await this.api.get<TableMeta>(`/v1/tables/${encodeURIComponent(id)}`)
    this.tables.set(id, t)
    return t
  }

  async column(column: string, tableId?: string): Promise<{ ref: ColumnRef; meta: ColumnMeta | null }> {
    // A metric built on a saved question: its columns are named as the question names them.
    if (!this.sourceTable) {
      if (tableId) throw new ToolInputError("Cette métrique repose sur une question enregistrée : seules ses propres colonnes sont utilisables, sans table_id.")
      return { ref: { field: column }, meta: null }
    }
    if (!tableId || tableId === this.sourceTable) {
      const meta = findColumn(await this.table(this.sourceTable), column)
      return { ref: { field: meta.name }, meta }
    }
    const source = await this.table(this.sourceTable)
    const target = await this.table(tableId)
    const key = (source.columns ?? []).find((c) => c.fk?.table === tableId)
    if (!key?.fk) {
      throw new ToolInputError(
        `Aucune clé étrangère de ${source.label} ne mène à ${target.label} : regroupez par une colonne de ${source.label} ou d'une table qu'elle référence.`,
      )
    }
    let join = this.joins.find((j) => j.source.kind === 'table' && j.source.id === tableId)
    if (!join) {
      join = { alias: `j${this.joins.length + 1}`, source: { kind: 'table', id: tableId }, kind: 'left', left: { field: key.name }, right: key.fk.name }
      this.joins.push(join)
    }
    const meta = findColumn(target, column)
    return { ref: { join: join.alias, field: meta.name }, meta }
  }

  /** The source's date column a period grouping falls back on: an event date first. */
  async defaultTimeColumn(): Promise<string> {
    if (!this.sourceTable) throw new ToolInputError('Précisez time_column : la métrique repose sur une question enregistrée.')
    const cols = ((await this.table(this.sourceTable)).columns ?? []).filter(isTemporal)
    const best = cols.find((c) => c.semantic === 'event_at') ?? cols.find((c) => c.semantic === 'created_at') ?? cols[0]
    if (!best) throw new ToolInputError('La table de la métrique n’a aucune colonne de date : time_unit est inutilisable.')
    return best.name
  }
}

// ── Enregistrement ──────────────────────────────────────────────────────────

export const TOOL_NAMES = [
  'list_datasources',
  'search_schema',
  'describe_table',
  'list_metrics',
  'query_metric',
  'list_questions',
  'run_question',
  'run_sql',
  'get_dashboard',
  'show_chart',
] as const

/** Rows handed to the chart view: enough for any chart, light enough for the conversation. */
const CHART_ROWS = 1000

/** The chart forms `show_chart` draws; the others fall back to a table. */
const CHART_TYPES = VISUALIZATIONS.filter((v) => v !== 'map' && v !== 'pivot')

/** The web application, for « Ouvrir » links. */
const webUrl = () => (process.env.EODIA_PUBLIC_URL ?? process.env.EODIA_URL ?? '').replace(/\/+$/, '')

export function registerTools(server: McpServer, api: EodiaApi): void {
  registerChartApp(server)

  server.registerTool(
    'list_datasources',
    {
      title: 'Sources de données',
      description:
        "Liste les sources de données connectées (bases PostgreSQL, MySQL, MongoDB…) que le propriétaire du jeton peut lire, avec leur catalogue Trino : en SQL, une table se cite catalogue.schéma.table.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () =>
      guarded(async () => {
        const list = await api.get<Datasource[]>('/v1/datasources')
        if (!list.length) return 'Aucune source de données accessible.'
        return table(
          ['Nom', 'Moteur', 'Catalogue Trino', 'Tables', 'Synchro', 'Description', 'id'],
          list.map((d) => [d.name, d.engine, d.catalog, d.stats.tables, d.sync.status, d.description ?? '', d.id]),
        )
      }),
  )

  server.registerTool(
    'search_schema',
    {
      title: 'Rechercher dans le schéma',
      description:
        "Cherche des tables et des colonnes par mot-clé (nom, libellé, description), dans toutes les sources lisibles. Renvoie les tables trouvées, leur identifiant (pour describe_table) et les colonnes qui correspondent.",
      inputSchema: { query: z.string().min(1).describe('Mots-clés, par exemple « client région » ou « montant »') },
      annotations: READ_ONLY,
    },
    ({ query }) =>
      guarded(async () => {
        const tables = await api.get<TableMeta[]>('/v1/tables?columns=1')
        const words = fold(query).split(/\s+/).filter(Boolean)
        const hits = tables
          .filter((t) => t.status === 'active' && t.visibility !== 'hidden')
          .map((t) => {
            const own = fold(`${t.name} ${t.label} ${t.description ?? ''} ${t.native_comment ?? ''} ${t.entity ?? ''}`)
            const cols = (t.columns ?? []).filter((c) => c.status === 'active' && c.visibility !== 'hidden')
            const matching = cols.filter((c) => {
              const hay = fold(`${c.name} ${c.label} ${c.description ?? ''} ${c.native_comment ?? ''} ${c.semantic ?? ''}`)
              return words.some((w) => hay.includes(w))
            })
            // A word found in the table itself weighs more than one found in a column.
            const score = words.reduce((s, w) => s + (own.includes(w) ? 3 : 0) + (matching.some((c) => fold(`${c.name} ${c.label} ${c.description ?? ''}`).includes(w)) ? 1 : 0), 0)
            return { t, matching, score }
          })
          .filter((h) => h.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 20)
        if (!hits.length) return `Aucune table ni colonne ne correspond à « ${query} ».`
        return hits
          .map(({ t, matching }) => {
            const head = `- **${t.label}** \`${t.qualified}\` — id \`${t.id}\`${t.row_count != null ? ` — ~${t.row_count} lignes` : ''}`
            const desc = t.description ? `\n  ${cell(t.description)}` : ''
            const cols = matching.length ? `\n  Colonnes : ${matching.slice(0, 12).map((c) => `${c.name} (${c.type}${c.label !== c.name ? `, « ${c.label} »` : ''})`).join(', ')}` : ''
            return head + desc + cols
          })
          .join('\n')
      }),
  )

  server.registerTool(
    'describe_table',
    {
      title: 'Décrire une table',
      description:
        "Décrit une table : nom qualifié Trino, colonnes (type, type sémantique, clés, description) et valeurs des colonnes de catégorie. À appeler avant d'écrire du SQL ou de filtrer une métrique.",
      inputSchema: { table_id: z.string().describe('Identifiant de la table (voir search_schema)') },
      annotations: READ_ONLY,
    },
    ({ table_id }) =>
      guarded(async () => {
        const t = await api.get<TableMeta>(`/v1/tables/${encodeURIComponent(table_id)}`)
        const cols = (t.columns ?? []).filter((c) => c.status === 'active')
        const parts = [
          `# ${t.label}`,
          `\`${t.qualified}\`${t.row_count != null ? ` · ~${t.row_count} lignes` : ''}${t.entity ? ` · entité ${t.entity}` : ''}`,
        ]
        if (t.description ?? t.native_comment) parts.push(cell(t.description ?? t.native_comment))
        parts.push(table(['Colonne', 'Libellé', 'Type', 'Sémantique', 'Notes'], cols.map(describeColumn), 200))
        // Category values in parallel, a dozen columns at most: enough to write a filter.
        const valued = cols.filter((c) => c.has_values && c.visibility !== 'hidden').slice(0, 12)
        const values = await Promise.all(
          valued.map(async (c) => {
            try {
              const v = await api.get<{ values: ColumnValue[]; complete: boolean }>(`/v1/columns/${encodeURIComponent(c.id)}/values`)
              const shown = v.values.slice(0, 25).map((x) => (x.label && x.label !== x.value ? `${x.value} (« ${x.label} »)` : x.value))
              return `- **${c.name}** : ${shown.join(', ')}${v.values.length > 25 || !v.complete ? ', …' : ''}`
            } catch {
              return null
            }
          }),
        )
        const lines = values.filter((l): l is string => l !== null)
        if (lines.length) parts.push(`## Valeurs\n${lines.join('\n')}`)
        return parts.join('\n\n')
      }),
  )

  server.registerTool(
    'list_metrics',
    {
      title: 'Métriques',
      description:
        "Liste les métriques enregistrées (chiffre d'affaires, panier moyen…) : des agrégats définis une fois, à interroger avec query_metric plutôt que de réécrire leur calcul.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () =>
      guarded(async () => {
        const list = await api.get<ItemSummary[]>('/v1/metrics')
        if (!list.length) return 'Aucune métrique accessible.'
        return table(['Nom', 'Description', 'id'], list.map((m) => [m.name, m.description ?? '', m.id]))
      }),
  )

  server.registerTool(
    'query_metric',
    {
      title: 'Interroger une métrique',
      description:
        "Calcule une métrique enregistrée, éventuellement regroupée par une colonne (group_by) et/ou par période (time_unit sur time_column, par défaut la date d'événement de la table) et filtrée. La définition de la métrique (ses propres filtres compris) s'applique telle quelle.",
      inputSchema: {
        metric_id: z.string().describe('Identifiant de la métrique (voir list_metrics)'),
        group_by: z
          .object({
            column: z.string().describe('Nom ou libellé de la colonne'),
            table_id: z.string().optional().describe('Table de la colonne si ce n’est pas la table de la métrique (rejointe par clé étrangère)'),
          })
          .optional()
          .describe('Regroupement par une colonne'),
        time_unit: z.enum(TIME_UNITS).optional().describe('Regroupement par période'),
        time_column: z.string().optional().describe('Colonne de date du regroupement par période'),
        filters: z.array(FilterInput).max(10).optional().describe('Filtres supplémentaires'),
      },
      annotations: READ_ONLY,
    },
    ({ metric_id, group_by, time_unit, time_column, filters }) =>
      guarded(async () => {
        const metric = await api.get<Question>(`/v1/questions/${encodeURIComponent(metric_id)}`)
        if (metric.type !== 'metric') throw new ToolInputError(`« ${metric.name} » n'est pas une métrique : utilisez run_question.`)
        if (metric.query.kind !== 'builder') throw new ToolInputError(`La métrique « ${metric.name} » n'est pas construite avec l'éditeur visuel.`)
        const source = metric.query.source
        const b = new MetricQueryBuilder(api, source.kind === 'table' ? source.id : null)

        const breakouts: Breakout[] = []
        const unit: TimeUnit | undefined = time_unit ?? (time_column ? 'month' : undefined)
        if (unit) {
          const { ref, meta } = await b.column(time_column ?? (await b.defaultTimeColumn()))
          if (meta && !isTemporal(meta)) throw new ToolInputError(`${meta.name} n'est pas une date (${meta.type}).`)
          breakouts.push({ ...ref, unit })
        }
        if (group_by) breakouts.push((await b.column(group_by.column, group_by.table_id)).ref)

        const extra: Filter[] = []
        for (const f of filters ?? []) extra.push({ column: (await b.column(f.column, f.table_id)).ref, op: f.op, values: f.values })

        const query: BuilderQuery = {
          kind: 'builder',
          source,
          ...(b.joins.length ? { joins: b.joins } : {}),
          ...(extra.length ? { filters: extra } : {}),
          aggregations: [{ fn: 'metric', metric: metric.id, label: metric.name }],
          ...(breakouts.length ? { breakouts } : {}),
          // Periods read in time order; otherwise the largest values first.
          ...(breakouts.length && !unit ? { sort: [{ target: { kind: 'aggregation', index: 0 }, desc: true }] } : {}),
        }
        const result = await api.post<QueryResult>('/v1/query', { query, limit: 2000 })
        return `**${metric.name}**${metric.description ? ` — ${metric.description}` : ''}\n\n${resultMarkdown(result, { sql: true })}`
      }),
  )

  server.registerTool(
    'list_questions',
    {
      title: 'Questions et tableaux de bord',
      description:
        "Recherche les questions, modèles, métriques et tableaux de bord enregistrés, par nom ou description. Sans recherche, liste les plus récents.",
      inputSchema: { search: z.string().max(200).optional().describe('Texte recherché') },
      annotations: READ_ONLY,
    },
    ({ search }) =>
      guarded(async () => {
        const { items } = await api.get<{ items: ItemSummary[] }>(`/v1/search?q=${encodeURIComponent(search ?? '')}`)
        if (!items.length) return search ? `Rien ne correspond à « ${search} ».` : 'Aucun élément accessible.'
        return table(['Type', 'Nom', 'Description', 'id'], items.map((i) => [i.kind, i.name, i.description ?? '', i.id]))
      }),
  )

  server.registerTool(
    'run_question',
    {
      title: 'Exécuter une question',
      description:
        'Exécute une question (ou un modèle, une métrique) enregistrée et renvoie son résultat. Les variables d’une question SQL se passent dans parameters, par nom.',
      inputSchema: {
        question_id: z.string().describe('Identifiant de la question (voir list_questions)'),
        parameters: z
          .record(z.string(), z.union([z.string(), z.array(z.string())]))
          .optional()
          .describe('Valeurs des variables, par nom : { "region": "Bretagne" }'),
      },
      annotations: READ_ONLY,
    },
    ({ question_id, parameters }) =>
      guarded(async () => {
        const id = encodeURIComponent(question_id)
        const [q, result] = await Promise.all([
          api.get<Question>(`/v1/questions/${id}`),
          api.post<QueryResult>(`/v1/questions/${id}/run`, parameters ? { parameters } : {}),
        ])
        return `**${q.name}**${q.description ? ` — ${q.description}` : ''}\n\n${resultMarkdown(result)}`
      }),
  )

  server.registerTool(
    'run_sql',
    {
      title: 'Exécuter du SQL',
      description:
        "Exécute une requête SQL en lecture seule dans Trino (dialecte Trino), sous les droits du propriétaire du jeton : ses permissions de tables, de colonnes et de lignes s'appliquent. Les tables se citent catalogue.schéma.table (voir list_datasources et describe_table). Les requêtes inter-sources sont possibles.",
      inputSchema: {
        sql: z.string().min(1).max(100_000).describe('Requête SELECT (ou WITH, SHOW, DESCRIBE, EXPLAIN)'),
        limit: z.number().int().positive().max(10_000).optional().describe('Nombre maximal de lignes lues (défaut 200)'),
      },
      annotations: READ_ONLY,
    },
    ({ sql, limit }) =>
      guarded(async () => {
        // Trino refuses writes through the access control anyway; refusing here first gives a
        // clearer message and keeps a read-only tool honest about what it runs.
        const statement = sql.replace(/^(\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)+/, '')
        if (!/^(select|with|show|describe|explain|values|table)\b/i.test(statement)) {
          throw new ToolInputError('run_sql est en lecture seule : SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, VALUES ou TABLE uniquement.')
        }
        const result = await api.post<QueryResult>('/v1/query', { query: { kind: 'sql', sql }, limit: limit ?? 200 })
        return resultMarkdown(result)
      }),
  )

  server.registerTool(
    'get_dashboard',
    {
      title: 'Tableau de bord',
      description:
        "Résume un tableau de bord : onglets, filtres et cartes (avec l'identifiant de la question de chaque carte, à exécuter avec run_question).",
      inputSchema: { dashboard_id: z.string().describe('Identifiant du tableau de bord (voir list_questions)') },
      annotations: READ_ONLY,
    },
    ({ dashboard_id }) =>
      guarded(async () => {
        const d = await api.get<Dashboard>(`/v1/dashboards/${encodeURIComponent(dashboard_id)}`)
        const ids = [...new Set(d.cards.map((c) => c.question).filter((q): q is string => !!q))]
        const names = new Map<string, Question>()
        await Promise.all(
          ids.map(async (id) => {
            try {
              names.set(id, await api.get<Question>(`/v1/questions/${encodeURIComponent(id)}`))
            } catch {
              // A card on a question the reader cannot open stays listed, without its name.
            }
          }),
        )
        const parts = [`# ${d.name}`]
        if (d.description) parts.push(d.description)
        if (d.parameters.length) {
          parts.push(
            `## Filtres\n${table(
              ['id', 'Libellé', 'Type', 'Défaut'],
              d.parameters.map((p) => [p.id, p.label, p.type, p.default ?? '']),
            )}`,
          )
        }
        const tabs = d.tabs.length ? d.tabs : [{ id: null, label: 'Cartes' }]
        for (const tab of tabs) {
          const cards = d.cards
            .filter((c) => (d.tabs.length ? c.tab === tab.id : true))
            .sort((a, b) => a.y - b.y || a.x - b.x)
          const rows = cards.map((c) => {
            const q = c.question ? names.get(c.question) : undefined
            const title = c.title || q?.name || (c.kind === 'heading' || c.kind === 'text' ? (c.text ?? '').slice(0, 80) : c.kind)
            const what = c.kind === 'question' ? (q ? `${q.type}, ${q.visualization.type}` : c.question ? 'question inaccessible' : 'requête intégrée') : c.kind
            return [title, what, c.question ?? '']
          })
          parts.push(`## ${tab.label}\n${rows.length ? table(['Carte', 'Nature', 'Question'], rows, MAX_ROWS) : '_Aucune carte._'}`)
        }
        return parts.join('\n\n')
      }),
  )

  registerAppTool(
    server,
    'show_chart',
    {
      title: 'Afficher un graphique',
      description:
        "Affiche un graphique dans la conversation (MCP Apps), dessiné comme dans eodia insights : soit une question enregistrée (question_id, avec sa visualisation), soit une requête SQL Trino en lecture seule (sql) avec la forme voulue. Le résultat textuel est aussi renvoyé. Pour un graphique par période, groupez par une date tronquée (date_trunc) ; pour des séries, une deuxième dimension. À utiliser quand la personne veut voir des chiffres plutôt que les lire.",
      inputSchema: {
        question_id: z.string().optional().describe('Question enregistrée à afficher (voir list_questions)'),
        parameters: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional().describe('Variables de la question, par nom'),
        sql: z.string().min(1).max(100_000).optional().describe('Requête SELECT Trino, si aucune question_id'),
        visualization: z.enum(CHART_TYPES as [string, ...string[]]).optional().describe('Forme : bar, row, line, area, combo, pie, funnel, scatter, scalar, gauge, table… (défaut : celle de la question, sinon déduite du résultat)'),
        stack: z.enum(['none', 'stacked', 'percent']).optional().describe('Empilement des séries (barres, aires)'),
        title: z.string().max(200).optional().describe('Titre affiché au-dessus du graphique'),
      },
      annotations: READ_ONLY,
      _meta: { ui: { resourceUri: CHART_URI } },
    },
    async ({ question_id, parameters, sql, visualization, stack, title }) => {
      let structured: Record<string, unknown> | undefined
      const out = await guarded(async () => {
        if (!question_id && !sql) throw new ToolInputError('Donnez question_id ou sql.')
        let result: QueryResult & { looks?: unknown }
        let name: string
        let subtitle: string | undefined
        let viz: { type: string; settings?: Record<string, unknown> } | undefined
        let url: string | undefined
        const web = webUrl()
        if (question_id) {
          const id = encodeURIComponent(question_id)
          const [q, r] = await Promise.all([
            api.get<Question>(`/v1/questions/${id}`),
            api.post<QueryResult>(`/v1/questions/${id}/run`, parameters ? { parameters } : {}),
          ])
          result = r
          name = q.name
          subtitle = q.description ?? undefined
          viz = { type: q.visualization.type, ...(q.visualization.settings ? { settings: q.visualization.settings as Record<string, unknown> } : {}) }
          if (web) url = `${web}/question/${q.id}`
        } else {
          const statement = (sql as string).replace(/^(\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)+/, '')
          if (!/^(select|with|values|table)\b/i.test(statement)) throw new ToolInputError('show_chart lit des données : SELECT, WITH, VALUES ou TABLE uniquement.')
          result = await api.post<QueryResult>('/v1/query', { query: { kind: 'sql', sql }, limit: CHART_ROWS })
          name = 'Requête SQL'
          if (web) url = `${web}/question/new?sql=${encodeURIComponent(sql as string)}`
        }
        if (visualization) viz = { type: visualization, ...(viz?.type === visualization && viz.settings ? { settings: viz.settings } : {}) }
        if (stack) viz = { type: viz?.type ?? 'bar', settings: { ...(viz?.settings ?? {}), stack } }
        const rows = result.rows.slice(0, CHART_ROWS)
        structured = {
          title: title ?? name,
          ...(subtitle ? { subtitle } : {}),
          ...(url ? { url } : {}),
          ...(viz ? { visualization: viz } : {}),
          result: {
            columns: result.columns,
            rows,
            ...(result.looks ? { looks: result.looks } : {}),
            truncated: !!result.truncated || result.rows.length > rows.length,
          },
        }
        return `**${title ?? name}**${viz ? ` (${viz.type})` : ''} — graphique affiché à la personne.\n\n${resultMarkdown(result)}`
      })
      return structured && !out.isError ? { ...out, structuredContent: structured } : out
    },
  )
}
