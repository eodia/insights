import { type HomeLayout, HomeLayoutSchema } from '@eodia/contracts'
import type { Actor, Core } from '../context'

/**
 * Each person's home page, laid out by them: the figures they pinned, their favourites, their
 * alerts and the questions they want to see. Only its arrangement is kept here — every card
 * still runs under the person's rights when the page is shown.
 */

/** The person's layout; null when they never arranged it (the page then shows its own). */
export async function getHomeLayout(core: Core, actor: Actor): Promise<HomeLayout | null> {
  const row = await core.db.one<{ layout: unknown }>('SELECT layout FROM user_home WHERE user_id = $1', [actor.userId])
  if (!row) return null
  const parsed = HomeLayoutSchema.safeParse(row.layout)
  return parsed.success ? (parsed.data as HomeLayout) : null
}

/** Keeps the person's layout; null brings back the page's own. */
export async function saveHomeLayout(core: Core, actor: Actor, layout: HomeLayout | null): Promise<HomeLayout | null> {
  if (layout === null) {
    await core.db.exec('DELETE FROM user_home WHERE user_id = $1', [actor.userId])
    return null
  }
  await core.db.exec(
    `INSERT INTO user_home (user_id, layout) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET layout = EXCLUDED.layout, updated_at = now()`,
    [actor.userId, JSON.stringify(layout)],
  )
  return layout
}
