import { z } from '@hono/zod-openapi'
import {
  AppError,
  DEMO_ADMIN,
  OIDC_COOKIE,
  SESSION_COOKIE,
  acceptInvitation,
  closeSession,
  createApiToken,
  createUser,
  listApiTokens,
  loginWithPassword,
  me,
  needsSetup,
  oidcCallback,
  oidcStart,
  openSession,
  readInvitation,
  revokeApiToken,
  updateProfile,
} from '@eodia/core'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { type Ctx, actorOf, bodyOf, clientIp, type newApp, ok, param, route } from '../http'

function setSession(c: Ctx, token: string) {
  const core = c.get('core')
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: core.config.cookieSecure,
    path: '/',
    maxAge: core.config.sessionDays * 86_400,
  })
}

const meta = (c: Ctx) => {
  const ip = clientIp(c)
  const userAgent = c.req.header('user-agent')
  return { ...(ip ? { ip } : {}), ...(userAgent ? { userAgent } : {}) }
}

const Login = z.object({ email: z.string().min(3).max(320), password: z.string().min(1).max(500) })
const Setup = z.object({ email: z.string().email(), name: z.string().min(1).max(120), password: z.string().min(10).max(500) })
const Accept = z.object({ name: z.string().min(1).max(120), password: z.string().min(10).max(500) })
const Profile = z.object({
  name: z.string().min(1).max(120).optional(),
  locale: z.string().max(10).optional(),
  password: z.object({ current: z.string(), next: z.string().min(10).max(500) }).optional(),
})
const TokenInput = z.object({
  name: z.string().min(1).max(120),
  surfaces: z.array(z.enum(['rest', 'mcp'])).min(1),
  expires_days: z.number().int().min(1).max(3650).nullable().optional(),
})

export function authRoutes(app: ReturnType<typeof newApp>) {
  const tags = ['Authentification']

  route(app, { method: 'get', path: '/api/auth/state', tags, summary: "État de l'instance et moyens de connexion", public: true }, async (c) => {
    const core = c.get('core')
    return ok(c, {
      setup_required: await needsSetup(core),
      password: core.config.passwordLogin,
      oidc: core.config.oidc ? { label: core.config.oidc.label } : null,
      demo: core.config.demo ? { email: DEMO_ADMIN.email, password: DEMO_ADMIN.password } : null,
      signed_in: c.get('actor') !== null,
    })
  })

  route(app, { method: 'post', path: '/api/auth/setup', tags, summary: 'Créer le premier administrateur', body: Setup, public: true }, async (c) => {
    const core = c.get('core')
    if (!(await needsSetup(core))) throw new AppError('CONFLICT', "L'instance est déjà configurée.")
    const input = bodyOf(c, Setup)
    const id = await createUser(core, { ...input, admin: true })
    setSession(c, await openSession(core, id, meta(c)))
    return ok(c)
  })

  route(app, { method: 'post', path: '/api/auth/login', tags, summary: 'Se connecter par mot de passe', body: Login, public: true }, async (c) => {
    const input = bodyOf(c, Login)
    setSession(c, await loginWithPassword(c.get('core'), input.email, input.password, meta(c)))
    return ok(c)
  })

  route(app, { method: 'post', path: '/api/auth/logout', tags, summary: 'Se déconnecter' }, async (c) => {
    const token = getCookie(c, SESSION_COOKIE)
    if (token) await closeSession(c.get('core'), token)
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return ok(c)
  })

  app.get('/api/auth/oidc/start', async (c) => {
    const { url, cookie } = await oidcStart(c.get('core'), c.req.query('return') ?? '/')
    setCookie(c, OIDC_COOKIE, cookie, { httpOnly: true, sameSite: 'Lax', secure: c.get('core').config.cookieSecure, path: '/api/auth/oidc', maxAge: 600 })
    return c.redirect(url)
  })

  app.get('/api/auth/oidc/callback', async (c) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    if (!code || !state) return c.redirect(`/login?error=${encodeURIComponent(c.req.query('error_description') ?? 'Connexion annulée.')}`)
    try {
      const { token, returnTo } = await oidcCallback(c.get('core'), { code, state }, getCookie(c, OIDC_COOKIE), meta(c))
      deleteCookie(c, OIDC_COOKIE, { path: '/api/auth/oidc' })
      setSession(c, token)
      return c.redirect(returnTo)
    } catch (err) {
      return c.redirect(`/login?error=${encodeURIComponent(err instanceof Error ? err.message : 'Connexion impossible.')}`)
    }
  })

  route(app, { method: 'get', path: '/api/auth/invitation/:token', tags, summary: 'Lire une invitation', public: true }, async (c) => {
    const inv = await readInvitation(c.get('core'), param(c, 'token'))
    return ok(c, { email: inv.email, name: inv.name, inviter: inv.inviter })
  })

  route(app, { method: 'post', path: '/api/auth/invitation/:token', tags, summary: 'Accepter une invitation', body: Accept, public: true }, async (c) => {
    const token = await acceptInvitation(c.get('core'), param(c, 'token'), bodyOf(c, Accept), meta(c))
    setSession(c, token)
    return ok(c)
  })

  // ── Profil ──
  const ptags = ['Profil']
  route(app, { method: 'get', path: '/api/v1/me', tags: ptags, summary: 'La personne connectée et ses droits' }, async (c) => ok(c, await me(c.get('core'), actorOf(c))))

  route(app, { method: 'patch', path: '/api/v1/me', tags: ptags, summary: 'Modifier son profil', body: Profile }, async (c) => {
    await updateProfile(c.get('core'), actorOf(c), bodyOf(c, Profile))
    return ok(c, await me(c.get('core'), actorOf(c)))
  })

  route(app, { method: 'get', path: '/api/v1/me/tokens', tags: ptags, summary: "Ses jetons d'intégration" }, async (c) => ok(c, await listApiTokens(c.get('core'), actorOf(c).userId)))

  route(app, { method: 'post', path: '/api/v1/me/tokens', tags: ptags, summary: "Créer un jeton d'intégration (REST, MCP)", body: TokenInput }, async (c) => {
    const actor = actorOf(c)
    if (actor.via === 'token') throw new AppError('FORBIDDEN', 'Un jeton ne crée pas de jeton.')
    return ok(c, await createApiToken(c.get('core'), actor, bodyOf(c, TokenInput)))
  })

  route(app, { method: 'delete', path: '/api/v1/me/tokens/:id', tags: ptags, summary: 'Révoquer un jeton' }, async (c) => {
    await revokeApiToken(c.get('core'), actorOf(c), param(c, 'id'))
    return ok(c)
  })
}
