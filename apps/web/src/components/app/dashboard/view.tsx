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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { RunResult } from '@/lib/api'
import { api } from '@/lib/api'
import { valueLabel as valueLabelFor } from './parameters'
import { $t, $tp, msg } from '@/lib/i18n'
import { folderLabel } from '@/lib/folders'
import { useFolders, useMe, useQuestion, useTables } from '@/lib/queries'
import { type ColumnOption, columnOptions } from '@/lib/builder'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRightLeft,
  LayoutDashboard,
  BarChart3,
  Copy,
  Ellipsis,
  ExternalLink,
  FolderClosed,
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
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactGridLayout, { type Layout, useContainerWidth, verticalCompactor } from 'react-grid-layout'
import Link from 'next/link'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { ParameterBar, type Values } from './parameters'
import { RefreshTimer } from './refresh-timer'
import { MoveDialog } from '@/components/app/move-dialog'
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
  /** Filters chosen by clicks on this card: it is not narrowed by them, it shows them. */
  selection?: { readonly params: readonly string[]; readonly values: readonly string[] }
  /** The other tabs it can go to, and where else it can go — when it can move. */
  moveTabs?: readonly DashboardTab[]
  onMoveToTab?: (tab: string) => void
  onMoveElsewhere?: () => void
}

/** Whether a result column can be what a filter restricts. */
function fitsParameter(parameter: DashboardParameter, c: ResultColumn): boolean {
  switch (parameter.type) {
    case 'date':
      return c.type === 'date' || c.type === 'datetime'
    case 'temporal_unit':
      return c.type === 'date' || c.type === 'datetime' || !!c.unit
    case 'number':
      return c.type === 'number' && !c.unit
    default:
      return (c.type === 'text' || c.type === 'number' || c.type === 'boolean') && !c.unit
  }
}

/** A column several cards share: what « Relier toutes les cartes » offers. */
interface Candidate {
  readonly key: string
  readonly label: string
  readonly cards: ReadonlyMap<string, ColumnRef>
}

/** The columns of the loaded cards a filter could restrict, the most shared first. */
function candidates(parameter: DashboardParameter, cards: readonly DashboardCard[], results: ReadonlyMap<string, RunResult>): Candidate[] {
  const out = new Map<string, { label: string; cards: Map<string, ColumnRef> }>()
  for (const card of cards) {
    if (card.kind !== 'question') continue
    for (const c of results.get(card.id)?.columns ?? []) {
      if (!c.source || !fitsParameter(parameter, c)) continue
      const key = c.source.column ?? `${c.source.table}.${c.source.field}`
      const entry = out.get(key) ?? { label: c.label.replace(/ : .*$/, '').replace(/^.* → /, ''), cards: new Map<string, ColumnRef>() }
      if (!entry.cards.has(card.id)) entry.cards.set(card.id, { field: c.source.field, ...(c.source.join ? { join: c.source.join } : {}) })
      out.set(key, entry)
    }
  }
  return [...out.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.cards.size - a.cards.size || a.label.localeCompare(b.label))
}

function MappingSelect({ card, result, parameter, onChange, variables, sourceColumns }: { card: DashboardCard; result?: RunResult; parameter: DashboardParameter; onChange: (m: CardMapping[]) => void; variables: readonly string[]; sourceColumns: readonly ColumnOption[] }) {
  const current = (card.mappings ?? []).find((m) => m.parameter === parameter.id)
  const value = current ? ('column' in current.target ? `c:${refKey(current.target.column)}` : `v:${current.target.variable}`) : 'none'
  const cols = (result?.columns ?? []).filter((c) => c.source && fitsParameter(parameter, c))
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
  const { card, parameters, tick, fresh, editing, draft, runner, selectedParameter, onResult, onPoint, onChange, onRemove, onDuplicate, onFullscreen, publicMode, moveTabs = [], onMoveToTab, onMoveElsewhere, selection } = props
  const isQuestion = card.kind === 'question'
  // The card a selection was clicked on keeps all its categories: one can add to it.
  const own = useMemo(() => (selection?.params.length ? Object.fromEntries(Object.entries(props.values).filter(([k]) => !selection.params.includes(k))) : props.values), [props.values, selection])
  const values = own
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
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold" onDoubleClick={() => editing && setEditingTitle(true)}>
              {card.question && !publicMode && !editing ? (
                <Link href={`/question/${card.question}`} className="hover:text-primary hover:underline">
                  {title}
                </Link>
              ) : (
                title
              )}
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
              {onMoveToTab && moveTabs.length > 0 ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <ArrowRightLeft className="size-4" /> {$t('Vers l’onglet')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-52">
                    {moveTabs.map((t) => (
                      <DropdownMenuItem key={t.id} onSelect={() => onMoveToTab(t.id)}>
                        {t.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}
              {onMoveElsewhere ? (
                <DropdownMenuItem onSelect={onMoveElsewhere}>
                  <LayoutDashboard /> {$t('Vers un autre tableau de bord…')}
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
          <Visualization result={run.data} viz={viz} compact onPointClick={(p) => onPoint(card, p)} {...(selection?.values.length ? { selected: selection.values } : {})} />
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
  const { data: folders = [] } = useFolders()
  const { data: me } = useMe()
  const byId = new Map(folders.map((f) => [f.id, f]))
  // Where it is filed: the folder, under its parents.
  const where = (id: string | null) => {
    const f = id ? byId.get(id) : undefined
    if (!f) return null
    return [...f.path.map((p) => byId.get(p.id) ?? { ...p, personal: null }), f].map((x) => folderLabel(x, me?.id)).join(' › ')
  }
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
              {where(i.folder) ? (
                <span className="flex max-w-[45%] shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <FolderClosed className="size-3.5 shrink-0" />
                  <span className="truncate">{where(i.folder)}</span>
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * A filter's settings while the dashboard is edited: its name and behaviour, its default, and
 * the cards it restricts — tied one by one on each card, or all at once to a shared column.
 */
function FilterSettings({
  parameter,
  current,
  cards,
  results,
  onPatch,
  onMap,
  onRemove,
  onClose,
}: {
  parameter: DashboardParameter
  current: ParameterValue | null
  cards: readonly DashboardCard[]
  results: ReadonlyMap<string, RunResult>
  onPatch: (patch: Partial<DashboardParameter>) => void
  /** Ties (a column) or unties (`null`) the filter on each card given. */
  onMap: (byCard: Map<string, ColumnRef | null>) => void
  onRemove: () => void
  onClose: () => void
}) {
  const [open, setOpen] = useState(false)
  const questions = cards.filter((c) => c.kind === 'question')
  const tied = questions.filter((c) => (c.mappings ?? []).some((m) => m.parameter === parameter.id))
  const unloaded = questions.filter((c) => !results.has(c.id)).length
  const list = candidates(parameter, questions, results)
  const fold = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const suggested = list.find((c) => fold(c.label) === fold(parameter.label))?.key ?? list[0]?.key
  const typeLabel = PARAM_TYPES.find((t) => t.type === parameter.type)?.label ?? parameter.type
  const share = questions.length ? tied.length / questions.length : 0
  const defaultLabel = valueLabelFor(parameter, parameter.default ?? null)
  return (
    <div className="space-y-3 border-b bg-primary/5 px-6 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{$t(typeLabel)}</span>
        <Input value={parameter.label} onChange={(e) => onPatch({ label: e.target.value })} aria-label={$t('Nom du filtre')} className="h-8 w-52 bg-background" />
        <span className="font-mono text-xs text-muted-foreground">{`{{${parameter.id}}}`}</span>
        {parameter.type === 'category' ? (
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={parameter.multiple !== false} onCheckedChange={(v) => onPatch({ multiple: v })} />
            {$t('Plusieurs valeurs')}
          </label>
        ) : null}
        <span className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">{$t('Par défaut')}</span>
          <span className="font-medium">{defaultLabel || $t('aucune valeur')}</span>
          <button type="button" className="text-primary hover:underline disabled:opacity-40 disabled:no-underline" disabled={!parameterHasValue(current)} onClick={() => onPatch({ default: current })}>
            {$t('prendre la valeur actuelle')}
          </button>
          {defaultLabel ? (
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => onPatch({ default: null })} aria-label={$t('Retirer la valeur par défaut')}>
              <X className="size-3.5" />
            </button>
          ) : null}
        </span>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" className="text-destructive" onClick={onRemove}>
          <Trash2 /> {$t('Supprimer le filtre')}
        </Button>
        <Button size="sm" onClick={onClose}>
          {$t('Terminé')}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${share * 100}%` }} />
          </div>
          <span className="text-xs">
            {$tp(tied.length, 'Relié à {count} carte sur {total}', 'Relié à {count} cartes sur {total}', { total: questions.length })}
          </span>
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 bg-background" disabled={list.length === 0}>
              <Link2 /> {$t('Relier toutes les cartes')}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-1">
            <div className="px-2 pt-1.5 pb-2 text-xs text-muted-foreground">{$t('À quelle colonne relier « {label} » sur chaque carte qui l’a ?', { label: parameter.label })}</div>
            {list.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  onMap(new Map(c.cards))
                  setOpen(false)
                  toast.success($tp(c.cards.size, '« {label} » relié à {count} carte.', '« {label} » relié à {count} cartes.', { label: parameter.label }))
                }}
                className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent', c.key === suggested && 'bg-primary/5')}
              >
                <span className="flex-1 truncate">{c.label}</span>
                {c.key === suggested ? <span className="text-[10px] font-semibold tracking-wide text-primary uppercase">{$t('suggérée')}</span> : null}
                <span className="text-xs text-muted-foreground tabular-nums">{$tp(c.cards.size, '{count} carte', '{count} cartes')}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
        {tied.length ? (
          <Button size="sm" variant="ghost" className="h-7" onClick={() => onMap(new Map(tied.map((c) => [c.id, null])))}>
            {$t('Délier toutes')}
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {$t('Ou choisissez la colonne sur chaque carte.')}
          {unloaded ? ` ${$tp(unloaded, '{count} carte d’un autre onglet : ouvrez-le pour la relier.', '{count} cartes d’autres onglets : ouvrez-les pour les relier.')}` : ''}
        </span>
      </div>
    </div>
  )
}

const PARAM_TYPES: { type: ParameterType; label: string }[] = [
  { type: 'date', label: msg('Période') },
  { type: 'category', label: msg('Catégorie') },
  { type: 'text', label: msg('Texte') },
  { type: 'number', label: msg('Nombre') },
  { type: 'temporal_unit', label: msg('Granularité de date') },
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
  /** Offers the choice of the automatic refresh, as a stopwatch, when given. */
  onAutoRefreshChange?: (seconds: number | null) => void
  /** Opens the editor for a new question of this dashboard, whose card goes to `tab`. */
  onNewQuestion?: (tab: string | null) => void
  /** The tab shown, when the page keeps it (in its address); otherwise kept here. */
  tab?: string | null
  onTabChange?: (tab: string) => void
  /** Moves a card to a tab or another dashboard, on the server. */
  onMoveCard?: (cardId: string, dashboard: string, tab: string | null) => Promise<void>
}

export function DashboardView({ dashboard, runner, editable, publicMode = false, startEditing = false, onSave, toolbar, autoRefresh, onAutoRefreshChange, onNewQuestion, tab: tabProp, onTabChange, onMoveCard }: DashboardViewProps) {
  const [editing, setEditing] = useState(startEditing && editable)
  const [draft, setDraft] = useState({ tabs: dashboard.tabs, cards: dashboard.cards, parameters: dashboard.parameters })
  const initialValues = useMemo(() => Object.fromEntries(dashboard.parameters.map((p) => [p.id, p.default ?? null])) as Values, [dashboard.parameters])
  const [values, setValues] = useState<Values>(initialValues)
  const [tabState, setTabState] = useState<string | null>(dashboard.tabs[0]?.id ?? null)
  const tab = tabProp !== undefined ? tabProp : tabState
  const setTab = (id: string) => {
    if (id === tab) return
    if (onTabChange) onTabChange(id)
    else setTabState(id)
  }
  const [moving, setMoving] = useState<DashboardCard | null>(null)
  const [tick, setTick] = useState(0)
  const [fresh, setFresh] = useState(false)
  const [selectedParam, setSelectedParam] = useState<string | null>(null)
  // Which card each click-made selection came from, by filter.
  const [origins, setOrigins] = useState<Record<string, string>>({})
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

  // Automatic refresh: every card re-runs, bypassing the cache. `cycle` is when the wait began.
  const [cycle, setCycle] = useState(() => Date.now())
  useEffect(() => {
    if (!autoRefresh || editing) return
    setCycle(Date.now())
    const t = setInterval(() => {
      setFresh(true)
      setTick((x) => x + 1)
      setCycle(Date.now())
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
    const current = values[param.id]
    let value: ParameterValue | null = null
    if (param.type === 'date' && p.column.unit) {
      value = periodExpression(String(p.value), p.column.unit)
      // Shift + click on a second period: the span from the first to the last.
      if (value !== null && p.additive && typeof current === 'string' && current.includes('~') && value.includes('~')) {
        const [a = '', b = ''] = current.split('~')
        const [c = '', d = ''] = value.split('~')
        value = `${a < c ? a : c}~${b > d ? b : d}`
      }
    } else if (param.type === 'category') {
      const v = String(p.value)
      const chosen = (Array.isArray(current) ? current : current ? [current] : []).map(String)
      // Shift (or Ctrl, ⌘) + click adds the category, or takes it away; a click alone keeps
      // only it — or, on the one already chosen, lets the filter go.
      if (p.additive && param.multiple !== false) value = chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v]
      else value = chosen.length === 1 && chosen[0] === v ? [] : [v]
      if (value.length === 0) value = null
    } else if (param.type === 'number') value = [Number(p.value), Number(p.value)]
    else value = String(p.value)
    if (value === null && param.type !== 'category') return
    setValues((v) => ({ ...v, [param.id]: value }))
    setOrigins((o) => {
      const { [param.id]: _, ...rest } = o
      return param.type === 'category' && value !== null ? { ...rest, [param.id]: card.id } : rest
    })
    if (value === null) toast.message($t('Filtre « {label} » retiré.', { label: param.label }))
    else
      toast.success($t('Filtré : {label} = {value}', { label: param.label, value: valueLabelFor(param, value) }), {
        ...(param.type === 'category' && param.multiple !== false && !p.additive ? { description: $t('Maj + clic pour ajouter d’autres catégories.') } : {}),
      })
  }

  // The filters a card's clicks chose, and the categories they hold.
  const selectionOf = (cardId: string) => {
    const params = Object.entries(origins)
      .filter(([, c]) => c === cardId)
      .map(([p]) => p)
    if (!params.length) return {}
    const chosen = params.flatMap((p) => {
      const v = values[p]
      return Array.isArray(v) ? v.map(String) : v ? [String(v)] : []
    })
    return { selection: { params, values: chosen } }
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

  const draftChanged = () => JSON.stringify(draft) !== JSON.stringify({ tabs: dashboard.tabs, cards: dashboard.cards, parameters: dashboard.parameters })
  // A card changes tab within the edit in progress; outside it, at once on the server.
  const moveToTab = async (card: DashboardCard, to: string) => {
    if (editing) {
      setDraft((d) => {
        const others = d.cards.filter((c) => c.id !== card.id)
        const [placed] = placedAfter(others, to, [{ ...card, tab: to }])
        return { ...d, cards: [...others, placed as DashboardCard] }
      })
      return
    }
    try {
      await onMoveCard?.(card.id, dashboard.id, to)
      toast.success($t('Carte déplacée.'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }
  // To another dashboard: the edit in progress is saved first.
  const moveElsewhere = async (card: DashboardCard, to: string, toTab: string | null) => {
    if (editing && onSave && draftChanged()) await onSave(draft)
    await onMoveCard?.(card.id, to, toTab)
  }

  const activeFilters = Object.values(values).filter((v) => parameterHasValue(v)).length

  return (
    <div className="flex h-full flex-col">
      {/* Bar: filters, then the dashboard's actions */}
      <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
        <ParameterBar
          parameters={draft.parameters}
          values={values}
          onChange={(id, v) => {
            setValues((cur) => ({ ...cur, [id]: v }))
            setOrigins(({ [id]: _, ...rest }) => rest)
          }}
          columnFor={columnFor}
          editing={editing}
          selected={selectedParam}
          onSelect={(id) => setSelectedParam((s) => (s === id ? null : id))}
        />
        {!editing && activeFilters > 0 ? (
          <button
            type="button"
            onClick={() => {
              setValues(initialValues)
              setOrigins({})
            }}
            className="text-xs text-muted-foreground hover:text-foreground">
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
            {onAutoRefreshChange ? <RefreshTimer seconds={autoRefresh ?? null} since={cycle} onChange={onAutoRefreshChange} /> : null}
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
        <FilterSettings
          parameter={selectedParameter}
          current={values[selectedParameter.id] ?? null}
          cards={draft.cards}
          results={results.current}
          onPatch={(patch) => setDraft((d) => ({ ...d, parameters: d.parameters.map((p) => (p.id === selectedParameter.id ? { ...p, ...patch } : p)) }))}
          onMap={(byCard) =>
            setDraft((d) => ({
              ...d,
              cards: d.cards.map((c) => {
                if (!byCard.has(c.id)) return c
                const others = (c.mappings ?? []).filter((m) => m.parameter !== selectedParameter.id)
                const column = byCard.get(c.id)
                return { ...c, mappings: column ? [...others, { parameter: selectedParameter.id, target: { column } }] : others }
              }),
            }))
          }
          onRemove={() => {
            setDraft((d) => ({
              ...d,
              parameters: d.parameters.filter((p) => p.id !== selectedParameter.id),
              cards: d.cards.map((c) => ({ ...c, mappings: (c.mappings ?? []).filter((m) => m.parameter !== selectedParameter.id) })),
            }))
            setSelectedParam(null)
          }}
          onClose={() => setSelectedParam(null)}
        />
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
                  {...(onMoveCard && editable && !publicMode && card.kind !== 'heading'
                    ? {
                        moveTabs: tabs.filter((t) => t.id !== currentTab),
                        onMoveToTab: (to: string) => void moveToTab(card, to),
                        // A card saved already: the server moves what it knows.
                        ...(dashboard.cards.some((c) => c.id === card.id) ? { onMoveElsewhere: () => setMoving(card) } : {}),
                      }
                    : {})}
                  onFullscreen={() => setFullscreenCard(card)}
                  publicMode={publicMode}
                  {...selectionOf(card.id)}
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
      {moving ? (
        <MoveDialog
          open
          onOpenChange={(o) => !o && setMoving(null)}
          name={moving.title || $t('Carte')}
          targets={['dashboard']}
          current={{ dashboard: dashboard.id, tab: moving.tab }}
          onMove={async (target) => {
            if (target.kind !== 'dashboard') return
            if (target.dashboard === dashboard.id) await moveToTab(moving, target.tab ?? '')
            else await moveElsewhere(moving, target.dashboard, target.tab)
            setMoving(null)
          }}
        />
      ) : null}
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
