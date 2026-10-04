'use client'

import type { Aggregation, BuilderQuery, Breakout, ColumnRef, CustomColumn, Filter, ItemSummary, Join, OrderBy, TableMeta, TemporalUnit } from '@eodia/contracts'
import { JOIN_KINDS, QUERY_LIMITS, TEMPORAL_EXTRACTIONS, TEMPORAL_UNITS, columnName } from '@eodia/contracts'
import { ItemTile, LookIcon } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Choice } from '@/components/ui/choice'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import {
  AGG_FNS,
  type ColumnOption,
  JOIN_LABELS,
  joinAlias,
  suggestedCondition,
  UNIT_LABELS,
  aggregationLabel,
  filterLabel,
  findOption,
  pruneJoins,
  withJoinFor,
} from '@/lib/builder'
import { $t, $tp, msg } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ArrowDownAZ, ArrowUpAZ, ChevronDown, Columns3, Database, Filter as FilterIcon, ListOrdered, Plus, Sigma, SquareFunction, X } from 'lucide-react'
import { useId, useState } from 'react'
import { JoinGlyph } from './join-glyph'
import { ColumnList, FilterEditor, KindIcon, SearchBox, SourceList } from './pickers'

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

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

const JOIN_SHORT: Record<Join['kind'], string> = {
  left: msg('À gauche'),
  inner: msg('Interne'),
  right: msg('À droite'),
  full: msg('Complète'),
}

/**
 * A join the person adds: the table, how rows meet (left, inner, right, full) and the columns
 * they meet on — the key between the two tables is proposed when there is one.
 */
function JoinEditor({
  query,
  initial,
  tables,
  sourceTable,
  sourceLabel,
  options,
  onApply,
  onRemove,
}: {
  query: BuilderQuery
  initial?: Join
  tables: readonly TableMeta[]
  sourceTable: TableMeta | null
  sourceLabel: string
  options: readonly ColumnOption[]
  onApply: (j: Join) => void
  onRemove?: () => void
}) {
  const [target, setTarget] = useState<TableMeta | null>(() => (initial?.source.kind === 'table' ? (tables.find((t) => t.id === initial.source.id) ?? null) : null))
  const [kind, setKind] = useState<Join['kind']>(initial?.kind ?? 'left')
  const [left, setLeft] = useState<ColumnRef | null>(initial?.left ?? null)
  const [right, setRight] = useState<string | null>(initial?.right ?? null)
  // The columns a condition may start from: the source's, and those of the other joins added by hand.
  const others = new Set((query.joins ?? []).filter((j) => j.explicit && j.alias !== initial?.alias).map((j) => j.alias))
  const leftOptions = options.filter((o) => !o.join || others.has(o.join.alias))
  if (!target) {
    return (
      <SourceList
        tables={tables}
        models={[]}
        onPick={(ref) => {
          const t = tables.find((x) => x.id === ref.id) ?? null
          setTarget(t)
          const cond = t ? suggestedCondition(sourceTable, t) : null
          setLeft(cond?.left ?? null)
          setRight(cond?.right ?? null)
        }}
      />
    )
  }
  const ready = left !== null && right !== null && leftOptions.some((o) => columnName(o.ref) === columnName(left))
  // The condition may start from another join: its side is then named after that table.
  const leftSide = (left?.join ? leftOptions.find((o) => columnName(o.ref) === columnName(left))?.group : undefined) ?? sourceLabel
  const sourceIcon = sourceTable?.icon ? <LookIcon name={sourceTable.icon} color={sourceTable.color} className="size-4" /> : <Database className="size-4 text-muted-foreground" />
  const targetIcon = target.icon ? <LookIcon name={target.icon} color={target.color} className="size-4" /> : <Database className="size-4 text-muted-foreground" />
  return (
    <div className="w-[22rem] space-y-3 p-3">
      <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-1.5">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-background px-2 py-1.5 text-sm font-semibold shadow-xs" title={$t('Source')}>
          {sourceIcon}
          <span className="truncate">{sourceLabel}</span>
        </span>
        <JoinGlyph kind={kind} className="h-5 w-8 text-primary" />
        {initial ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-background px-2 py-1.5 text-sm font-semibold shadow-xs">
            {targetIcon}
            <span className="truncate">{target.label}</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setTarget(null)}
            title={$t('Changer de table')}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-background px-2 py-1.5 text-left text-sm font-semibold shadow-xs hover:ring-1 hover:ring-primary/40"
          >
            {targetIcon}
            <span className="flex-1 truncate">{target.label}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="text-xs text-muted-foreground">{$t('Type de jointure')}</div>
        <div className="grid grid-cols-4 gap-1.5">
          {JOIN_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              title={$t(JOIN_LABELS[k])}
              onClick={() => setKind(k)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border px-1 pt-2 pb-1.5 text-[11px] leading-tight transition-colors',
                kind === k ? 'border-primary bg-primary/5 text-primary' : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground',
              )}
            >
              <JoinGlyph kind={k} className="h-5 w-8" />
              {$t(JOIN_SHORT[k])}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {kind === 'inner'
            ? $t('Seulement les lignes présentes des deux côtés.')
            : kind === 'full'
              ? $t('Toutes les lignes des deux côtés, qu’elles se correspondent ou non.')
              : kind === 'left'
                ? $t('Toutes les lignes de {source}, complétées par {table} quand elles se correspondent.', { source: sourceLabel, table: target.label })
                : $t('Toutes les lignes de {source}, complétées par {table} quand elles se correspondent.', { source: target.label, table: sourceLabel })}
        </p>
      </div>
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">{$t('Lignes reliées quand')}</div>
        <div className="flex items-center gap-1.5 pt-0.5 text-xs font-medium">
          {left?.join ? <Database className="size-3.5 text-muted-foreground" /> : sourceIcon}
          <span className="truncate">{leftSide}</span>
        </div>
        <Choice
          value={left ? columnName(left) : ''}
          onValueChange={(v) => setLeft(leftOptions.find((o) => columnName(o.ref) === v)?.ref ?? null)}
          options={leftOptions.map((o) => ({ value: columnName(o.ref), label: o.join ? `${o.group} → ${o.label}` : o.label }))}
          placeholder={$t('Colonne de la source')}
          aria-label={$t('Colonne de la source')}
          className="w-full"
        />
        <div className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {$t('égale')}
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {targetIcon}
          <span className="truncate">{target.label}</span>
        </div>
        <Choice
          value={right ?? ''}
          onValueChange={(v) => setRight(v)}
          options={(target.columns ?? []).filter((c) => c.status === 'active').map((c) => ({ value: c.name, label: c.label }))}
          placeholder={$t('Colonne de {table}', { table: target.label })}
          aria-label={$t('Colonne de {table}', { table: target.label })}
          className="w-full"
        />
      </div>
      <div className="flex items-center gap-2">
        {onRemove ? (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onRemove}>
            {$t('Retirer')}
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button
          size="sm"
          disabled={!ready}
          onClick={() =>
            left &&
            right &&
            onApply({ alias: initial?.alias ?? joinAlias(query, target, options), source: { kind: 'table', id: target.id }, kind, left, right, explicit: true })
          }
        >
          {initial ? $t('Appliquer') : $t('Joindre')}
        </Button>
      </div>
    </div>
  )
}

/**
 * The columns one table gives the result: a chip that says how many, and the list to choose
 * them. With every column of every table ticked, the question keeps none chosen — new columns
 * of the source then show up by themselves.
 */
function TableColumns({
  label,
  icon,
  options,
  shown,
  query,
  onChange,
}: {
  label: string
  icon: React.ReactNode
  options: readonly ColumnOption[]
  shown: readonly ColumnOption[]
  query: BuilderQuery
  onChange: (q: BuilderQuery) => void
}) {
  const [q, setQ] = useState('')
  const uid = useId()
  const chosen = query.fields?.length ? new Set(query.fields.map(columnName)) : null
  const isOn = (o: ColumnOption) => !chosen || chosen.has(columnName(o.ref))
  const count = options.filter(isOn).length
  const current = (): ColumnRef[] => (query.fields?.length ? [...query.fields] : shown.map((o) => o.ref))
  const update = (next: ColumnRef[]) => {
    // The result keeps at least one column.
    if (!next.length) return
    const names = new Set(next.map(columnName))
    onChange({ ...query, fields: shown.every((o) => names.has(columnName(o.ref))) ? [] : next })
  }
  const mine = new Set(options.map((o) => columnName(o.ref)))
  const listed = q ? options.filter((o) => fold(`${o.label} ${o.ref.field}`).includes(fold(q))) : options
  return (
    <Popover onOpenChange={(o) => (o ? undefined : setQ(''))}>
      <PopoverTrigger asChild>
        <button type="button" className={cn('inline-flex h-8 max-w-full items-center gap-2 rounded-lg pr-2 pl-2.5 text-sm font-medium', TONES.sort)}>
          {icon}
          <span className="truncate">{label}</span>
          <span className="shrink-0 text-xs font-normal opacity-70">{count === options.length ? $t('toutes') : $t('{count} sur {total}', { count, total: options.length })}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="space-y-2 border-b p-2">
          <SearchBox value={q} onChange={setQ} placeholder={$t('Chercher une colonne…')} />
          <div className="flex items-center gap-2 px-1 text-xs">
            <span className="flex-1 text-muted-foreground">{$tp(count, '{count} colonne affichée', '{count} colonnes affichées')}</span>
            <button
              type="button"
              className="font-medium text-primary hover:underline disabled:no-underline disabled:opacity-40"
              disabled={count === options.length}
              onClick={() => update([...current().filter((f) => !mine.has(columnName(f))), ...options.map((o) => o.ref)])}
            >
              {$t('Toutes')}
            </button>
            <button
              type="button"
              className="font-medium text-primary hover:underline disabled:no-underline disabled:opacity-40"
              disabled={count === 0}
              onClick={() => update(current().filter((f) => !mine.has(columnName(f))))}
            >
              {$t('Aucune')}
            </button>
          </div>
        </div>
        <div className="max-h-[340px] overflow-y-auto p-1">
          {listed.map((o) => {
            const key = columnName(o.ref)
            return (
              <label key={key} htmlFor={`${uid}-${key}`} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                <Checkbox id={`${uid}-${key}`} checked={isOn(o)} onCheckedChange={(v) => update(v === true ? [...current(), o.ref] : current().filter((f) => columnName(f) !== key))} />
                <KindIcon kind={o.kind} />
                <span className="truncate">{o.label}</span>
              </label>
            )
          })}
          {listed.length === 0 ? <p className="px-2 py-3 text-center text-xs text-muted-foreground">{$t('Aucune colonne ne correspond.')}</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** A column computed on each row of the source, in Trino SQL; its name is set once and for all. */
function ExpressionEditor({
  initial,
  taken,
  readOnly,
  onApply,
  onRemove,
}: {
  initial?: CustomColumn
  taken: ReadonlySet<string>
  readOnly?: boolean
  onApply: (e: CustomColumn) => void
  onRemove?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [expression, setExpression] = useState(initial?.expression ?? '')
  const validName = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
  const clash = taken.has(name.toLowerCase())
  return (
    <form
      className="w-80 space-y-3 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (validName && !clash && expression.trim()) onApply({ name, expression: expression.trim() })
      }}
    >
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">{$t('Nom')}</div>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="marge" disabled={!!initial || readOnly} autoFocus={!initial} className="h-8 font-mono text-sm" />
        {name && !validName ? (
          <p className="text-xs text-destructive">{$t('Lettres, chiffres et _ ; pas de chiffre au début.')}</p>
        ) : clash ? (
          <p className="text-xs text-destructive">{$t('Une colonne porte déjà ce nom.')}</p>
        ) : null}
      </div>
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">{$t('Expression Trino SQL')}</div>
        <Textarea value={expression} onChange={(e) => setExpression(e.target.value)} placeholder="prix - cout" rows={3} readOnly={readOnly} autoFocus={!!initial} className="font-mono text-xs" />
        <p className="text-xs text-muted-foreground">{$t('Calculée pour chaque ligne à partir des colonnes de la source, elle sert ensuite comme les autres : filtre, mesure, regroupement.')}</p>
      </div>
      {readOnly ? null : (
        <div className="flex items-center gap-2">
          {onRemove ? (
            <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={onRemove}>
              {$t('Retirer')}
            </Button>
          ) : null}
          <span className="flex-1" />
          <Button type="submit" size="sm" disabled={!validName || clash || !expression.trim()}>
            {initial ? $t('Appliquer') : $t('Ajouter')}
          </Button>
        </div>
      )}
    </form>
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
  const [exprOpen, setExprOpen] = useState<number | 'new' | null>(null)
  const [joinOpen, setJoinOpen] = useState<string | 'new' | null>(null)
  const metricNames = new Map(metrics.map((m) => [m.id, m.name]))
  const sourceTable = query.source.kind === 'table' ? tables.find((t) => t.id === query.source.id) : undefined
  const grouped = (query.aggregations ?? []).length > 0 || (query.breakouts ?? []).length > 0
  const set = (q: BuilderQuery) => onChange(pruneJoins(q))
  // A join goes with every step that cites its columns.
  const removeJoin = (alias: string) => {
    const cites = (r?: ColumnRef) => r?.join === alias
    set({
      ...query,
      joins: (query.joins ?? []).filter((j) => j.alias !== alias && !cites(j.left)),
      filters: (query.filters ?? []).filter((f) => !('column' in f) || !cites(f.column)),
      aggregations: (query.aggregations ?? []).filter((a) => !cites(a.column)),
      breakouts: (query.breakouts ?? []).filter((b) => !cites(b)),
      fields: (query.fields ?? []).filter((f) => !cites(f)),
      sort: (query.sort ?? []).filter((o) => o.target.kind !== 'column' || !cites(o.target.column)),
    })
    setJoinOpen(null)
  }
  // The columns shown row by row: the source's and those of the joins added by hand.
  const explicitAliases = new Set((query.joins ?? []).filter((j) => j.explicit).map((j) => j.alias))
  const shownOptions = options.filter((o) => !o.join || explicitAliases.has(o.join.alias))
  const expressionNames = new Set((query.expressions ?? []).map((e) => e.name))
  // The tables the result's columns come from: the source, then each join added by hand.
  const columnTables = [
    {
      alias: '',
      label: sourceLabel,
      icon: sourceTable?.icon ? <LookIcon name={sourceTable.icon} className="size-4" /> : <Database className="size-4" />,
      options: shownOptions.filter((o) => !o.ref.join && !expressionNames.has(o.ref.field)),
    },
    ...(query.joins ?? [])
      .filter((j) => j.explicit)
      .map((j) => ({
        alias: j.alias,
        label: (j.source.kind === 'table' ? tables.find((t) => t.id === j.source.id)?.label : undefined) ?? j.alias,
        icon: <JoinGlyph kind={j.kind} className="h-3.5 w-[22px]" />,
        options: shownOptions.filter((o) => o.ref.join === j.alias),
      })),
  ].filter((t) => t.options.length > 0)
  // A computed column's name must not hide one of the source's.
  const takenNames = (except?: string) => new Set(options.filter((o) => !o.ref.join && o.ref.field !== except).map((o) => o.ref.field.toLowerCase()))
  const applyExpression = (e: CustomColumn, index?: number) => {
    const expressions = [...(query.expressions ?? [])]
    if (index === undefined) expressions.push(e)
    else expressions[index] = e
    // Columns chosen one by one take the new one in.
    const fields = index === undefined && query.fields?.length ? [...query.fields, { field: e.name }] : query.fields
    set({ ...query, expressions, ...(fields ? { fields } : {}) })
    setExprOpen(null)
  }
  // A computed column goes with every step that cites it.
  const removeExpression = (index: number) => {
    const name = (query.expressions ?? [])[index]?.name
    const cites = (r?: ColumnRef) => !!r && !r.join && r.field === name
    set({
      ...query,
      expressions: (query.expressions ?? []).filter((_, j) => j !== index),
      filters: (query.filters ?? []).filter((f) => !('column' in f) || !cites(f.column)),
      aggregations: (query.aggregations ?? []).filter((a) => !cites(a.column)),
      breakouts: (query.breakouts ?? []).filter((b) => !cites(b)),
      fields: (query.fields ?? []).filter((f) => !cites(f)),
      sort: (query.sort ?? []).filter((o) => o.target.kind !== 'column' || !cites(o.target.column)),
    })
    setExprOpen(null)
  }

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
        {(query.joins ?? []).map((j) =>
          j.explicit ? (
            <Popover key={j.alias} open={joinOpen === j.alias} onOpenChange={(o) => setJoinOpen(o ? j.alias : null)}>
              <PopoverTrigger asChild>
                <span>
                  <Pill tone={TONES.data} onClick={() => setJoinOpen(j.alias)} onRemove={() => removeJoin(j.alias)}>
                    <span className="inline-flex items-center gap-1.5">
                      <JoinGlyph kind={j.kind} className="h-3.5 w-[22px]" />
                      {(j.source.kind === 'table' ? tables.find((t) => t.id === j.source.id)?.label : undefined) ?? j.alias}
                    </span>
                  </Pill>
                </span>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <JoinEditor
                  query={query}
                  initial={j}
                  tables={tables}
                  sourceTable={sourceTable ?? null}
                  sourceLabel={sourceLabel}
                  options={options}
                  onApply={(nj) => {
                    set({ ...query, joins: (query.joins ?? []).map((x) => (x.alias === j.alias ? nj : x)) })
                    setJoinOpen(null)
                  }}
                  onRemove={() => removeJoin(j.alias)}
                />
              </PopoverContent>
            </Popover>
          ) : (
            <span key={j.alias} className="inline-flex h-8 items-center gap-1 rounded-lg bg-muted px-2.5 text-xs text-muted-foreground">
              + {j.alias}
            </span>
          ),
        )}
        {(query.joins ?? []).length < QUERY_LIMITS.joins ? (
          <AddButton label={$t('Joindre des données')} open={joinOpen === 'new'} onOpenChange={(o) => setJoinOpen(o ? 'new' : null)}>
            <JoinEditor
              query={query}
              tables={tables}
              sourceTable={sourceTable ?? null}
              sourceLabel={sourceLabel}
              options={options}
              onApply={(j) => {
                set({ ...query, joins: [...(query.joins ?? []), j] })
                setJoinOpen(null)
              }}
            />
          </AddButton>
        ) : null}
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

      {!grouped || allowSql || (query.expressions ?? []).length ? (
        <Step icon={Columns3} title={$t('Colonnes')} tone={TONES.sort}>
          {!grouped ? (
            columnTables.map((t) => <TableColumns key={t.alias} label={t.label} icon={t.icon} options={t.options} query={query} shown={shownOptions} onChange={set} />)
          ) : (
            <span className="self-center text-sm text-muted-foreground">{$t('Le résumé décide des colonnes du résultat.')}</span>
          )}
          {allowSql || (query.expressions ?? []).length ? (
            <div className="flex w-full flex-wrap items-center gap-1.5 border-t pt-2">
              <span className="pr-1 text-xs text-muted-foreground">{$t('Calculées')}</span>
              {(query.expressions ?? []).map((e, i) => (
                <Popover key={e.name} open={exprOpen === i} onOpenChange={(o) => setExprOpen(o ? i : null)}>
                  <PopoverTrigger asChild>
                    <span>
                      <Pill tone={TONES.sort} onClick={() => setExprOpen(i)} onRemove={allowSql ? () => removeExpression(i) : undefined}>
                        <span className="inline-flex items-center gap-1.5">
                          <SquareFunction className="size-3.5 opacity-70" />
                          {e.name}
                          <span className="max-w-48 truncate font-mono text-xs font-normal opacity-70">= {e.expression}</span>
                        </span>
                      </Pill>
                    </span>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <ExpressionEditor initial={e} taken={takenNames(e.name)} readOnly={!allowSql} onApply={(ne) => applyExpression(ne, i)} onRemove={() => removeExpression(i)} />
                  </PopoverContent>
                </Popover>
              ))}
              {allowSql ? (
                <AddButton label={$t('Colonne calculée')} open={exprOpen === 'new'} onOpenChange={(o) => setExprOpen(o ? 'new' : null)}>
                  <ExpressionEditor taken={takenNames()} onApply={(ne) => applyExpression(ne)} />
                </AddButton>
              ) : null}
            </div>
          ) : null}
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
              <ColumnList options={shownOptions} onPick={(o) => { set({ ...query, sort: [...(query.sort ?? []), { target: { kind: 'column', column: o.ref } }] }); setSortOpen(false) }} />
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

      <p className="px-1 text-xs text-muted-foreground">{sourceTable?.description ?? sourceTable?.native_comment ?? ''}</p>
    </div>
  )
}
