import { DASHBOARD_COLUMNS, type Dashboard, type DashboardCard, type HomeBlockKind, type HomeLayout, type VisualizationType, cardSize } from '@eodia/contracts'
import { BellRing, Clock3, Database, type LucideIcon, Plus, Sparkles, Star, Table2 } from 'lucide-react'
import { api } from './api'
import { $t, msg } from './i18n'

/** The home page, drawn as a dashboard of the person's own: its identifier among them. */
export const HOME_DASHBOARD = 'home'

/** The home page's own blocks: how each is named, drawn and described in the editor's toolbar. */
export const HOME_BLOCK_META: Record<HomeBlockKind, { label: string; icon: LucideIcon; hint: string }> = {
  favorites: { label: msg('Mes favoris'), icon: Star, hint: msg('Les tableaux de bord et questions étoilés') },
  alerts: { label: msg('À surveiller'), icon: BellRing, hint: msg('Vos alertes, et les chiffres qui baissent') },
  recent: { label: msg('Consultés récemment'), icon: Clock3, hint: msg('Ce que vous avez ouvert en dernier') },
  latest: { label: msg('Nouveautés'), icon: Sparkles, hint: msg('Ce qui a changé ces deux derniers mois') },
  shortcuts: { label: msg('Raccourcis'), icon: Plus, hint: msg('Créer une question, une requête SQL, un tableau de bord') },
  tables: { label: msg('Tables'), icon: Table2, hint: msg('Les plus grandes tables, à explorer') },
  sources: { label: msg('Sources'), icon: Database, hint: msg('Les sources connectées et leur état') },
}

const blockLabel = (kind: HomeBlockKind) => $t(HOME_BLOCK_META[kind].label)

const newId = () => `c${Math.random().toString(36).slice(2, 10)}`

const block = (kind: HomeBlockKind, x: number, y: number, w: number, h: number): DashboardCard => ({
  id: `home-${kind}`,
  kind: 'block',
  block: kind,
  title: blockLabel(kind),
  tab: null,
  x,
  y,
  w,
  h,
})

/** The page as it comes, before one arranges it: favourites and alerts, then what one saw last. */
export function defaultCards(): DashboardCard[] {
  return [
    block('favorites', 0, 0, 16, 7),
    block('alerts', 16, 0, 8, 7),
    block('recent', 0, 7, 12, 6),
    block('latest', 12, 7, 12, 6),
  ]
}

/** The person's home page as a dashboard: theirs to arrange, with nothing of a shared one's. */
export function homeDashboard(name: string, layout: HomeLayout): Dashboard {
  const now = new Date().toISOString()
  return {
    id: HOME_DASHBOARD,
    name,
    description: null,
    folder: null,
    tabs: layout.tabs ?? [],
    cards: layout.cards,
    parameters: layout.parameters ?? [],
    auto_refresh: null,
    cache_ttl: null,
    preload: false,
    created_by: null,
    created_at: now,
    updated_at: now,
    access: 'edit',
    archived: false,
    theme: null,
    resolved_theme: null,
    width: 'full',
  }
}

export const homeLayoutKey = ['home-layout'] as const

export const fetchHomeLayout = () => api.get<{ layout: HomeLayout | null }>('/v1/home/layout')

export const saveHomeLayout = (layout: HomeLayout | null) => api.put<{ layout: HomeLayout | null }>('/v1/home/layout', { layout })

/**
 * A question pinned to one's home page, from wherever it is shown. A figure joins the others along
 * the top, or opens a row there and pushes the rest down; a chart goes at the bottom.
 */
export async function pinToHome(question: string, viz: VisualizationType): Promise<void> {
  const { layout } = await fetchHomeLayout()
  const cards = layout?.cards ?? defaultCards()
  const size = cardSize('question', viz)
  const figure = ['scalar', 'trend', 'progress'].includes(viz)
  const card = (x: number, y: number, w: number, h: number): DashboardCard => ({ id: newId(), kind: 'question', question, tab: null, x, y, w, h })
  let next: DashboardCard[]
  if (figure) {
    const w = 6
    const top = cards.filter((c) => c.kind === 'question' && c.y === 0 && c.h === size.h)
    const end = top.reduce((m, c) => Math.max(m, c.x + c.w), 0)
    next = top.length && end + w <= DASHBOARD_COLUMNS ? [...cards, card(end, 0, w, size.h)] : [card(0, 0, w, size.h), ...cards.map((c) => ({ ...c, y: c.y + size.h }))]
  } else {
    const bottom = cards.reduce((m, c) => Math.max(m, c.y + c.h), 0)
    next = [...cards, card(0, bottom, size.w, size.h)]
  }
  await saveHomeLayout({ ...(layout ?? {}), cards: next })
}
