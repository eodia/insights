import { z } from '@hono/zod-openapi'
import {
  DashboardInputSchema,
  FolderInputSchema,
  QuestionInputSchema,
  RunQuerySchema,
  ShareInputSchema,
  ThemeInputSchema,
} from '@eodia/contracts'
import {
  AppError,
  cancelExecution,
  createDashboard,
  createFolder,
  createQuestion,
  createTheme,
  deleteTheme,
  getTheme,
  listThemes,
  updateTheme,
  deleteDashboard,
  deleteFolder,
  deleteQuestion,
  folderContents,
  deleteSnippet,
  duplicateDashboard,
  duplicateQuestion,
  folderItems,
  getDashboard,
  getFolder,
  getQuestion,
  history,
  homeInsights,
  homeItems,
  listByType,
  listFolders,
  listShares,
  listSnippets,
  moveCard,
  recordView,
  runCard,
  runQuery,
  runQuestion,
  saveSnippet,
  search,
  setBookmark,
  share,
  toCsv,
  toJson,
  toXlsx,
  unshare,
  updateDashboard,
  updateFolder,
  updateQuestion,
} from '@eodia/core'
import { type Ctx, actorOf, bodyOf, type newApp, ok, param, queryOf, route } from '../http'

const Run = RunQuerySchema.extend({ execution_id: z.string().max(64).optional(), question: z.string().optional() })
const RunSaved = z.object({
  parameters: z.record(z.string(), z.any()).optional(),
  constraints: z.array(z.any()).optional(),
  fresh: z.boolean().optional(),
  execution_id: z.string().max(64).optional(),
})
const CardMove = z.object({ dashboard: z.string().min(1).max(64), tab: z.string().max(60).nullable().optional() })
const CardRun = z.object({ values: z.record(z.string(), z.any()).optional(), fresh: z.boolean().optional() })
const ExportInput = Run.extend({ format: z.enum(['csv', 'json', 'xlsx']), name: z.string().max(120).optional() })
const HistoryQuery = z.object({ all: z.enum(['0', '1']).optional(), origin: z.string().optional(), errors: z.enum(['0', '1']).optional(), before: z.string().optional() })
const SnippetInput = z.object({ name: z.string().min(1).max(80), description: z.string().max(500).nullable().optional(), content: z.string().min(1).max(50_000) })
const Bookmark = z.object({ kind: z.enum(['question', 'model', 'metric', 'dashboard', 'folder']), id: z.string(), on: z.boolean() })
const FolderPatch = FolderInputSchema.partial().extend({ archived: z.boolean().optional() })
const QuestionPatch = QuestionInputSchema.partial().extend({ archived: z.boolean().optional() })
const DashboardPatch = DashboardInputSchema.partial().extend({ archived: z.boolean().optional() })
const Copy = z.object({ folder: z.string().nullable().optional() })

function download(c: Ctx, format: 'csv' | 'json' | 'xlsx', name: string, result: Parameters<typeof toCsv>[0]) {
  const safe = (name || 'resultat').replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 80) || 'resultat'
  const filename = `${safe}.${format}`
  const headers = { 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` }
  if (format === 'csv') return c.body(toCsv(result), 200, { ...headers, 'content-type': 'text/csv; charset=utf-8' })
  if (format === 'json') return c.body(toJson(result), 200, { ...headers, 'content-type': 'application/json; charset=utf-8' })
  return c.body(new Uint8Array(toXlsx(result, safe)), 200, { ...headers, 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function contentRoutes(app: ReturnType<typeof newApp>) {
  const qtags = ['Exécution']

  route(app, {
    method: 'post',
    path: '/api/v1/query',
    tags: qtags,
    summary: 'Exécuter une requête (builder, SQL Trino ou SQL natif)',
    description: "S'exécute dans Trino sous l'identité de l'appelant : ses permissions de données, de colonnes et de lignes s'appliquent.",
    body: Run,
  }, async (c) => {
    const input = bodyOf(c, Run)
    const actor = actorOf(c)
    return ok(
      c,
      await runQuery(c.get('core'), actor, {
        query: input.query as never,
        origin: actor.via === 'token' ? 'api' : 'editor',
        adhoc: true,
        ...(input.parameters ? { parameters: input.parameters as never } : {}),
        ...(input.constraints ? { constraints: input.constraints as never } : {}),
        ...(input.fresh ? { fresh: true } : {}),
        ...(input.limit ? { limit: input.limit } : {}),
        ...(input.execution_id ? { executionId: input.execution_id } : {}),
        ...(input.question ? { questionId: input.question } : {}),
      }),
    )
  })

  route(app, { method: 'post', path: '/api/v1/query/cancel', tags: qtags, summary: 'Annuler une exécution en cours', body: z.object({ execution_id: z.string() }) }, async (c) =>
    ok(c, { cancelled: await cancelExecution(c.get('core'), actorOf(c), bodyOf(c, z.object({ execution_id: z.string() })).execution_id) }),
  )

  route(app, { method: 'post', path: '/api/v1/query/export', tags: qtags, summary: 'Exporter un résultat (CSV, JSON, XLSX)', body: ExportInput }, async (c) => {
    const input = bodyOf(c, ExportInput)
    const result = await runQuery(c.get('core'), actorOf(c), {
      query: input.query as never,
      origin: 'editor',
      adhoc: true,
      limit: Math.min(input.limit ?? 100_000, 100_000),
      ...(input.parameters ? { parameters: input.parameters as never } : {}),
      ...(input.constraints ? { constraints: input.constraints as never } : {}),
    })
    return download(c, input.format, input.name ?? '', result)
  })

  route(app, { method: 'get', path: '/api/v1/history', tags: qtags, summary: 'Historique des requêtes', query: HistoryQuery }, async (c) => {
    const q = queryOf(c, HistoryQuery)
    return ok(c, await history(c.get('core'), actorOf(c), { all: q.all === '1', ...(q.origin ? { origin: q.origin } : {}), errors: q.errors === '1', ...(q.before ? { before: Number(q.before) } : {}) }))
  })

  route(app, { method: 'get', path: '/api/v1/snippets', tags: qtags, summary: 'Snippets SQL' }, async (c) => {
    actorOf(c)
    return ok(c, await listSnippets(c.get('core')))
  })
  route(app, { method: 'post', path: '/api/v1/snippets', tags: qtags, summary: 'Créer un snippet', body: SnippetInput }, async (c) => ok(c, await saveSnippet(c.get('core'), actorOf(c), bodyOf(c, SnippetInput))))
  route(app, { method: 'put', path: '/api/v1/snippets/:id', tags: qtags, summary: 'Modifier un snippet', body: SnippetInput }, async (c) =>
    ok(c, await saveSnippet(c.get('core'), actorOf(c), { ...bodyOf(c, SnippetInput), id: param(c, 'id') })),
  )
  route(app, { method: 'delete', path: '/api/v1/snippets/:id', tags: qtags, summary: 'Supprimer un snippet' }, async (c) => {
    await deleteSnippet(c.get('core'), actorOf(c), param(c, 'id'))
    return ok(c)
  })

  // ── Dossiers ──
  const ftags = ['Dossiers']
  route(app, { method: 'get', path: '/api/v1/home', tags: ftags, summary: "Récents, favoris et nouveautés de l'accueil" }, async (c) => ok(c, await homeItems(c.get('core'), actorOf(c))))
  route(app, {
    method: 'get',
    path: '/api/v1/home/insights',
    tags: ftags,
    summary: "Les chiffres clés que l'accueil trouve seul",
    description: "Dans les tables que l'appelant peut interroger : un montant, un nombre de lignes ou une note, mois par mois, sur les douze derniers mois complets. Exécuté sous son identité.",
  }, async (c) => ok(c, await homeInsights(c.get('core'), actorOf(c))))
  route(app, { method: 'get', path: '/api/v1/search', tags: ftags, summary: 'Rechercher', query: z.object({ q: z.string().max(200), kind: z.enum(['question', 'model', 'metric', 'dashboard']).optional() }) }, async (c) => {
    const kind = c.req.query('kind') as 'question' | 'model' | 'metric' | 'dashboard' | undefined
    return ok(c, await search(c.get('core'), actorOf(c), c.req.query('q') ?? '', kind ? 200 : 30, kind))
  },
  )
  route(app, { method: 'post', path: '/api/v1/bookmarks', tags: ftags, summary: 'Ajouter ou retirer un favori', body: Bookmark }, async (c) => {
    const b = bodyOf(c, Bookmark)
    await setBookmark(c.get('core'), actorOf(c), b.kind, b.id, b.on)
    return ok(c)
  })
  route(app, { method: 'get', path: '/api/v1/folders', tags: ftags, summary: 'Dossiers accessibles' }, async (c) => ok(c, await listFolders(c.get('core'), actorOf(c))))
  route(app, { method: 'post', path: '/api/v1/folders', tags: ftags, summary: 'Créer un dossier', body: FolderInputSchema }, async (c) =>
    ok(c, await createFolder(c.get('core'), actorOf(c), bodyOf(c, FolderInputSchema) as never)),
  )
  route(app, { method: 'get', path: '/api/v1/folders/:id', tags: ftags, summary: 'Lire un dossier' }, async (c) => ok(c, await getFolder(c.get('core'), actorOf(c), param(c, 'id'))))
  route(app, { method: 'patch', path: '/api/v1/folders/:id', tags: ftags, summary: 'Modifier, déplacer ou archiver un dossier', body: FolderPatch }, async (c) =>
    ok(c, await updateFolder(c.get('core'), actorOf(c), param(c, 'id'), bodyOf(c, FolderPatch) as never)),
  )
  route(app, { method: 'get', path: '/api/v1/folders/:id/contents', tags: ftags, summary: 'Ce que contient un dossier, sous-dossiers compris' }, async (c) =>
    ok(c, await folderContents(c.get('core'), actorOf(c), param(c, 'id'))),
  )
  route(app, { method: 'delete', path: '/api/v1/folders/:id', tags: ftags, summary: 'Supprimer un dossier : son contenu passe au dossier parent (mode=move) ou part avec lui (mode=delete)' }, async (c) => {
    const mode = c.req.query('mode')
    if (mode !== 'move' && mode !== 'delete') throw new AppError('INVALID_INPUT', 'Précisez mode=move ou mode=delete.')
    await deleteFolder(c.get('core'), actorOf(c), param(c, 'id'), mode)
    return ok(c)
  })
  // ── Thèmes ──
  const ttags = ['Thèmes']
  const ThemePatch = ThemeInputSchema.partial()
  route(app, { method: 'get', path: '/api/v1/themes', tags: ttags, summary: 'Lister les thèmes' }, async (c) => ok(c, await listThemes(c.get('core'))))
  route(app, { method: 'get', path: '/api/v1/themes/:id', tags: ttags, summary: 'Lire un thème' }, async (c) => ok(c, await getTheme(c.get('core'), param(c, 'id'))))
  route(app, { method: 'post', path: '/api/v1/themes', tags: ttags, summary: 'Créer un thème (administrateurs)', body: ThemeInputSchema }, async (c) =>
    ok(c, await createTheme(c.get('core'), actorOf(c), bodyOf(c, ThemeInputSchema) as never)),
  )
  route(app, { method: 'patch', path: '/api/v1/themes/:id', tags: ttags, summary: 'Modifier un thème (administrateurs)', body: ThemePatch }, async (c) =>
    ok(c, await updateTheme(c.get('core'), actorOf(c), param(c, 'id'), bodyOf(c, ThemePatch) as never)),
  )
  route(app, { method: 'delete', path: '/api/v1/themes/:id', tags: ttags, summary: 'Supprimer un thème (administrateurs)' }, async (c) => {
    await deleteTheme(c.get('core'), actorOf(c), param(c, 'id'))
    return ok(c)
  })
  route(app, { method: 'get', path: '/api/v1/folders/:id/items', tags: ftags, summary: "Contenu d'un dossier (« root » pour la racine)" }, async (c) => {
    const id = param(c, 'id')
    return ok(c, await folderItems(c.get('core'), actorOf(c), id === 'root' ? null : id))
  })

  // ── Partage d'élément ──
  route(app, { method: 'get', path: '/api/v1/shares/:kind/:id', tags: ftags, summary: "Partages d'un élément" }, async (c) =>
    ok(c, await listShares(c.get('core'), actorOf(c), param(c, 'kind') as never, param(c, 'id'))),
  )
  route(app, { method: 'post', path: '/api/v1/shares', tags: ftags, summary: 'Partager un élément avec une personne ou un groupe', body: ShareInputSchema }, async (c) => {
    await share(c.get('core'), actorOf(c), bodyOf(c, ShareInputSchema))
    return ok(c)
  })
  route(app, { method: 'delete', path: '/api/v1/shares/:id', tags: ftags, summary: 'Retirer un partage' }, async (c) => {
    await unshare(c.get('core'), actorOf(c), param(c, 'id'))
    return ok(c)
  })

  // ── Questions, modèles, métriques ──
  const tags = ['Questions']
  route(app, { method: 'get', path: '/api/v1/models', tags, summary: 'Modèles accessibles' }, async (c) => ok(c, await listByType(c.get('core'), actorOf(c), 'model')))
  route(app, { method: 'get', path: '/api/v1/metrics', tags, summary: 'Métriques accessibles' }, async (c) => ok(c, await listByType(c.get('core'), actorOf(c), 'metric')))
  route(app, { method: 'post', path: '/api/v1/questions', tags, summary: 'Enregistrer une question, un modèle ou une métrique', body: QuestionInputSchema }, async (c) =>
    ok(c, await createQuestion(c.get('core'), actorOf(c), bodyOf(c, QuestionInputSchema))),
  )
  route(app, { method: 'get', path: '/api/v1/questions/:id', tags, summary: 'Lire une question' }, async (c) => {
    const actor = actorOf(c)
    const q = await getQuestion(c.get('core'), actor, param(c, 'id'))
    void recordView(c.get('core'), actor, q.type === 'question' ? 'question' : q.type, q.id)
    return ok(c, q)
  })
  route(app, { method: 'patch', path: '/api/v1/questions/:id', tags, summary: 'Modifier une question', body: QuestionPatch }, async (c) =>
    ok(c, await updateQuestion(c.get('core'), actorOf(c), param(c, 'id'), bodyOf(c, QuestionPatch))),
  )
  route(app, { method: 'delete', path: '/api/v1/questions/:id', tags, summary: 'Supprimer une question' }, async (c) => {
    await deleteQuestion(c.get('core'), actorOf(c), param(c, 'id'))
    return ok(c)
  })
  route(app, { method: 'post', path: '/api/v1/questions/:id/duplicate', tags, summary: 'Dupliquer une question', body: Copy }, async (c) =>
    ok(c, await duplicateQuestion(c.get('core'), actorOf(c), param(c, 'id'), bodyOf(c, Copy).folder)),
  )
  route(app, { method: 'post', path: '/api/v1/questions/:id/run', tags, summary: 'Exécuter une question enregistrée', body: RunSaved }, async (c) => {
    const input = bodyOf(c, RunSaved)
    const actor = actorOf(c)
    return ok(
      c,
      await runQuestion(c.get('core'), actor, param(c, 'id'), {
        origin: actor.via === 'token' ? 'api' : 'question',
        ...(input.parameters ? { parameters: input.parameters } : {}),
        ...(input.constraints ? { constraints: input.constraints } : {}),
        ...(input.fresh ? { fresh: true } : {}),
        ...(input.execution_id ? { executionId: input.execution_id } : {}),
      }),
    )
  })
  route(app, { method: 'post', path: '/api/v1/questions/:id/export', tags, summary: 'Exporter le résultat d’une question', body: RunSaved.extend({ format: z.enum(['csv', 'json', 'xlsx']) }) }, async (c) => {
    const input = bodyOf(c, RunSaved.extend({ format: z.enum(['csv', 'json', 'xlsx']) }))
    const core = c.get('core')
    const actor = actorOf(c)
    const q = await getQuestion(core, actor, param(c, 'id'))
    const result = await runQuestion(core, actor, q.id, { limit: 100_000, ...(input.parameters ? { parameters: input.parameters } : {}), ...(input.constraints ? { constraints: input.constraints } : {}) })
    return download(c, input.format, q.name, result)
  })

  // ── Tableaux de bord ──
  const dtags = ['Tableaux de bord']
  route(app, { method: 'post', path: '/api/v1/dashboards', tags: dtags, summary: 'Créer un tableau de bord', body: DashboardInputSchema }, async (c) =>
    ok(c, await createDashboard(c.get('core'), actorOf(c), bodyOf(c, DashboardInputSchema))),
  )
  route(app, { method: 'get', path: '/api/v1/dashboards/:id', tags: dtags, summary: 'Lire un tableau de bord' }, async (c) => {
    const actor = actorOf(c)
    const d = await getDashboard(c.get('core'), actor, param(c, 'id'))
    void recordView(c.get('core'), actor, 'dashboard', d.id)
    return ok(c, d)
  })
  route(app, { method: 'patch', path: '/api/v1/dashboards/:id', tags: dtags, summary: 'Modifier un tableau de bord', body: DashboardPatch }, async (c) =>
    ok(c, await updateDashboard(c.get('core'), actorOf(c), param(c, 'id'), bodyOf(c, DashboardPatch))),
  )
  route(app, { method: 'delete', path: '/api/v1/dashboards/:id', tags: dtags, summary: 'Supprimer un tableau de bord' }, async (c) => {
    await deleteDashboard(c.get('core'), actorOf(c), param(c, 'id'))
    return ok(c)
  })
  route(app, { method: 'post', path: '/api/v1/dashboards/:id/duplicate', tags: dtags, summary: 'Dupliquer un tableau de bord', body: Copy }, async (c) =>
    ok(c, await duplicateDashboard(c.get('core'), actorOf(c), param(c, 'id'), bodyOf(c, Copy).folder)),
  )
  route(app, {
    method: 'post',
    path: '/api/v1/dashboards/:id/cards/:card/run',
    tags: dtags,
    summary: "Exécuter une carte avec les valeurs des filtres",
    description: 'Les filtres auxquels la carte est reliée sont lus dans le tableau de bord lui-même.',
    body: CardRun,
  }, async (c) => {
    const input = bodyOf(c, CardRun)
    return ok(c, await runCard(c.get('core'), actorOf(c), param(c, 'id'), param(c, 'card'), input.values ?? {}, { ...(input.fresh ? { fresh: true } : {}) }))
  })
  route(app, {
    method: 'post',
    path: '/api/v1/dashboards/:id/cards/:card/move',
    tags: dtags,
    summary: 'Déplacer une carte vers un autre onglet ou un autre tableau de bord',
    description: 'Ses liens aux filtres ne suivent pas d’un tableau à l’autre ; une question créée dans le tableau quitté la suit.',
    body: CardMove,
  }, async (c) => {
    const input = bodyOf(c, CardMove)
    return ok(c, await moveCard(c.get('core'), actorOf(c), param(c, 'id'), param(c, 'card'), input.dashboard, input.tab ?? null))
  })
}

export { AppError }
