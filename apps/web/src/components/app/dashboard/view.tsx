'use client'

import 'react-grid-layout/css/styles.css'
import type {
  CardMapping,
  ColumnRef,
  Dashboard,
  DashboardCard,
  DashboardParameter,
  DashboardTab,
  ItemSummary,
  ParameterType,
  ParameterValue,
  ResultColumn,
  VisualizationType,
  Visualization as Viz,
} from '@eodia/contracts'
import { DASHBOARD_COLUMNS, DASHBOARD_ROW_HEIGHT, cardSize, parameterHasValue, periodExpression, placedAfter } from '@eodia/contracts'
import { ItemTile } from '@/components/app/look'
import { VizPicker } from '@/components/app/question/viz-settings'
import { ResultFooter, Visualization, type PointClick } from '@/components/app/visualization'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { RunResult } from '@/lib/api'
import { api } from '@/lib/api'
import { valueLabel as valueLabelFor } from './parameters'
import { $t } from '@/lib/i18n'
import { useQuestion, useTables } from '@/lib/queries'
import { type ColumnOption, columnOptions } from '@/lib/builder'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  BarChart3,
  Copy,
  Ellipsis,
  ExternalLink,
  GripVertical,
  Heading,
  Link2,
  ListFilter,
  Loader2,
  Maximize2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Type,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactGridLayout, { type Layout, useContainerWidth, verticalCompactor } from 'react-grid-layout'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { ParameterBar, type Values } from './parameters'
import { TabRow } from '@/components/ui/tab-row'

export type Runner = (card: DashboardCard, values: Values, opts: { fresh: boolean; draft: boolean }) => Promise<RunResult>

const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

const refKey = (r: { field: string; join?: string }) => `${r.join ?? ''}.${r.field}`

/** The values a card's result depends on: only the filters tied to it. */
function relevantValues(card: DashboardCard, values: Values): Values {
  const ids = new Set((card.mappings ?? []).map((m) => m.parameter))
  return Object.fromEntries(Object.entries(values).filter(([k]) => ids.has(k)))
}

function substitute(text: string, parameters: readonly DashboardParameter[], values: Values): string {
  return text.replace(/\{\{\s*([a-z0-9_-]+)\s*\}\}/gi, (whole, name: string) => {
    const p = parameters.find((x) => x.id === name || x.label.toLowerCase() === name.toLowerCase())
    if (!p) return whole
    return valueLabelFor(p, values[p.id]) || $t('(tout)')
  })
}

interface CardProps {
  card: DashboardCard
  dashboardId: string
  parameters: readonly DashboardParameter[]
  values: Values
  tick: number
  fresh: boolean
  editing: boolean
  draft: boolean
  runner: Runner
  selectedParameter: DashboardParameter | null
  onResult: (cardId: string, r: RunResult, viz: Viz) => void
  onPoint: (card: DashboardCard, p: PointClick) => void
  onChange: (patch: Partial<DashboardCard>) => void
  onRemove: () => void
  onDuplicate: () => void
  onFullscreen: () => void
  publicMode: boolean
}

function MappingSelect({ card, result, parameter, onChange, variables, sourceColumns }: { card: DashboardCard; result?: RunResult; parameter: DashboardParameter; onChange: (m: CardMapping[]) => void; variables: readonly string[]; sourceColumns: readonly ColumnOption[] }) {
  const current = (card.mappings ?? []).find((m) => m.parameter === parameter.id)
  const value = current ? ('column' in current.target ? `c:${refKey(current.target.column)}` : `v:${current.target.variable}`) : 'none'
  const fits = (c: ResultColumn) => {
    const t = c.type
    switch (parameter.type) {
      case 'date':
      case 'temporal_unit':
        return t === 'date' || t === 'datetime'
      case 'number':
        return t === 'number'
      default:
        return t === 'text' || t === 'number' || t === 'boolean'
    }
  }
  const cols = (result?.columns ?? []).filter((c) => c.source && (fits(c) || (parameter.type === 'temporal_unit' && c.unit)))
  const fitsKind = (k: string) =>
    parameter.type === 'date' || parameter.type === 'temporal_unit' ? k === 'date' || k === 'datetime' : parameter.type === 'number' ? k === 'number' : ['text', 'number', 'boolean'].includes(k)
  const options = [
    { value: 'none', label: $t('Non relié') },
    ...sourceColumns.filter((o) => fitsKind(o.kind)).map((o) => ({ value: `c:${refKey(o.ref)}`, label: o.join ? `${o.group} → ${o.label}` : o.label })),
    ...cols.map((c) => ({ value: `c:${refKey({ field: c.source?.field ?? c.name, ...(c.source?.join ? { join: c.source.join } : {}) })}`, label: c.label.replace(/ : .*$/, '') })),
    ...variables.map((v) => ({ value: `v:${v}`, label: `{{${v}}}` })),
  ]
  const unique = options.filter((o, i) => options.findIndex((x) => x.value === o.value) === i)
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-background/85 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-60 space-y-2 text-center">
        <div className="text-xs text-muted-foreground">{$t('Relier « {label} » à', { label: parameter.label })}</div>
        <Choice
          value={value}
          onValueChange={(v) => {
            const others = (card.mappings ?? []).filter((m) => m.parameter !== parameter.id)
            if (v === 'none') return onChange(others)
            if (v.startsWith('v:')) return onChange([...others, { parameter: parameter.id, target: { variable: v.slice(2) } }])
            const [join, field] = v.slice(2).split('.') as [string, string]
            const column: ColumnRef = join ? { join, field } : { field }
            onChange([...others, { parameter: parameter.id, target: { column } }])
          }}
          options={unique}
          aria-label={$t('Colonne')}
          className="w-full"
          size="default"
        />
        {!result ? <div className="text-[11px] text-muted-foreground">{$t('Le résultat de la carte se charge…')}</div> : null}
      </div>
    </div>
  )
}

function CardFrame(props: CardProps) {
  const { card, parameters, values, tick, fresh, editing, draft, runner, selectedParameter, onResult, onPoint, onChange, onRemove, onDuplicate, onFullscreen, publicMode } = props
  const isQuestion = card.kind === 'question'
  const { data: question } = useQuestion(isQuestion && card.question && !publicMode ? card.question : null)
  const relevant = useMemo(() => relevantValues(card, values), [card, values])
  const run = useQuery({
    queryKey: ['card', props.dashboardId, card.id, JSON.stringify({ q: card.question, query: card.query, m: card.mappings, draft }), JSON.stringify(relevant), tick],
    queryFn: () => runner(card, values, { fresh, draft }),
    enabled: isQuestion,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
  const viz = card.visualization ?? question?.visualization ?? { type: 'table' as VisualizationType }
  useEffect(() => {
    if (run.data) onResult(card.id, run.data, viz)
  }, [run.data, card.id, onResult, viz])
  const title = card.title || question?.name || ''
  const [editingTitle, setEditingTitle] = useState(false)
  const builderQuery = question?.query.kind === 'builder' ? question.query : card.query?.kind === 'builder' ? card.query : null
  const { data: tables = [] } = useTables(undefined, true)
  const sourceColumns = useMemo(() => {
    if (!builderQuery || builderQuery.source.kind !== 'table') return []
    const map = new Map(tables.map((t) => [t.id, t]))
    // A joined column is offered only when the question already has that join: a filter cannot add one.
    return columnOptions(map.get(builderQuery.source.id) ?? null, map, builderQuery).filter((o) => !o.join || (builderQuery.joins ?? []).some((j) => j.alias === o.join?.alias))
  }, [builderQuery, tables])
  const variables = question && question.query.kind !== 'builder' ? (question.query.variables ?? []).map((v) => v.name) : card.query && card.query.kind !== 'builder' ? (card.query.variables ?? []).map((v) => v.name) : []

  if (card.kind === 'heading') {
    return (
      <div className={cn('group flex h-full items-center', editing && 'rounded-xl border border-dashed px-3')}>
        {editing ? <GripVertical className="card-handle mr-2 mb-2 size-4 cursor-move text-muted-foreground" /> : null}
        {editing ? (
          <input value={card.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} className="card-still w-full bg-transparent text-xl font-semibold outline-none" placeholder={$t('Titre de section')} />
        ) : (
          <h2 className="text-xl font-semibold tracking-tight">{substitute(card.text ?? '', parameters, values)}</h2>
        )}
        {editing ? (
          <button type="button" onClick={onRemove} className="card-still mb-2 ml-2 opacity-0 group-hover:opacity-100">
            <Trash2 className="size-4 text-muted-foreground" />
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className={cn('group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-xs', editing && 'ring-primary/30 hover:ring-2')}>
      {(isQuestion || title || editing) && card.kind !== 'text' ? (
        <div className="flex h-11 shrink-0 items-center gap-2 px-4">
          {editing ? <GripVertical className="card-handle size-4 shrink-0 cursor-move text-muted-foreground" /> : null}
          {editing && editingTitle ? (
            <input autoFocus value={card.title ?? title} onChange={(e) => onChange({ title: e.target.value })} onBlur={() => setEditingTitle(false)} className="card-still flex-1 bg-transparent text-[15px] font-semibold outline-none" />
          ) : (
            <h3 className="flex-1 truncate text-[15px] font-semibold" onDoubleClick={() => editing && setEditingTitle(true)}>
              {title}
            </h3>
          )}
          {run.isFetching ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="card-still rounded-md p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent data-[state=open]:opacity-100" aria-label={$t('Actions de la carte')}>
                <Ellipsis className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {isQuestion ? (
                <DropdownMenuItem onSelect={() => void run.refetch()}>
                  <RefreshCw /> {$t('Rafraîchir')}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={onFullscreen}>
                <Maximize2 /> {$t('Agrandir')}
              </DropdownMenuItem>
              {card.question && !publicMode ? (
                <DropdownMenuItem onSelect={() => window.open(`/question/${card.question}`, '_self')}>
                  <ExternalLink /> {$t('Ouvrir la question')}
                </DropdownMenuItem>
              ) : null}
              {editing ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setEditingTitle(true)}>
                    <Type /> {$t('Renommer')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onDuplicate}>
                    <Copy /> {$t('Dupliquer')}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onSelect={onRemove}>
                    <Trash2 /> {$t('Retirer')}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          {editing && isQuestion ? (
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="card-still rounded-md p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent" aria-label={$t('Visualisation')}>
                  <BarChart3 className="size-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <VizPicker value={viz.type} result={run.data ?? null} onChange={(type) => onChange({ visualization: { ...viz, type } })} />
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      ) : null}
      <div className={cn('card-still relative min-h-0 flex-1', isQuestion ? 'px-3 pb-3' : 'p-4')}>
        {card.kind === 'text' ? (
          editing ? (
            <Textarea value={card.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} className="h-full resize-none text-sm" placeholder={$t('Texte en Markdown ; citez un filtre avec {{id_du_filtre}}')} />
          ) : (
            <div className="prose-sm h-full overflow-auto text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_li]:ml-4 [&_ul]:list-disc [&_strong]:text-foreground">
              <Markdown remarkPlugins={[remarkGfm]}>{substitute(card.text ?? '', parameters, values)}</Markdown>
            </div>
          )
        ) : card.kind === 'embed' ? (
          editing ? (
            <Input value={card.url ?? ''} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://…" />
          ) : card.url ? (
            <iframe src={card.url} title={title} className="size-full rounded-md border-0" sandbox="allow-scripts allow-same-origin allow-popups" />
          ) : null
        ) : run.error ? (
          <div className="flex h-full items-center justify-center gap-2 px-4 text-center text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" /> {(run.error as Error).message}
          </div>
        ) : run.data ? (
          <Visualization result={run.data} viz={viz} compact onPointClick={(p) => onPoint(card, p)} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground/60" />
          </div>
        )}
        {editing && selectedParameter && isQuestion ? <MappingSelect card={card} result={run.data} parameter={selectedParameter} variables={variables} sourceColumns={sourceColumns} onChange={(mappings) => onChange({ mappings })} /> : null}
      </div>
    </div>
  )
}

function QuestionPicker({ open, onOpenChange, onPick, onNew }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (q: ItemSummary) => void; onNew?: () => void }) {
  const [q, setQ] = useState('')
  const { data } = useQuery({ queryKey: ['search', q, 'picker'], queryFn: () => api.get<{ items: ItemSummary[] }>(`/v1/search?q=${encodeURIComponent(q)}`), enabled: open })
  const items = (data?.items ?? []).filter((i) => i.kind !== 'dashboard')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{$t('Ajouter une question')}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={$t('Rechercher une question, un modèle, une métrique…')} className="pl-9" />
        </div>
        <div className="max-h-[380px] space-y-1 overflow-y-auto">
          {onNew ? (
            <button type="button" onClick={onNew} className="flex w-full items-center gap-3 rounded-lg border border-dashed px-2 py-2 text-left hover:bg-accent">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Plus className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{$t('Nouvelle question')}</div>
                <div className="truncate text-xs text-muted-foreground">{$t('Créée dans ce tableau de bord, sans passer par un dossier')}</div>
              </div>
            </button>
          ) : null}
          {items.map((i) => (
            <button key={i.id} type="button" onClick={() => onPick(i)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent">
              <ItemTile kind={i.kind} className="size-8" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{i.name}</div>
                {i.description ? <div className="truncate text-xs text-muted-foreground">{i.description}</div> : null}
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

const PARAM_TYPES: { type: ParameterType; label: string }[] = [
  { type: 'date', label: 'Période' },
  { type: 'category', label: 'Catégorie' },
  { type: 'text', label: 'Texte' },
  { type: 'number', label: 'Nombre' },
  { type: 'temporal_unit', label: 'Granularité de date' },
]

export interface DashboardViewProps {
  dashboard: Dashboard
  runner: Runner
  editable: boolean
  publicMode?: boolean
  startEditing?: boolean
  onSave?: (d: Pick<Dashboard, 'tabs' | 'cards' | 'parameters'>) => Promise<void>
  toolbar?: React.ReactNode
  autoRefresh?: number | null
  /** Opens the editor for a new question of this dashboard, whose card goes to `tab`. */
  onNewQuestion?: (tab: string | null) => void
}

export function DashboardView({ dashboard, runner, editable, publicMode = false, startEditing = false, onSave, toolbar, autoRefresh, onNewQuestion }: DashboardViewProps) {
  const [editing, setEditing] = useState(startEditing && editable)
  const [draft, setDraft] = useState({ tabs: dashboard.tabs, cards: dashboard.cards, parameters: dashboard.parameters })
  const initialValues = useMemo(() => Object.fromEntries(dashboard.parameters.map((p) => [p.id, p.default ?? null])) as Values, [dashboard.parameters])
  const [values, setValues] = useState<Values>(initialValues)
  const [tab, setTab] = useState<string | null>(dashboard.tabs[0]?.id ?? null)
  const [tick, setTick] = useState(0)
  const [fresh, setFresh] = useState(false)
  const [selectedParam, setSelectedParam] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [fullscreenCard, setFullscreenCard] = useState<DashboardCard | null>(null)
  const [saving, setSaving] = useState(false)
  const results = useRef(new Map<string, RunResult>())
  const vizs = useRef(new Map<string, Viz>())
  const [, force] = useState(0)
  const { width, containerRef, mounted } = useContainerWidth()

  useEffect(() => {
    if (!editing) setDraft({ tabs: dashboard.tabs, cards: dashboard.cards, parameters: dashboard.parameters })
  }, [dashboard, editing])

  // Automatic refresh: every card re-runs, bypassing the cache.
  useEffect(() => {
    if (!autoRefresh || editing) return
    const t = setInterval(() => {
      setFresh(true)
      setTick((x) => x + 1)
    }, autoRefresh * 1000)
    return () => clearInterval(t)
  }, [autoRefresh, editing])

  const tabs = draft.tabs
  const currentTab = tabs.length ? (tabs.some((t) => t.id === tab) ? tab : (tabs[0]?.id ?? null)) : null
  const cards = draft.cards.filter((c) => (tabs.length ? c.tab === currentTab : true))
  const layout: Layout = cards.map((c) => ({ i: c.id, x: c.x, y: c.y, w: c.w, h: c.h, minW: 2, minH: c.kind === 'heading' ? 1 : 2 }))
  const selectedParameter = draft.parameters.find((p) => p.id === selectedParam) ?? null

  const onResult = useCallback((id: string, r: RunResult, viz: Viz) => {
    const had = results.current.has(id)
    results.current.set(id, r)
    vizs.current.set(id, viz)
    if (!had) force((x) => x + 1)
  }, [])

  const columnFor = (paramId: string) => {
    for (const c of draft.cards) {
      const m = (c.mappings ?? []).find((x) => x.parameter === paramId && 'column' in x.target)
      if (!m || !('column' in m.target)) continue
      const target = m.target.column
      const col = results.current.get(c.id)?.columns.find((rc) => rc.source && rc.source.field === target.field && (rc.source.join ?? '') === (target.join ?? ''))
      if (col?.source?.column) return col.source.column
    }
    return undefined
  }

  const setCard = (id: string, patch: Partial<DashboardCard>) => setDraft((d) => ({ ...d, cards: d.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
  const addCards = (items: Omit<DashboardCard, 'x' | 'y' | 'tab'>[]) =>
    setDraft((d) => ({ ...d, cards: [...d.cards, ...placedAfter(d.cards, currentTab, items.map((i) => ({ ...i, tab: currentTab })))] as DashboardCard[] }))

  // A click on a point filters the dashboard by it, through the filter tied to that column.
  const onPoint = (card: DashboardCard, p: PointClick) => {
    if (editing || !p.column.source) return
    const src = p.column.source
    const mapping = (card.mappings ?? []).find((m) => 'column' in m.target && m.target.column.field === src.field && (m.target.column.join ?? '') === (src.join ?? ''))
    const param = mapping ? draft.parameters.find((x) => x.id === mapping.parameter && x.type !== 'temporal_unit') : undefined
    if (!param) {
      toast.message($t('Aucun filtre du tableau n’est relié à « {col} ».', { col: p.column.label }))
      return
    }
    let value: ParameterValue | null = null
    if (param.type === 'date' && p.column.unit) value = periodExpression(String(p.value), p.column.unit)
    else if (param.type === 'category') value = [String(p.value)]
    else if (param.type === 'number') value = [Number(p.value), Number(p.value)]
    else value = String(p.value)
    if (value === null) return
    setValues((v) => ({ ...v, [param.id]: value }))
    toast.success($t('Filtré : {label} = {value}', { label: param.label, value: valueLabelFor(param, value) }))
  }

  const save = async () => {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave(draft)
      setEditing(false)
      setSelectedParam(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  // A new question leaves the page: the changes in progress are saved first.
  const newQuestion = async () => {
    if (!onNewQuestion) return
    const changed = JSON.stringify(draft) !== JSON.stringify({ tabs: dashboard.tabs, cards: dashboard.cards, parameters: dashboard.parameters })
    if (changed && onSave) {
      setSaving(true)
      try {
        await onSave(draft)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
        return
      } finally {
        setSaving(false)
      }
    }
    setPicker(false)
    onNewQuestion(currentTab)
  }

  const activeFilters = Object.values(values).filter((v) => parameterHasValue(v)).length

  return (
    <div className="flex h-full flex-col">
      {/* Bar: filters, then the dashboard's actions */}
      <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
        <ParameterBar
          parameters={draft.parameters}
          values={values}
          onChange={(id, v) => setValues((cur) => ({ ...cur, [id]: v }))}
          columnFor={columnFor}
          editing={editing}
          selected={selectedParam}
          onSelect={(id) => setSelectedParam((s) => (s === id ? null : id))}
        />
        {!editing && activeFilters > 0 ? (
          <button type="button" onClick={() => setValues(initialValues)} className="text-xs text-muted-foreground hover:text-foreground">
            {$t('Réinitialiser les filtres')}
          </button>
        ) : null}
        {editing ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="border-dashed">
                <ListFilter /> {$t('Filtre')}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-1">
              {PARAM_TYPES.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => {
                    const id = newId('f')
                    setDraft((d) => ({ ...d, parameters: [...d.parameters, { id, label: $t(t.label), type: t.type, ...(t.type === 'category' ? { multiple: true } : {}), ...(t.type === 'number' ? { operator: 'between' as const } : {}) }] }))
                    setSelectedParam(id)
                  }}
                  className="flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  {$t(t.label)}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        ) : null}
        <span className="flex-1" />
        {editing ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setPicker(true)}>
              <Plus /> {$t('Question')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => addCards([{ id: newId('c'), kind: 'heading', text: $t('Nouvelle section'), ...cardSize('heading') }])}>
              <Heading /> {$t('Titre')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => addCards([{ id: newId('c'), kind: 'text', text: '', ...cardSize('text') }])}>
              <Type /> {$t('Texte')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => addCards([{ id: newId('c'), kind: 'embed', title: $t('Page intégrée'), url: '', ...cardSize('embed') }])}>
              <Link2 /> {$t('Intégration')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft({ tabs: dashboard.tabs, cards: dashboard.cards, parameters: dashboard.parameters })
                setEditing(false)
                setSelectedParam(null)
              }}
            >
              {$t('Annuler')}
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              {$t('Enregistrer')}
            </Button>
          </>
        ) : (
          <>
            {toolbar}
            {editable ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                {$t('Modifier')}
              </Button>
            ) : null}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={$t('Rafraîchir')}
              onClick={() => {
                setFresh(true)
                setTick((x) => x + 1)
              }}
            >
              <RefreshCw />
            </Button>
          </>
        )}
      </div>

      {/* The selected filter's settings, while editing */}
      {editing && selectedParameter ? (
        <div className="flex flex-wrap items-center gap-3 border-b bg-primary/5 px-6 py-2 text-sm">
          <span className="font-medium">{$t('Filtre')}</span>
          <Input value={selectedParameter.label} onChange={(e) => setDraft((d) => ({ ...d, parameters: d.parameters.map((p) => (p.id === selectedParameter.id ? { ...p, label: e.target.value } : p)) }))} className="h-8 w-48" />
          <span className="font-mono text-xs text-muted-foreground">{`{{${selectedParameter.id}}}`}</span>
          {selectedParameter.type === 'category' ? (
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={selectedParameter.multiple !== false} onCheckedChange={(v) => setDraft((d) => ({ ...d, parameters: d.parameters.map((p) => (p.id === selectedParameter.id ? { ...p, multiple: v } : p)) }))} />
              {$t('Plusieurs valeurs')}
            </label>
          ) : null}
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => setDraft((d) => ({ ...d, parameters: d.parameters.map((p) => (p.id === selectedParameter.id ? { ...p, default: values[p.id] ?? null } : p)) }))}
          >
            {$t('Valeur actuelle par défaut')}
          </button>
          <span className="text-xs text-muted-foreground">{$t('Choisissez, sur chaque carte, la colonne que ce filtre restreint.')}</span>
          <span className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              setDraft((d) => ({
                ...d,
                parameters: d.parameters.filter((p) => p.id !== selectedParameter.id),
                cards: d.cards.map((c) => ({ ...c, mappings: (c.mappings ?? []).filter((m) => m.parameter !== selectedParameter.id) })),
              }))
              setSelectedParam(null)
            }}
          >
            <Trash2 /> {$t('Supprimer le filtre')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelectedParam(null)}>
            {$t('Terminé')}
          </Button>
        </div>
      ) : null}

      {/* Tabs */}
      {tabs.length > 0 || editing ? (
        <TabRow className="items-center gap-1 border-b px-6">
          {tabs.map((t: DashboardTab) => (
            <div key={t.id} className={cn('relative flex items-center', currentTab === t.id && 'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary')}>
              {editing ? (
                <input
                  value={t.label}
                  onFocus={() => setTab(t.id)}
                  onChange={(e) => setDraft((d) => ({ ...d, tabs: d.tabs.map((x) => (x.id === t.id ? { ...x, label: e.target.value } : x)) }))}
                  className={cn('w-28 bg-transparent px-3 py-2.5 text-sm outline-none', currentTab === t.id ? 'font-semibold' : 'text-muted-foreground')}
                />
              ) : (
                <button type="button" onClick={() => setTab(t.id)} className={cn('px-3 py-2.5 text-sm', currentTab === t.id ? 'font-semibold' : 'text-muted-foreground hover:text-foreground')}>
                  {t.label}
                </button>
              )}
              {editing && tabs.length > 1 ? (
                <button type="button" aria-label={$t('Supprimer l’onglet')} onClick={() => setDraft((d) => ({ ...d, tabs: d.tabs.filter((x) => x.id !== t.id), cards: d.cards.filter((c) => c.tab !== t.id) }))}>
                  <Trash2 className="size-3 text-muted-foreground" />
                </button>
              ) : null}
            </div>
          ))}
          {editing ? (
            <button
              type="button"
              className="ml-2 inline-flex items-center gap-1 px-2 py-2.5 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => {
                const id = newId('t')
                setDraft((d) => {
                  // The first tab takes the cards that had none.
                  if (d.tabs.length === 0) {
                    const first = newId('t')
                    return { ...d, tabs: [{ id: first, label: $t('Vue d’ensemble') }, { id, label: $t('Nouvel onglet') }], cards: d.cards.map((c) => ({ ...c, tab: first })) }
                  }
                  return { ...d, tabs: [...d.tabs, { id, label: $t('Nouvel onglet') }] }
                })
                setTab(id)
              }}
            >
              <Plus className="size-3.5" /> {$t('Onglet')}
            </button>
          ) : null}
        </TabRow>
      ) : null}

      {/* Grid */}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto bg-surface px-6 py-5">
        {cards.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-sm text-muted-foreground">
            {$t('Ce tableau de bord est vide.')}
            {editable && !editing ? (
              <Button size="sm" onClick={() => setEditing(true)}>
                {$t('Ajouter des cartes')}
              </Button>
            ) : editing ? (
              <Button size="sm" onClick={() => setPicker(true)}>
                <Plus /> {$t('Ajouter une question')}
              </Button>
            ) : null}
          </div>
        ) : null}
        {mounted && cards.length > 0 ? (
          <ReactGridLayout
            layout={layout}
            width={width - 48}
            gridConfig={{ cols: DASHBOARD_COLUMNS, rowHeight: DASHBOARD_ROW_HEIGHT, margin: [14, 14], containerPadding: [0, 0] }}
            dragConfig={{ enabled: editing, handle: '.card-handle', cancel: '.card-still', threshold: 3 }}
            resizeConfig={{ enabled: editing, handles: ['se'] }}
            compactor={verticalCompactor}
            onLayoutChange={(next) => {
              if (!editing) return
              setDraft((d) => ({
                ...d,
                cards: d.cards.map((c) => {
                  const l = next.find((x) => x.i === c.id)
                  return l ? { ...c, x: l.x, y: l.y, w: l.w, h: l.h } : c
                }),
              }))
            }}
          >
            {cards.map((card) => (
              <div key={card.id}>
                <CardFrame
                  card={card}
                  dashboardId={dashboard.id}
                  parameters={draft.parameters}
                  values={values}
                  tick={tick}
                  fresh={fresh}
                  editing={editing}
                  draft={editing}
                  runner={runner}
                  selectedParameter={selectedParameter}
                  onResult={onResult}
                  onPoint={onPoint}
                  onChange={(patch) => setCard(card.id, patch)}
                  onRemove={() => setDraft((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== card.id) }))}
                  onDuplicate={() => addCards([{ ...card, id: newId('c') }])}
                  onFullscreen={() => setFullscreenCard(card)}
                  publicMode={publicMode}
                />
              </div>
            ))}
          </ReactGridLayout>
        ) : null}
      </div>

      <QuestionPicker
        open={picker}
        onOpenChange={setPicker}
        {...(onNewQuestion && editable ? { onNew: newQuestion } : {})}
        onPick={(q) => {
          addCards([{ id: newId('c'), kind: 'question', question: q.id, ...cardSize('question', (q.viz ?? 'bar') as VisualizationType) }])
          setPicker(false)
        }}
      />
      <Dialog open={!!fullscreenCard} onOpenChange={(o) => !o && setFullscreenCard(null)}>
        <DialogContent className="h-[85vh] max-w-[90vw] sm:max-w-[90vw]">
          <DialogHeader>
            <DialogTitle>{fullscreenCard?.title || $t('Carte')}</DialogTitle>
          </DialogHeader>
          {fullscreenCard && results.current.get(fullscreenCard.id) ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="min-h-0 flex-1">
                <Visualization result={results.current.get(fullscreenCard.id) as RunResult} viz={vizs.current.get(fullscreenCard.id) ?? { type: 'table' }} />
              </div>
              <ResultFooter result={results.current.get(fullscreenCard.id) as RunResult} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
