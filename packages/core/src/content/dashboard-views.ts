/**
 * The views of a dashboard: filters and a tab kept under a name, by whoever opens it — theirs,
 * or shared with everyone who can open it. Reading a dashboard is enough to keep one's own.
 */
import type { DashboardSavedView, SavedViewInput } from '@eodia/contracts'
import { summaryOf } from '../auth/users'
import type { Actor, Core } from '../context'
import { forbidden, notFound } from '../errors'
import { getDashboard } from './items'

interface Row {
  id: string
  user_id: string
  name: string
  filter_values: Record<string, unknown>
  tab: string | null
  shared: boolean
  is_default: boolean
}

export async function listDashboardViews(core: Core, actor: Actor, dashboardId: string): Promise<DashboardSavedView[]> {
  await getDashboard(core, actor, dashboardId)
  const rows = await core.db.many<Row>(
    `SELECT id, user_id, name, filter_values, tab, shared, is_default FROM dashboard_view
      WHERE dashboard_id = $1 AND (user_id = $2 OR shared)
      ORDER BY (user_id = $2) DESC, lower(name)`,
    [dashboardId, actor.userId],
  )
  const authors = await summaryOf(core, rows.map((r) => r.user_id))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    values: r.filter_values,
    tab: r.tab,
    shared: r.shared,
    // A default is its author's: a shared view is no one else's default.
    is_default: r.is_default && r.user_id === actor.userId,
    mine: r.user_id === actor.userId,
    author: authors.get(r.user_id) ?? null,
  }))
}

async function ownView(core: Core, actor: Actor, dashboardId: string, id: string): Promise<void> {
  const row = await core.db.one<{ user_id: string }>('SELECT user_id FROM dashboard_view WHERE id = $1 AND dashboard_id = $2', [id, dashboardId])
  if (!row) throw notFound('Vue introuvable.')
  if (row.user_id !== actor.userId) throw forbidden('Cette vue est à quelqu’un d’autre : enregistrez-en une à vous.')
}

/** Keeps a view — a new one, or one of one's own, `id` given. One default per person and dashboard. */
export async function saveDashboardView(core: Core, actor: Actor, dashboardId: string, input: SavedViewInput, id?: string): Promise<DashboardSavedView> {
  const d = await getDashboard(core, actor, dashboardId)
  // Only the dashboard's filters are kept, and its tabs.
  const known = new Set(d.parameters.map((p) => p.id))
  const values = Object.fromEntries(Object.entries(input.values).filter(([k]) => known.has(k)))
  const tab = input.tab && d.tabs.some((t) => t.id === input.tab) ? input.tab : null
  return core.db.tx(async (c) => {
    if (input.is_default) await core.db.exec('UPDATE dashboard_view SET is_default = false WHERE dashboard_id = $1 AND user_id = $2', [dashboardId, actor.userId], c)
    let viewId = id
    if (id) {
      await ownView(core, actor, dashboardId, id)
      await core.db.exec(
        'UPDATE dashboard_view SET name = $2, filter_values = $3, tab = $4, shared = $5, is_default = $6, updated_at = now() WHERE id = $1',
        [id, input.name.trim(), JSON.stringify(values), tab, !!input.shared, !!input.is_default],
        c,
      )
    } else {
      const row = await core.db.one<{ id: string }>(
        'INSERT INTO dashboard_view (dashboard_id, user_id, name, filter_values, tab, shared, is_default) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [dashboardId, actor.userId, input.name.trim(), JSON.stringify(values), tab, !!input.shared, !!input.is_default],
        c,
      )
      viewId = row?.id
    }
    return { id: viewId as string, name: input.name.trim(), values, tab, shared: !!input.shared, is_default: !!input.is_default, mine: true, author: null }
  })
}

export async function deleteDashboardView(core: Core, actor: Actor, dashboardId: string, id: string): Promise<void> {
  await getDashboard(core, actor, dashboardId)
  await ownView(core, actor, dashboardId, id)
  await core.db.exec('DELETE FROM dashboard_view WHERE id = $1', [id])
}
