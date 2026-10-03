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
import { forbidden, invalid, notFound } from '../errors'
import { contentIndex } from './access'

interface ThemeRow {
  id: string
  name: string
  settings: Record<string, unknown>
  updated_at: Date
}

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

async function assertAdmin(core: Core, actor: Actor): Promise<void> {
  const idx = await contentIndex(core, actor.userId)
  if (!idx.admin) throw forbidden('Seul un administrateur crée ou modifie un thème.')
}

export async function listThemes(core: Core): Promise<Theme[]> {
  return (
    await core.db.many<ThemeRow>('SELECT id, name, settings, updated_at FROM theme ORDER BY name')
  ).map(dto)
}

export async function getTheme(core: Core, id: string): Promise<Theme> {
  const r = await core.db.one<ThemeRow>(
    'SELECT id, name, settings, updated_at FROM theme WHERE id = $1',
    [id],
  )
  if (!r) throw notFound('Thème introuvable.')
  return dto(r)
}

export async function createTheme(core: Core, actor: Actor, input: ThemeInput): Promise<Theme> {
  await assertAdmin(core, actor)
  const row = await core.db.one<{ id: string }>(
    'INSERT INTO theme (name, settings, created_by) VALUES ($1, $2, $3) RETURNING id',
    [input.name.trim(), JSON.stringify(input.settings), actor.userId],
  )
  if (!row) throw invalid('Thème non créé.')
  await audit(core, actor, 'theme.create', { kind: 'theme', id: row.id }, { name: input.name })
  return getTheme(core, row.id)
}

export async function updateTheme(
  core: Core,
  actor: Actor,
  id: string,
  input: Partial<ThemeInput>,
): Promise<Theme> {
  await assertAdmin(core, actor)
  const current = await getTheme(core, id)
  await core.db.exec(
    'UPDATE theme SET name = $2, settings = $3, updated_at = now() WHERE id = $1',
    [id, (input.name ?? current.name).trim(), JSON.stringify(input.settings ?? current.settings)],
  )
  await audit(core, actor, 'theme.update', { kind: 'theme', id }, { fields: Object.keys(input) })
  return getTheme(core, id)
}

export async function deleteTheme(core: Core, actor: Actor, id: string): Promise<void> {
  await assertAdmin(core, actor)
  await getTheme(core, id)
  // Folders and dashboards that wore it fall back to what they inherit (ON DELETE SET NULL).
  await core.db.exec('DELETE FROM theme WHERE id = $1', [id])
  await audit(core, actor, 'theme.delete', { kind: 'theme', id }, {})
}

/** A theme may be set on a folder or a dashboard only if it exists. */
export async function checkTheme(core: Core, id: string | null | undefined): Promise<void> {
  if (id) await getTheme(core, id)
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
