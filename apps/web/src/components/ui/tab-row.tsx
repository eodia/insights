'use client'

import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'

/**
 * A row of tabs that never overflows its pane: it scrolls sideways (no visible scrollbar),
 * fades at the edge where more tabs hide, keeps the active tab — `aria-selected`,
 * `data-state="active"` or `data-active` — in view, and turns the mouse wheel into a
 * horizontal scroll.
 */
export function TabRow({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  // Listeners, once: the edges are recomputed on scroll and on resize — and set only when they
  // change, or every render would schedule another.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const left = el.scrollLeft > 2
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
      setEdges((e) => (e.left === left && e.right === right ? e : { left, right }))
    }
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      el.removeEventListener('wheel', onWheel)
      observer.disconnect()
    }
  }, [])

  // The active tab back in view when the tabs change; no state set here.
  useEffect(() => {
    const el = ref.current
    const active = el?.querySelector<HTMLElement>('[aria-selected="true"],[data-state="active"],[data-active="true"]')
    if (!el || !active) return
    const a = active.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    if (a.left < r.left || a.right > r.right) el.scrollLeft += a.left < r.left ? a.left - r.left - 16 : a.right - r.right + 16
  })

  return (
    <div
      ref={ref}
      role="tablist"
      className={cn(
        'flex min-w-0 items-center overflow-x-auto overflow-y-hidden whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0',
        className,
      )}
      style={{
        maskImage:
          edges.left || edges.right
            ? `linear-gradient(to right, ${edges.left ? 'transparent, black 24px' : 'black'}, ${edges.right ? 'black calc(100% - 24px), transparent' : 'black'})`
            : undefined,
      }}
    >
      {children}
    </div>
  )
}
