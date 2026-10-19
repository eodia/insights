'use client'

import type { PivotSort, ResultColumn } from '@eodia/contracts'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatValue } from '@/lib/format'
import { $t, $tp, msg } from '@/lib/i18n'
import { type PivotAxis, pivotKey } from '@/lib/pivot'
import { cn } from '@/lib/utils'
import { ArrowDownAZ, ArrowDownUp, ArrowDownWideNarrow, ArrowDownZA, ArrowUpNarrowWide, ChevronDown, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

const SORTS: readonly { value: PivotSort; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'result', label: msg('Ordre du résultat'), icon: ArrowDownUp },
  { value: 'asc', label: msg('De A à Z'), icon: ArrowDownAZ },
  { value: 'desc', label: msg('De Z à A'), icon: ArrowDownZA },
  { value: 'total_desc', label: msg('Total décroissant'), icon: ArrowDownWideNarrow },
  { value: 'total_asc', label: msg('Total croissant'), icon: ArrowUpNarrowWide },
]

/** Whether an axis departs from the query's: sorted otherwise, or some values left out. */
export const axisChanged = (axis: PivotAxis) => axis.sort !== 'result' || axis.values !== null

/** The order and the values of one side of a pivot, as a pivot table in a spreadsheet offers them. */
function AxisMenu({ column, values, axis, onChange }: { column: ResultColumn; values: readonly unknown[]; axis: PivotAxis; onChange: (axis: PivotAxis) => void }) {
  const [q, setQ] = useState('')
  const kept = useMemo(() => (axis.values ? new Set(axis.values) : null), [axis.values])
  const shown = values.filter((v) => !q || (formatValue(v, column) || '∅').toLowerCase().includes(q.trim().toLowerCase()))
  const isKept = (v: unknown) => !kept || kept.has(pivotKey(v))
  const all = values.map(pivotKey)
  // Keeping every value again is keeping all of them: the filter goes, new values come in too.
  const keep = (next: Set<string>) => onChange({ ...axis, values: next.size === all.length ? null : all.filter((k) => next.has(k)) })
  const toggle = (v: unknown) => {
    const next = new Set(kept ?? all)
    const k = pivotKey(v)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    keep(next)
  }
  const keptCount = kept ? all.filter((k) => kept.has(k)).length : all.length

  return (
    <div className="w-64 space-y-3">
      <div className="space-y-0.5">
        <div className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{$t('Trier')}</div>
        {SORTS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange({ ...axis, sort: s.value })}
            className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent', axis.sort === s.value && 'bg-accent font-medium')}
          >
            <s.icon className="size-4 text-muted-foreground" />
            {$t(s.label)}
          </button>
        ))}
      </div>
      <div className="space-y-1.5 border-t pt-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{$t('Filtrer')}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{$t('{kept} sur {all}', { kept: keptCount, all: all.length })}</span>
        </div>
        {values.length > 8 ? (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={$t('Rechercher une valeur…')} className="h-8 pl-7 text-sm" />
          </div>
        ) : null}
        <div className="flex gap-3 px-1 text-xs">
          <button type="button" onClick={() => keep(new Set(all))} className="text-primary hover:underline">
            {$t('Tout cocher')}
          </button>
          <button type="button" onClick={() => onChange({ ...axis, values: [] })} className="text-primary hover:underline">
            {$t('Tout décocher')}
          </button>
        </div>
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {shown.map((v) => (
            // biome-ignore lint/a11y/noLabelWithoutControl: the checkbox inside is the control
            <label key={pivotKey(v)} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent">
              <Checkbox checked={isKept(v)} onCheckedChange={() => toggle(v)} />
              <span className="min-w-0 flex-1 truncate">{formatValue(v, column) || '∅'}</span>
            </label>
          ))}
          {shown.length === 0 ? <div className="px-2 py-1 text-xs text-muted-foreground">{$t('Aucune valeur')}</div> : null}
        </div>
      </div>
      {axisChanged(axis) ? (
        <button type="button" onClick={() => onChange({ sort: 'result', values: null })} className="w-full border-t pt-2 text-left text-xs text-muted-foreground hover:text-foreground">
          {$t('Réinitialiser le tri et le filtre')}
        </button>
      ) : null}
    </div>
  )
}

/** A dimension's name in a pivot's corner, opening its order and its values. */
export function PivotAxisHeader({ column, values, axis, onChange }: { column: ResultColumn; values: readonly unknown[]; axis: PivotAxis; onChange: (axis: PivotAxis) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn('inline-flex items-center gap-1 rounded px-1 -mx-1 hover:bg-accent hover:text-foreground', axisChanged(axis) && 'text-primary')}>
          {column.label}
          <ChevronDown className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <AxisMenu column={column} values={values} axis={axis} onChange={onChange} />
      </PopoverContent>
    </Popover>
  )
}

/** The same menu in the settings: the order and the values the pivot opens with. */
export function PivotAxisSetting({ label, column, values, axis, onChange }: { label: string; column: ResultColumn; values: readonly unknown[]; axis: PivotAxis; onChange: (axis: PivotAxis) => void }) {
  const sort = SORTS.find((s) => s.value === axis.sort) ?? SORTS[0]
  const kept = axis.values ? values.filter((v) => axis.values?.includes(pivotKey(v))).length : values.length
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm hover:bg-accent">
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">{label}</span>
            <span className="block truncate">
              {$t(sort?.label ?? '')} · {axis.values ? $tp(values.length, '{kept} valeur sur {count}', '{kept} valeurs sur {count}', { kept }) : $t('toutes les valeurs')}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <AxisMenu column={column} values={values} axis={axis} onChange={onChange} />
      </PopoverContent>
    </Popover>
  )
}
