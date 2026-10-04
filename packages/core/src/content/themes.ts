/**
 * Thèmes : l'habillage d'un tableau de bord et de son PDF. Un thème se pose sur un dossier —
 * tout ce qu'il contient en hérite, sous-dossiers compris — ou sur un tableau de bord, qui
 * l'emporte alors sur son dossier. Une question porte le thème de son dossier, ou de son
 * tableau de bord quand elle lui appartient.
 *
 * Un thème n'ouvre aucun droit : il n'habille que ce que la personne voit déjà. Les
 * administrateurs les créent ; qui peut modifier un dossier ou un tableau de bord choisit le sien.
 */
import {
  type ResolvedTheme,
  type Theme,
  type ThemeInput,
  ThemeSettingsSchema,
} from '@eodia/contracts'
import { audit } from '../audit'
import type { Actor, Core } from '../context'
import { isInstanceAdmin } from '../access/decide'
import { forbidden, invalid, notFound } from '../errors'
import { contentIndex } from './access'

interface ThemeRow {
  id: string
  name: string
  settings: Record<string, unknown>
  updated_at: Date
  workspace_id: string | null
}

/** The themes of a space: its own, and those of the instance (without space). */
const IN_SPACE = '(workspace_id IS NULL OR workspace_id = $2)'

function dto(r: ThemeRow): Theme {
  // A setting written by an older version and no longer understood is dropped, not trusted.
  const parsed = ThemeSettingsSchema.safeParse(r.settings)
  return {
    id: r.id,
    name: r.name,
    settings: parsed.success ? parsed.data : {},
    updated_at: r.updated_at.toISOString(),
  }
}

/**
 * Who may change a theme: an administrator of the space for its own; one of the instance for
 * those every space shares.
 */
async function assertAdmin(core: Core, actor: Actor, theme?: ThemeRow): Promise<void> {
  const idx = await contentIndex(core, actor)
  if (!idx.admin) throw forbidden('Seul un administrateur crée ou modifie un thème.')
  if (theme && theme.workspace_id === null && !isInstanceAdmin(idx.snap, actor.userId)) {
    throw forbidden('Ce thème sert à tous les espaces : seul un administrateur de l’instance le modifie.')
  }
}

export async function listThemes(core: Core, actor: Actor): Promise<Theme[]> {
  return (
    await core.db.many<ThemeRow>(`SELECT id, name, settings, updated_at, workspace_id FROM theme WHERE ${IN_SPACE.replace('$2', '$1')} ORDER BY name`, [
      actor.workspaceId,
    ])
  ).map(dto)
}

async function themeRow(core: Core, actor: Pick<Actor, 'workspaceId'>, id: string): Promise<ThemeRow> {
  const r = await core.db.one<ThemeRow>(`SELECT id, name, settings, updated_at, workspace_id FROM theme WHERE id = $1 AND ${IN_SPACE}`, [
    id,
    actor.workspaceId,
  ])
  if (!r) throw notFound('Thème introuvable.')
  return r
}

export async function getTheme(core: Core, actor: Pick<Actor, 'workspaceId'>, id: string): Promise<Theme> {
  return dto(await themeRow(core, actor, id))
}

export async function createTheme(core: Core, actor: Actor, input: ThemeInput): Promise<Theme> {
  await assertAdmin(core, actor)
  const row = await core.db.one<{ id: string }>(
    'INSERT INTO theme (name, settings, created_by, workspace_id) VALUES ($1, $2, $3, $4) RETURNING id',
    [input.name.trim(), JSON.stringify(input.settings), actor.userId, actor.workspaceId],
  )
  if (!row) throw invalid('Thème non créé.')
  await audit(core, actor, 'theme.create', { kind: 'theme', id: row.id }, { name: input.name })
  return getTheme(core, actor, row.id)
}

export async function updateTheme(
  core: Core,
  actor: Actor,
  id: string,
  input: Partial<ThemeInput>,
): Promise<Theme> {
  const row = await themeRow(core, actor, id)
  await assertAdmin(core, actor, row)
  const current = dto(row)
  await core.db.exec(
    'UPDATE theme SET name = $2, settings = $3, updated_at = now() WHERE id = $1',
    [id, (input.name ?? current.name).trim(), JSON.stringify(input.settings ?? current.settings)],
  )
  await audit(core, actor, 'theme.update', { kind: 'theme', id }, { fields: Object.keys(input) })
  return getTheme(core, actor, id)
}

export async function deleteTheme(core: Core, actor: Actor, id: string): Promise<void> {
  await assertAdmin(core, actor, await themeRow(core, actor, id))
  // Folders and dashboards that wore it fall back to what they inherit (ON DELETE SET NULL).
  await core.db.exec('DELETE FROM theme WHERE id = $1', [id])
  await audit(core, actor, 'theme.delete', { kind: 'theme', id }, {})
}

/** A theme may be set on a folder or a dashboard only if the space has it. */
export async function checkTheme(core: Core, actor: Pick<Actor, 'workspaceId'>, id: string | null | undefined): Promise<void> {
  if (id) await themeRow(core, actor, id)
}

/**
 * The theme worn by what sits in `folder`, and by `dashboard` when it has its own: the
 * dashboard's, else the folder's, else the nearest parent's that has one.
 */
export async function resolveTheme(
  core: Core,
  place: { folder: string | null; dashboard?: { id: string; name: string; theme: string | null } },
): Promise<ResolvedTheme | null> {
  if (place.dashboard?.theme) {
    const t = await core.db.one<ThemeRow>(
      'SELECT id, name, settings, updated_at FROM theme WHERE id = $1',
      [place.dashboard.theme],
    )
    if (t)
      return {
        ...dto(t),
        from: { kind: 'dashboard', id: place.dashboard.id, name: place.dashboard.name },
      }
  }
  if (!place.folder) return null
  const r = await core.db.one<ThemeRow & { folder_id: string; folder_name: string }>(
    `WITH RECURSIVE up AS (
       SELECT id, parent_id, theme_id, name, 0 AS depth FROM folder WHERE id = $1
       UNION ALL
       SELECT f.id, f.parent_id, f.theme_id, f.name, up.depth + 1 FROM folder f JOIN up ON f.id = up.parent_id WHERE up.depth < 64
     )
     SELECT t.id, t.name, t.settings, t.updated_at, up.id AS folder_id, up.name AS folder_name
       FROM up JOIN theme t ON t.id = up.theme_id
      ORDER BY up.depth LIMIT 1`,
    [place.folder],
  )
  return r ? { ...dto(r), from: { kind: 'folder', id: r.folder_id, name: r.folder_name } } : null
}
