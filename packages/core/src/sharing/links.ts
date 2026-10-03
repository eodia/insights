/**
 * Partage hors de l'application :
 * - lien public ou réservé aux membres (± groupes), exécuté sous l'autorité de son auteur
 *   (modèle BaseDB) : un visiteur ne voit jamais plus que l'auteur, ni ne choisit ce que filtre
 *   une carte ; `can_embed` autorise l'iframe ;
 * - intégration signée (JWT HS256) : l'application hôte signe la ressource, les paramètres
 *   verrouillés et les attributs du visiteur ; les données sont lues sous une identité
 *   virtuelle qui prend les droits du groupe du secret — et ses règles de ligne.
 */
import { createHash } from 'node:crypto'
import type { ParameterValue } from '@eodia/contracts'
import { jwtVerify } from 'jose'
import { userOf } from '../access/decide'
import { audit } from '../audit'
import type { Actor, Core } from '../context'
import { getDashboard, getQuestion } from '../content/items'
import { assertItemAccess } from '../content/folders'
import { decrypt, encrypt, randomToken } from '../crypto'
import { AppError, notFound } from '../errors'

export interface ShareLink {
  readonly id: string
  readonly item_kind: 'question' | 'dashboard'
  readonly item_id: string
  readonly token: string
  readonly url: string
  readonly audience: 'public' | 'members'
  readonly groups: readonly string[]
  readonly can_embed: boolean
  readonly locked_parameters: Readonly<Record<string, ParameterValue | null>>
  readonly created_at: string
}

interface LinkRow {
  id: string
  item_kind: 'question' | 'dashboard'
  item_id: string
  token: string
  audience: 'public' | 'members'
  groups: string[]
  can_embed: boolean
  locked_parameters: Record<string, ParameterValue | null>
  created_by: string
  created_at: Date
}

const dto = (core: Core, r: LinkRow): ShareLink => ({
  id: r.id,
  item_kind: r.item_kind,
  item_id: r.item_id,
  token: r.token,
  url: `${core.config.publicUrl}/${r.item_kind === 'dashboard' ? 'd' : 'q'}/${r.token}`,
  audience: r.audience,
  groups: r.groups,
  can_embed: r.can_embed,
  locked_parameters: r.locked_parameters,
  created_at: r.created_at.toISOString(),
})

export async function listShareLinks(core: Core, actor: Actor, kind: 'question' | 'dashboard', id: string): Promise<ShareLink[]> {
  await assertItemAccess(core, actor, kind, id, 'view')
  const rows = await core.db.many<LinkRow>('SELECT * FROM share_link WHERE item_kind = $1 AND item_id = $2 AND revoked_at IS NULL ORDER BY created_at', [kind, id])
  return rows.map((r) => dto(core, r))
}

export async function createShareLink(
  core: Core,
  actor: Actor,
  input: { item_kind: 'question' | 'dashboard'; item_id: string; audience: 'public' | 'members'; groups?: string[]; can_embed?: boolean; locked_parameters?: Record<string, ParameterValue | null> },
): Promise<ShareLink> {
  await assertItemAccess(core, actor, input.item_kind, input.item_id, 'edit')
  const row = await core.db.one<LinkRow>(
    `INSERT INTO share_link (item_kind, item_id, token, audience, groups, can_embed, locked_parameters, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [input.item_kind, input.item_id, randomToken(18), input.audience, input.groups ?? [], input.can_embed ?? false, input.locked_parameters ?? {}, actor.userId],
  )
  await audit(core, actor, 'share_link.create', { kind: input.item_kind, id: input.item_id }, { audience: input.audience, embed: input.can_embed ?? false })
  return dto(core, row as LinkRow)
}

export async function updateShareLink(core: Core, actor: Actor, id: string, patch: { audience?: 'public' | 'members'; groups?: string[]; can_embed?: boolean; locked_parameters?: Record<string, ParameterValue | null> }) {
  const row = await core.db.one<LinkRow>('SELECT * FROM share_link WHERE id = $1 AND revoked_at IS NULL', [id])
  if (!row) throw notFound('Lien introuvable.')
  await assertItemAccess(core, actor, row.item_kind, row.item_id, 'edit')
  const next = await core.db.one<LinkRow>(
    'UPDATE share_link SET audience = $2, groups = $3, can_embed = $4, locked_parameters = $5 WHERE id = $1 RETURNING *',
    [id, patch.audience ?? row.audience, patch.groups ?? row.groups, patch.can_embed ?? row.can_embed, patch.locked_parameters ?? row.locked_parameters],
  )
  await audit(core, actor, 'share_link.update', { kind: row.item_kind, id: row.item_id })
  return dto(core, next as LinkRow)
}

export async function revokeShareLink(core: Core, actor: Actor, id: string): Promise<void> {
  const row = await core.db.one<LinkRow>('SELECT * FROM share_link WHERE id = $1', [id])
  if (!row) throw notFound('Lien introuvable.')
  await assertItemAccess(core, actor, row.item_kind, row.item_id, 'edit')
  await core.db.exec('UPDATE share_link SET revoked_at = now() WHERE id = $1', [id])
  await audit(core, actor, 'share_link.revoke', { kind: row.item_kind, id: row.item_id })
}

/**
 * Opens a link for a visitor (`viewer`, when signed in). Returns the actor the content is read
 * and run as: its author, while they can still see it.
 */
export async function openShareLink(core: Core, token: string, viewer: Actor | null): Promise<{ link: ShareLink; actor: Actor }> {
  const row = await core.db.one<LinkRow>('SELECT * FROM share_link WHERE token = $1 AND revoked_at IS NULL', [token])
  if (!row) throw notFound('Ce lien de partage n’existe pas ou a été désactivé.')
  if (row.audience === 'members') {
    if (!viewer) throw new AppError('UNAUTHENTICATED', 'Connectez-vous pour voir ce contenu.')
    if (row.groups.length > 0) {
      const snap = await core.snapshot()
      const groups = userOf(snap, viewer.userId)?.groups
      if (!groups || !row.groups.some((g) => groups.has(g))) throw new AppError('FORBIDDEN', "Ce contenu n'est pas partagé avec vous.")
    }
  }
  const actor: Actor = { userId: row.created_by, via: 'share' }
  // The author lost access: the link goes dark with it.
  await assertItemAccess(core, actor, row.item_kind, row.item_id, 'view').catch(() => {
    throw notFound('Ce lien de partage n’est plus actif.')
  })
  return { link: dto(core, row), actor }
}

export async function sharedContent(core: Core, token: string, viewer: Actor | null) {
  const { link, actor } = await openShareLink(core, token, viewer)
  if (link.item_kind === 'dashboard') {
    const d = await getDashboard(core, actor, link.item_id)
    // Locked filters are not shown: their values never leave the server.
    const locked = new Set(Object.keys(link.locked_parameters))
    return { link: { can_embed: link.can_embed, kind: link.item_kind }, dashboard: { ...d, parameters: d.parameters.filter((p) => !locked.has(p.id)), access: 'view' as const } }
  }
  const q = await getQuestion(core, actor, link.item_id)
  return {
    link: { can_embed: link.can_embed, kind: link.item_kind },
    question: { id: q.id, name: q.name, description: q.description, visualization: q.visualization, type: q.type, variables: q.query.kind === 'builder' ? [] : (q.query.variables ?? []), resolved_theme: q.resolved_theme ?? null },
  }
}

// ── Intégration signée ───────────────────────────────────────────────────────

export async function listEmbedSecrets(core: Core) {
  return core.db.many(
    `SELECT e.id, e.name, e.group_id AS group, g.name AS group_name, e.created_at FROM embed_secret e JOIN user_group g ON g.id = e.group_id
     WHERE e.revoked_at IS NULL ORDER BY e.created_at`,
  )
}

export async function createEmbedSecret(core: Core, actor: Actor, input: { name: string; group: string }): Promise<{ id: string; secret: string }> {
  const secret = randomToken(32)
  const row = await core.db.one<{ id: string }>(
    'INSERT INTO embed_secret (name, secret, group_id, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
    [input.name.trim(), encrypt(core.config.secretKey, secret), input.group, actor.userId],
  )
  await audit(core, actor, 'embed_secret.create', { kind: 'embed_secret', id: row?.id ?? null }, { group: input.group })
  return { id: row?.id as string, secret }
}

export async function revokeEmbedSecret(core: Core, actor: Actor, id: string): Promise<void> {
  await core.db.exec('UPDATE embed_secret SET revoked_at = now() WHERE id = $1', [id])
  await audit(core, actor, 'embed_secret.revoke', { kind: 'embed_secret', id })
}

export interface EmbedClaims {
  readonly resource: { readonly dashboard?: string; readonly question?: string }
  readonly params?: Record<string, ParameterValue | null>
  readonly user?: { readonly id?: string; readonly attributes?: Record<string, string> }
}

/**
 * Verifies an embed token (`kid` = the secret's id) and returns how to read: the content as the
 * secret's author, the data as a virtual visitor in the secret's group.
 */
export async function openEmbed(core: Core, token: string): Promise<{ claims: EmbedClaims; actor: Actor }> {
  const [headerPart] = token.split('.')
  const header = JSON.parse(Buffer.from(headerPart ?? '', 'base64url').toString('utf8') || '{}') as { kid?: string }
  const row = header.kid
    ? await core.db.one<{ id: string; secret: Buffer; group_id: string; created_by: string | null }>(
        'SELECT id, secret, group_id, created_by FROM embed_secret WHERE id = $1 AND revoked_at IS NULL',
        [header.kid],
      )
    : undefined
  if (!row?.created_by) throw new AppError('UNAUTHENTICATED', "Jeton d'intégration inconnu (kid).")
  const key = new TextEncoder().encode(decrypt(core.config.secretKey, row.secret))
  let payload: EmbedClaims
  try {
    payload = (await jwtVerify(token, key, { algorithms: ['HS256'], requiredClaims: ['exp'] })).payload as unknown as EmbedClaims
  } catch {
    throw new AppError('UNAUTHENTICATED', "Jeton d'intégration invalide ou expiré.")
  }
  const visitor = payload.user?.id ?? 'anonyme'
  const attributes = Object.fromEntries(Object.entries(payload.user?.attributes ?? {}).map(([k, v]) => [k, String(v)]))
  const id = `embed-${createHash('sha256').update(`${row.id}\u0000${visitor}\u0000${JSON.stringify(attributes)}`).digest('hex').slice(0, 32)}`
  core.registerVirtualUser({ id, email: `${visitor}@embed`, name: visitor, active: true, groups: new Set([row.group_id]), attributes }, 15 * 60_000)
  return { claims: payload, actor: { userId: row.created_by, via: 'embed', dataUser: id } }
}
