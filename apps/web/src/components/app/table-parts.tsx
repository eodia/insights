'use client'

import type { ResultColumn } from '@eodia/contracts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { download } from '@/lib/api'
import { formatCount, formatValue } from '@/lib/format'
import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export const MIN_COLUMN_WIDTH = 64
export const MAX_COLUMN_WIDTH = 800

/** Text without accents nor case, for a search. */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// ── Mise en page mémorisée ──────────────────────────────────────────────────

interface Layout {
  readonly widths: Readonly<Record<string, number>>
  readonly order: readonly string[] | null
}

const EMPTY: Layout = { widths: {}, order: null }

/**
 * The widths and the order of a table's columns, as this browser left them: kept per table
 * (`key`), in local storage — which a private window may refuse: the table then simply forgets.
 */
export function useTableLayout(key: string | undefined) {
  const storageKey = key ? `eodia-table:${key}` : null
  const [layout, setLayout] = useState<Layout>(EMPTY)
  useEffect(() => {
    if (!storageKey) return setLayout(EMPTY)
    try {
      const raw = window.localStorage.getItem(storageKey)
      setLayout(raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Layout>) } : EMPTY)
    } catch {
      setLayout(EMPTY)
    }
  }, [storageKey])
  const save = useCallback(
    (next: Layout) => {
      setLayout(next)
      if (!storageKey) return
      try {
        if (!next.order && Object.keys(next.widths).length === 0) window.localStorage.removeItem(storageKey)
        else window.localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // Storage refused: the layout holds for this visit only.
      }
    },
    [storageKey],
  )
  return {
    layout,
    /** A width, or null: the column takes back its natural one. */
    setWidth: (name: string, width: number | null) => {
      const { [name]: _gone, ...others } = layout.widths
      save({ ...layout, widths: width === null ? others : { ...others, [name]: Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width))) } })
    },
    setOrder: (order: readonly string[]) => save({ ...layout, order }),
    reset: () => save(EMPTY),
    custom: layout.order !== null || Object.keys(layout.widths).length > 0,
  }
}

// ── Filtres par colonne ─────────────────────────────────────────────────────

/** What a column keeps: some values (as their text), or the rows whose text contains a word. */
export interface ColumnFilter {
  readonly values?: readonly string[]
  readonly text?: string
}

export const valueKey = (v: unknown) => (v === null || v === undefined ? '\u0000' : String(v))

export function keepsRow(filter: ColumnFilter, value: unknown, col: ResultColumn): boolean {
  if (filter.values && !filter.values.includes(valueKey(value))) return false
  if (filter.text && !fold(formatValue(value, col)).includes(fold(filter.text))) return false
  return true
}

/** The values a column holds, the most frequent first, to tick: as a spreadsheet's filter. */
function ColumnFilterMenu({ col, values, filter, onChange }: { col: ResultColumn; values: readonly unknown[]; filter: ColumnFilter | undefined; onChange: (f: ColumnFilter | undefined) => void }) {
  const [q, setQ] = useState('')
  const counted = useMemo(() => {
    const m = new Map<string, { value: unknown; n: number }>()
    for (const v of values) {
      const k = valueKey(v)
      const e = m.get(k)
      if (e) e.n++
      else m.set(k, { value: v, n: 1 })
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n)
  }, [values])
  const shown = counted.filter(([, e]) => !q || fold(formatValue(e.value, col) || '∅').includes(fold(q))).slice(0, 200)
  const kept = filter?.values ? new Set(filter.values) : null
  const all = counted.map(([k]) => k)
  const toggle = (k: string) => {
    const next = new Set(kept ?? all)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    const values = next.size === all.length ? undefined : all.filter((x) => next.has(x))
    onChange(values || filter?.text ? { ...(values ? { values } : {}), ...(filter?.text ? { text: filter.text } : {}) } : undefined)
  }
  return (
    <div className="w-64 space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={$t('Rechercher une valeur…')} className="h-8 pl-7 text-sm" />
      </div>
      {q.trim() ? (
        <button
          type="button"
          onClick={() => onChange({ ...(filter?.values ? { values: filter.values } : {}), text: q.trim() })}
          className="w-full rounded-md px-2 py-1.5 text-left text-sm text-primary hover:bg-accent"
        >
          {$t('Garder les lignes qui contiennent « {text} »', { text: q.trim() })}
        </button>
      ) : null}
      <div className="flex gap-3 px-1 text-xs">
        <button type="button" onClick={() => onChange(filter?.text ? { text: filter.text } : undefined)} className="text-primary hover:underline">
          {$t('Tout cocher')}
        </button>
        <button type="button" onClick={() => onChange({ values: [], ...(filter?.text ? { text: filter.text } : {}) })} className="text-primary hover:underline">
          {$t('Tout décocher')}
        </button>
      </div>
      <div className="max-h-60 space-y-0.5 overflow-y-auto">
        {shown.map(([k, e]) => (
          // biome-ignore lint/a11y/noLabelWithoutControl: the checkbox inside is the control
          <label key={k} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent">
            <Checkbox checked={!kept || kept.has(k)} onCheckedChange={() => toggle(k)} />
            <span className="min-w-0 flex-1 truncate">{formatValue(e.value, col) || '∅'}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">{formatCount(e.n)}</span>
          </label>
        ))}
        {counted.length > shown.length && !q ? <p className="px-2 py-1 text-[11px] text-muted-foreground">{$t('Les 200 valeurs les plus fréquentes : cherchez les autres.')}</p> : null}
      </div>
      {filter ? (
        <button type="button" onClick={() => onChange(undefined)} className="w-full border-t pt-2 text-left text-xs text-muted-foreground hover:text-foreground">
          {filter.text ? $t('Retirer le filtre (contient « {text} »)', { text: filter.text }) : $t('Retirer le filtre')}
        </button>
      ) : null}
    </div>
  )
}

// ── En-tête de colonne ──────────────────────────────────────────────────────

/**
 * A column's head: its title sorts; dragged, it moves the column; its right edge sets its width
 * (a double click gives it back its natural one); its funnel filters its rows.
 */
export function HeaderCell({
  col,
  label,
  numeric,
  sort,
  onSort,
  width,
  onWidth,
  onDrop,
  values,
  filter,
  onFilter,
  sticky,
  filters,
}: {
  col: ResultColumn
  label: string
  numeric: boolean
  sort: 'asc' | 'desc' | null
  onSort: () => void
  width: number | undefined
  onWidth: (w: number | null) => void
  /** A column dropped on this one: it takes its place. */
  onDrop: (dragged: string) => void
  values: readonly unknown[]
  filter: ColumnFilter | undefined
  onFilter: (f: ColumnFilter | undefined) => void
  sticky?: boolean
  filters: boolean
}) {
  const th = useRef<HTMLTableCellElement>(null)
  const [over, setOver] = useState(false)
  const startResize = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const from = th.current?.getBoundingClientRect().width ?? width ?? 160
    const x0 = e.clientX
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => onWidth(from + ev.clientX - x0)
    const up = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }
  return (
    <th
      ref={th}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/x-eodia-column', col.name)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('text/x-eodia-column')) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const dragged = e.dataTransfer.getData('text/x-eodia-column')
        if (dragged && dragged !== col.name) onDrop(dragged)
      }}
      style={width ? { width, minWidth: width, maxWidth: width } : undefined}
      className={cn(
        'group/th relative border-b bg-background px-3 py-2 text-xs font-medium whitespace-nowrap text-muted-foreground select-none',
        numeric ? 'text-right' : 'text-left',
        sticky && 'sticky left-0 z-20',
        over && 'shadow-[inset_2px_0_0_var(--primary)]',
      )}
    >
      <span className={cn('inline-flex max-w-full items-center gap-1', numeric && 'flex-row-reverse')}>
        <button type="button" onClick={onSort} className={cn('inline-flex min-w-0 items-center gap-1 hover:text-foreground', numeric && 'flex-row-reverse')} title={label}>
          <span className="truncate">{label}</span>
          {sort === 'desc' ? <ArrowDown className="size-3 shrink-0" /> : sort === 'asc' ? <ArrowUp className="size-3 shrink-0" /> : <ArrowUpDown className="size-3 shrink-0 opacity-0 group-hover/th:opacity-40" />}
        </button>
        {filters ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn('shrink-0 rounded p-0.5 hover:bg-accent hover:text-foreground', filter ? 'text-primary' : 'opacity-0 group-hover/th:opacity-60 focus-visible:opacity-100 data-[state=open]:opacity-100')}
                aria-label={$t('Filtrer « {column} »', { column: label })}
              >
                <Filter className={cn('size-3', filter && 'fill-current')} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-3">
              <ColumnFilterMenu col={col} values={values} filter={filter} onChange={onFilter} />
            </PopoverContent>
          </Popover>
        ) : null}
      </span>
      <span
        onPointerDown={startResize}
        onDoubleClick={() => onWidth(null)}
        className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize hover:bg-primary/40"
        aria-hidden="true"
      />
    </th>
  )
}

// ── Pagination ──────────────────────────────────────────────────────────────

export function Pager({ page, pages, from, to, total, onPage }: { page: number; pages: number; from: number; to: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-1 border-t px-2 py-1 text-xs text-muted-foreground">
      <span className="mr-2 tabular-nums">{$t('{from}–{to} sur {total}', { from: formatCount(from), to: formatCount(to), total: formatCount(total) })}</span>
      <Button size="icon-sm" variant="ghost" className="size-7" disabled={page === 0} onClick={() => onPage(0)} aria-label={$t('Première page')}>
        <ChevronsLeft />
      </Button>
      <Button size="icon-sm" variant="ghost" className="size-7" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label={$t('Page précédente')}>
        <ChevronLeft />
      </Button>
      <span className="px-1 tabular-nums">{$t('Page {page} / {pages}', { page: page + 1, pages })}</span>
      <Button size="icon-sm" variant="ghost" className="size-7" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label={$t('Page suivante')}>
        <ChevronRight />
      </Button>
      <Button size="icon-sm" variant="ghost" className="size-7" disabled={page >= pages - 1} onClick={() => onPage(pages - 1)} aria-label={$t('Dernière page')}>
        <ChevronsRight />
      </Button>
    </div>
  )
}

// ── Export ──────────────────────────────────────────────────────────────────

/** The table as it shows — its columns, their titles, its filtered and sorted rows —, as a file. */
export function exportTable(format: 'csv' | 'xlsx', name: string, columns: readonly { col: ResultColumn; label: string; index: number }[], rows: readonly (readonly unknown[])[]) {
  const kind = (c: ResultColumn) => (c.type === 'number' || c.type === 'date' || c.type === 'datetime' || c.type === 'boolean' ? c.type : 'text')
  return download('/v1/export/table', {
    format,
    name,
    columns: columns.map(({ col, label }) => ({ name: col.name, label, type: kind(col) })),
    rows: rows.map((r) => columns.map(({ index }) => r[index] ?? null)),
  })
}
