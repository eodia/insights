'use client'

import { Avatar } from '@/components/app/look'
import { $t } from '@/lib/i18n'
import { MENTION } from '@/lib/mentions'
import { useDirectory } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { Fragment, type KeyboardEvent, useRef, useState } from 'react'

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Calling on someone in a field: typing « @ » lists the people of the space; one chosen is
 * written « @Marie » — and, when the text is sent, `@[Marie](her-id)`, which the server reads to
 * tell her. Returns what the field needs, the list to show, and how to encode the text.
 */
export function useMentions(value: string, setValue: (v: string) => void) {
  const field = useRef<HTMLTextAreaElement & HTMLInputElement>(null)
  const { data } = useDirectory()
  const [query, setQuery] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const chosen = useRef(new Map<string, string>())
  const people = query === null ? [] : (data?.users ?? []).filter((u) => fold(u.name).includes(fold(query)) || fold(u.email).startsWith(fold(query))).slice(0, 6)

  const detect = (el: HTMLTextAreaElement | HTMLInputElement) => {
    const before = el.value.slice(0, el.selectionStart ?? el.value.length)
    const m = /(?:^|\s)@([^\s@]{0,30})$/u.exec(before)
    setQuery(m ? (m[1] ?? '') : null)
    setActive(0)
  }
  const pick = (u: { id: string; name: string }) => {
    const el = field.current
    if (!el) return
    const at = el.selectionStart ?? value.length
    const before = value.slice(0, at).replace(/@([^\s@]{0,30})$/u, `@${u.name} `)
    const next = before + value.slice(at)
    chosen.current.set(u.name, u.id)
    setValue(next)
    setQuery(null)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(before.length, before.length)
    })
  }

  return {
    field,
    onChange: (e: { target: HTMLTextAreaElement | HTMLInputElement }) => {
      setValue(e.target.value)
      detect(e.target)
    },
    /** True when the key served the list (arrows, Enter, Escape): the field does nothing else with it. */
    onKeyDown: (e: KeyboardEvent): boolean => {
      if (query === null || people.length === 0) return false
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : people.length - 1)) % people.length)
        return true
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const u = people[active]
        if (u) pick(u)
        return true
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setQuery(null)
        return true
      }
      return false
    },
    /** The text to send: each « @Name » chosen becomes `@[Name](id)`. */
    encode: (text: string) => {
      let out = text
      for (const [name, id] of [...chosen.current].sort((a, b) => b[0].length - a[0].length)) {
        out = out.split(`@${name}`).join(`@[${name}](${id})`)
      }
      return out
    },
    menu:
      query !== null && people.length ? (
        <div role="listbox" aria-label={$t('Mentionner')} className="absolute inset-x-0 bottom-full z-50 mb-1 overflow-hidden rounded-xl border bg-popover p-1 shadow-lg">
          {people.map((u, i) => (
            <button
              key={u.id}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(u)
              }}
              onMouseMove={() => setActive(i)}
              className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm', i === active && 'bg-accent')}
            >
              <Avatar name={u.name} color={u.color} size="sm" />
              <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
              <span className="max-w-[45%] truncate text-xs text-muted-foreground">{u.email}</span>
            </button>
          ))}
        </div>
      ) : null,
  }
}

/** A text with its mentions shown as chips: `@[Marie](…)` reads « @Marie », highlighted. */
export function MentionText({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(new RegExp(MENTION.source, 'gi'))) {
    const at = m.index ?? 0
    if (at > last) parts.push(text.slice(last, at))
    parts.push(
      <span key={at} className="rounded-md bg-primary/10 px-1 font-medium text-primary">
        @{m[1]}
      </span>,
    )
    last = at + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return (
    <span className={className}>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </span>
  )
}
