'use client'

import type { DashboardParameter, ParameterValue, TemporalTruncation } from '@eodia/contracts'
import { TEMPORAL_UNITS, parameterHasValue } from '@eodia/contracts'
import { ValueList } from './value-list'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PeriodPicker } from '@/components/app/period-picker'
import { UNIT_LABELS } from '@/lib/builder'
import { periodLabel } from '@/lib/periods'
import { $t, intlLocale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Calendar, ChevronDown, Hash, ListFilter, Type, X, Clock } from 'lucide-react'
import { useCallback, useState } from 'react'

export type Values = Record<string, ParameterValue | null>

export function valueLabel(p: DashboardParameter, v: ParameterValue | null | undefined): string {
  if (!parameterHasValue(v)) return ''
  if (p.type === 'date') return periodLabel(String(v))
  if (p.type === 'temporal_unit') return $t(UNIT_LABELS[String(Array.isArray(v) ? v[0] : v) as TemporalTruncation] ?? String(v))
  if (Array.isArray(v)) {
    if (p.type === 'number') return v.filter((x) => x !== null).join(' – ')
    return v.length > 2 ? $t('{first} +{more}', { first: v.slice(0, 2).join(', '), more: v.length - 2 }) : v.join(', ')
  }
  return String(v)
}

const ICONS = { date: Calendar, category: ListFilter, text: Type, number: Hash, temporal_unit: Clock } as const

function Editor({
  p,
  value,
  columnId,
  linked,
  onChange,
  onPick,
  onShare,
  onDone,
}: {
  p: DashboardParameter
  value: ParameterValue | null | undefined
  columnId?: string
  linked: { column: string; values: string[] }[]
  /** A choice that closes the editor. */
  onChange: (v: ParameterValue | null) => void
  /** A choice among others: the list stays open. */
  onPick: (v: ParameterValue | null) => void
  onShare: (share: number | null) => void
  onDone: () => void
}) {
  const [text, setText] = useState(typeof value === 'string' ? value : '')
  switch (p.type) {
    case 'date':
      return <PeriodPicker value={typeof value === 'string' ? value : null} onChange={onChange} onClear={() => onChange(null)} />
    case 'temporal_unit':
      return (
        <div className="w-48 p-1">
          {(p.units?.length ? p.units : TEMPORAL_UNITS.filter((u) => !['minute', 'hour'].includes(u))).map((u) => (
            <button key={u} type="button" onClick={() => onChange(u)} className={cn('flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent', value === u && 'font-semibold text-primary')}>
              {$t(UNIT_LABELS[u])}
            </button>
          ))}
        </div>
      )
    case 'category':
      return (
        <div className={columnId ? '' : 'w-72 space-y-2 p-3'}>
          {columnId ? (
            <ValueList
              columnId={columnId}
              linked={linked}
              multiple={p.multiple !== false}
              selected={(Array.isArray(value) ? value : value ? [value] : []).map(String)}
              onChange={(v) => onPick(v.length ? v : null)}
              onShare={onShare}
              onDone={onDone}
            />
          ) : (
            <>
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={$t('Valeurs séparées par des virgules')} className="h-8" />
              <Button size="sm" className="w-full" onClick={() => onChange(text.split(',').map((s) => s.trim()).filter(Boolean))}>
                {$t('Appliquer')}
              </Button>
            </>
          )}
        </div>
      )
    case 'number': {
      const arr = Array.isArray(value) ? (value as (number | null)[]) : []
      return (
        <NumberEditor initial={arr} between={p.operator === 'between'} onChange={onChange} />
      )
    }
    default:
      return (
        <form className="w-64 space-y-2 p-3" onSubmit={(e) => { e.preventDefault(); onChange(text) }}>
          <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} className="h-8" />
          <Button size="sm" type="submit" className="w-full">
            {$t('Appliquer')}
          </Button>
        </form>
      )
  }
}

function NumberEditor({ initial, between, onChange }: { initial: (number | null)[]; between: boolean; onChange: (v: ParameterValue) => void }) {
  const [lo, setLo] = useState(initial[0] === null || initial[0] === undefined ? '' : String(initial[0]))
  const [hi, setHi] = useState(initial[1] === null || initial[1] === undefined ? '' : String(initial[1]))
  return (
    <div className="w-64 space-y-2 p-3">
      <div className="flex items-center gap-2">
        <Input type="number" value={lo} onChange={(e) => setLo(e.target.value)} className="h-8" placeholder={between ? $t('min') : ''} />
        {between ? <Input type="number" value={hi} onChange={(e) => setHi(e.target.value)} className="h-8" placeholder={$t('max')} /> : null}
      </div>
      <Button size="sm" className="w-full" onClick={() => onChange([lo === '' ? null : Number(lo), hi === '' ? null : Number(hi)])}>
        {$t('Appliquer')}
      </Button>
    </div>
  )
}

/** The filters of a dashboard, in one row above its cards. */
export function ParameterBar({
  parameters,
  values,
  onChange,
  columnFor,
  editing,
  selected,
  onSelect,
}: {
  parameters: readonly DashboardParameter[]
  values: Values
  onChange: (id: string, v: ParameterValue | null) => void
  /** The column a category filter reads its values from — the first card tied to it. */
  columnFor: (id: string) => string | undefined
  editing?: boolean
  selected?: string | null
  onSelect?: (id: string) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  // The share of the rows each category filter keeps, as its list last said.
  const [shares, setShares] = useState<Record<string, number | null>>({})
  const setShare = useCallback((id: string, share: number | null) => setShares((s) => (s[id] === share ? s : { ...s, [id]: share })), [])
  if (parameters.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {parameters.map((p) => {
        const Icon = ICONS[p.type]
        const v = values[p.id]
        const has = parameterHasValue(v)
        return (
          <Popover key={p.id} open={!editing && open === p.id} onOpenChange={(o) => setOpen(o ? p.id : null)}>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={() => (editing ? onSelect?.(p.id) : undefined)}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm shadow-xs transition-colors hover:bg-accent',
                  has && 'border-primary/50 bg-primary/5',
                  editing && selected === p.id && 'ring-2 ring-primary',
                )}
              >
                <Icon className="size-4 text-muted-foreground" />
                <span className={cn(has ? 'text-muted-foreground' : '')}>{p.label}</span>
                {has ? <span className="font-medium">{valueLabel(p, v)}</span> : null}
                {has && p.type === 'category' && typeof shares[p.id] === 'number' ? (
                  <span className="rounded bg-emerald-500/15 px-1.5 text-[11px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 0 }).format(shares[p.id] as number)}
                  </span>
                ) : null}
                {has && !editing ? (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={$t('Effacer le filtre')}
                    onClick={(e) => {
                      e.stopPropagation()
                      onChange(p.id, null)
                    }}
                    onKeyDown={() => undefined}
                    className="rounded p-0.5 hover:bg-black/5"
                  >
                    <X className="size-3.5" />
                  </span>
                ) : (
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Editor
                p={p}
                value={v}
                columnId={columnFor(p.id)}
                linked={parameters
                  .filter((o) => o.id !== p.id && o.type === 'category' && Array.isArray(values[o.id]) && (values[o.id] as unknown[]).length > 0 && columnFor(o.id))
                  .map((o) => ({ column: columnFor(o.id) as string, values: (values[o.id] as string[]).map(String) }))}
                onChange={(nv) => {
                  onChange(p.id, nv)
                  setOpen(null)
                }}
                onPick={(nv) => onChange(p.id, nv)}
                onShare={(share) => setShare(p.id, share)}
                onDone={() => setOpen(null)}
              />
            </PopoverContent>
          </Popover>
        )
      })}
    </div>
  )
}
