/** Personnes, sessions, jetons d'intégration, invitations. Repris de BaseDB, sans tenant. */
import type { LookColor, Me, UserRow, UserSummary, WorkspaceRole } from '@eodia/contracts'
import { LOOK_COLORS } from '@eodia/contracts'
import type pg from 'pg'
import { isAdmin, isInstanceAdmin, queryLevel, rightsOf, userOf } from '../access/decide'
import { audit } from '../audit'
import { type Actor, type Core, principalOf } from '../context'
import { addMember, defaultWorkspace, listWorkspaces, personalFolder, workspaceFor } from '../workspaces'
import { hashPassword, randomToken, sha256, verifyPassword } from '../crypto'
import { AppError, invalid, notFound } from '../errors'

export const SESSION_COOKIE = 'eodia_session'
export const TOKEN_PREFIX = 'eoi_'

const COLORS = LOOK_COLORS.filter((c) => c !== 'gray')
const colorFor = (email: string): LookColor =>
  COLORS[[...email].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length] as LookColor

export function validatePassword(password: string): void {
  if (password.length < 10) throw invalid('Le mot de passe doit faire au moins 10 caractères.')
}

export async function needsSetup(core: Core): Promise<boolean> {
  const row = await core.db.one<{ n: number }>('SELECT count(*)::int AS n FROM app_user')
  return (row?.n ?? 0) === 0
}

export interface NewUser {
  readonly email: string
  readonly name: string
  readonly password?: string
  /** Administrator of the instance. */
  readonly admin?: boolean
  readonly groups?: readonly string[]
  readonly attributes?: Readonly<Record<string, string>>
  /** The space they enter, and their role there; by default the oldest open one, as a member. */
  readonly workspace?: { readonly id: string; readonly role: WorkspaceRole }
}

/** Creates a person, their space, personal folder and memberships, in one transaction. */
export async function createUser(core: Core, input: NewUser, client?: pg.PoolClient): Promise<string> {
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid('Adresse e-mail invalide.')
  if (input.password !== undefined) validatePassword(input.password)
  const hash = input.password === undefined ? null : await hashPassword(input.password)
  const run = async (c: pg.PoolClient) => {
    const exists = await core.db.one('SELECT 1 FROM app_user WHERE email = $1', [email], c)
    if (exists) throw new AppError('CONFLICT', 'Une personne utilise déjà cette adresse.')
    const user = await core.db.one<{ id: string }>(
      'INSERT INTO app_user (email, name, password_hash, color) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, input.name.trim() || email, hash, colorFor(email)],
      c,
    )
    const id = user?.id as string
    const space = input.workspace ?? { id: await defaultWorkspace(core, c), role: input.admin ? ('admin' as const) : ('member' as const) }
    await addMember(core, space.id, id, space.role, c)
    await core.db.exec('UPDATE app_user SET workspace_id = $2 WHERE id = $1', [id, space.id], c)
    await personalFolder(core, id, space.id, c)
    const groups = [...(input.groups ?? [])]
    if (input.admin) {
      const admin = await core.db.one<{ id: string }>(`SELECT id FROM user_group WHERE kind = 'admin'`, [], c)
      if (admin) groups.push(admin.id)
    }
    for (const g of new Set(groups)) {
      await core.db.exec('INSERT INTO group_member (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [g, id], c)
    }
    for (const [k, v] of Object.entries(input.attributes ?? {})) {
      await core.db.exec('INSERT INTO user_attribute (user_id, key, value) VALUES ($1, $2, $3)', [id, k, v], c)
    }
    return id
  }
  const id = client ? await run(client) : await core.db.tx(run)
  core.changed()
  return id
}

// ── Sessions ────────────────────────────────────────────────────────────────

export interface SessionMeta {
  readonly ip?: string
  readonly userAgent?: string
}

export async function openSession(core: Core, userId: string, meta: SessionMeta): Promise<string> {
  const token = randomToken()
  await core.db.exec(
    `INSERT INTO session (id, user_id, expires_at, user_agent, ip) VALUES ($1, $2, now() + make_interval(days => $3), $4, $5)`,
    [sha256(token), userId, core.config.sessionDays, meta.userAgent ?? null, meta.ip ?? null],
  )
  await core.db.exec('UPDATE app_user SET last_login_at = now() WHERE id = $1', [userId])
  return token
}

/** Constant-ish failure: the same message whether the address or the password is wrong. */
export async function loginWithPassword(core: Core, email: string, password: string, meta: SessionMeta): Promise<string> {
  if (!core.config.passwordLogin) throw new AppError('FORBIDDEN', 'La connexion par mot de passe est désactivée.')
  const user = await core.db.one<{ id: string; password_hash: string | null; active: boolean }>(
    'SELECT id, password_hash, active FROM app_user WHERE email = $1',
    [email.trim().toLowerCase()],
  )
  const ok = await verifyPassword(password, user?.password_hash ?? 'scrypt$AAAA$AAAA')
  if (!user || !ok || !user.active) {
    await audit(core, null, 'auth.login_failed', undefined, { email: email.trim().toLowerCase(), ip: meta.ip })
    throw new AppError('UNAUTHENTICATED', 'Adresse ou mot de passe incorrect.')
  }
  const token = await openSession(core, user.id, meta)
  await audit(core, { userId: user.id, via: 'session', ...(meta.ip ? { ip: meta.ip } : {}) }, 'auth.login', { kind: 'user', id: user.id })
  return token
}

/**
 * The person behind a session cookie, in the space the interface asks for (`requested`) when
 * they may enter it — else the one they last worked in.
 */
export async function actorFromSession(core: Core, token: string, ip?: string, requested?: string | null): Promise<Actor | null> {
  const id = sha256(token)
  const row = await core.db.one<{ user_id: string; last_seen_at: Date }>(
    `SELECT s.user_id, s.last_seen_at FROM session s JOIN app_user u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now() AND u.active`,
    [id],
  )
  if (!row) return null
  if (Date.now() - new Date(row.last_seen_at).getTime() > 60_000) {
    void core.db.exec('UPDATE session SET last_seen_at = now() WHERE id = $1', [id])
  }
  const workspaceId = await workspaceFor(core, row.user_id, requested)
  return { userId: row.user_id, workspaceId, via: 'session', sessionId: id, ...(ip ? { ip } : {}) }
}

export async function closeSession(core: Core, token: string): Promise<void> {
  await core.db.exec('DELETE FROM session WHERE id = $1', [sha256(token)])
}

// ── Jetons d'intégration ────────────────────────────────────────────────────

export async function createApiToken(
  core: Core,
  actor: Actor,
  input: { name: string; surfaces: readonly ('rest' | 'mcp')[]; expires_days?: number | null },
): Promise<{ id: string; token: string }> {
  const secret = randomToken(24)
  const token = `${TOKEN_PREFIX}${secret}`
  const row = await core.db.one<{ id: string }>(
    `INSERT INTO api_token (user_id, name, prefix, token_hash, surfaces, expires_at, workspace_id)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::int IS NULL THEN NULL ELSE now() + make_interval(days => $6::int) END, $7) RETURNING id`,
    [actor.userId, input.name.trim() || 'Jeton', token.slice(0, 10), sha256(token), input.surfaces, input.expires_days ?? null, actor.workspaceId],
  )
  await audit(core, actor, 'token.create', { kind: 'api_token', id: row?.id ?? null }, { name: input.name })
  return { id: row?.id as string, token }
}

export async function listApiTokens(core: Core, userId: string) {
  return core.db.many(
    `SELECT t.id, t.name, t.prefix, t.surfaces, t.created_at, t.last_used_at, t.expires_at,
            jsonb_build_object('id', w.id, 'name', w.name) AS workspace
     FROM api_token t JOIN workspace w ON w.id = t.workspace_id
     WHERE t.user_id = $1 AND t.revoked_at IS NULL ORDER BY t.created_at DESC`,
    [userId],
  )
}

export async function revokeApiToken(core: Core, actor: Actor, id: string): Promise<void> {
  const n = await core.db.exec('UPDATE api_token SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL', [id, actor.userId])
  if (n === 0) throw notFound('Jeton introuvable.')
  await audit(core, actor, 'token.revoke', { kind: 'api_token', id })
}

export async function actorFromToken(core: Core, token: string, surface: 'rest' | 'mcp', ip?: string): Promise<Actor | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null
  const row = await core.db.one<{ id: string; user_id: string; surfaces: string[]; workspace_id: string }>(
    `SELECT t.id, t.user_id, t.surfaces, t.workspace_id FROM api_token t JOIN app_user u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > now()) AND u.active`,
    [sha256(token)],
  )
  if (!row || !row.surfaces.includes(surface)) return null
  void core.db.exec('UPDATE api_token SET last_used_at = now() WHERE id = $1', [row.id])
  // A token acts in the space it was made in — and reads nothing once its owner has left it.
  return { userId: row.user_id, workspaceId: row.workspace_id, via: 'token', surfaces: row.surfaces, ...(ip ? { ip } : {}) }
}

// ── Qui suis-je ─────────────────────────────────────────────────────────────

export async function summaryOf(core: Core, ids: readonly (string | null | undefined)[]): Promise<Map<string, UserSummary>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))]
  if (wanted.length === 0) return new Map()
  const rows = await core.db.many<{ id: string; name: string; email: string; color: LookColor | null }>(
    'SELECT id, name, email, color FROM app_user WHERE id = ANY($1)',
    [wanted],
  )
  return new Map(rows.map((r) => [r.id, r]))
}

export async function me(core: Core, actor: Actor): Promise<Me> {
  const snap = await core.snapshot()
  const user = await core.db.one<{ id: string; name: string; email: string; color: LookColor | null; locale: string }>(
    'SELECT id, name, email, color, locale FROM app_user WHERE id = $1',
    [actor.userId],
  )
  if (!user) throw new AppError('UNAUTHENTICATED', 'Session expirée.')
  const who = principalOf(actor)
  const self = userOf(snap, who)
  if (!actor.workspaceId || !self) {
    throw new AppError('FORBIDDEN', 'Vous n’appartenez à aucun espace : demandez à un administrateur de vous y ajouter.')
  }
  const workspaces = await listWorkspaces(core, actor.userId)
  const workspace = workspaces.find((w) => w.id === actor.workspaceId)
  if (!workspace) throw new AppError('FORBIDDEN', 'Espace introuvable.')
  // The groups the person is in here — the space's « everyone » first.
  const groups = await core.db.many<{ id: string; name: string }>(
    `SELECT g.id, g.name FROM user_group g WHERE g.id = ANY($1) AND g.workspace_id = $2 ORDER BY g.kind, g.name`,
    [[...self.groups], actor.workspaceId],
  )
  const folder = await personalFolder(core, actor.userId, actor.workspaceId)
  const rights = rightsOf(snap, who)
  const admin = isAdmin(snap, who)
  const instanceAdmin = isInstanceAdmin(snap, actor.userId)
  const useSql = admin || [...snap.datasources.keys()].some((ds) => ['sql', 'native'].includes(queryLevel(snap, who, ds)))
  const folderManagers = await core.db.one<{ n: number }>(
    `SELECT count(*)::int AS n FROM folder_permission fp JOIN folder f ON f.id = fp.folder_id
     WHERE fp.access = 'manage' AND fp.group_id = ANY($1) AND f.workspace_id = $2`,
    [[...self.groups], actor.workspaceId],
  )
  return {
    ...user,
    is_admin: admin,
    is_instance_admin: instanceAdmin,
    groups,
    personal_folder: folder,
    workspace,
    workspaces,
    can: {
      manage_sources: rights.has('manage_sources'),
      manage_metadata: rights.has('manage_metadata'),
      manage_permissions: rights.has('manage_permissions'),
      use_sql: useSql,
      create_folders: admin || (folderManagers?.n ?? 0) > 0,
      manage_workspace: admin,
      create_workspaces: instanceAdmin,
    },
    ai_enabled: core.config.ai.provider !== 'none' && !!core.config.ai.apiKey,
  }
}

export async function updateProfile(core: Core, actor: Actor, patch: { name?: string; locale?: string; password?: { current: string; next: string } }) {
  if (patch.name !== undefined) {
    await core.db.exec('UPDATE app_user SET name = $2 WHERE id = $1', [actor.userId, patch.name.trim()])
  }
  if (patch.locale !== undefined) await core.db.exec('UPDATE app_user SET locale = $2 WHERE id = $1', [actor.userId, patch.locale])
  if (patch.password) {
    const row = await core.db.one<{ password_hash: string | null }>('SELECT password_hash FROM app_user WHERE id = $1', [actor.userId])
    if (row?.password_hash && !(await verifyPassword(patch.password.current, row.password_hash))) {
      throw new AppError('FORBIDDEN', 'Le mot de passe actuel est incorrect.')
    }
    validatePassword(patch.password.next)
    await core.db.exec('UPDATE app_user SET password_hash = $2 WHERE id = $1', [actor.userId, await hashPassword(patch.password.next)])
    await core.db.exec('DELETE FROM session WHERE user_id = $1 AND id <> $2', [actor.userId, actor.sessionId ?? ''])
    await audit(core, actor, 'auth.password_change', { kind: 'user', id: actor.userId })
  }
  core.changed()
}

// ── Administration des personnes ────────────────────────────────────────────

/**
 * The people an administrator manages: the members of the current space — everyone, for an
 * administrator of the instance. Their groups are those of the current space (and the
 * administrators' group, which is the instance's).
 */
export async function listUsers(core: Core, actor: Actor): Promise<UserRow[]> {
  const snap = await core.snapshot()
  const everyone = isInstanceAdmin(snap, actor.userId)
  const rows = await core.db.many<{
    id: string
    name: string
    email: string
    color: LookColor | null
    active: boolean
    created_at: Date
    last_login_at: Date | null
    groups: string[] | null
    attributes: Record<string, string> | null
    password: boolean
    providers: string[] | null
  }>(`
    SELECT u.id, u.name, u.email, u.color, u.active, u.created_at, u.last_login_at,
      (SELECT array_agg(m.group_id) FROM group_member m JOIN user_group g ON g.id = m.group_id
        WHERE m.user_id = u.id AND (g.workspace_id = $1 OR g.kind = 'admin')) AS groups,
      (SELECT jsonb_object_agg(key, value) FROM user_attribute WHERE user_id = u.id) AS attributes,
      u.password_hash IS NOT NULL AS password,
      (SELECT array_agg(DISTINCT provider) FROM auth_identity WHERE user_id = u.id) AS providers
    FROM app_user u
    WHERE $2 OR EXISTS (SELECT 1 FROM workspace_member wm WHERE wm.user_id = u.id AND wm.workspace_id = $1)
    ORDER BY u.name`, [actor.workspaceId, everyone])
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    color: r.color,
    active: r.active,
    groups: r.groups ?? [],
    attributes: r.attributes ?? {},
    created_at: r.created_at.toISOString(),
    last_login_at: r.last_login_at?.toISOString() ?? null,
    auth: [...(r.password ? ['password'] : []), ...(r.providers ?? [])],
  }))
}

export async function updateUser(
  core: Core,
  actor: Actor,
  id: string,
  patch: { name?: string; active?: boolean; groups?: readonly string[]; attributes?: Readonly<Record<string, string>> },
): Promise<void> {
  const snap = await core.snapshot()
  const instanceAdmin = isInstanceAdmin(snap, actor.userId)
  // A space's administrator manages its members; the instance's, everyone.
  if (!instanceAdmin && !snap.members.get(id)?.has(actor.workspaceId)) throw notFound('Personne introuvable.')
  await core.db.tx(async (c) => {
    const exists = await core.db.one('SELECT 1 FROM app_user WHERE id = $1', [id], c)
    if (!exists) throw notFound('Personne introuvable.')
    if (patch.name !== undefined) await core.db.exec('UPDATE app_user SET name = $2 WHERE id = $1', [id, patch.name.trim()], c)
    if (patch.active !== undefined) {
      if (!instanceAdmin) throw new AppError('FORBIDDEN', 'Seuls les administrateurs de l’instance désactivent un compte.')
      if (id === actor.userId && !patch.active) throw invalid('Vous ne pouvez pas vous désactiver vous-même.')
      await core.db.exec('UPDATE app_user SET active = $2 WHERE id = $1', [id, patch.active], c)
      if (!patch.active) await core.db.exec('DELETE FROM session WHERE user_id = $1', [id], c)
    }
    if (patch.groups !== undefined) {
      // The groups of the current space; the administrators' group is the instance's, and only
      // its own administrators move people in or out of it.
      const admin = await core.db.one<{ id: string }>(`SELECT id FROM user_group WHERE kind = 'admin'`, [], c)
      if (admin && instanceAdmin) {
        if (id === actor.userId && !patch.groups.includes(admin.id)) throw invalid('Vous ne pouvez pas vous retirer vous-même des administrateurs.')
        if (patch.groups.includes(admin.id)) {
          await core.db.exec('INSERT INTO group_member (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [admin.id, id], c)
        } else await core.db.exec('DELETE FROM group_member WHERE group_id = $1 AND user_id = $2', [admin.id, id], c)
      }
      await core.db.exec(
        `DELETE FROM group_member WHERE user_id = $1 AND group_id IN (SELECT id FROM user_group WHERE kind = 'custom' AND workspace_id = $2)`,
        [id, actor.workspaceId],
        c,
      )
      for (const g of patch.groups) {
        await core.db.exec(
          `INSERT INTO group_member (group_id, user_id)
           SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM user_group WHERE id = $1 AND kind = 'custom' AND workspace_id = $3) ON CONFLICT DO NOTHING`,
          [g, id, actor.workspaceId],
          c,
        )
      }
    }
    if (patch.attributes !== undefined) {
      await core.db.exec(`DELETE FROM user_attribute WHERE user_id = $1 AND source = 'manual'`, [id], c)
      for (const [k, v] of Object.entries(patch.attributes)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(k)) throw invalid(`Nom d'attribut invalide : ${k}`)
        await core.db.exec(
          `INSERT INTO user_attribute (user_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, source = 'manual'`,
          [id, k, v],
          c,
        )
      }
    }
  })
  core.changed()
  await audit(core, actor, 'user.update', { kind: 'user', id }, { fields: Object.keys(patch) })
}

// ── Invitations ─────────────────────────────────────────────────────────────

export async function createInvitation(
  core: Core,
  actor: Actor,
  input: { email: string; name?: string; groups?: readonly string[]; role?: WorkspaceRole },
): Promise<{ id: string; url: string }> {
  const email = input.email.trim().toLowerCase()
  const exists = await core.db.one('SELECT 1 FROM app_user WHERE email = $1', [email])
  if (exists) throw new AppError('CONFLICT', 'Cette personne a déjà un compte : ajoutez-la plutôt aux membres de l’espace.')
  // The groups it brings are those of the space it invites into.
  const groups = (
    await core.db.many<{ id: string }>(`SELECT id FROM user_group WHERE id = ANY($1) AND kind = 'custom' AND workspace_id = $2`, [
      [...(input.groups ?? [])],
      actor.workspaceId,
    ])
  ).map((g) => g.id)
  const token = randomToken()
  const row = await core.db.one<{ id: string }>(
    `INSERT INTO invitation (email, name, token_hash, groups, invited_by, expires_at, workspace_id, workspace_role)
     VALUES ($1, $2, $3, $4, $5, now() + interval '7 days', $6, $7) RETURNING id`,
    [email, input.name ?? null, sha256(token), groups, actor.userId, actor.workspaceId, input.role ?? 'member'],
  )
  const url = `${core.config.publicUrl}/invitation/${token}`
  await audit(core, actor, 'invitation.create', { kind: 'invitation', id: row?.id ?? null }, { email })
  return { id: row?.id as string, url }
}

export async function readInvitation(core: Core, token: string) {
  const row = await core.db.one<{
    id: string
    email: string
    name: string | null
    groups: string[]
    inviter: string | null
    workspace_id: string | null
    workspace_role: WorkspaceRole
    workspace: string | null
  }>(
    `SELECT i.id, i.email, i.name, i.groups, u.name AS inviter, i.workspace_id, i.workspace_role, w.name AS workspace
     FROM invitation i LEFT JOIN app_user u ON u.id = i.invited_by LEFT JOIN workspace w ON w.id = i.workspace_id
     WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.expires_at > now()`,
    [sha256(token)],
  )
  if (!row) throw notFound('Invitation expirée ou déjà utilisée.')
  return row
}

export async function acceptInvitation(core: Core, token: string, input: { name: string; password: string }, meta: SessionMeta) {
  const inv = await readInvitation(core, token)
  const userId = await core.db.tx(async (c) => {
    const id = await createUser(
      core,
      {
        email: inv.email,
        name: input.name,
        password: input.password,
        groups: inv.groups,
        ...(inv.workspace_id ? { workspace: { id: inv.workspace_id, role: inv.workspace_role } } : {}),
      },
      c,
    )
    await core.db.exec('UPDATE invitation SET accepted_at = now() WHERE id = $1', [inv.id], c)
    return id
  })
  await audit(core, { userId, via: 'session' }, 'invitation.accept', { kind: 'invitation', id: inv.id })
  return openSession(core, userId, meta)
}

/** The pending invitations into the current space. */
export async function listInvitations(core: Core, actor: Actor) {
  return core.db.many(
    `SELECT i.id, i.email, i.name, i.groups, i.created_at, i.expires_at, i.emailed_at, u.name AS invited_by, i.workspace_role AS role
     FROM invitation i LEFT JOIN app_user u ON u.id = i.invited_by
     WHERE i.accepted_at IS NULL AND i.expires_at > now() AND i.workspace_id = $1 ORDER BY i.created_at DESC`,
    [actor.workspaceId],
  )
}

export async function revokeInvitation(core: Core, actor: Actor, id: string) {
  await core.db.exec('DELETE FROM invitation WHERE id = $1 AND accepted_at IS NULL AND workspace_id = $2', [id, actor.workspaceId])
  await audit(core, actor, 'invitation.revoke', { kind: 'invitation', id })
}
