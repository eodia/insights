/**
 * Socle HTTP : application OpenAPI, identité (session ou jeton), CSRF, erreurs.
 *
 * - Une session est un cookie httpOnly `SameSite=Lax` ; toute écriture par cookie exige l'en-tête
 *   `X-Eodia-Csrf: 1`, qu'un autre site ne peut pas poser sans pré-vol CORS.
 * - Un jeton d'intégration `eoi_…` passe en `Authorization: Bearer` ; il n'est valable que sur
 *   les surfaces qu'il déclare (`rest`, `mcp`).
 */
import { OpenAPIHono, type RouteConfig, createRoute, z } from '@hono/zod-openapi'
import type { AdminRight } from '@eodia/contracts'
import {
  type Actor,
  AppError,
  type Core,
  SESSION_COOKIE,
  actorFromSession,
  actorFromToken,
  rightsOf,
} from '@eodia/core'
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'

export type Env = { Variables: { actor: Actor | null; core: Core } }
export type Ctx = Context<Env>

export function newApp() {
  return new OpenAPIHono<Env>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join('.') || 'corps'} : ${i.message}`)
        return c.json({ error: { code: 'INVALID_INPUT', message: `Entrée invalide — ${issues.slice(0, 3).join(' ; ')}`, details: result.error.issues } }, 400)
      }
    },
  })
}

export const clientIp = (c: Ctx) =>
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? undefined

/** Resolves who is calling; never rejects — routes decide. */
export function identify(core: Core): MiddlewareHandler<Env> {
  return async (c, next) => {
    c.set('core', core)
    let actor: Actor | null = null
    const ip = clientIp(c)
    const auth = c.req.header('authorization')
    if (auth?.startsWith('Bearer ')) {
      // The MCP server relays its caller's token to this API and says so with this header, so a
      // token issued for MCP alone works through it. The surface limits what a token is meant
      // for; the rights it carries stay those of its owner whatever the surface.
      const surface = c.req.path.startsWith('/mcp') || c.req.header('x-eodia-surface') === 'mcp' ? 'mcp' : 'rest'
      actor = await actorFromToken(core, auth.slice(7).trim(), surface, ip)
      if (!actor) return c.json({ error: { code: 'UNAUTHENTICATED', message: "Jeton d'intégration invalide, expiré ou non autorisé sur cette surface." } }, 401)
    } else {
      const token = getCookie(c, SESSION_COOKIE)
      if (token) actor = await actorFromSession(core, token, ip)
      const writes = !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)
      if (actor && writes && c.req.header('x-eodia-csrf') !== '1') {
        return c.json({ error: { code: 'CSRF', message: 'Requête refusée (protection CSRF).' } }, 403)
      }
    }
    c.set('actor', actor)
    await next()
  }
}

export function actorOf(c: Ctx): Actor {
  const actor = c.get('actor')
  if (!actor) throw new AppError('UNAUTHENTICATED', 'Connectez-vous pour continuer.')
  return actor
}

export async function requireRight(c: Ctx, right: AdminRight): Promise<Actor> {
  const actor = actorOf(c)
  const snap = await c.get('core').snapshot()
  if (!rightsOf(snap, actor.userId).has(right)) {
    throw new AppError('FORBIDDEN', 'Cette action demande un droit d’administration.')
  }
  return actor
}

export async function requireAdmin(c: Ctx): Promise<Actor> {
  const actor = actorOf(c)
  const snap = await c.get('core').snapshot()
  const { isAdmin } = await import('@eodia/core')
  if (!isAdmin(snap, actor.userId)) throw new AppError('FORBIDDEN', 'Réservé aux administrateurs.')
  return actor
}

// ── Déclaration des routes ───────────────────────────────────────────────────

const Json = z.any().openapi({ type: 'object' })

interface RouteSpec {
  readonly method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  readonly path: string
  readonly tags: string[]
  readonly summary: string
  readonly description?: string
  readonly body?: z.ZodType
  readonly query?: z.ZodObject
  readonly params?: z.ZodObject
  /** Public routes take no identity. */
  readonly public?: boolean
}

/** `/questions/{id}` in OpenAPI, from Hono's `/questions/:id`. */
const openapiPath = (p: string) => p.replace(/:([A-Za-z_]+)/g, '{$1}')

export function route<A extends ReturnType<typeof newApp>>(
  app: A,
  spec: RouteSpec,
  handler: (c: Ctx) => Response | Promise<Response>,
): void {
  const params = spec.params ?? (/:([A-Za-z_]+)/.test(spec.path) ? z.object(Object.fromEntries([...spec.path.matchAll(/:([A-Za-z_]+)/g)].map((m) => [m[1] as string, z.string()]))) : undefined)
  const config: RouteConfig = createRoute({
    method: spec.method,
    path: openapiPath(spec.path),
    tags: spec.tags,
    summary: spec.summary,
    ...(spec.description ? { description: spec.description } : {}),
    ...(spec.public ? { security: [] } : {}),
    request: {
      ...(spec.body ? { body: { content: { 'application/json': { schema: spec.body } }, required: true } } : {}),
      ...(spec.query ? { query: spec.query } : {}),
      ...(params ? { params } : {}),
    },
    responses: {
      200: { description: 'Succès', content: { 'application/json': { schema: Json } } },
      400: { description: 'Entrée invalide' },
      401: { description: 'Non authentifié' },
      403: { description: 'Refusé' },
      404: { description: 'Introuvable' },
    },
  })
  app.openapi(config, handler as never)
}

export const ok = (c: Ctx, body: unknown = { ok: true }) => c.json(body as object)

/** The validated JSON body of a route declared with a body. */
export const bodyOf = <S extends z.ZodType>(c: Ctx, _schema: S): z.infer<S> =>
  (c.req as unknown as { valid(t: 'json'): z.infer<S> }).valid('json')

/** The validated query of a route declared with a query. */
export const queryOf = <S extends z.ZodType>(c: Ctx, _schema: S): z.infer<S> =>
  (c.req as unknown as { valid(t: 'query'): z.infer<S> }).valid('query')

export const param = (c: Ctx, name: string): string => c.req.param(name) as string
