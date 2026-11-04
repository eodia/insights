import type { HomeLayout, HomeWidget, HomeWidgetKind } from '@eodia/contracts'
import { api } from './api'

/** The home page's grid: twelve columns, rows a little taller than a line of text. */
export const HOME_COLUMNS = 12
export const HOME_ROW_HEIGHT = 30

/** Each block's size when it is added: a figure is small, a list wider and taller. */
export const WIDGET_SIZE: Record<HomeWidgetKind, { w: number; h: number }> = {
  kpi: { w: 3, h: 4 },
  question: { w: 6, h: 10 },
  favorites: { w: 8, h: 10 },
  alerts: { w: 4, h: 10 },
  recent: { w: 6, h: 9 },
  latest: { w: 6, h: 9 },
  shortcuts: { w: 12, h: 7 },
  tables: { w: 6, h: 10 },
  sources: { w: 6, h: 6 },
}

/** The blocks shown once at most: the page's own lists. */
export const SINGLE_WIDGETS: readonly HomeWidgetKind[] = ['favorites', 'alerts', 'recent', 'latest', 'shortcuts', 'tables', 'sources']

const newId = () => Math.random().toString(36).slice(2, 10)

/** The page as it comes, before one arranges it: favourites and alerts, then what one saw last. */
export function defaultWidgets(): HomeWidget[] {
  return [
    { id: 'favorites', kind: 'favorites', x: 0, y: 0, w: 8, h: 10 },
    { id: 'alerts', kind: 'alerts', x: 8, y: 0, w: 4, h: 10 },
    { id: 'recent', kind: 'recent', x: 0, y: 10, w: 6, h: 9 },
    { id: 'latest', kind: 'latest', x: 6, y: 10, w: 6, h: 9 },
    { id: 'shortcuts', kind: 'shortcuts', x: 0, y: 19, w: 12, h: 7 },
  ]
}

/**
 * A block added to the page. A figure joins the others along the top, or opens a new row there,
 * pushing the rest down; anything else goes at the bottom.
 */
export function placeWidget(widgets: readonly HomeWidget[], kind: HomeWidgetKind, question?: string): HomeWidget[] {
  const size = WIDGET_SIZE[kind]
  const widget = (x: number, y: number): HomeWidget => ({ id: newId(), kind, ...(question ? { question } : {}), x, y, ...size })
  if (kind === 'kpi') {
    const top = widgets.filter((w) => w.kind === 'kpi' && w.y === 0)
    const end = top.reduce((m, w) => Math.max(m, w.x + w.w), 0)
    if (top.length && end + size.w <= HOME_COLUMNS) return [...widgets, widget(end, 0)]
    return [widget(0, 0), ...widgets.map((w) => ({ ...w, y: w.y + size.h }))]
  }
  const bottom = widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0)
  return [...widgets, widget(0, bottom)]
}

export const homeLayoutKey = ['home-layout'] as const

export const fetchHomeLayout = () => api.get<{ layout: HomeLayout | null }>('/v1/home/layout')

export const saveHomeLayout = (widgets: readonly HomeWidget[] | null) =>
  api.put<{ layout: HomeLayout | null }>('/v1/home/layout', { layout: widgets ? { widgets } : null })

/** A question pinned to one's home page, from wherever it is shown: as a figure, or as its chart. */
export async function pinToHome(question: string, kind: 'kpi' | 'question'): Promise<void> {
  const { layout } = await fetchHomeLayout()
  const widgets = layout?.widgets ?? defaultWidgets()
  await saveHomeLayout(placeWidget(widgets, kind, question))
}
