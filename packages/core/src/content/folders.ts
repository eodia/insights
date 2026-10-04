/** Dossiers (collections à la Metabase) : arborescence, dossier personnel, droits, partages. */
import type { ContentAccess, Folder, ItemKind, ItemSummary, LookColor } from '@eodia/contracts'
import { audit } from '../audit'
import { checkTheme, resolveTheme } from './themes'
import { summaryOf } from '../auth/users'
import type { Actor, Core } from '../context'
import { AppError, forbidden, invalid, notFound } from '../errors'
import { type ContentIndex, QUESTION_ROWS, type QuestionAccessRow, atLeastAccess, contentIndex, questionAccess } from './access'

interface FolderRow {
  id: string
  parent_id: string | null
  name: string
  description: string | null
  color: LookColor | null
  icon: string | null
  personal_owner_id: string | null
  archived: boolean
  theme_id: string | null
}

function dto(r: FolderRow, idx: ContentIndex): Folder {
  return {
    id: r.id,
    parent: r.parent_id,
    name: r.name,
    description: r.description,
    color: r.color,
    icon: r.icon,
    personal: r.personal_owner_id,
    access: idx.folder(r.id) as ContentAccess,
    path: idx.path(r.parent_id),
    theme: r.theme_id,
  }
}

/** Every folder the person can open, with their access. */
export async function listFolders(core: Core, actor: Actor): Promise<Folder[]> {
  const idx = await contentIndex(core, actor.userId)
  const rows = await core.db.many<FolderRow>('SELECT * FROM folder WHERE NOT archived ORDER BY personal_owner_id IS NOT NULL, name')
  return rows
    .filter((r) => idx.folder(r.id) !== 'none')
    // Other people's personal folders only under « Dossiers personnels » for admins.
    .filter((r) => !r.personal_owner_id || r.personal_owner_id === actor.userId || idx.admin)
    .map((r) => dto(r, idx))
}

export async function getFolder(core: Core, actor: Actor, id: string): Promise<Folder> {
  const idx = await contentIndex(core, actor.userId)
  const row = await core.db.one<FolderRow>('SELECT * FROM folder WHERE id = $1', [id])
  if (!row || idx.folder(id) === 'none') throw notFound('Dossier introuvable.')
  return { ...dto(row, idx), resolved_theme: await resolveTheme(core, { folder: row.id }) }
}

export async function createFolder(
  core: Core,
  actor: Actor,
  input: { name: string; parent?: string | null; description?: string | null; color?: LookColor | null; icon?: string | null },
): Promise<Folder> {
  const idx = await contentIndex(core, actor.userId)
  const parent = input.parent ?? null
  if (parent === null ? !idx.admin : !atLeastAccess(idx.folder(parent), 'edit')) {
    throw forbidden("Vous ne pouvez pas créer de dossier ici.")
  }
  const row = await core.db.one<{ id: string }>(
    'INSERT INTO folder (parent_id, name, description, color, icon, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [parent, input.name.trim(), input.description ?? null, input.color ?? null, input.icon ?? null, actor.userId],
  )
  const id = row?.id as string
  // A new shared folder at the root: everyone may add to it, as Metabase's root collection.
  if (parent === null) {
    await core.db.exec(
      `INSERT INTO folder_permission (group_id, folder_id, access) SELECT id, $1, 'edit' FROM user_group WHERE kind = 'all'`,
      [id],
    )
  }
  await audit(core, actor, 'folder.create', { kind: 'folder', id }, { name: input.name })
  return getFolder(core, actor, id)
}

export async function updateFolder(
  core: Core,
  actor: Actor,
  id: string,
  patch: { name?: string; parent?: string | null; description?: string | null; color?: LookColor | null; icon?: string | null; archived?: boolean; theme?: string | null },
): Promise<Folder> {
  const idx = await contentIndex(core, actor.userId)
  const row = await core.db.one<FolderRow>('SELECT * FROM folder WHERE id = $1', [id])
  if (!row) throw notFound('Dossier introuvable.')
  if (!atLeastAccess(idx.folder(id), 'edit')) throw forbidden()
  if (row.personal_owner_id && (patch.parent !== undefined || patch.archived)) throw invalid('Un dossier personnel ne se déplace ni ne s’archive.')
  if (patch.parent === null && row.parent_id !== null && !idx.admin) throw forbidden('Seul un administrateur range un dossier à la racine.')
  if (patch.parent !== undefined && patch.parent !== null) {
    if (!atLeastAccess(idx.folder(patch.parent), 'edit')) throw forbidden('Vous ne pouvez pas déplacer le dossier ici.')
    if (idx.path(patch.parent).some((p) => p.id === id) || patch.parent === id) throw invalid('Un dossier ne peut pas se ranger dans lui-même.')
  }
  if (patch.theme !== undefined) await checkTheme(core, patch.theme)
  const fields = Object.entries({ ...patch, parent_id: patch.parent, theme_id: patch.theme }).filter(([k, v]) => v !== undefined && k !== 'parent' && k !== 'theme')
  if (fields.length) {
    await core.db.exec(
      `UPDATE folder SET ${fields.map(([k], i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`,
      [id, ...fields.map(([, v]) => v)],
    )
  }
  await audit(core, actor, 'folder.update', { kind: 'folder', id }, { fields: fields.map(([k]) => k) })
  return getFolder(core, actor, id)
}

/** The folder and every sub-folder under it, at any depth. */
const SUBTREE = `WITH RECURSIVE tree AS (
  SELECT id FROM folder WHERE id = $1
  UNION ALL SELECT f.id FROM folder f JOIN tree t ON f.parent_id = t.id
)`
/** What deleting the subtree takes: its dashboards, and its questions with those of its dashboards. */
const DOOMED = `${SUBTREE},
doomed_dashboard AS (SELECT id FROM dashboard WHERE folder_id IN (SELECT id FROM tree)),
doomed_question AS (
  SELECT id FROM question
  WHERE folder_id IN (SELECT id FROM tree) OR dashboard_id IN (SELECT id FROM doomed_dashboard)
)`

/** What a folder holds, sub-folders included — what its deletion would take, or hand to its parent. */
export async function folderContents(core: Core, actor: Actor, id: string): Promise<{ folders: number; dashboards: number; questions: number }> {
  const idx = await contentIndex(core, actor.userId)
  if (idx.folder(id) === 'none') throw notFound('Dossier introuvable.')
  const row = await core.db.one<{ folders: number; dashboards: number; questions: number }>(
    `${DOOMED}
     SELECT (SELECT count(*)::int - 1 FROM tree) AS folders,
            (SELECT count(*)::int FROM doomed_dashboard) AS dashboards,
            (SELECT count(*)::int FROM doomed_question) AS questions`,
    [id],
  )
  return row ?? { folders: 0, dashboards: 0, questions: 0 }
}

/**
 * Deletes a folder. `move`: what it holds — sub-folders, dashboards, questions — goes up to its
 * parent. `delete`: everything under it goes too, sub-folders included; refused while a question
 * left outside still relies on a model or a metric it holds.
 */
export async function deleteFolder(core: Core, actor: Actor, id: string, mode: 'move' | 'delete'): Promise<void> {
  const idx = await contentIndex(core, actor.userId)
  const row = await core.db.one<FolderRow>('SELECT * FROM folder WHERE id = $1', [id])
  if (!row || idx.folder(id) === 'none') throw notFound('Dossier introuvable.')
  if (row.personal_owner_id) throw invalid('Un dossier personnel ne se supprime pas.')
  if (!atLeastAccess(idx.folder(id), 'manage')) throw forbidden('Il faut le droit de gestion sur le dossier pour le supprimer.')
  if (mode === 'move' && row.parent_id === null && !idx.admin) throw forbidden('Seul un administrateur range des éléments à la racine.')
  const tree = await core.db.many<{ id: string }>(`${SUBTREE} SELECT id FROM tree`, [id])
  if (mode === 'delete' && tree.some((f) => !atLeastAccess(idx.folder(f.id), 'edit'))) {
    throw forbidden('Un sous-dossier vous est fermé : il ne peut pas être supprimé avec le reste.')
  }
  await core.db.tx(async (client) => {
    if (mode === 'move') {
      for (const table of ['question', 'dashboard']) {
        await core.db.exec(`UPDATE ${table} SET folder_id = $2 WHERE folder_id = $1`, [id, row.parent_id], client)
      }
      await core.db.exec('UPDATE folder SET parent_id = $2 WHERE parent_id = $1', [id, row.parent_id], client)
    } else {
      const relying = await core.db.one<{ n: number }>(
        `${DOOMED}
         SELECT count(*)::int AS n FROM question o
         WHERE o.id NOT IN (SELECT id FROM doomed_question) AND NOT o.archived
           AND EXISTS (SELECT 1 FROM doomed_question d WHERE o.query::text LIKE '%' || d.id || '%')`,
        [id],
        client,
      )
      if ((relying?.n ?? 0) > 0) {
        throw new AppError('CONFLICT', `${relying?.n} question(s) hors du dossier s'appuient sur un modèle ou une métrique qu'il contient : déplacez-les d'abord, ou reportez le contenu dans le dossier parent.`)
      }
      await core.db.exec(`${DOOMED} DELETE FROM question WHERE id IN (SELECT id FROM doomed_question)`, [id], client)
      await core.db.exec(`${DOOMED} DELETE FROM dashboard WHERE id IN (SELECT id FROM doomed_dashboard)`, [id], client)
    }
    // Its sub-folders, if any are left, and its permissions go with it (ON DELETE CASCADE).
    await core.db.exec('DELETE FROM folder WHERE id = $1', [id], client)
  })
  await audit(core, actor, 'folder.delete', { kind: 'folder', id }, { name: row.name, mode })
}

/** Questions, models, metrics, dashboards and sub-folders of a folder the person may see. */
export async function folderItems(core: Core, actor: Actor, folderId: string | null): Promise<{ folders: Folder[]; items: ItemSummary[] }> {
  const idx = await contentIndex(core, actor.userId)
  if (folderId !== null && idx.folder(folderId) === 'none') throw notFound('Dossier introuvable.')
  const folders = (
    await core.db.many<FolderRow>(
      `SELECT * FROM folder WHERE NOT archived AND parent_id IS NOT DISTINCT FROM $1 AND (personal_owner_id IS NULL OR personal_owner_id = $2) ORDER BY name`,
      [folderId, actor.userId],
    )
  )
    .filter((f) => idx.folder(f.id) !== 'none')
    .map((f) => dto(f, idx))
  const items = await itemsWhere(core, actor, idx, 'folder_id IS NOT DISTINCT FROM $1', [folderId])
  return { folders, items }
}

export async function itemsWhere(core: Core, actor: Actor, idx: ContentIndex, where: string, params: unknown[]): Promise<ItemSummary[]> {
  const rows = await core.db.many<{
    kind: ItemKind
    id: string
    name: string
    description: string | null
    folder_id: string | null
    viz: string | null
    updated_at: Date
    updated_by: string | null
    created_by: string | null
    bookmarked: boolean
  }>(
    `SELECT * FROM (
       SELECT CASE type WHEN 'question' THEN 'question' ELSE type END AS kind, id, name, description, folder_id,
              visualization->>'type' AS viz, updated_at, updated_by, created_by, archived
       FROM question WHERE dashboard_id IS NULL -- a dashboard's own questions live in it, not in a folder
       UNION ALL
       SELECT 'dashboard', id, name, description, folder_id, NULL, updated_at, updated_by, created_by, archived FROM dashboard
     ) i
     CROSS JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM bookmark b WHERE b.user_id = $${params.length + 1} AND b.item_id = i.id) AS bookmarked) bm
     WHERE NOT archived AND ${where} ORDER BY name`,
    [...params, actor.userId],
  )
  const visible = rows.filter((r) => idx.item(r.kind, r.id, r.folder_id, r.created_by) !== 'none')
  const users = await summaryOf(core, visible.map((r) => r.updated_by))
  return visible.map((r) => ({
    kind: r.kind,
    id: r.id,
    name: r.name,
    description: r.description,
    folder: r.folder_id,
    ...(r.viz ? { viz: r.viz } : {}),
    updated_at: r.updated_at.toISOString(),
    updated_by: (r.updated_by && users.get(r.updated_by)) || null,
    bookmarked: r.bookmarked,
  }))
}

// ── Droits de dossier et partages ────────────────────────────────────────────

export async function folderPermissions(core: Core) {
  return core.db.many('SELECT group_id AS group, folder_id AS folder, access FROM folder_permission')
}

export async function setFolderPermission(core: Core, actor: Actor, group: string, folder: string, access: ContentAccess | 'none' | 'inherit') {
  const idx = await contentIndex(core, actor.userId)
  if (!atLeastAccess(idx.folder(folder), 'manage')) throw forbidden('Il faut le droit « Gestion » sur ce dossier.')
  if (access === 'inherit') await core.db.exec('DELETE FROM folder_permission WHERE group_id = $1 AND folder_id = $2', [group, folder])
  else {
    await core.db.exec(
      `INSERT INTO folder_permission (group_id, folder_id, access) VALUES ($1, $2, $3)
       ON CONFLICT (group_id, folder_id) DO UPDATE SET access = EXCLUDED.access`,
      [group, folder, access],
    )
  }
  await audit(core, actor, 'permission.folder', { kind: 'folder', id: folder }, { group, access })
}

export async function listShares(core: Core, actor: Actor, kind: ItemKind, id: string) {
  await assertItemAccess(core, actor, kind, id, 'view')
  return core.db.many(
    `SELECT s.id, s.principal_kind, s.principal_id, s.access, coalesce(u.name, g.name) AS name, u.email
     FROM item_share s LEFT JOIN app_user u ON s.principal_kind = 'user' AND u.id = s.principal_id
     LEFT JOIN user_group g ON s.principal_kind = 'group' AND g.id = s.principal_id
     WHERE s.item_kind = $1 AND s.item_id = $2 ORDER BY name`,
    [kind, id],
  )
}

export async function share(
  core: Core,
  actor: Actor,
  input: { item_kind: ItemKind; item_id: string; principal_kind: 'user' | 'group'; principal_id: string; access: 'view' | 'edit' },
) {
  await assertItemAccess(core, actor, input.item_kind, input.item_id, 'edit')
  await core.db.exec(
    `INSERT INTO item_share (item_kind, item_id, principal_kind, principal_id, access, created_by) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (item_kind, item_id, principal_kind, principal_id) DO UPDATE SET access = EXCLUDED.access`,
    [input.item_kind, input.item_id, input.principal_kind, input.principal_id, input.access, actor.userId],
  )
  await audit(core, actor, 'share.add', { kind: input.item_kind, id: input.item_id }, { to: input.principal_id, access: input.access })
}

export async function unshare(core: Core, actor: Actor, shareId: string) {
  const row = await core.db.one<{ item_kind: ItemKind; item_id: string }>('SELECT item_kind, item_id FROM item_share WHERE id = $1', [shareId])
  if (!row) throw notFound()
  await assertItemAccess(core, actor, row.item_kind, row.item_id, 'edit')
  await core.db.exec('DELETE FROM item_share WHERE id = $1', [shareId])
  await audit(core, actor, 'share.remove', { kind: row.item_kind, id: row.item_id })
}

/** Throws unless the person has at least `min` on the item. Returns their access. */
export async function assertItemAccess(core: Core, actor: Actor, kind: ItemKind, id: string, min: ContentAccess): Promise<ContentAccess> {
  const idx = await contentIndex(core, actor.userId)
  let access: ContentAccess | 'none'
  if (kind === 'folder') access = idx.folder(id)
  else if (kind === 'dashboard') {
    const row = await core.db.one<{ folder_id: string | null; created_by: string | null }>('SELECT folder_id, created_by FROM dashboard WHERE id = $1', [id])
    if (!row) throw notFound()
    access = idx.item(kind, id, row.folder_id, row.created_by)
  } else {
    const row = await core.db.one<QuestionAccessRow>(`${QUESTION_ROWS} WHERE q.id = $1`, [id])
    if (!row) throw notFound()
    access = questionAccess(idx, row)
  }
  if (access === 'none') throw notFound()
  if (!atLeastAccess(access, min)) throw new AppError('FORBIDDEN', min === 'view' ? "Vous n'avez pas accès à cet élément." : 'Vous ne pouvez pas modifier cet élément.')
  return access
}

// ── Favoris, récents, recherche ──────────────────────────────────────────────

export async function setBookmark(core: Core, actor: Actor, kind: ItemKind, id: string, on: boolean) {
  if (on) {
    await core.db.exec('INSERT INTO bookmark (user_id, item_kind, item_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [actor.userId, kind, id])
  } else await core.db.exec('DELETE FROM bookmark WHERE user_id = $1 AND item_id = $2', [actor.userId, id])
}

export async function recordView(core: Core, actor: Actor, kind: ItemKind, id: string) {
  await core.db.exec(
    `INSERT INTO recent_view (user_id, item_kind, item_id) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, item_kind, item_id) DO UPDATE SET viewed_at = now()`,
    [actor.userId, kind, id],
  )
}

export async function homeItems(core: Core, actor: Actor) {
  const idx = await contentIndex(core, actor.userId)
  const recent = await itemsWhere(
    core,
    actor,
    idx,
    `id IN (SELECT item_id FROM recent_view WHERE user_id = $1 ORDER BY viewed_at DESC LIMIT 12)`,
    [actor.userId],
  )
  const order = await core.db.many<{ item_id: string }>('SELECT item_id FROM recent_view WHERE user_id = $1 ORDER BY viewed_at DESC LIMIT 12', [actor.userId])
  const rank = new Map(order.map((r, i) => [r.item_id, i]))
  recent.sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99))
  const bookmarks = await itemsWhere(core, actor, idx, `id IN (SELECT item_id FROM bookmark WHERE user_id = $1)`, [actor.userId])
  const latest = (await itemsWhere(core, actor, idx, `updated_at > now() - interval '60 days'`, [])).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8)
  return { recent, bookmarks, latest }
}

export async function search(core: Core, actor: Actor, text: string, limit = 30, kind?: ItemKind) {
  const idx = await contentIndex(core, actor.userId)
  const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const items = kind
    ? await itemsWhere(core, actor, idx, '(name ILIKE $1 OR description ILIKE $1) AND kind = $2', [like, kind])
    : await itemsWhere(core, actor, idx, '(name ILIKE $1 OR description ILIKE $1)', [like])
  const folders = (await core.db.many<FolderRow>('SELECT * FROM folder WHERE NOT archived AND name ILIKE $1 LIMIT 50', [like]))
    .filter((f) => idx.folder(f.id) !== 'none' && (!f.personal_owner_id || f.personal_owner_id === actor.userId))
    .map((f) => dto(f, idx))
  return { items: items.slice(0, limit), folders: folders.slice(0, 10) }
}
