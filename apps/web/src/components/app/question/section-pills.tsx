'use client'

import { TabRow } from '@/components/ui/tab-row'
import { cn } from '@/lib/utils'
import { type RefObject, useEffect, useRef, useState } from 'react'

/**
 * A pill for each section of a long panel — those marked `data-anchor` in `content` —, to go
 * straight to it; the one being read is lit as the panel scrolls. Meant for a header pinned at
 * the top of the panel, which the sections then stop under.
 */
export function SectionPills({ content, className }: { content: RefObject<HTMLElement | null>; className?: string }) {
  const [titles, setTitles] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)
  const self = useRef<HTMLDivElement>(null)
  // The section chosen, lit until the panel has stopped on it — even when it cannot reach the top.
  const chosen = useRef<string | null>(null)

  useEffect(() => {
    const root = content.current
    const scroller = root?.parentElement
    if (!root || !scroller) return
    const anchors = () => [...root.querySelectorAll<HTMLElement>('[data-anchor]')]
    // Where a section stops: under the pinned header.
    const offset = () => (self.current?.closest<HTMLElement>('[data-pinned]')?.offsetHeight ?? 0) + 12
    const read = () => {
      const list = [...new Set(anchors().map((a) => a.dataset.anchor ?? ''))].filter(Boolean)
      setTitles((t) => (t.join('\n') === list.join('\n') ? t : list))
      if (chosen.current) return setActive(chosen.current)
      const top = scroller.getBoundingClientRect().top + offset() + 4
      // At the very bottom, the last section is the one read, however short it is.
      const end = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
      const seen = anchors().filter((a) => a.getBoundingClientRect().top <= top)
      setActive(end ? (list.at(-1) ?? null) : (seen.at(-1)?.dataset.anchor ?? list[0] ?? null))
    }
    read()
    const changes = new MutationObserver(read)
    changes.observe(root, { childList: true, subtree: true })
    scroller.addEventListener('scroll', read, { passive: true })
    // Scrolled by hand: the pills follow the panel again.
    const free = () => {
      chosen.current = null
    }
    scroller.addEventListener('wheel', free, { passive: true })
    scroller.addEventListener('pointerdown', free, { passive: true })
    return () => {
      changes.disconnect()
      scroller.removeEventListener('scroll', read)
      scroller.removeEventListener('wheel', free)
      scroller.removeEventListener('pointerdown', free)
    }
  }, [content])

  // The lit pill kept in sight when the row is longer than the panel — the row alone scrolled:
  // scrolling it into view would also stop the panel on its way to a section.
  useEffect(() => {
    const pill = self.current?.querySelector<HTMLElement>('[aria-current="true"]')
    const row = pill?.parentElement
    if (!pill || !row) return
    const left = pill.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft
    if (left < row.scrollLeft + 16) row.scrollTo({ left: left - 16, behavior: 'smooth' })
    else if (left + pill.offsetWidth > row.scrollLeft + row.clientWidth - 16) row.scrollTo({ left: left + pill.offsetWidth - row.clientWidth + 16, behavior: 'smooth' })
  }, [active])

  const go = (title: string) => {
    const root = content.current
    const scroller = root?.parentElement
    const target = root?.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(title)}"]`)
    if (!scroller || !target) return
    const pinned = self.current?.closest<HTMLElement>('[data-pinned]')?.offsetHeight ?? 0
    const top = scroller.scrollTop + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - pinned - 12
    chosen.current = title
    setActive(title)
    scroller.scrollTo({ top, behavior: 'smooth' })
  }

  if (titles.length < 2) return null
  return (
    <div ref={self}>
      <TabRow className={cn('gap-1 px-4 py-2', className)}>
        {titles.map((title) => (
          <button
            key={title}
            type="button"
            onClick={() => go(title)}
            aria-current={active === title}
            className={cn(
              'inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-[12.5px] whitespace-nowrap transition-colors',
              active === title ? 'bg-primary/10 font-semibold text-primary' : 'bg-muted/70 text-muted-foreground hover:text-foreground',
            )}
          >
            {title}
          </button>
        ))}
      </TabRow>
    </div>
  )
}
