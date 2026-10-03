'use client'

/**
 * Sizes of resizable panes, remembered in the browser for each person: two people sharing a
 * browser keep their own layout. localStorage may be unavailable (private mode, blocked
 * storage) — every access is guarded, and the default size is then simply used.
 */
import { useCallback, useEffect, useState } from 'react'
import { useMe } from './queries'

const PREFIX = 'eodia:panes:'

function read(userId: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(PREFIX + userId)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function write(userId: string, id: string, size: number | null): void {
  try {
    const all = read(userId)
    if (size === null) delete all[id]
    else all[id] = Math.round(size)
    localStorage.setItem(PREFIX + userId, JSON.stringify(all))
  } catch {
    // Not remembered: the pane still resizes for this visit.
  }
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

/** `[size, setSize, reset]` of a pane, clamped to its bounds and saved as it changes. */
export function usePaneSize(id: string, defaultSize: number, min: number, max: number): [number, (s: number) => void, () => void] {
  const { data: me } = useMe()
  const userId = me?.id ?? 'anonyme'
  const [size, setSizeState] = useState(defaultSize)

  // The saved size is read after mount: the server render and the first paint agree.
  useEffect(() => {
    const saved = read(userId)[id]
    if (typeof saved === 'number' && Number.isFinite(saved)) setSizeState(clamp(saved, min, max))
  }, [userId, id, min, max])

  const setSize = useCallback(
    (s: number) => {
      const next = clamp(s, min, max)
      setSizeState(next)
      write(userId, id, next)
    },
    [userId, id, min, max],
  )
  const reset = useCallback(() => {
    setSizeState(defaultSize)
    write(userId, id, null)
  }, [userId, id, defaultSize])
  return [size, setSize, reset]
}
