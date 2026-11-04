/**
 * Where one was on a dashboard before opening one of its questions — its tab, its filters, how
 * far down — so that the question can bring one back there exactly. Kept for the browser tab's
 * session only.
 */

const KEY = 'eodia:return-point'

export interface ReturnPoint {
  readonly dashboard: string
  readonly name: string
  readonly tab: string | null
  readonly values: Readonly<Record<string, unknown>>
  readonly scroll: number
  /** The question opened from it: the way back shows on that one alone. */
  readonly question: string
}

export function leaveDashboard(point: ReturnPoint): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(point))
  } catch {}
}

function read(): ReturnPoint | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as ReturnPoint) : null
  } catch {
    return null
  }
}

/** The way back from this question, if one came from a dashboard. */
export function returnPointFor(question: string | undefined): ReturnPoint | null {
  const p = read()
  return p && question && p.question === question ? p : null
}

/** The address that brings one back: the dashboard, at its tab, asking for its filters back. */
export const returnHref = (p: ReturnPoint) => `/dashboard/${p.dashboard}?${new URLSearchParams({ ...(p.tab ? { tab: p.tab } : {}), back: '1' })}`

/** Back on the dashboard: where one was, once. */
export function takeReturnPoint(dashboard: string): ReturnPoint | null {
  const p = read()
  if (!p || p.dashboard !== dashboard) return null
  try {
    sessionStorage.removeItem(KEY)
  } catch {}
  return p
}
