/**
 * Les outils du serveur MCP (`apps/mcp`), décrits pour la documentation. Le front ne parle
 * qu'à l'API : cette liste reprend celle du serveur et doit évoluer avec elle.
 */
import { msg } from '@/lib/i18n'

export interface McpParam {
  readonly name: string
  readonly type: string
  readonly required: boolean
  readonly description: string
}

export interface McpTool {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly params: readonly McpParam[]
  /** Arguments of a sample call. */
  readonly example: Readonly<Record<string, unknown>>
  /** The REST endpoints it calls, under the caller's token. */
  readonly calls: readonly string[]
}

export const MCP_TOOLS: readonly McpTool[] = [
  {
    name: 'list_datasources',
    title: msg('Sources de données'),
    description:
      msg('Liste les sources de données lisibles par le propriétaire du jeton, avec leur moteur et leur catalogue Trino : en SQL, une table se cite catalogue.schéma.table.'),
    params: [],
    example: {},
    calls: ['GET /api/v1/datasources'],
  },
  {
    name: 'search_schema',
    title: msg('Rechercher dans le schéma'),
    description: msg('Cherche des tables et des colonnes par mot-clé (nom, libellé, description) dans toutes les sources lisibles.'),
    params: [{ name: 'query', type: 'string', required: true, description: msg('Mots-clés, par exemple « client région ».') }],
    example: { query: 'client région' },
    calls: ['GET /api/v1/tables?columns=1'],
  },
  {
    name: 'describe_table',
    title: msg('Décrire une table'),
    description: msg('Nom qualifié Trino, colonnes (type, type sémantique, clés, description) et valeurs des colonnes de catégorie.'),
    params: [{ name: 'table_id', type: 'string', required: true, description: msg('Identifiant de la table, donné par search_schema.') }],
    example: { table_id: '<id>' },
    calls: ['GET /api/v1/tables/{id}', 'GET /api/v1/columns/{id}/values'],
  },
  {
    name: 'list_metrics',
    title: msg('Métriques'),
    description: msg("Liste les métriques enregistrées : des agrégats définis une fois (chiffre d'affaires, panier moyen…)."),
    params: [],
    example: {},
    calls: ['GET /api/v1/metrics'],
  },
  {
    name: 'query_metric',
    title: msg('Interroger une métrique'),
    description:
      msg("Calcule une métrique, regroupée par une colonne et/ou par période, avec des filtres en plus des siens. Une colonne d'une autre table est rejointe par clé étrangère."),
    params: [
      { name: 'metric_id', type: 'string', required: true, description: msg('Identifiant de la métrique.') },
      { name: 'group_by', type: '{ column, table_id? }', required: false, description: msg('Colonne de regroupement, par nom ou libellé.') },
      { name: 'time_unit', type: 'day | week | month | quarter | year', required: false, description: msg('Regroupement par période.') },
      { name: 'time_column', type: 'string', required: false, description: msg("Colonne de date ; par défaut la date d'événement de la table.") },
      { name: 'filters', type: '{ column, op, values, table_id? }[]', required: false, description: msg('Filtres supplémentaires (is, contains, gt, between, date…).') },
    ],
    example: { metric_id: '<id>', time_unit: 'month', time_column: 'passee_le' },
    calls: ['GET /api/v1/questions/{id}', 'POST /api/v1/query'],
  },
  {
    name: 'list_questions',
    title: msg('Questions et tableaux de bord'),
    description: msg('Recherche les questions, modèles, métriques et tableaux de bord enregistrés.'),
    params: [{ name: 'search', type: 'string', required: false, description: msg('Texte recherché ; vide : les plus récents.') }],
    example: { search: 'commandes' },
    calls: ['GET /api/v1/search?q='],
  },
  {
    name: 'run_question',
    title: msg('Exécuter une question'),
    description: msg('Exécute une question enregistrée et renvoie son résultat en tableau (50 lignes au plus).'),
    params: [
      { name: 'question_id', type: 'string', required: true, description: msg('Identifiant de la question.') },
      { name: 'parameters', type: 'Record<string, string | string[]>', required: false, description: msg("Valeurs des variables d'une question SQL, par nom.") },
    ],
    example: { question_id: '<id>' },
    calls: ['POST /api/v1/questions/{id}/run'],
  },
  {
    name: 'run_sql',
    title: msg('Exécuter du SQL'),
    description:
      msg('Exécute une requête SQL Trino en lecture seule, sous les droits du propriétaire du jeton : ses permissions de tables, de colonnes et de lignes s’appliquent. Les requêtes inter-sources sont possibles.'),
    params: [
      { name: 'sql', type: 'string', required: true, description: msg('SELECT, WITH, SHOW, DESCRIBE ou EXPLAIN.') },
      { name: 'limit', type: 'integer', required: false, description: msg('Nombre maximal de lignes lues (défaut 200).') },
    ],
    example: { sql: 'select count(*) from boutique.public.commandes' },
    calls: ['POST /api/v1/query'],
  },
  {
    name: 'get_dashboard',
    title: msg('Tableau de bord'),
    description: msg('Résume un tableau de bord : onglets, filtres et cartes, avec la question de chaque carte.'),
    params: [{ name: 'dashboard_id', type: 'string', required: true, description: msg('Identifiant du tableau de bord.') }],
    example: { dashboard_id: '<id>' },
    calls: ['GET /api/v1/dashboards/{id}', 'GET /api/v1/questions/{id}'],
  },
  {
    name: 'show_chart',
    title: msg('Afficher un graphique'),
    description:
      msg('Affiche un graphique dans la conversation (MCP Apps : Claude, ChatGPT, VS Code…), dessiné comme dans l’application, d’une question enregistrée ou d’une requête SQL. Un client sans MCP Apps reçoit le résultat en texte.'),
    params: [
      { name: 'question_id', type: 'string', required: false, description: msg('Question enregistrée, avec sa visualisation.') },
      { name: 'parameters', type: 'object', required: false, description: msg('Variables de la question, par nom.') },
      { name: 'sql', type: 'string', required: false, description: msg('Requête SELECT Trino, à défaut de question_id.') },
      { name: 'visualization', type: 'string', required: false, description: msg('bar, row, line, area, combo, pie, funnel, scatter, scalar, gauge, table…') },
      { name: 'stack', type: 'string', required: false, description: msg('none, stacked ou percent.') },
      { name: 'title', type: 'string', required: false, description: msg('Titre affiché.') },
    ],
    example: { sql: "select date_trunc('month', passee_le) as mois, statut, count(*) as commandes from boutique.public.commandes group by 1, 2", visualization: 'bar', stack: 'stacked' },
    calls: ['GET /api/v1/questions/{id}', 'POST /api/v1/questions/{id}/run', 'POST /api/v1/query'],
  },
]

/**
 * Where the MCP server answers. In development it listens on its own port; behind Caddy it
 * shares the application's address, under `/mcp`.
 */
export function mcpUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:4200/mcp'
  const { protocol, hostname, port, origin } = window.location
  return port === '3100' ? `${protocol}//${hostname}:4200/mcp` : `${origin}/mcp`
}
