/** Abonnements, alertes, et les fichiers qu'un canal Teams ou Slack affiche par leur adresse. */
import { z } from '@hono/zod-openapi'
import { AlertInputSchema, type DeliveryCapabilities, SubscriptionInputSchema } from '@eodia/contracts'
import {
  checkAlert,
  deleteAlert,
  deleteSubscription,
  deliverSubscription,
  enqueue,
  listAlerts,
  listSubscriptions,
  mailEnabled,
  readFile,
  renderEnabled,
  saveAlert,
  saveSubscription,
} from '@eodia/core'
import { actorOf, bodyOf, type newApp, ok, param, queryOf, route } from '../http'

const stags = ['Abonnements et alertes']

export function deliveryRoutes(app: ReturnType<typeof newApp>) {
  route(app, { method: 'get', path: '/api/v1/delivery', tags: stags, summary: 'Ce que l’instance peut envoyer : e-mails, images et PDF' }, async (c) => {
    actorOf(c)
    const core = c.get('core')
    const out: DeliveryCapabilities = { email: mailEnabled(core), render: renderEnabled(core) }
    return ok(c, out)
  })

  // ── Abonnements ───────────────────────────────────────────────────────────
  route(app, { method: 'get', path: '/api/v1/subscriptions', tags: stags, summary: 'Ses abonnements (tous ceux de l’espace pour un administrateur)', query: z.object({ dashboard: z.string().uuid().optional() }) }, async (c) => {
    const q = queryOf(c, z.object({ dashboard: z.string().optional() }))
    return ok(c, await listSubscriptions(c.get('core'), actorOf(c), q.dashboard ? { dashboard: q.dashboard } : {}))
  })
  route(app, { method: 'post', path: '/api/v1/subscriptions', tags: stags, summary: 'Abonner des personnes et des canaux à un tableau de bord', body: SubscriptionInputSchema }, async (c) =>
    ok(c, await saveSubscription(c.get('core'), actorOf(c), bodyOf(c, SubscriptionInputSchema))),
  )
  route(app, { method: 'put', path: '/api/v1/subscriptions/:id', tags: stags, summary: 'Modifier un abonnement', body: SubscriptionInputSchema }, async (c) =>
    ok(c, await saveSubscription(c.get('core'), actorOf(c), bodyOf(c, SubscriptionInputSchema), param(c, 'id'))),
  )
  route(app, { method: 'delete', path: '/api/v1/subscriptions/:id', tags: stags, summary: 'Supprimer un abonnement' }, async (c) => {
    await deleteSubscription(c.get('core'), actorOf(c), param(c, 'id'))
    return ok(c)
  })
  route(
    app,
    { method: 'post', path: '/api/v1/subscriptions/:id/send', tags: stags, summary: 'Envoyer un abonnement maintenant — à soi seul pour un essai', body: z.object({ only_me: z.boolean().default(true) }) },
    async (c) => {
      const actor = actorOf(c)
      const core = c.get('core')
      const id = param(c, 'id')
      // Checks the subscription is one's own (or one's to manage) before sending anything.
      const mine = (await listSubscriptions(core, actor)).find((s) => s.id === id)
      if (!mine) return c.json({ error: { code: 'NOT_FOUND', message: 'Abonnement introuvable.' } }, 404)
      const { only_me } = bodyOf(c, z.object({ only_me: z.boolean() }))
      // A trial waits for its result; a real sending goes to the worker.
      if (only_me) return ok(c, await deliverSubscription(core, id, { onlyTo: actor.userId }))
      return ok(c, { job: await enqueue(core, 'deliver_subscription', { id }, { dedupe: `subscription:${id}`, createdBy: actor.userId }) })
    },
  )

  // ── Alertes ───────────────────────────────────────────────────────────────
  route(app, { method: 'get', path: '/api/v1/alerts', tags: stags, summary: 'Ses alertes (toutes celles de l’espace pour un administrateur)', query: z.object({ question: z.string().uuid().optional() }) }, async (c) => {
    const q = queryOf(c, z.object({ question: z.string().optional() }))
    return ok(c, await listAlerts(c.get('core'), actorOf(c), q.question ? { question: q.question } : {}))
  })
  route(app, { method: 'post', path: '/api/v1/alerts', tags: stags, summary: 'Créer une alerte sur une question', body: AlertInputSchema }, async (c) =>
    ok(c, await saveAlert(c.get('core'), actorOf(c), bodyOf(c, AlertInputSchema))),
  )
  route(app, { method: 'put', path: '/api/v1/alerts/:id', tags: stags, summary: 'Modifier une alerte', body: AlertInputSchema }, async (c) =>
    ok(c, await saveAlert(c.get('core'), actorOf(c), bodyOf(c, AlertInputSchema), param(c, 'id'))),
  )
  route(app, { method: 'delete', path: '/api/v1/alerts/:id', tags: stags, summary: 'Supprimer une alerte' }, async (c) => {
    await deleteAlert(c.get('core'), actorOf(c), param(c, 'id'))
    return ok(c)
  })
  route(app, { method: 'post', path: '/api/v1/alerts/:id/check', tags: stags, summary: 'Vérifier une alerte maintenant (et prévenir si elle tient)' }, async (c) => {
    const actor = actorOf(c)
    const core = c.get('core')
    const id = param(c, 'id')
    if (!(await listAlerts(core, actor)).some((a) => a.id === id)) return c.json({ error: { code: 'NOT_FOUND', message: 'Alerte introuvable.' } }, 404)
    return ok(c, await checkAlert(core, id, { force: true }))
  })

  // ── Fichiers des canaux ───────────────────────────────────────────────────
  route(app, { method: 'get', path: '/api/public/files/:id/:file', tags: stags, summary: 'Une image ou un PDF posté dans un canal (adresse à jeton, un mois)', public: true }, async (c) => {
    const token = param(c, 'file').replace(/\.(png|pdf)$/, '')
    const file = await readFile(c.get('core'), param(c, 'id'), token)
    if (!file) return c.json({ error: { code: 'NOT_FOUND', message: 'Fichier introuvable ou expiré.' } }, 404)
    return c.body(new Uint8Array(file.data), 200, { 'content-type': file.mime, 'cache-control': 'private, max-age=86400' })
  })
}
