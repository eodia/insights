'use client'

import { $t } from '@/lib/i18n'
import { usePaneSize } from '@/lib/panes'
import { cn } from '@/lib/utils'
import { useRef, useState } from 'react'

type Side = 'left' | 'right' | 'top'

/**
 * A pane the person resizes by its inner edge: drag, arrow keys, double-click to restore.
 * The size is remembered per person in the browser (`lib/panes.ts`).
 *
 * - `left`: a pane on the left of the screen, its handle on its right edge;
 * - `right`: on the right, handle on its left edge;
 * - `top`: above the rest, handle on its bottom edge (its height, in pixels).
 */
export function Pane({
  id,
  side,
  defaultSize,
  min,
  max,
  className,
  children,
  as: Tag = 'div',
}: {
  id: string
  side: Side
  defaultSize: number
  min: number
  max: number
  className?: string
  children: React.ReactNode
  as?: 'div' | 'aside' | 'section' | 'nav'
}) {
  const [size, setSize, reset] = usePaneSize(id, defaultSize, min, max)
  const [dragging, setDragging] = useState(false)
  const start = useRef({ pointer: 0, size: 0 })
  // The size the next key press starts from, even when presses come faster than renders.
  const latest = useRef(size)
  latest.current = size
  const vertical = side === 'top'
  const resizeBy = (delta: number) => {
    latest.current = Math.min(Math.max(latest.current + delta, min), max)
    setSize(latest.current)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    start.current = { pointer: vertical ? e.clientY : e.clientX, size }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const delta = (vertical ? e.clientY : e.clientX) - start.current.pointer
    setSize(start.current.size + (side === 'right' ? -delta : delta))
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(false)
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16
    const grow = vertical ? 'ArrowDown' : side === 'right' ? 'ArrowLeft' : 'ArrowRight'
    const shrink = vertical ? 'ArrowUp' : side === 'right' ? 'ArrowRight' : 'ArrowLeft'
    if (e.key === grow) resizeBy(step)
    else if (e.key === shrink) resizeBy(-step)
    else if (e.key === 'Home') setSize(min)
    else if (e.key === 'End') setSize(max)
    else return
    e.preventDefault()
  }

  return (
    <Tag className={cn('relative shrink-0', className)} style={vertical ? { height: size } : { width: size }}>
      {children}
      {/* biome-ignore lint/a11y/useSemanticElements: a resizable splitter is a focusable separator */}
      <div
        role="separator"
        tabIndex={0}
        aria-orientation={vertical ? 'horizontal' : 'vertical'}
        aria-valuenow={Math.round(size)}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-label={$t('Redimensionner le volet (double-clic : taille par défaut)')}
        title={$t('Glisser pour redimensionner · double-clic pour revenir à la taille par défaut')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={reset}
        onKeyDown={onKeyDown}
        className={cn(
          'group absolute z-30 touch-none outline-none',
          vertical ? '-bottom-1 left-0 h-2 w-full cursor-row-resize' : 'top-0 h-full w-2 cursor-col-resize',
          side === 'left' && '-right-1',
          side === 'right' && '-left-1',
        )}
      >
        <span
          className={cn(
            'pointer-events-none absolute bg-primary opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-100',
            vertical ? 'inset-x-0 top-1/2 h-0.5 -translate-y-1/2' : 'inset-y-0 left-1/2 w-0.5 -translate-x-1/2',
            dragging && 'opacity-100',
          )}
        />
      </div>
      {/* While dragging, the cursor stays a resize cursor over iframes and charts too. */}
      {dragging ? <div className={cn('fixed inset-0 z-50', vertical ? 'cursor-row-resize' : 'cursor-col-resize')} /> : null}
    </Tag>
  )
}
