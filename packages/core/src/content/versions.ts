/**
 * A dashboard's versions: each save keeps its whole state, to see who changed what, to compare,
 * and to restore one — a restore being a new version itself, nothing is lost.
 */
import type { Dashboard, DashboardSnapshot, DashboardVersion } from '@eodia/contracts'
import { summaryOf } from '../auth/users'
import type { Actor, Core } from '../context'
import { forbidden, notFound } from '../errors'
import { atLeastAccess } from './access'
import { getDashboard, updateDashboard } from './items'

/** How many versions a dashboard keeps: the oldest go beyond. */
const KEPT = 200

/** What a version keeps of a dashboard: all one may change, nothing of who may see it. */
export function snapshotOf(d: Dashboard): DashboardSnapshot {
  return {
    name: d.name,
    description: d.description,
    tabs: d.tabs,
    cards: d.cards,
    parameters: d.parameters,
    theme: d.theme,
    width: d.width,
    auto_refresh: d.auto_refresh,
    cache_ttl: d.cache_ttl,
    preload: d.preload,
  }
}

/** Keeps the dashboard as it now stands, as a version. */
export async function keepVersion(core: Core, actor: Actor, d: Dashboard, note: string | null = null): Promise<void> {
  await core.db.exec('INSERT INTO dashboard_version (dashboard_id, snapshot, user_id, note) VALUES ($1, $2, $3, $4)', [
    d.id,
    JSON.stringify(snapshotOf(d)),
    actor.userId,
    note,
  ])
  await core.db.exec(
    `DELETE FROM dashboard_version WHERE dashboard_id = $1 AND id NOT IN (SELECT id FROM dashboard_version WHERE dashboard_id = $1 ORDER BY id DESC LIMIT ${KEPT})`,
    [d.id],
  )
}

/** The latest versions of a dashboard, newest first — for whoever may open it. */
export async function listDashboardVersions(core: Core, actor: Actor, id: string): Promise<DashboardVersion[]> {
  await getDashboard(core, actor, id)
  const rows = await core.db.many<{ id: string; snapshot: DashboardSnapshot; user_id: string | null; note: string | null; created_at: Date }>(
    'SELECT id::text, snapshot, user_id, note, created_at FROM dashboard_version WHERE dashboard_id = $1 ORDER BY id DESC LIMIT 60',
    [id],
  )
  const people = await summaryOf(core, rows.map((r) => r.user_id))
  return rows.map((r) => ({
    id: r.id,
    at: r.created_at.toISOString(),
    author: (r.user_id && people.get(r.user_id)) || null,
    note: r.note,
    snapshot: r.snapshot,
  }))
}

/** Puts a version back: the dashboard becomes it again — as a new version. */
export async function restoreDashboardVersion(core: Core, actor: Actor, id: string, versionId: string): Promise<Dashboard> {
  const current = await getDashboard(core, actor, id)
  if (!atLeastAccess(current.access, 'edit')) throw forbidden('Vous ne pouvez pas modifier ce tableau de bord.')
  const row = await core.db.one<{ snapshot: DashboardSnapshot; created_at: Date }>('SELECT snapshot, created_at FROM dashboard_version WHERE id = $1 AND dashboard_id = $2', [
    versionId,
    id,
  ])
  if (!row) throw notFound('Version introuvable.')
  const s = row.snapshot
  return updateDashboard(
    core,
    actor,
    id,
    {
      name: s.name,
      description: s.description,
      tabs: s.tabs as never,
      cards: s.cards as never,
      parameters: s.parameters as never,
      theme: s.theme,
      width: s.width,
      auto_refresh: s.auto_refresh,
      cache_ttl: s.cache_ttl,
      preload: s.preload,
    },
    `restore:${row.created_at.toISOString()}`,
  )
}
