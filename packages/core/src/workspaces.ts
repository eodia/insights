/**
 * Les espaces : les équipes ou les filiales d'une même instance. Chacun a ses sources (et
 * celles qu'on lui partage), ses dossiers et leur contenu, ses groupes et leurs droits ; les
 * personnes, elles, sont celles de l'instance, membres ou administratrices d'un ou plusieurs
 * espaces. Les administrateurs de l'instance les voient et les administrent tous.
 *
 * Le cloisonnement ne vit pas ici : il est dans le point de décision (`access/decide.ts`, qui
 * ne laisse lire une source que depuis son espace ou un espace avec lequel elle est
 * partagée) et dans l'index du contenu (`content/access.ts`, qui ne charge que les dossiers
 * de l'espace). Ce module tient les espaces eux-mêmes et leurs membres.
 */
import type { LookColor, Workspace, WorkspaceMember, WorkspaceRole } from '@eodia/contracts'
import type pg from 'pg'
import { isAdmin, isInstanceAdmin, principal, userOf } from './access/decide'
import { audit } from './audit'
import type { Actor, Core } from './context'
import { AppError, forbidden, invalid, notFound } from './errors'
import { cacheClear } from './query/cache'

interface WorkspaceRow {
  id: string
  name: string
  description: string | null
  color: LookColor | null
  icon: string | null
  archived: boolean
  members: number
  created_at: Date
}

const dto = (r: WorkspaceRow, role: WorkspaceRole | null): Workspace => ({
  id: r.id,
  name: r.name,
  description: r.description,
  color: r.color,
  icon: r.icon,
  role,
  members: r.members,
  archived: r.archived,
})

/**
 * The space a person acts in: the one asked for when they may enter it, else the one they last
 * worked in, else their first. An administrator of the instance may enter any; someone who
 * belongs to none gets `''` — and reads nothing.
 */
export async function workspaceFor(core: Core, userId: string, requested?: string | null): Promise<string> {
  const snap = await core.snapshot()
  const open = (id: string | null | undefined): id is string => !!id && userOf(snap, principal(userId, id)) !== undefined
  if (open(requested)) return requested
  const home = snap.users.get(userId)?.home
  if (open(home)) return home
  for (const id of snap.members.get(userId)?.keys() ?? []) if (open(id)) return id
  if (isInstanceAdmin(snap, userId)) {
    for (const w of snap.workspaces.values()) if (!w.archived) return w.id
  }
  return ''
}

/** The person's personal folder in a space, made the first time they need it. */
export async function personalFolder(core: Core, userId: string, workspaceId: string, client?: pg.PoolClient): Promise<string> {
  const found = await core.db.one<{ id: string }>(
    'SELECT id FROM folder WHERE personal_owner_id = $1 AND workspace_id = $2',
    [userId, workspaceId],
    client,
  )
  if (found) return found.id
  const made = await core.db.one<{ id: string }>(
    `INSERT INTO folder (name, personal_owner_id, created_by, workspace_id)
     SELECT 'Dossier de ' || name, id, id, $2 FROM app_user WHERE id = $1
     ON CONFLICT (workspace_id, personal_owner_id) WHERE personal_owner_id IS NOT NULL DO UPDATE SET name = folder.name
     RETURNING id`,
    [userId, workspaceId],
    client,
  )
  if (!made) throw notFound('Personne introuvable.')
  return made.id
}

/** The spaces a person can enter, with their role in each — every space for the instance's administrators. */
export async function listWorkspaces(core: Core, userId: string): Promise<Workspace[]> {
  const snap = await core.snapshot()
  const all = isInstanceAdmin(snap, userId)
  const rows = await core.db.many<WorkspaceRow & { role: WorkspaceRole | null }>(
    `SELECT w.*, me.role, (SELECT count(*)::int FROM workspace_member m WHERE m.workspace_id = w.id) AS members
     FROM workspace w LEFT JOIN workspace_member me ON me.workspace_id = w.id AND me.user_id = $1
     WHERE ($2 OR me.user_id IS NOT NULL) AND (NOT w.archived OR $2)
     ORDER BY w.archived, lower(w.name)`,
    [userId, all],
  )
  return rows.map((r) => dto(r, r.role))
}

export async function getWorkspace(core: Core, actor: Actor, id: string): Promise<Workspace> {
  const list = await listWorkspaces(core, actor.userId)
  const found = list.find((w) => w.id === id)
  if (!found) throw notFound('Espace introuvable.')
  return found
}

/** Who may change a space: its administrators, and the instance's. */
async function assertManages(core: Core, actor: Actor, id: string): Promise<void> {
  const snap = await core.snapshot()
  if (!isAdmin(snap, principal(actor.userId, id))) throw forbidden('Réservé aux administrateurs de l’espace.')
}

export interface WorkspaceInput {
  readonly name: string
  readonly description?: string | null
  readonly color?: LookColor | null
  readonly icon?: string | null
}

/** A new space — by an administrator of the instance, who becomes its first administrator. */
export async function createWorkspace(core: Core, actor: Actor, input: WorkspaceInput): Promise<Workspace> {
  const snap = await core.snapshot()
  if (!isInstanceAdmin(snap, actor.userId)) throw forbidden('Seuls les administrateurs de l’instance créent des espaces.')
  const name = input.name.trim()
  if (!name) throw invalid('Donnez un nom à l’espace.')
  const id = await core.db.tx(async (c) => {
    const taken = await core.db.one('SELECT 1 FROM workspace WHERE lower(name) = lower($1)', [name], c)
    if (taken) throw new AppError('CONFLICT', 'Un espace porte déjà ce nom.')
    const row = await core.db.one<{ id: string }>(
      'INSERT INTO workspace (name, description, color, icon, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, input.description ?? null, input.color ?? null, input.icon ?? null, actor.userId],
      c,
    )
    const ws = row?.id as string
    await core.db.exec(
      `INSERT INTO user_group (name, kind, description, workspace_id) VALUES ('Tous les membres', 'all', 'Chaque membre de l''espace en fait partie', $1)`,
      [ws],
      c,
    )
    await core.db.exec(`INSERT INTO workspace_member (workspace_id, user_id, role) VALUES ($1, $2, 'admin')`, [ws, actor.userId], c)
    return ws
  })
  core.changed()
  await audit(core, { ...actor, workspaceId: id }, 'workspace.create', { kind: 'workspace', id }, { name })
  return getWorkspace(core, actor, id)
}

/** Its name and look — by its administrators; archiving, by the instance's. */
export async function updateWorkspace(core: Core, actor: Actor, id: string, patch: Partial<WorkspaceInput> & { archived?: boolean }): Promise<Workspace> {
  await assertManages(core, actor, id)
  if (patch.archived !== undefined && !isInstanceAdmin(await core.snapshot(), actor.userId)) {
    throw forbidden('Seuls les administrateurs de l’instance archivent un espace.')
  }
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) throw invalid('Donnez un nom à l’espace.')
    const taken = await core.db.one('SELECT 1 FROM workspace WHERE lower(name) = lower($1) AND id <> $2', [name, id])
    if (taken) throw new AppError('CONFLICT', 'Un espace porte déjà ce nom.')
  }
  if (patch.archived) {
    const others = await core.db.one<{ n: number }>('SELECT count(*)::int AS n FROM workspace WHERE NOT archived AND id <> $1', [id])
    if ((others?.n ?? 0) === 0) throw invalid('Il faut garder au moins un espace ouvert.')
  }
  const fields = Object.entries({ ...patch, name: patch.name?.trim() }).filter(([, v]) => v !== undefined)
  if (fields.length) {
    await core.db.exec(`UPDATE workspace SET ${fields.map(([k], i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [
      id,
      ...fields.map(([, v]) => v),
    ])
  }
  core.changed()
  if (patch.archived) await cacheClear(core)
  await audit(core, actor, 'workspace.update', { kind: 'workspace', id }, { fields: fields.map(([k]) => k) })
  return getWorkspace(core, actor, id)
}

/** Where the person works from now on: the space their next session opens in. */
export async function switchWorkspace(core: Core, actor: Actor, id: string): Promise<Workspace> {
  const snap = await core.snapshot()
  if (!userOf(snap, principal(actor.userId, id))) throw notFound('Espace introuvable.')
  await core.db.exec('UPDATE app_user SET workspace_id = $2 WHERE id = $1', [actor.userId, id])
  core.changed()
  return getWorkspace(core, actor, id)
}

// ── Membres ──────────────────────────────────────────────────────────────────

export async function listMembers(core: Core, actor: Actor): Promise<WorkspaceMember[]> {
  await assertManages(core, actor, actor.workspaceId)
  const rows = await core.db.many<{ id: string; name: string; email: string; color: LookColor | null; role: WorkspaceRole; added_at: Date }>(
    `SELECT u.id, u.name, u.email, u.color, m.role, m.added_at FROM workspace_member m JOIN app_user u ON u.id = m.user_id
     WHERE m.workspace_id = $1 ORDER BY lower(u.name)`,
    [actor.workspaceId],
  )
  return rows.map((r) => ({ ...r, added_at: r.added_at.toISOString() }))
}

/** Makes someone a member of a space, or changes their role there. */
export async function addMember(core: Core, workspaceId: string, userId: string, role: WorkspaceRole, client?: pg.PoolClient): Promise<void> {
  await core.db.exec(
    `INSERT INTO workspace_member (workspace_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [workspaceId, userId, role],
    client,
  )
}

/**
 * Adds a person to the current space, changes their role, or (`null`) takes them out of it —
 * with their groups there. A space keeps at least one administrator.
 */
export async function setMember(core: Core, actor: Actor, userId: string, role: WorkspaceRole | null): Promise<void> {
  const ws = actor.workspaceId
  await assertManages(core, actor, ws)
  const exists = await core.db.one('SELECT 1 FROM app_user WHERE id = $1', [userId])
  if (!exists) throw notFound('Personne introuvable.')
  await core.db.tx(async (c) => {
    if (role === null) {
      await core.db.exec('DELETE FROM workspace_member WHERE workspace_id = $1 AND user_id = $2', [ws, userId], c)
      await core.db.exec(
        'DELETE FROM group_member WHERE user_id = $2 AND group_id IN (SELECT id FROM user_group WHERE workspace_id = $1)',
        [ws, userId],
        c,
      )
    } else await addMember(core, ws, userId, role, c)
    const admins = await core.db.one<{ n: number }>(`SELECT count(*)::int AS n FROM workspace_member WHERE workspace_id = $1 AND role = 'admin'`, [ws], c)
    if ((admins?.n ?? 0) === 0) throw invalid('Un espace garde au moins un administrateur.')
  })
  core.changed()
  // Someone who left the space (or lost its administration) must not read it from the cache.
  await cacheClear(core)
  await audit(core, actor, role === null ? 'workspace.member_remove' : 'workspace.member_set', { kind: 'user', id: userId }, { role })
}

const OWNED = { folder: 'folder', question: 'question', dashboard: 'dashboard', datasource: 'datasource' } as const

/**
 * What to say of an element not found in the current space: if it lives in another space the
 * person may enter, which one (`OTHER_WORKSPACE`: the interface switches and opens it) —
 * otherwise, plainly, that it was not found.
 */
export async function notHere(core: Core, actor: Actor, kind: keyof typeof OWNED, id: string, what?: string): Promise<AppError> {
  const row = await core.db
    .one<{ workspace_id: string; name: string }>(
      `SELECT x.workspace_id, w.name FROM ${OWNED[kind]} x JOIN workspace w ON w.id = x.workspace_id WHERE x.id = $1`,
      [id],
    )
    .catch(() => undefined)
  if (row && row.workspace_id !== actor.workspaceId && actor.via === 'session') {
    const snap = await core.snapshot()
    if (userOf(snap, principal(actor.userId, row.workspace_id))) {
      return new AppError('OTHER_WORKSPACE', `Cet élément est dans l’espace « ${row.name} ».`, { workspace: { id: row.workspace_id, name: row.name } })
    }
  }
  return notFound(what)
}

/** The space everyone joins when nothing says otherwise: the oldest one still open. */
export async function defaultWorkspace(core: Core, client?: pg.PoolClient): Promise<string> {
  const row = await core.db.one<{ id: string }>('SELECT id FROM workspace WHERE NOT archived ORDER BY created_at LIMIT 1', [], client)
  if (!row) throw new AppError('INTERNAL', 'Aucun espace ouvert sur cette instance.')
  return row.id
}
