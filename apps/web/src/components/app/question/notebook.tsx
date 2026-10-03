'use client'

import type { Aggregation, BuilderQuery, Breakout, Filter, ItemSummary, OrderBy, TableMeta, TemporalUnit } from '@eodia/contracts'
import { TEMPORAL_EXTRACTIONS, TEMPORAL_UNITS, columnName } from '@eodia/contracts'
import { ItemTile, LookIcon } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import {
  AGG_FNS,
  type ColumnOption,
  UNIT_LABELS,
  aggregationLabel,
  filterLabel,
  findOption,
  pruneJoins,
  withJoinFor,
} from '@/lib/builder'
import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ArrowDownAZ, ArrowUpAZ, Database, Filter as FilterIcon, ListOrdered, Plus, Sigma, SquareFunction, Rows3, X, Group } from 'lucide-react'
import { useState } from 'react'
import { ColumnList, FilterEditor, KindIcon, SourceList } from './pickers'

function Step({ icon: Icon, title, tone, children, onRemove }: { icon: typeof Database; title: string; tone: string; children: React.ReactNode; onRemove?: () => void }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <span className={cn('inline-flex size-5 items-center justify-center rounded-md', tone)}>
          <Icon className="size-3" />
        </span>
        <span className="flex-1">{title}</span>
        {onRemove ? (
          <button type="button" onClick={onRemove} className="rounded p-0.5 hover:bg-accent" aria-label={$t('Retirer')}>
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5 rounded-xl border bg-card p-2.5">{children}</div>
    </section>
  )
}

function Pill({ children, tone, onRemove, onClick }: { children: React.ReactNode; tone: string; onRemove?: () => void; onClick?: () => void }) {
  return (
    <span className={cn('inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg pr-1 pl-2.5 text-sm font-medium', tone)}>
      <button type="button" onClick={onClick} className="truncate text-left">
        {children}
      </button>
      {onRemove ? (
        <button type="button" onClick={onRemove} className="rounded p-0.5 opacity-60 hover:bg-black/5 hover:opacity-100" aria-label={$t('Retirer')}>
          <X className="size-3.5" />
        </button>
      ) : null}
    </span>
  )
}

function AddButton({ label, children, open, onOpenChange }: { label: string; children: React.ReactNode; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  return (
    <Popover {...(open !== undefined ? { open } : {})} {...(onOpenChange ? { onOpenChange } : {})}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed px-2.5 text-sm text-muted-foreground hover:border-primary hover:text-primary">
          <Plus className="size-3.5" /> {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        {children}
      </PopoverContent>
    </Popover>
  )
}

const TONES = {
  data: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300',
  filter: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  summarize: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  group: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  sort: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
}

export function Notebook({
  query,
  onChange,
  options,
  tables,
  models,
  metrics,
  sourceLabel,
  allowSql,
}: {
  query: BuilderQuery
  onChange: (q: BuilderQuery) => void
  options: readonly ColumnOption[]
  tables: readonly TableMeta[]
  models: readonly ItemSummary[]
  metrics: readonly ItemSummary[]
  sourceLabel: string
  allowSql: boolean
}) {
  const [filterOpen, setFilterOpen] = useState<number | 'new' | null>(null)
  const [filterColumn, setFilterColumn] = useState<ColumnOption | null>(null)
  const [aggOpen, setAggOpen] = useState(false)
  const [aggFn, setAggFn] = useState<(typeof AGG_FNS)[number] | null>(null)
  const [groupOpen, setGroupOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [expr, setExpr] = useState({ name: '', expression: '' })
  const metricNames = new Map(metrics.map((m) => [m.id, m.name]))
  const sourceTable = query.source.kind === 'table' ? tables.find((t) => t.id === query.source.id) : undefined
  const grouped = (query.aggregations ?? []).length > 0 || (query.breakouts ?? []).length > 0
  const set = (q: BuilderQuery) => onChange(pruneJoins(q))

  const addFilter = (f: Filter, option: ColumnOption) => {
    const q = withJoinFor(query, option)
    const filters = [...(q.filters ?? [])]
    if (typeof filterOpen === 'number') filters[filterOpen] = f
    else filters.push(f)
    set({ ...q, filters })
    setFilterOpen(null)
    setFilterColumn(null)
  }

  const addAggregation = (a: Aggregation, option?: ColumnOption) => {
    const q = withJoinFor(query, option)
    set({ ...q, aggregations: [...(q.aggregations ?? []), a] })
    setAggOpen(false)
    setAggFn(null)
  }

  const addBreakout = (option: ColumnOption) => {
    const q = withJoinFor(query, option)
    const temporal = option.kind === 'date' || option.kind === 'datetime'
    const b: Breakout = { ...option.ref, ...(temporal ? { unit: 'month' as const } : option.kind === 'number' && !['pk', 'fk', 'zip', 'rating'].includes(option.semantic ?? '') ? {} : {}) }
    set({ ...q, breakouts: [...(q.breakouts ?? []), b] })
    setGroupOpen(false)
  }

  return (
    <div className="space-y-5">
      <Step icon={Database} title={$t('Données')} tone={TONES.data}>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={cn('inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold', TONES.data)}>
              {sourceTable?.icon ? <LookIcon name={sourceTable.icon} className="size-4" /> : query.source.kind === 'question' ? <ItemTile kind="model" className="size-5" /> : <Database className="size-4" />}
              {sourceLabel}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <SourceList tables={tables} models={models} onPick={(ref) => onChange({ kind: 'builder', source: ref })} />
          </PopoverContent>
        </Popover>
        {(query.joins ?? []).map((j) => (
          <span key={j.alias} className="inline-flex h-8 items-center gap-1 rounded-lg bg-muted px-2.5 text-xs text-muted-foreground">
            + {j.alias}
          </span>
        ))}
      </Step>

      <Step icon={FilterIcon} title={$t('Filtrer')} tone={TONES.filter}>
        {(query.filters ?? []).map((f, i) => (
          <Popover key={i} open={filterOpen === i} onOpenChange={(o) => setFilterOpen(o ? i : null)}>
            <PopoverTrigger asChild>
              <span>
                <Pill tone={TONES.filter} onClick={() => setFilterOpen(i)} onRemove={() => set({ ...query, filters: (query.filters ?? []).filter((_, j) => j !== i) })}>
                  {filterLabel(f, options)}
                </Pill>
              </span>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              {'column' in f && findOption(options, f.column) ? <FilterEditor option={findOption(options, f.column) as ColumnOption} initial={f} onApply={(nf) => addFilter(nf, findOption(options, f.column) as ColumnOption)} /> : <div className="p-3 font-mono text-xs">{'sql' in f ? f.sql : ''}</div>}
            </PopoverContent>
          </Popover>
        ))}
        <AddButton
          label={$t('Filtre')}
          open={filterOpen === 'new'}
          onOpenChange={(o) => {
            setFilterOpen(o ? 'new' : null)
            if (!o) setFilterColumn(null)
          }}
        >
          {filterColumn ? <FilterEditor option={filterColumn} onApply={(f) => addFilter(f, filterColumn)} /> : <ColumnList options={options} onPick={setFilterColumn} />}
        </AddButton>
      </Step>

      <Step icon={Sigma} title={$t('Résumer')} tone={TONES.summarize}>
        {(query.aggregations ?? []).map((a, i) => (
          <Pill key={i} tone={TONES.summarize} onRemove={() => set({ ...query, aggregations: (query.aggregations ?? []).filter((_, j) => j !== i) })}>
            {aggregationLabel(a, options, metricNames)}
          </Pill>
        ))}
        <AddButton
          label={$t('Mesure')}
          open={aggOpen}
          onOpenChange={(o) => {
            setAggOpen(o)
            if (!o) setAggFn(null)
          }}
        >
          {aggFn ? (
            <ColumnList options={options} filter={aggFn.numeric ? (o) => o.kind === 'number' : undefined} onPick={(o) => addAggregation({ fn: aggFn.fn, column: o.ref }, o)} />
          ) : (
            <div className="w-64 p-1">
              {AGG_FNS.map((f) => (
                <button key={f.fn} type="button" onClick={() => (f.needsColumn ? setAggFn(f) : addAggregation({ fn: f.fn }))} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
                  <SquareFunction className="size-3.5 text-muted-foreground" /> {$t(f.label)}
                </button>
              ))}
              {metrics.length ? (
                <>
                  <div className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{$t('Métriques')}</div>
                  {metrics.map((m) => (
                    <button key={m.id} type="button" onClick={() => addAggregation({ fn: 'metric', metric: m.id })} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
                      <ItemTile kind="metric" className="size-5" /> {m.name}
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          )}
        </AddButton>
        <span className="self-center px-1 text-sm text-muted-foreground">{$t('par')}</span>
        {(query.breakouts ?? []).map((b, i) => {
          const o = findOption(options, b)
          const temporal = o?.kind === 'date' || o?.kind === 'datetime'
          return (
            <span key={i} className={cn('inline-flex h-8 items-center gap-1 rounded-lg pr-1 pl-2.5 text-sm font-medium', TONES.group)}>
              {o?.label ?? columnName(b)}
              {temporal ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="rounded px-1 text-xs underline decoration-dotted underline-offset-2 opacity-80">
                      : {$t(UNIT_LABELS[b.unit ?? 'month'])}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-56 p-1">
                    {[...TEMPORAL_UNITS, ...TEMPORAL_EXTRACTIONS].map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => set({ ...query, breakouts: (query.breakouts ?? []).map((x, j) => (j === i ? { ...x, unit: u as TemporalUnit } : x)) })}
                        className={cn('flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent', b.unit === u && 'font-semibold text-primary')}
                      >
                        {$t(UNIT_LABELS[u])}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              ) : o?.kind === 'number' ? (
                <button
                  type="button"
                  onClick={() => set({ ...query, breakouts: (query.breakouts ?? []).map((x, j) => (j === i ? (x.bin ? { join: x.join, field: x.field } as Breakout : { ...x, bin: 'auto' }) : x)) })}
                  className="rounded px-1 text-xs underline decoration-dotted underline-offset-2 opacity-80"
                >
                  {b.bin ? $t(': par tranches') : $t(': valeurs')}
                </button>
              ) : null}
              <button type="button" onClick={() => set({ ...query, breakouts: (query.breakouts ?? []).filter((_, j) => j !== i) })} className="rounded p-0.5 opacity-60 hover:opacity-100" aria-label={$t('Retirer')}>
                <X className="size-3.5" />
              </button>
            </span>
          )
        })}
        {(query.breakouts ?? []).length < 3 ? (
          <AddButton label={$t('Regroupement')} open={groupOpen} onOpenChange={setGroupOpen}>
            <ColumnList options={options} filter={(o) => o.kind !== 'json'} onPick={addBreakout} />
          </AddButton>
        ) : null}
      </Step>

      {!grouped ? (
        <Step icon={Rows3} title={$t('Colonnes')} tone={TONES.sort}>
          <span className="self-center text-sm text-muted-foreground">{(query.fields ?? []).length ? `${query.fields?.length} ${$t('colonnes choisies')}` : $t('Toutes les colonnes')}</span>
          <AddButton label={$t('Choisir')}>
            <div className="max-h-[420px] w-72 overflow-y-auto p-1">
              {options.filter((o) => !o.join).map((o) => {
                const on = !query.fields?.length || query.fields.some((f) => f.field === o.ref.field && !f.join)
                return (
                  <label key={o.ref.field} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        const current = query.fields?.length ? query.fields : options.filter((x) => !x.join).map((x) => x.ref)
                        const next = e.target.checked ? [...current, o.ref] : current.filter((f) => !(f.field === o.ref.field && !f.join))
                        set({ ...query, fields: next })
                      }}
                    />
                    <KindIcon kind={o.kind} /> {o.label}
                  </label>
                )
              })}
            </div>
          </AddButton>
        </Step>
      ) : null}

      <Step icon={ListOrdered} title={$t('Trier et limiter')} tone={TONES.sort}>
        {(query.sort ?? []).map((s, i) => {
          const label =
            s.target.kind === 'aggregation'
              ? aggregationLabel((query.aggregations ?? [])[s.target.index] as Aggregation, options, metricNames)
              : s.target.kind === 'breakout'
                ? findOption(options, (query.breakouts ?? [])[s.target.index] as Breakout)?.label
                : findOption(options, s.target.column)?.label ?? columnName(s.target.column)
          return (
            <Pill
              key={i}
              tone={TONES.sort}
              onClick={() => set({ ...query, sort: (query.sort ?? []).map((x, j) => (j === i ? { ...x, desc: !x.desc } : x)) })}
              onRemove={() => set({ ...query, sort: (query.sort ?? []).filter((_, j) => j !== i) })}
            >
              <span className="inline-flex items-center gap-1">
                {s.desc ? <ArrowDownAZ className="size-3.5" /> : <ArrowUpAZ className="size-3.5" />}
                {label}
              </span>
            </Pill>
          )
        })}
        <AddButton label={$t('Tri')} open={sortOpen} onOpenChange={setSortOpen}>
          <div className="max-h-[360px] w-72 overflow-y-auto p-1">
            {grouped ? (
              <>
                {(query.aggregations ?? []).map((a, i) => (
                  <button key={`a${i}`} type="button" onClick={() => { set({ ...query, sort: [...(query.sort ?? []), { target: { kind: 'aggregation', index: i }, desc: true } as OrderBy] }); setSortOpen(false) }} className="flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
                    {aggregationLabel(a, options, metricNames)}
                  </button>
                ))}
                {(query.breakouts ?? []).map((b, i) => (
                  <button key={`b${i}`} type="button" onClick={() => { set({ ...query, sort: [...(query.sort ?? []), { target: { kind: 'breakout', index: i } } as OrderBy] }); setSortOpen(false) }} className="flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
                    {findOption(options, b)?.label ?? columnName(b)}
                  </button>
                ))}
              </>
            ) : (
              <ColumnList options={options.filter((o) => !o.join)} onPick={(o) => { set({ ...query, sort: [...(query.sort ?? []), { target: { kind: 'column', column: o.ref } }] }); setSortOpen(false) }} />
            )}
          </div>
        </AddButton>
        <span className="flex items-center gap-1.5 pl-2 text-sm text-muted-foreground">
          {$t('Limite')}
          <Input
            type="number"
            min={1}
            value={query.limit ?? ''}
            onChange={(e) => set({ ...query, limit: e.target.value === '' ? null : Number(e.target.value) })}
            placeholder={$t('aucune')}
            className="h-8 w-24"
          />
        </span>
      </Step>

      {allowSql ? (
        <Step icon={Group} title={$t('Colonnes personnalisées')} tone={TONES.sort}>
          {(query.expressions ?? []).map((e, i) => (
            <Pill key={e.name} tone={TONES.sort} onRemove={() => set({ ...query, expressions: (query.expressions ?? []).filter((_, j) => j !== i) })}>
              <span className="font-mono text-xs">
                {e.name} = {e.expression}
              </span>
            </Pill>
          ))}
          <AddButton label={$t('Colonne calculée')}>
            <div className="w-80 space-y-2 p-3">
              <Input placeholder={$t('Nom (ex. marge)')} value={expr.name} onChange={(e) => setExpr({ ...expr, name: e.target.value })} className="h-8" />
              <Textarea placeholder={$t('Expression Trino SQL (ex. prix - cout)')} value={expr.expression} onChange={(e) => setExpr({ ...expr, expression: e.target.value })} rows={3} className="font-mono text-xs" />
              <Button
                size="sm"
                disabled={!/^[A-Za-z_][A-Za-z0-9_]*$/.test(expr.name) || !expr.expression.trim()}
                onClick={() => {
                  set({ ...query, expressions: [...(query.expressions ?? []), { name: expr.name, expression: expr.expression }] })
                  setExpr({ name: '', expression: '' })
                }}
              >
                {$t('Ajouter')}
              </Button>
            </div>
          </AddButton>
        </Step>
      ) : null}
      <p className="px-1 text-xs text-muted-foreground">{sourceTable?.description ?? sourceTable?.native_comment ?? ''}</p>
    </div>
  )
}
