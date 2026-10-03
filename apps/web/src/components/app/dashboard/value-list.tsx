'use client'

import { LookIcon } from '@/components/app/look'
import { SearchBox } from '@/components/app/question/pickers'
import { Hint } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { LOOK_HEX } from '@/lib/format'
import { $t, $tp, intlLocale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { LookColor } from '@eodia/contracts'
import { useQuery } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

/** A value as the scope endpoint gives it: its look, its rows, its rows within the other filters. */
interface ScopedValue {
  readonly value: string
  readonly label?: string | null
  readonly color?: LookColor | null
  readonly icon?: string | null
  readonly count: number
  readonly scoped: number
}

type State = 'selected' | 'possible' | 'excluded'

export interface Linked {
  readonly column: string
  readonly values: readonly string[]
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const int = (n: number) => new Intl.NumberFormat(intlLocale()).format(n)
const pct = (n: number) =>
  new Intl.NumberFormat(intlLocale(), {
    style: 'percent',
    maximumFractionDigits: n < 0.1 ? 1 : 0,
  }).format(n)

/**
 * A dashboard filter's values, the associative way (as Qlik): the chosen ones in green, the
 * possible ones — those the other filters leave rows for — in white, the excluded ones greyed
 * and below. Each value shows its share of the rows; the head, the share of the selection.
 *
 * A click toggles a value; Shift + click selects a range; Ctrl (⌘) + click keeps only that
 * one. ↑ ↓ move, Space toggles, Shift + ↑ ↓ extend, Ctrl + A selects all, Enter closes.
 * Choices apply as they are made, a moment after the last one.
 */
export function ValueList({
  columnId,
  selected,
  multiple = true,
  linked = [],
  onChange,
  onShare,
  onDone,
}: {
  columnId: string
  selected: readonly string[]
  multiple?: boolean
  linked?: readonly Linked[]
  onChange: (values: string[]) => void
  /** The share of the rows in scope the selection keeps, for the filter's button. */
  onShare?: (share: number | null) => void
  onDone?: () => void
}) {
  const [sel, setSel] = useState<string[]>(() => [...selected])
  const [opened] = useState(() => new Set(selected))
  const [q, setQ] = useState('')
  const [serverQ, setServerQ] = useState('')
  const [active, setActive] = useState(0)
  const anchor = useRef<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Choices apply a moment after the last one — and at once when the list closes.
  const pending = useRef<string[] | null>(null)
  const change = useRef(onChange)
  change.current = onChange
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new choice restarts the wait
  useEffect(() => {
    if (pending.current === null) return
    const t = setTimeout(() => {
      if (pending.current) change.current(pending.current)
      pending.current = null
    }, 350)
    return () => clearTimeout(t)
  }, [sel])
  useEffect(
    () => () => {
      if (pending.current) change.current(pending.current)
    },
    [],
  )
  const choose = (next: string[]) => {
    const v = multiple ? next : next.slice(-1)
    pending.current = v
    setSel(v)
  }

  const all = useQuery({
    queryKey: ['scoped-values', columnId, linked, ''],
    queryFn: () =>
      api.post<{ values: ScopedValue[]; complete: boolean }>(
        `/v1/columns/${columnId}/values/scope`,
        { filters: linked, search: '' },
      ),
    staleTime: 30_000,
  })
  // A long list is searched on the server; a short one, here.
  useEffect(() => {
    const t = setTimeout(() => setServerQ(q), 250)
    return () => clearTimeout(t)
  }, [q])
  const searchServer = !!serverQ && all.data?.complete === false
  const searched = useQuery({
    queryKey: ['scoped-values', columnId, linked, serverQ],
    queryFn: () =>
      api.post<{ values: ScopedValue[]; complete: boolean }>(
        `/v1/columns/${columnId}/values/scope`,
        { filters: linked, search: serverQ },
      ),
    enabled: searchServer,
    staleTime: 30_000,
  })
  const source = searchServer ? searched.data : all.data
  const loading = searchServer ? searched.isLoading : all.isLoading

  const rows = useMemo(() => {
    const values = source?.values ?? []
    const known = new Set(values.map((v) => v.value))
    // A chosen value the data lacks (a default from before, a value out of reach) stays shown.
    const missing: ScopedValue[] = q
      ? []
      : sel.filter((v) => !known.has(v)).map((value) => ({ value, count: 0, scoped: 0 }))
    const shown = [...values, ...missing].filter(
      (v) => !q || fold(`${v.label ?? ''} ${v.value}`).includes(fold(q)),
    )
    const chosen = new Set(sel)
    const state = (v: ScopedValue): State =>
      chosen.has(v.value) ? 'selected' : v.scoped > 0 ? 'possible' : 'excluded'
    // The order is the one the list opened with: rows do not jump under the pointer as one chooses.
    const rank = (v: ScopedValue) => (opened.has(v.value) ? 0 : v.scoped > 0 ? 1 : 2)
    return shown
      .map((v, i) => ({ ...v, state: state(v), i }))
      .sort((a, b) => rank(a) - rank(b) || a.i - b.i)
  }, [source, sel, q, opened])

  const max = Math.max(1, ...rows.map((r) => (r.state === 'excluded' ? r.count : r.scoped)))
  const inScope = (all.data?.values ?? []).reduce((s, v) => s + v.scoped, 0)
  const kept = (all.data?.values ?? [])
    .filter((v) => sel.includes(v.value))
    .reduce((s, v) => s + v.scoped, 0)
  const share = sel.length && inScope ? kept / inScope : null
  const possible = rows.filter((r) => r.state !== 'excluded').length

  useEffect(() => {
    if (all.data) onShare?.(share)
  }, [share, all.data, onShare])

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const click = (index: number, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    const row = rows[index]
    if (!row) return
    setActive(index)
    if (e.ctrlKey || e.metaKey || !multiple) {
      choose([row.value])
    } else if (e.shiftKey && anchor.current !== null) {
      const [from, to] = [Math.min(anchor.current, index), Math.max(anchor.current, index)]
      const range = rows.slice(from, to + 1).map((r) => r.value)
      choose([...new Set([...sel, ...range])])
      return
    } else {
      choose(sel.includes(row.value) ? sel.filter((v) => v !== row.value) : [...sel, row.value])
    }
    anchor.current = index
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(Math.max(active + (e.key === 'ArrowDown' ? 1 : -1), 0), rows.length - 1)
      if (e.shiftKey && multiple) {
        const v = rows[next]?.value
        if (v && !sel.includes(v)) choose([...sel, v])
      }
      setActive(next)
    } else if (e.key === ' ' && (e.target as HTMLElement).tagName !== 'INPUT') {
      e.preventDefault()
      click(active, { shiftKey: false, ctrlKey: false, metaKey: false })
    } else if (
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === 'a' &&
      multiple &&
      (e.target as HTMLElement).tagName !== 'INPUT'
    ) {
      e.preventDefault()
      choose(rows.filter((r) => r.state !== 'excluded').map((r) => r.value))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if ((e.target as HTMLElement).tagName === 'INPUT' && q && rows[0] && multiple)
        choose([
          ...new Set([...sel, ...rows.filter((r) => r.state !== 'excluded').map((r) => r.value)]),
        ])
      else onDone?.()
    } else if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      (e.target as HTMLElement).tagName !== 'INPUT'
    ) {
      e.preventDefault()
      choose([])
    }
  }

  const actions: { label: string; hint: string; run: () => void; disabled?: boolean }[] = [
    {
      label: $t('Tout'),
      hint: $t('Toutes les valeurs possibles (Ctrl + A)'),
      run: () => choose(rows.filter((r) => r.state !== 'excluded').map((r) => r.value)),
      disabled: !multiple,
    },
    {
      label: $t('Exclues'),
      hint: $t('Les valeurs que les autres filtres excluent'),
      run: () => choose(rows.filter((r) => r.state === 'excluded').map((r) => r.value)),
      disabled: !multiple || rows.every((r) => r.state !== 'excluded'),
    },
    {
      label: $t('Inverser'),
      hint: $t('Les valeurs possibles non choisies'),
      run: () => choose(rows.filter((r) => r.state === 'possible').map((r) => r.value)),
      disabled: !multiple || sel.length === 0,
    },
    {
      label: $t('Effacer'),
      hint: $t('Aucune valeur (Suppr)'),
      run: () => choose([]),
      disabled: sel.length === 0,
    },
  ]

  return (
    <div className="flex w-80 flex-col gap-2 p-3" onKeyDown={onKey}>
      <SearchBox value={q} onChange={setQ} placeholder={$t('Chercher une valeur…')} />

      {/* What the selection keeps */}
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          {sel.length ? (
            <span>
              <span className="font-semibold">
                {$tp(sel.length, '{count} valeur choisie', '{count} valeurs choisies')}
              </span>
              {share !== null ? (
                <span className="text-muted-foreground">
                  {' '}
                  · {$tp(kept, '{count} ligne', '{count} lignes')}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {all.data
                ? $tp(possible, '{count} possible sur {total}', '{count} possibles sur {total}', {
                    total: int(rows.length),
                  })
                : ' '}
            </span>
          )}
          {share !== null ? (
            <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {pct(share)}
            </span>
          ) : null}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
            style={{ width: `${(share ?? 0) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex gap-1">
        {actions.map((a) => (
          <Hint key={a.label} label={a.hint}>
            <button
              type="button"
              disabled={a.disabled}
              onClick={a.run}
              className="h-7 flex-1 rounded-md border text-xs hover:bg-accent disabled:opacity-40"
            >
              {a.label}
            </button>
          </Hint>
        ))}
      </div>

      <div
        ref={listRef}
        // biome-ignore lint/a11y/useSemanticElements: a list of options with ranges and modifiers, which <select> cannot do
        role="listbox"
        aria-multiselectable={multiple}
        tabIndex={0}
        aria-activedescendant={rows[active] ? `v-${active}` : undefined}
        className="max-h-72 overflow-y-auto rounded-lg border outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> {$t('Chargement…')}
          </div>
        ) : null}
        {all.error ? (
          <p className="p-3 text-xs text-destructive">{(all.error as Error).message}</p>
        ) : null}
        {rows.map((r, index) => {
          const amount = r.scoped > 0 && r.state !== 'excluded' ? r.scoped : r.count
          const first =
            index > 0 && rows[index - 1]?.scoped !== 0 && r.scoped === 0 && !opened.has(r.value)
          return (
            <div
              key={r.value}
              id={`v-${index}`}
              data-row={index}
              // biome-ignore lint/a11y/useSemanticElements: see the listbox
              role="option"
              aria-selected={r.state === 'selected'}
              tabIndex={-1}
              onMouseDown={(e) => e.shiftKey && e.preventDefault()}
              onClick={(e) => click(index, e)}
              onKeyDown={() => undefined}
              className={cn(
                'relative flex h-8 cursor-pointer items-center gap-2 overflow-hidden border-b px-2.5 text-sm last:border-b-0',
                r.state === 'selected' && 'bg-emerald-500 text-white dark:bg-emerald-600',
                r.state === 'possible' && 'bg-background hover:bg-accent',
                r.state === 'excluded' && 'bg-muted text-muted-foreground hover:bg-muted/80',
                first && 'border-t-2 border-t-border',
                index === active && 'ring-2 ring-inset ring-primary/60',
              )}
            >
              {/* The value's share of the rows, behind it */}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute inset-y-0 left-0',
                  r.state === 'selected'
                    ? 'bg-white/15'
                    : r.state === 'possible'
                      ? 'bg-primary/8'
                      : 'bg-black/5 dark:bg-white/5',
                )}
                style={{ width: `${(amount / max) * 100}%` }}
              />
              <span className="relative flex w-4 shrink-0 justify-center">
                {r.state === 'selected' ? <Check className="size-3.5" /> : null}
              </span>
              {r.icon ? (
                <LookIcon
                  name={r.icon}
                  className="relative size-3.5 shrink-0"
                  {...(r.state === 'selected' ? {} : { color: r.color ?? null })}
                />
              ) : null}
              {r.color && !r.icon && r.state !== 'selected' ? (
                <span
                  className="relative size-2 shrink-0 rounded-full"
                  style={{ background: LOOK_HEX[r.color] }}
                />
              ) : null}
              <span
                className={cn(
                  'relative flex-1 truncate',
                  r.state === 'excluded' && 'line-through decoration-muted-foreground/40',
                )}
              >
                {r.label || r.value}
              </span>
              <span
                className={cn(
                  'relative text-[11px] tabular-nums',
                  r.state === 'selected' ? 'text-white/85' : 'text-muted-foreground',
                )}
              >
                {amount ? int(amount) : '–'}
                {r.state === 'possible' && r.scoped !== r.count ? (
                  <span className="opacity-60"> / {int(r.count)}</span>
                ) : null}
              </span>
            </div>
          )
        })}
        {!loading && rows.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">{$t('Aucune valeur')}</p>
        ) : null}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {multiple
          ? $t(
              'Maj + clic : une plage · Ctrl + clic : seulement celle-ci · ↑ ↓ Espace · Ctrl + A : tout',
            )
          : $t('Un clic choisit la valeur · ↑ ↓ Espace')}
      </p>
    </div>
  )
}
