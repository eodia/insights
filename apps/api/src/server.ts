/**
 * L'API d'eodia insights : REST `/api/v1`, authentification, pages publiques, endpoint OPA
 * interne (point de décision de Trino), OpenAPI 3.1 générée depuis les routes.
 */
import { serve } from '@hono/node-server'
import { AppError, type OpaInput, OpaDecider, loadConfig, prepare, start } from '@eodia/core'
import { identify, newApp } from './http'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { contentRoutes } from './routes/content'
import { sharingRoutes } from './routes/sharing'
import { sourceRoutes } from './routes/sources'

export async function createApp() {
  const config = loadConfig()
  const core = await prepare(config)
  const app = newApp()

  // ── Point de décision de Trino ────────────────────────────────────────────
  // Hors de la chaîne d'identité : appelé par Trino seul, protégé par un secret dans le chemin.
  app.post('/internal/opa/:secret/:kind', async (c) => {
    if (c.req.param('secret') !== config.opaSecret) return c.json({ error: 'forbidden' }, 403)
    const body = (await c.req.json().catch(() => ({}))) as { input?: OpaInput }
    const input = body.input ?? {}
    const decider = new OpaDecider(await core.snapshot(), config.trinoServiceUser)
    switch (c.req.param('kind')) {
      case 'allow':
        return c.json({ result: decider.allow(input) })
      case 'batch':
        return c.json({ result: decider.batch(input) })
      case 'row-filters':
        return c.json({ result: decider.rowFilters(input) })
      case 'column-masks':
        return c.json({ result: decider.columnMasks(input) })
      default:
        return c.json({ result: false })
    }
  })

  app.get('/api/health', async (c) => {
    const trino = await core.engine.info()
    return c.json({ ok: true, trino: trino.up })
  })

  app.use('/api/*', identify(core))

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } }, err.status as 400)
    }
    console.error(err)
    return c.json({ error: { code: 'INTERNAL', message: 'Erreur interne du serveur.' } }, 500)
  })

  authRoutes(app)
  sourceRoutes(app)
  contentRoutes(app)
  adminRoutes(app)
  sharingRoutes(app)

  app.openAPIRegistry.registerComponent('securitySchemes', 'jeton', {
    type: 'http',
    scheme: 'bearer',
    description: "Jeton d'intégration `eoi_…`, créé depuis la documentation ou le profil.",
  })
  app.doc31('/api/v1/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'eodia insights',
      version: '0.1.0',
      description:
        "API REST d'eodia insights. Toute requête s'exécute dans Trino sous l'identité de l'appelant : ses droits sur les données, les colonnes et les lignes s'appliquent partout.",
      license: { name: 'AGPL-3.0-or-later' },
    },
    servers: [{ url: config.publicUrl }],
    security: [{ jeton: [] }],
  })

  return { app, core, config }
}

const port = Number(process.env.EODIA_API_PORT ?? 4100)
const { app, core } = await createApp()
const server = serve({ fetch: app.fetch, port, hostname: process.env.EODIA_API_HOST ?? '0.0.0.0' }, (info) => {
  console.log(`[eodia] API prête sur http://localhost:${info.port}`)
})
// Trino asks the OPA endpoint before any statement, ours included: listen first, then start.
const { worker } = await start(core)

const shutdown = async () => {
  worker?.stop()
  server.close()
  await core.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
