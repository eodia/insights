/**
 * Connexion OIDC : code d'autorisation + PKCE, jeton d'identité vérifié par jose contre les clés
 * publiées par le fournisseur. Les claims choisies deviennent des attributs (règles de ligne),
 * et un claim de groupes peut refléter les groupes du fournisseur.
 */
import { createHash } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { audit } from '../audit'
import type { Core } from '../context'
import { randomToken } from '../crypto'
import { AppError } from '../errors'
import { type SessionMeta, createUser, openSession } from './users'

interface Discovery {
  readonly authorization_endpoint: string
  readonly token_endpoint: string
  readonly jwks_uri: string
  readonly issuer: string
  readonly end_session_endpoint?: string
}

let discovery: { issuer: string; doc: Discovery; jwks: ReturnType<typeof createRemoteJWKSet> } | null = null

async function discover(issuer: string) {
  if (discovery?.issuer === issuer) return discovery
  const res = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new AppError('ENGINE_UNAVAILABLE', `Fournisseur d'identité injoignable (${res.status}).`)
  const doc = (await res.json()) as Discovery
  discovery = { issuer, doc, jwks: createRemoteJWKSet(new URL(doc.jwks_uri)) }
  return discovery
}

export const OIDC_COOKIE = 'eodia_oidc'

/** The address to send the browser to, and what to keep in a short cookie until it comes back. */
export async function oidcStart(core: Core, returnTo: string): Promise<{ url: string; cookie: string }> {
  const oidc = core.config.oidc
  if (!oidc) throw new AppError('NOT_FOUND', "La connexion SSO n'est pas configurée.")
  const { doc } = await discover(oidc.issuer)
  const state = randomToken(16)
  const verifier = randomToken(32)
  const nonce = randomToken(16)
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const url = new URL(doc.authorization_endpoint)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: oidc.clientId,
    redirect_uri: `${core.config.publicUrl}/api/auth/oidc/callback`,
    scope: oidc.scopes,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString()
  const safeReturn = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
  return { url: url.toString(), cookie: JSON.stringify({ state, verifier, nonce, returnTo: safeReturn }) }
}

export async function oidcCallback(
  core: Core,
  params: { code: string; state: string },
  cookie: string | undefined,
  meta: SessionMeta,
): Promise<{ token: string; returnTo: string }> {
  const oidc = core.config.oidc
  if (!oidc) throw new AppError('NOT_FOUND', "La connexion SSO n'est pas configurée.")
  const saved = cookie ? (JSON.parse(cookie) as { state: string; verifier: string; nonce: string; returnTo: string }) : null
  if (!saved || saved.state !== params.state) throw new AppError('UNAUTHENTICATED', 'Réponse du fournisseur inattendue : recommencez la connexion.')
  const { doc, jwks } = await discover(oidc.issuer)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: `${core.config.publicUrl}/api/auth/oidc/callback`,
    client_id: oidc.clientId,
    code_verifier: saved.verifier,
    ...(oidc.clientSecret ? { client_secret: oidc.clientSecret } : {}),
  })
  const res = await fetch(doc.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new AppError('UNAUTHENTICATED', `Le fournisseur a refusé le code (${res.status}).`)
  const tokens = (await res.json()) as { id_token?: string }
  if (!tokens.id_token) throw new AppError('UNAUTHENTICATED', "Le fournisseur n'a pas renvoyé de jeton d'identité.")
  const { payload } = await jwtVerify(tokens.id_token, jwks, { issuer: doc.issuer, audience: oidc.clientId })
  if (payload.nonce !== saved.nonce) throw new AppError('UNAUTHENTICATED', 'Jeton rejoué : recommencez la connexion.')
  const subject = String(payload.sub)
  const email = String(payload.email ?? '').toLowerCase()
  const name = String(payload.name ?? payload.preferred_username ?? email)

  let userId = (
    await core.db.one<{ user_id: string }>(`SELECT user_id FROM auth_identity WHERE provider = 'oidc' AND subject = $1`, [subject])
  )?.user_id
  if (!userId && email) {
    userId = (await core.db.one<{ id: string }>('SELECT id FROM app_user WHERE email = $1', [email]))?.id
    if (userId) {
      await core.db.exec(`INSERT INTO auth_identity (user_id, provider, subject, claims) VALUES ($1, 'oidc', $2, $3)`, [userId, subject, payload])
    }
  }
  if (!userId) {
    if (!email) throw new AppError('UNAUTHENTICATED', "Le fournisseur n'a pas transmis d'adresse e-mail.")
    userId = await createUser(core, { email, name })
    await core.db.exec(`INSERT INTO auth_identity (user_id, provider, subject, claims) VALUES ($1, 'oidc', $2, $3)`, [userId, subject, payload])
    await audit(core, { userId, via: 'session' }, 'user.create_oidc', { kind: 'user', id: userId })
  }
  const active = await core.db.one<{ active: boolean }>('SELECT active FROM app_user WHERE id = $1', [userId])
  if (!active?.active) throw new AppError('FORBIDDEN', 'Votre compte est désactivé.')

  // Claims chosen as attributes, refreshed at each sign-in.
  for (const claim of oidc.attributeClaims) {
    const v = payload[claim]
    if (v === undefined || v === null) continue
    await core.db.exec(
      `INSERT INTO user_attribute (user_id, key, value, source) VALUES ($1, $2, $3, 'oidc')
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, source = 'oidc'`,
      [userId, claim, Array.isArray(v) ? v.join(',') : String(v)],
    )
  }
  // Provider groups mirrored onto the groups of the same name — in every space the person
  // belongs to — and onto the instance's administrators.
  if (oidc.groupsClaim) {
    const raw = payload[oidc.groupsClaim]
    const names = (Array.isArray(raw) ? raw : []).map((g) => String(g).replace(/^\//, ''))
    await core.db.exec(
      `DELETE FROM group_member WHERE user_id = $1 AND group_id IN (SELECT id FROM user_group WHERE kind = 'custom')`,
      [userId],
    )
    await core.db.exec(
      `INSERT INTO group_member (group_id, user_id)
       SELECT g.id, $1 FROM user_group g
       WHERE g.name = ANY($2) AND (g.kind = 'admin'
         OR (g.kind = 'custom' AND g.workspace_id IN (SELECT workspace_id FROM workspace_member WHERE user_id = $1)))
       ON CONFLICT DO NOTHING`,
      [userId, names],
    )
  }
  core.changed()
  const token = await openSession(core, userId, meta)
  await audit(core, { userId, via: 'session' }, 'auth.login_oidc', { kind: 'user', id: userId })
  return { token, returnTo: saved.returnTo }
}
