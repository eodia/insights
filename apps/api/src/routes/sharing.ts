import { z } from '@hono/zod-openapi'
import { type ParameterValue, requestLocaleOf } from '@eodia/contracts'
import {
  AppError,
  assistantInfo,
  type CopilotContext,
  copilotTurn,
  createShareLink,
  deleteConversation,
  getDashboard,
  getQuestion,
  listConversations,
  listShareLinks,
  localizeMessage,
  openEmbed,
  openShareLink,
  readConversation,
  renameConversation,
  revokeShareLink,
  runCard,
  runQuestion,
  sharedContent,
  updateShareLink,
} from '@eodia/core'
import { streamSSE } from 'hono/streaming'
import { actorOf, bodyOf, type newApp, ok, param, route } from '../http'

const LinkInput = z.object({
  item_kind: z.enum(['question', 'dashboard']),
  item_id: z.string(),
  audience: z.enum(['public', 'members']),
  groups: z.array(z.string()).optional(),
  can_embed: z.boolean().optional(),
  locked_parameters: z.record(z.string(), z.any()).optional(),
})
const LinkPatch = LinkInput.omit({ item_kind: true, item_id: true }).partial()
const PublicRun = z.object({ values: z.record(z.string(), z.any()).optional(), parameters: z.record(z.string(), z.any()).optional() })
const ConversationPatch = z.object({ title: z.string().trim().min(1).max(120) })

const CopilotInput = z.object({
  conversation: z.string().nullish(),
  message: z.string().min(1).max(8000),
  allow_run: z.boolean().nullish(),
  context: z.record(z.string(), z.any()).nullish(),
})

export function sharingRoutes(app: ReturnType<typeof newApp>) {
  const tags = ['Partage']

  route(app, { method: 'get', path: '/api/v1/share-links/:kind/:id', tags, summary: "Liens de partage d'un élément" }, async (c) =>
    ok(c, await listShareLinks(c.get('core'), actorOf(c), param(c, 'kind') as 'question' | 'dashboard', param(c, 'id'))),
  )
  route(app, { method: 'post', path: '/api/v1/share-links', tags, summary: 'Créer un lien public ou réservé aux membres', body: LinkInput }, async (c) =>
    ok(c, await createShareLink(c.get('core'), actorOf(c), bodyOf(c, LinkInput))),
  )
  route(app, { method: 'patch', path: '/api/v1/share-links/:id', tags, summary: 'Modifier un lien de partage', body: LinkPatch }, async (c) =>
    ok(c, await updateShareLink(c.get('core'), actorOf(c), param(c, 'id'), bodyOf(c, LinkPatch))),
  )
  route(app, { method: 'delete', path: '/api/v1/share-links/:id', tags, summary: 'Désactiver un lien de partage' }, async (c) => {
    await revokeShareLink(c.get('core'), actorOf(c), param(c, 'id'))
    return ok(c)
  })

  // ── Pages publiques : sous l'autorité de l'auteur du lien ──
  const ptags = ['Public']
  route(app, { method: 'get', path: '/api/public/links/:token', tags: ptags, summary: 'Contenu d’un lien de partage', public: true }, async (c) =>
    ok(c, await sharedContent(c.get('core'), param(c, 'token'), c.get('actor'))),
  )
  route(app, { method: 'post', path: '/api/public/links/:token/cards/:card/run', tags: ptags, summary: "Exécuter une carte d'un tableau partagé", body: PublicRun, public: true }, async (c) => {
    const core = c.get('core')
    const { link, actor } = await openShareLink(core, param(c, 'token'), c.get('actor'))
    if (link.item_kind !== 'dashboard') throw new AppError('NOT_FOUND', 'Carte introuvable.')
    return ok(c, await runCard(core, actor, link.item_id, param(c, 'card'), bodyOf(c, PublicRun).values ?? {}, { origin: 'share', locked: link.locked_parameters }))
  })
  route(app, { method: 'post', path: '/api/public/links/:token/run', tags: ptags, summary: 'Exécuter une question partagée', body: PublicRun, public: true }, async (c) => {
    const core = c.get('core')
    const { link, actor } = await openShareLink(core, param(c, 'token'), c.get('actor'))
    if (link.item_kind !== 'question') throw new AppError('NOT_FOUND', 'Question introuvable.')
    return ok(c, await runQuestion(core, actor, link.item_id, { origin: 'share', parameters: { ...(bodyOf(c, PublicRun).parameters ?? {}), ...link.locked_parameters } }))
  })

  // Signed embedding: `?token=<JWT HS256>` signed by the host application.
  route(app, { method: 'get', path: '/api/public/embed', tags: ptags, summary: "Contenu d'une intégration signée", query: z.object({ token: z.string() }), public: true }, async (c) => {
    const core = c.get('core')
    const { claims, actor } = await openEmbed(core, c.req.query('token') ?? '')
    const locked = new Set(Object.keys(claims.params ?? {}))
    if (claims.resource.dashboard) {
      const d = await getDashboard(core, actor, claims.resource.dashboard)
      return ok(c, { dashboard: { ...d, parameters: d.parameters.filter((p) => !locked.has(p.id)), access: 'view' } })
    }
    if (claims.resource.question) {
      const q = await getQuestion(core, actor, claims.resource.question)
      return ok(c, { question: { id: q.id, name: q.name, description: q.description, visualization: q.visualization } })
    }
    throw new AppError('NOT_FOUND', 'Ressource absente du jeton.')
  })
  route(app, { method: 'post', path: '/api/public/embed/run', tags: ptags, summary: "Exécuter une carte ou une question d'une intégration signée", body: PublicRun.extend({ token: z.string(), card: z.string().optional() }), public: true }, async (c) => {
    const core = c.get('core')
    const input = bodyOf(c, PublicRun.extend({ token: z.string(), card: z.string().optional() }))
    const { claims, actor } = await openEmbed(core, input.token)
    const locked = (claims.params ?? {}) as Record<string, ParameterValue | null>
    if (claims.resource.dashboard && input.card) {
      return ok(c, await runCard(core, actor, claims.resource.dashboard, input.card, input.values ?? {}, { origin: 'share', locked }))
    }
    if (claims.resource.question) return ok(c, await runQuestion(core, actor, claims.resource.question, { origin: 'share', parameters: { ...(input.parameters ?? {}), ...locked } }))
    throw new AppError('NOT_FOUND', 'Ressource absente du jeton.')
  })

  // ── Copilot ──
  const ctags = ['Copilot']
  app.post('/api/v1/copilot', async (c) => {
    const actor = actorOf(c)
    const parsed = CopilotInput.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw new AppError('INVALID_INPUT', 'Message invalide.')
    const input = parsed.data
    const core = c.get('core')
    const locale = requestLocaleOf(c.req.header('cookie'), c.req.header('accept-language'))
    return streamSSE(c, async (stream) => {
      const controller = new AbortController()
      stream.onAbort(() => controller.abort())
      try {
        await copilotTurn(
          core,
          actor,
          {
            ...(input.conversation ? { conversation: input.conversation } : {}),
            message: input.message,
            allowRun: input.allow_run ?? false,
            context: (input.context ?? { kind: 'general' }) as CopilotContext,
          },
          (event) => {
            const shown = event.type === 'tool_result' ? { ...event, summary: localizeMessage(event.summary, locale) } : event
            void stream.writeSSE({ event: event.type, data: JSON.stringify(shown) })
          },
          controller.signal,
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ type: 'error', message: localizeMessage(message, locale) }) })
      }
    })
  })
  route(app, { method: 'get', path: '/api/v1/copilot/info', tags: ctags, summary: 'Le modèle qui répond' }, async (c) => ok(c, assistantInfo(c.get('core'))))
  route(app, { method: 'get', path: '/api/v1/copilot/conversations', tags: ctags, summary: 'Conversations du copilot' }, async (c) => {
    const kind = c.req.query('kind')
    return ok(c, await listConversations(c.get('core'), actorOf(c), kind === 'assistant' || kind === 'panel' ? kind : undefined))
  })
  route(app, { method: 'patch', path: '/api/v1/copilot/conversations/:id', tags: ctags, summary: 'Renommer une conversation', body: ConversationPatch }, async (c) => {
    await renameConversation(c.get('core'), actorOf(c), param(c, 'id'), bodyOf(c, ConversationPatch).title)
    return ok(c)
  })
  route(app, { method: 'get', path: '/api/v1/copilot/conversations/:id', tags: ctags, summary: 'Lire une conversation' }, async (c) => ok(c, await readConversation(c.get('core'), actorOf(c), param(c, 'id'))))
  route(app, { method: 'delete', path: '/api/v1/copilot/conversations/:id', tags: ctags, summary: 'Supprimer une conversation' }, async (c) => {
    await deleteConversation(c.get('core'), actorOf(c), param(c, 'id'))
    return ok(c)
  })
}
