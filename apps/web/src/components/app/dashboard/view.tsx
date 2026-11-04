'use client'

import 'react-grid-layout/css/styles.css'
import type {
  Annotation,
  CardComment,
  CardMapping,
  ColumnRef,
  Dashboard,
  DashboardCard,
  DashboardParameter,
  DashboardTab,
  ItemSummary,
  ParameterType,
  ParameterValue,
  Question,
  ResultColumn,
  VisualizationType,
  Visualization as Viz,
} from '@eodia/contracts'
import { DASHBOARD_COLUMNS, DASHBOARD_ROW_HEIGHT, applyConstraints, cardConstraints, cardSize, parameterHasValue, periodExpression, placedAfter } from '@eodia/contracts'
import { EmptyScene } from '@/components/app/empty-scene'
import { ItemTile, LookIcon } from '@/components/app/look'
import { IconPicker } from '@/components/app/structure/pickers'
import { VizPicker } from '@/components/app/question/viz-settings'
import { DarkSurface, ResultFooter, Visualization, type PointClick } from '@/components/app/visualization'
import { PointMenu, openRecords, recordPicks } from '@/components/app/point-menu'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { api, download } from '@/lib/api'
import { valueLabel as valueLabelFor } from './parameters'
import { $t, $tp, msg } from '@/lib/i18n'
import { folderLabel } from '@/lib/folders'
import { useFolders, useMe, useModelColumns, useModels, useModelsColumns, useQuestion, useTables } from '@/lib/queries'
import { type ColumnOption, type ModelColumns, columnOptions } from '@/lib/builder'
import { useUi } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  BellRing,
  Check,
  Palette,
  Braces,
  Download,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  BarChart3,
  ImageDown,
  Table2,
  Copy,
  Ellipsis,
  ExternalLink,
  Flag,
  FilterX,
  Redo2,
  Undo2,
  Image as ImageIcon,
  Minus,
  MousePointerClick,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Eye,
  EyeOff,
  FolderClosed,
  GripVertical,
  Heading,
  Link2,
  Filter as FilterIcon,
  ListFilter,
  Loader2,
  Maximize2,
  Pencil,
  Plus,
  Rows3,
  RefreshCw,
  Search,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactGridLayout, { type Layout, useContainerWidth, verticalCompactor } from 'react-grid-layout'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { FILTER_ICONS, FILTER_TYPES, ParameterBar, ParameterEditor, type Values, filterName, filterType } from './parameters'
import { ValueList } from './value-list'
import { RefreshTimer } from './refresh-timer'
import { createPortal } from 'react-dom'
import { MoveDialog } from '@/components/app/move-dialog'
import { TabRow } from '@/components/ui/tab-row'
import { Hint, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { SavedViews } from './saved-views'
import { AnnotateDialog, CommentsButton } from './comments'
import { TabLabel, TabMark, TabPreview, TabSettingsDialog, pictureTab } from './tabs'
import { CardStyleDialog, cardSurface } from './card-style'
import { leaveDashboard, takeReturnPoint } from '@/lib/return-point'
import { AlertsDialog } from '@/components/app/delivery/alerts'
import { CardCondition, ConditionDialog, type Runner, TabCondition, conditionSummary, useCardRun } from './conditions'
import { ButtonsView, CardSettingsDialog, ClickDialog, carriedFilters, HeadingStyleButton, HeadingView, ImageView, LinkView, SeparatorStyleButton, SeparatorView, type Summarizer, SummaryView, VariableView } from './cards'

export type { Runner }

/** The day a point of a chart over time stands for — where an annotation goes. */
function dayOf(p: PointClick): string | null {
  const dated = [{ column: p.column, value: p.value }, ...(p.also ?? [])].find((x) => x.column.type === 'date' || x.column.type === 'datetime')
  const day = dated ? String(dated.value ?? '').slice(0, 10) : ''
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

/** A button of the floating bar: a pictogram and a word, round as the bar. */
function AddPill({ icon: Icon, label, onClick, disabled, hint, primary }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; disabled?: boolean; hint?: string | undefined; primary?: boolean }) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
        primary ? 'bg-background text-primary shadow-sm hover:bg-background/90' : 'hover:bg-primary-foreground/15',
      )}
    >
      <Icon className="size-4" /> {label}
    </button>
  )
  return hint ? (
    <Hint label={hint}>
      <span>{button}</span>
    </Hint>
  ) : (
    button
  )
}

/** A card or a tab with this condition — or without any. */
function withCondition<T extends { condition?: DashboardCard['condition'] }>(x: T, condition: DashboardCard['condition'] | undefined): T {
  if (condition) return { ...x, condition }
  const { condition: _gone, ...rest } = x
  return rest as T
}

/** A menu's group title, as the dashboard's own menu has them. */
const MENU_LABEL = 'text-[11px] font-medium tracking-wide text-muted-foreground uppercase'

/** Where one was in a dashboard's grid when it was remounted (a save): to find it again. */
const KEPT_SCROLL = new Map<string, { top: number; at: number }>()

const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

const refKey = (r: { field: string; join?: string }) => `${r.join ?? ''}.${r.field}`

export function substitute(text: string, parameters: readonly DashboardParameter[], values: Values): string {
  const fold = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (whole, name: string) => {
    const p = parameters.find((x) => x.id === name || fold(filterName(x)) === fold(name))
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
  /** The catalog column each filter tied to the card restricts, read off its question. */
  onColumns?: (cardId: string, columns: Readonly<Record<string, string>>) => void
  onPoint: (card: DashboardCard, p: PointClick) => void
  /** A right click on a point: with the values the card was run with, to read its rows by. */
  onPointMenu: (card: DashboardCard, p: PointClick, values: Values, title: string) => void
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
  /** A card keeping its query to itself (the copilot's): it becomes a question to edit. */
  onEditQuestion?: () => void
  /** Being edited: its display condition, set here — and whether it holds now. */
  onCondition?: () => void
  conditionShown?: boolean | undefined
  /** A filter pane: its filter, its value, where its values are read, and how it changes. */
  pane?: FilterPane
  /** Leaving for the card's question: notes where one was, to come back to it. */
  onLeave?: () => void
  /** Reached on screen: the card rises into place, its chart draws itself. */
  revealed?: boolean
  /** Its turn in the wave of cards appearing together. */
  revealDelay?: number
  /** The dashboard's cards — what a summary reads. */
  allCards?: readonly DashboardCard[]
  summarizer?: Summarizer
  /** What people say of the card: its comments, its chart's annotations. */
  talk?: {
    readonly comments: readonly CardComment[]
    readonly annotations: readonly Annotation[]
    readonly onAdd: (body: string) => Promise<void>
    readonly onDelete: (id: string) => Promise<void>
    readonly onDeleteAnnotation: (id: string) => Promise<void>
  }
}

interface FilterPane {
  readonly parameter: DashboardParameter | undefined
  readonly value: ParameterValue | null | undefined
  readonly columnId: string | undefined
  readonly linked: { column: string; values: string[] }[]
  readonly onChange: (v: ParameterValue | null) => void
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

function MappingSelect({ card, result, parameter, onChange, variables, sourceColumns, sqlCard }: { card: DashboardCard; result?: RunResult; parameter: DashboardParameter; onChange: (m: CardMapping[]) => void; variables: readonly string[]; sourceColumns: readonly ColumnOption[]; sqlCard: boolean }) {
  const current = (card.mappings ?? []).find((m) => m.parameter === parameter.id)
  const value = current ? ('column' in current.target ? `c:${refKey(current.target.column)}` : `v:${current.target.variable}`) : 'none'
  // A SQL result's columns have no source, but its statement is filtered by their name.
  const cols = (result?.columns ?? []).filter((c) => (c.source || (sqlCard && !c.name.includes('.') && !c.name.includes('#'))) && fitsParameter(parameter, c))
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
        <div className="text-xs text-muted-foreground">{$t('Relier « {label} » à', { label: filterName(parameter) })}</div>
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
  const { card, parameters, tick, fresh, editing, draft, runner, selectedParameter, onResult, onColumns, onPoint, onPointMenu, onChange, onRemove, onDuplicate, onFullscreen, publicMode, moveTabs = [], onMoveToTab, onMoveElsewhere, onEditQuestion, onCondition, conditionShown, pane, allCards, summarizer, talk, selection } = props
  const isQuestion = card.kind === 'question'
  // The card a selection was clicked on keeps all its categories: one can add to it.
  const own = useMemo(() => (selection?.params.length ? Object.fromEntries(Object.entries(props.values).filter(([k]) => !selection.params.includes(k))) : props.values), [props.values, selection])
  const values = own
  const { data: question } = useQuestion(isQuestion && card.question && !publicMode ? card.question : null)
  const [alerting, setAlerting] = useState(false)
  const [styling, setStyling] = useState(false)
  const surface = cardSurface(card)
  // A chart read as the table of its numbers, for a moment — the card itself unchanged.
  const [asTable, setAsTable] = useState(false)
  const frameRef = useRef<HTMLDivElement>(null)
  // Reached: its chart is drawn once the card has nearly risen into place, so its bars are seen growing.
  const [drawn, setDrawn] = useState(props.revealed !== false)
  useEffect(() => {
    if (props.revealed !== true || drawn) return
    const t = setTimeout(() => setDrawn(true), (props.revealDelay ?? 0) + 260)
    return () => clearTimeout(t)
  }, [props.revealed, props.revealDelay, drawn])
  /** The card as an image in the clipboard: to paste in a message, a slide. */
  const copyImage = async () => {
    const el = frameRef.current
    if (!el) return
    try {
      const { domToBlob } = await import('modern-screenshot')
      const style = getComputedStyle(el)
      const blob = await domToBlob(el, {
        scale: 2,
        backgroundColor: style.backgroundColor || '#ffffff',
        // The card's own buttons stay out of the picture.
        filter: (node) => !(node instanceof HTMLElement && (node.matches('button[aria-label], [role="toolbar"]') || node.dataset.noshot !== undefined)),
      })
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast.success($t('Carte copiée en image : collez-la où vous voulez.'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }
  const router = useRouter()
  const openQuestion = () => {
    props.onLeave?.()
    if (card.question) router.push(`/question/${card.question}`)
  }
  const exportCard = async (format: 'csv' | 'xlsx' | 'json') => {
    try {
      await download(`/v1/dashboards/${props.dashboardId}/cards/${card.id}/export`, { values, format, name: title })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }
  const run = useCardRun({ card, dashboardId: props.dashboardId, values, tick, fresh, draft, runner, enabled: isQuestion })
  const viz = card.visualization ?? question?.visualization ?? { type: 'table' as VisualizationType }
  useEffect(() => {
    if (run.data) onResult(card.id, run.data, viz)
  }, [run.data, card.id, onResult, viz])
  const title = card.title || question?.name || (card.kind === 'filter' && pane?.parameter ? filterName(pane.parameter) : '')
  const [editingTitle, setEditingTitle] = useState(false)
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [clickOpen, setClickOpen] = useState(false)
  const builderQuery = question?.query.kind === 'builder' ? question.query : card.query?.kind === 'builder' ? card.query : null
  const { data: tables = [] } = useTables(undefined, true)
  // A model — the source, or joined —: its columns read off one of its rows (not on a public page).
  const { data: models = [] } = useModels(!publicMode)
  const sourceModel = useModelColumns(!publicMode && builderQuery?.source.kind === 'question' ? builderQuery.source.id : null)
  const joinedIds = useMemo(() => (publicMode ? [] : [...new Set((builderQuery?.joins ?? []).flatMap((j) => (j.source.kind === 'question' ? [j.source.id] : [])))]), [builderQuery?.joins, publicMode])
  const joinedColumns = useModelsColumns(joinedIds)
  const joinedKey = joinedColumns.map((q) => q.dataUpdatedAt).join(',')
  // biome-ignore lint/correctness/useExhaustiveDependencies: the joined models' columns follow `joinedKey`
  const sourceColumns = useMemo(() => {
    if (!builderQuery) return []
    const map = new Map(tables.map((t) => [t.id, t]))
    const joined = new Map<string, ModelColumns>()
    joinedIds.forEach((id, i) => {
      const columns = joinedColumns[i]?.data
      if (columns) joined.set(id, { name: models.find((m) => m.id === id)?.name ?? $t('Modèle'), columns })
    })
    const source = builderQuery.source.kind === 'table' ? (map.get(builderQuery.source.id) ?? null) : null
    // A joined column is offered only when the question already has that join: a filter cannot add one.
    return columnOptions(source, map, builderQuery, sourceModel.data, joined).filter((o) => !o.join || (builderQuery.joins ?? []).some((j) => j.alias === o.join?.alias))
  }, [builderQuery, tables, sourceModel.data, joinedIds, joinedKey, models])
  // The column a filter restricts, from the question itself: a count shows none of its columns,
  // and a filter tied to it still lists its values.
  useEffect(() => {
    if (!onColumns || !sourceColumns.length) return
    const ids: Record<string, string> = {}
    for (const m of card.mappings ?? []) {
      if (!('column' in m.target)) continue
      const key = refKey(m.target.column)
      const id = sourceColumns.find((o) => refKey(o.ref) === key)?.columnId
      if (id) ids[m.parameter] = id
    }
    onColumns(card.id, ids)
  }, [onColumns, sourceColumns, card.id, card.mappings])
  // A SQL card's result columns can take a filter too: the server wraps its statement.
  const sqlCard = (question?.query.kind ?? card.query?.kind ?? 'builder') !== 'builder'
  const variables = question && question.query.kind !== 'builder' ? (question.query.variables ?? []).map((v) => v.name) : card.query && card.query.kind !== 'builder' ? (card.query.variables ?? []).map((v) => v.name) : []

  if (card.kind === 'heading') {
    return (
      <div className={cn('group flex h-full items-center', editing && 'rounded-xl border border-dashed px-3')}>
        {editing ? <GripVertical className="card-handle mr-2 size-4 shrink-0 cursor-move text-muted-foreground" /> : null}
        <div className="min-w-0 flex-1 self-stretch">
          <HeadingView text={substitute(card.text ?? '', parameters, values)} icon={card.icon} style={card.heading}>
            {editing ? (
              <input
                value={card.text ?? ''}
                onChange={(e) => onChange({ text: e.target.value })}
                className={cn('card-still w-full min-w-0 bg-transparent tracking-tight outline-none', { sm: 'text-base', md: 'text-xl', lg: 'text-2xl', xl: 'text-3xl', '2xl': 'text-4xl' }[card.heading?.size ?? 'md'], card.heading?.weight === 'bold' ? 'font-bold' : card.heading?.weight === 'medium' ? 'font-medium' : 'font-semibold', card.heading?.uppercase && 'uppercase', card.heading?.align === 'center' ? 'text-center' : card.heading?.align === 'right' ? 'text-right' : '')}
                style={{ ...(card.heading?.color ? { color: card.heading.color } : {}), ...(card.heading?.font ? { fontFamily: `'${card.heading.font}', var(--font-sans)` } : {}) }}
                placeholder={$t('Titre de section')}
              />
            ) : undefined}
          </HeadingView>
        </div>
        {editing ? <HeadingStyleButton style={card.heading} onChange={(heading) => onChange({ heading })} /> : null}
        {editing ? (
          <Hint label={$t('Dupliquer')}>
            <button type="button" onClick={onDuplicate} className="card-still mb-2 ml-1 rounded-md p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground" aria-label={$t('Dupliquer')}>
              <Copy className="size-4" />
            </button>
          </Hint>
        ) : null}
        {editing ? (
          <button type="button" onClick={onRemove} className="card-still mb-2 ml-1 rounded-md p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive" aria-label={$t('Retirer')}>
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>
    )
  }

  if (card.kind === 'separator') {
    return (
      <div className={cn('group relative flex h-full items-center gap-2', editing && 'rounded-lg border border-dashed px-2')}>
        {editing ? <GripVertical className="card-handle size-4 shrink-0 cursor-move text-muted-foreground" /> : null}
        <div className="min-w-0 flex-1 self-stretch">
          <SeparatorView card={card} />
        </div>
        {editing ? <SeparatorStyleButton card={card} onChange={onChange} /> : null}
        {editing ? (
          <Hint label={$t('Dupliquer')}>
            <button type="button" onClick={onDuplicate} className="card-still rounded-md p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground" aria-label={$t('Dupliquer')}>
              <Copy className="size-4" />
            </button>
          </Hint>
        ) : null}
        {editing ? (
          <button type="button" onClick={onRemove} className="card-still rounded-md p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive" aria-label={$t('Retirer')}>
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div
      ref={frameRef}
      // The wave's delay for rising only: the shadow under the pointer stays immediate.
      style={{ ...surface.style, ...(props.revealDelay ? { transitionDelay: `${props.revealDelay}ms, ${props.revealDelay}ms, 0ms` } : {}) }}
      className={cn(
        'theme-card group relative flex h-full flex-col overflow-hidden rounded-[22px] border border-transparent bg-card shadow-[0_1px_2px_rgba(16,24,40,0.03),0_10px_30px_-20px_rgba(16,24,40,0.18)] transition-shadow duration-200 hover:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_40px_-20px_rgba(16,24,40,0.26)] dark:border-border/60',
        // Set off: the brand's colour, softly. Dark: a black card, its contents drawn for it.
        // Not reached yet: low and transparent; reached, it rises into place.
        props.revealed === false && 'translate-y-4 scale-[0.985] opacity-0',
        props.revealed !== undefined && 'transition-[opacity,transform,box-shadow] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
        surface.className,
        editing && 'ring-primary/30 hover:ring-2',
      )}
    >
      {(editing || isQuestion || (title && !['buttons', 'link', 'variable', 'image'].includes(card.kind))) && card.kind !== 'text' ? (
        <div className="flex h-11 shrink-0 items-center gap-2 px-4">
          {editing ? <GripVertical className="card-handle size-4 shrink-0 cursor-move text-muted-foreground" /> : null}
          {editing ? (
            <span className="card-still shrink-0">
              <IconPicker value={card.icon ?? null} onChange={(icon) => onChange({ icon: icon ?? undefined })} size="xs" />
            </span>
          ) : card.icon ? (
            <span className="theme-card-icon flex size-7 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
              <LookIcon name={card.icon} className="size-4" />
            </span>
          ) : null}
          {editing && editingTitle ? (
            <input autoFocus value={card.title ?? title} onChange={(e) => onChange({ title: e.target.value })} onBlur={() => setEditingTitle(false)} className="card-still flex-1 bg-transparent text-[15px] font-semibold outline-none" />
          ) : (
            <h3 className="theme-title min-w-0 flex-1 truncate text-[14.5px] font-semibold tracking-[-0.01em]" onDoubleClick={() => editing && setEditingTitle(true)}>
              {card.question && !publicMode && !editing ? (
                <Link href={`/question/${card.question}`} onClick={() => props.onLeave?.()} className="hover:text-primary hover:underline">
                  {title}
                </Link>
              ) : onEditQuestion ? (
                <button type="button" onClick={onEditQuestion} className="card-still max-w-full truncate text-left hover:text-primary hover:underline">
                  {title}
                </button>
              ) : (
                title
              )}
            </h3>
          )}
          {/* A table's search, here rather than on a line of its own. */}
          {isQuestion ? <div ref={setToolbarSlot} className="card-still flex min-w-0 items-center gap-1.5 empty:hidden" /> : null}
          {editing && card.condition?.rules.length ? (
            <Hint label={`${$t('Affichée si')} ${conditionSummary(card.condition, parameters)}`}>
              <button
                type="button"
                onClick={onCondition}
                className={cn(
                  'card-still inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                  conditionShown === false ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
                )}
              >
                {conditionShown === false ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                {conditionShown === false ? $t('Masquée') : $t('Conditionnelle')}
              </button>
            </Hint>
          ) : null}
          {run.isFetching ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          {talk && !editing ? <CommentsButton comments={talk.comments} annotations={talk.annotations} onAdd={talk.onAdd} onDelete={talk.onDelete} onDeleteAnnotation={talk.onDeleteAnnotation} /> : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="card-still rounded-md p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent data-[state=open]:opacity-100" aria-label={$t('Actions de la carte')}>
                <Ellipsis className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-64 [&_[role=menuitem]]:whitespace-nowrap">
              {/* The card: what one does with it, as one reads it. */}
              <DropdownMenuLabel className={MENU_LABEL}>{$t('Carte')}</DropdownMenuLabel>
              <DropdownMenuGroup>
                {isQuestion ? (
                  <DropdownMenuItem onSelect={() => void run.refetch()}>
                    <RefreshCw /> {$t('Rafraîchir')}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={onFullscreen}>
                  <Maximize2 /> {$t('Agrandir')}
                </DropdownMenuItem>
                {isQuestion && viz.type !== 'table' && viz.type !== 'pivot' ? (
                  <DropdownMenuItem onSelect={() => setAsTable((v) => !v)}>
                    {asTable ? <BarChart3 /> : <Table2 />} {asTable ? $t('Voir le graphique') : $t('Voir en table')}
                  </DropdownMenuItem>
                ) : null}
                {isQuestion ? (
                  <DropdownMenuItem onSelect={() => void copyImage()}>
                    <ImageDown /> {$t('Copier en image')}
                  </DropdownMenuItem>
                ) : null}
                {isQuestion && !publicMode ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Download className="size-4" /> {$t('Exporter les données')}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-44">
                      <DropdownMenuItem onSelect={() => void exportCard('csv')}>
                        <FileText /> CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void exportCard('xlsx')}>
                        <FileSpreadsheet /> Excel (XLSX)
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void exportCard('json')}>
                        <Braces /> JSON
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
              </DropdownMenuGroup>
              {/* The question behind it. */}
              {card.question && !publicMode ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className={MENU_LABEL}>{$t('Question')}</DropdownMenuLabel>
                  <DropdownMenuGroup>
                    <DropdownMenuItem onSelect={() => openQuestion()}>
                      <ExternalLink /> {$t('Ouvrir la question')}
                    </DropdownMenuItem>
                    {onEditQuestion ? (
                      <DropdownMenuItem onSelect={onEditQuestion}>
                        <Pencil /> {$t('Modifier la question')}
                      </DropdownMenuItem>
                    ) : null}
                    {!editing ? (
                      <DropdownMenuItem onSelect={() => setAlerting(true)}>
                        <BellRing /> {$t('Alertes…')}
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuGroup>
                </>
              ) : onEditQuestion ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onEditQuestion}>
                    <Pencil /> {$t('Modifier la question')}
                  </DropdownMenuItem>
                </>
              ) : null}
              {/* While editing: how it behaves. */}
              {editing && (isQuestion || onCondition || ['buttons', 'link', 'variable', 'image', 'summary'].includes(card.kind)) ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className={MENU_LABEL}>{$t('Réglages')}</DropdownMenuLabel>
                  <DropdownMenuGroup>
                    {['buttons', 'link', 'variable', 'image', 'summary'].includes(card.kind) ? (
                      <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                        <Settings2 /> {$t('Réglages…')}
                      </DropdownMenuItem>
                    ) : null}
                    {isQuestion ? (
                      <DropdownMenuItem onSelect={() => setClickOpen(true)}>
                        <MousePointerClick /> {$t('Au clic sur un point…')}
                      </DropdownMenuItem>
                    ) : null}
                    {onCondition ? (
                      <DropdownMenuItem onSelect={onCondition}>
                        <Eye /> {$t('Condition d’affichage…')}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onSelect={() => setStyling(true)}>
                      <Palette /> {$t('Style de la carte…')}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </>
              ) : null}
              {/* Where it sits. */}
              {(onMoveToTab && moveTabs.length > 0) || onMoveElsewhere ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className={MENU_LABEL}>{$t('Déplacer')}</DropdownMenuLabel>
                  <DropdownMenuGroup>
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
                  </DropdownMenuGroup>
                </>
              ) : null}
              {editing ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onSelect={() => setEditingTitle(true)}>
                      <Type /> {$t('Renommer')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={onDuplicate}>
                      <Copy /> {$t('Dupliquer')}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
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
      <div className={cn('card-still relative min-h-0 flex-1', isQuestion ? 'px-3 pb-3' : card.kind === 'filter' || card.kind === 'summary' ? 'flex flex-col gap-2 px-3 pb-3' : ['buttons', 'link', 'variable'].includes(card.kind) ? 'flex flex-col px-3 py-2' : card.kind === 'image' ? 'p-2' : 'p-4')}>
        {card.kind === 'buttons' ? (
          <ButtonsView card={card} parameter={pane?.parameter} value={pane?.value} columnId={pane?.columnId} linked={pane?.linked ?? []} onChange={(v) => pane?.onChange(v)} />
        ) : card.kind === 'variable' ? (
          <VariableView card={card} parameter={pane?.parameter} value={pane?.value} onChange={(v) => pane?.onChange(v)} />
        ) : card.kind === 'link' ? (
          <LinkView card={card} parameters={parameters} values={values} publicMode={publicMode} />
        ) : card.kind === 'image' ? (
          <ImageView card={card} />
        ) : card.kind === 'summary' ? (
          <SummaryView card={card} cards={allCards ?? []} values={values} summarizer={summarizer} dashboardId={props.dashboardId} tick={tick} draft={draft} />
        ) : card.kind === 'filter' ? (
          <>
            {editing ? (
              <Choice
                value={card.parameter ?? ''}
                onValueChange={(v) => onChange({ parameter: v })}
                options={parameters.map((x) => ({ value: x.id, label: filterName(x) }))}
                placeholder={$t('Choisir un filtre')}
                aria-label={$t('Filtre')}
                className="w-full"
              />
            ) : null}
            {!pane?.parameter ? (
              <p className="m-auto max-w-56 text-center text-xs text-muted-foreground">{parameters.length ? $t('Choisissez le filtre que ce volet montre.') : $t('Ajoutez d’abord un filtre au tableau de bord.')}</p>
            ) : pane.parameter.type === 'category' && pane.columnId ? (
              <ValueList
                key={`${pane.parameter.id}:${pane.columnId}`}
                fill
                columnId={pane.columnId}
                linked={pane.linked}
                multiple={pane.parameter.multiple !== false}
                selected={(Array.isArray(pane.value) ? pane.value : pane.value ? [pane.value] : []).map(String)}
                onChange={(v) => pane.onChange(v.length ? v : null)}
              />
            ) : pane.parameter.type === 'category' ? (
              <p className="m-auto max-w-56 text-center text-xs text-muted-foreground">{$t('Reliez ce filtre à une carte : ses valeurs viennent de la colonne qu’il restreint.')}</p>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto">
                <ParameterEditor p={pane.parameter} value={pane.value} linked={pane.linked} onChange={pane.onChange} onPick={pane.onChange} onShare={() => undefined} onDone={() => undefined} />
              </div>
            )}
          </>
        ) : card.kind === 'text' ? (
          editing ? (
            <Textarea value={card.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} className="h-full resize-none text-sm" placeholder={$t('Texte en Markdown ; citez un filtre par son nom, entre doubles accolades : {{Région}}')} />
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
        ) : run.data && (props.revealed === undefined || drawn) ? (
          <DarkSurface.Provider value={surface.dark}>
          <Visualization
            result={run.data}
            viz={asTable ? { ...viz, type: 'table' } : viz}
            compact
            onPointClick={(p) => onPoint(card, p)}
            {...(editing ? {} : { onPointMenu: (p: PointClick) => onPointMenu(card, p, values, title) })}
            {...(selection?.values.length ? { selected: selection.values } : {})}
            persistKey={`card:${props.dashboardId}:${card.id}`}
            exportName={title}
            toolbarSlot={toolbarSlot}
            {...(talk?.annotations.length ? { annotations: talk.annotations } : {})}
          />
          </DarkSurface.Provider>
        ) : (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground/60" />
          </div>
        )}
        {editing && selectedParameter && isQuestion ? <MappingSelect card={card} result={run.data} parameter={selectedParameter} variables={variables} sourceColumns={sourceColumns} sqlCard={sqlCard} onChange={(mappings) => onChange({ mappings })} /> : null}
      </div>
      {clickOpen ? <ClickDialog card={card} open onOpenChange={setClickOpen} onApply={onChange} /> : null}
      {settingsOpen ? (
        <CardSettingsDialog
          card={card}
          open
          onOpenChange={setSettingsOpen}
          parameters={parameters}
          cards={(allCards ?? []).filter((c) => c.kind === 'question')}
          titleOf={(c) => c.title || $t('Carte sans titre')}
          onApply={onChange}
        />
      ) : null}
      {styling ? <CardStyleDialog card={card} onSave={(style) => onChange(style as Partial<DashboardCard>)} onClose={() => setStyling(false)} /> : null}
      {alerting && card.question ? <AlertsDialog question={{ id: card.question, name: question?.name ?? title }} onClose={() => setAlerting(false)} /> : null}
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
  const kind = filterType(parameter.type)
  const Icon = FILTER_ICONS[parameter.type]
  const name = filterName(parameter)
  const share = questions.length ? tied.length / questions.length : 0
  const defaultLabel = valueLabelFor(parameter, parameter.default ?? null)
  return (
    <div className="border-b bg-muted/40 px-6 py-4 text-sm">
      <div className="mb-3 flex items-center gap-3">
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', kind.tone)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{$t('Filtre « {name} »', { name })}</div>
          <div className="truncate text-xs text-muted-foreground">{$t(kind.description)}</div>
        </div>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={onRemove}>
          <Trash2 /> {$t('Supprimer')}
        </Button>
        <Button size="sm" onClick={onClose}>
          {$t('Terminé')}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <section className="space-y-2 rounded-xl border bg-background p-3">
          <StepTitle n={1} title={$t('Son nom')} />
          <Input
            value={parameter.label}
            onChange={(e) => onPatch({ label: e.target.value })}
            placeholder={$t('Ex. {example}', { example: $t(kind.example) })}
            aria-label={$t('Nom du filtre')}
            autoFocus={!parameter.label}
            className="h-8"
          />
          <p className="text-xs text-muted-foreground">{$t('Ce que lit la personne dans la barre des filtres.')}</p>
          {parameter.type === 'category' ? (
            <label htmlFor={`multiple-${parameter.id}`} className="flex items-center gap-2 text-xs">
              <Switch id={`multiple-${parameter.id}`} checked={parameter.multiple !== false} onCheckedChange={(v) => onPatch({ multiple: v })} />
              {$t('Plusieurs valeurs à la fois')}
            </label>
          ) : null}
        </section>

        <section className="space-y-2 rounded-xl border bg-background p-3">
          <StepTitle n={2} title={$t('Les cartes qu’il filtre')} />
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${share * 100}%` }} />
            </div>
            <span className="shrink-0 text-xs tabular-nums">{$t('{count} sur {total}', { count: tied.length, total: questions.length })}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-7" disabled={list.length === 0}>
                  <Link2 /> {$t('Relier toutes les cartes')}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-1">
                <div className="px-2 pt-1.5 pb-2 text-xs text-muted-foreground">{$t('À quelle colonne relier « {label} » sur chaque carte qui l’a ?', { label: name })}</div>
                {list.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => {
                      onMap(new Map(c.cards))
                      setOpen(false)
                      toast.success($tp(c.cards.size, '« {label} » relié à {count} carte.', '« {label} » relié à {count} cartes.', { label: name }))
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
          </div>
          <p className="text-xs text-muted-foreground">
            {list.length === 0 && questions.length ? $t('Aucune colonne commune : choisissez-la sur chaque carte, ci-dessous.') : $t('Ou choisissez la colonne sur chaque carte, ci-dessous.')}
            {unloaded ? ` ${$tp(unloaded, '{count} carte d’un autre onglet : ouvrez-le pour la relier.', '{count} cartes d’autres onglets : ouvrez-les pour les relier.')}` : ''}
          </p>
        </section>

        <section className="space-y-2 rounded-xl border bg-background p-3">
          <StepTitle n={3} title={$t('Sa valeur à l’ouverture')} optional />
          <div className="flex h-8 items-center gap-2 rounded-md border bg-muted/40 px-2.5">
            <span className={cn('flex-1 truncate', defaultLabel ? 'font-medium' : 'text-muted-foreground')}>{defaultLabel || $t('Aucune : tout est affiché')}</span>
            {defaultLabel ? (
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => onPatch({ default: null })} aria-label={$t('Retirer la valeur par défaut')}>
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          <Button size="sm" variant="outline" className="h-7" disabled={!parameterHasValue(current)} onClick={() => onPatch({ default: current })}>
            {$t('Prendre la valeur choisie')}
          </Button>
          <p className="text-xs text-muted-foreground">{$t('Choisissez une valeur dans le filtre, en haut, puis gardez-la ici.')}</p>
        </section>
      </div>
    </div>
  )
}

/** A numbered step of the filter's settings. */
function StepTitle({ n, title, optional }: { n: number; title: string; optional?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold">
      <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[11px] text-primary tabular-nums">{n}</span>
      {title}
      {optional ? <span className="font-normal text-muted-foreground">{$t('facultatif')}</span> : null}
    </div>
  )
}


export interface DashboardViewProps {
  dashboard: Dashboard
  runner: Runner
  editable: boolean
  publicMode?: boolean
  startEditing?: boolean
  onSave?: (d: Pick<Dashboard, 'tabs' | 'cards' | 'parameters'>) => Promise<void>
  toolbar?: React.ReactNode
  /** The page's menu, last of the actions. */
  more?: React.ReactNode
  /** Where the page wants the actions — by its title; without it, they end the filters' bar. */
  actionsSlot?: HTMLElement | null
  autoRefresh?: number | null
  /** Offers the choice of the automatic refresh, as a stopwatch, when given. */
  onAutoRefreshChange?: (seconds: number | null) => void
  /** Opens the editor for a new question of this dashboard, whose card goes to `tab`. */
  onNewQuestion?: (tab: string | null) => void
  /** The tab shown, when the page keeps it (in its address); otherwise kept here. */
  tab?: string | null
  onTabChange?: (tab: string) => void
  /** Being edited, or not: the page around can show it. */
  onEditingChange?: (editing: boolean) => void
  /** How a summary card is written: the assistant, through the API — absent where it cannot be. */
  summarizer?: Summarizer
  /** Filters' values brought by a link from another dashboard, by filter name. */
  initialFilters?: Readonly<Record<string, ParameterValue>>
  /** Back from one of its questions (`?back=1`): the filters and the scroll one left are given back. */
  restoring?: boolean
  /** Filters by identifier, from a link that kept them (`?v=`). */
  startValues?: Readonly<Record<string, ParameterValue | null>>
  /** Told when the grid is scrolled down, and back to its top: the page's head folds. */
  onScrolled?: (scrolled: boolean) => void
  /** Offers the saved views — Qlik's bookmarks — of the dashboard. */
  savedViews?: boolean
  /** Comments on the cards, annotations on the charts — not on a public page. */
  collaborative?: boolean
  /** Moves a card to a tab or another dashboard, on the server. */
  onMoveCard?: (cardId: string, dashboard: string, tab: string | null) => Promise<void>
  /** Told the filters' values as they change — what a print of the dashboard shows. */
  onValuesChange?: (values: Readonly<Record<string, ParameterValue | null>>) => void
  /** A point's rows open as a new question: for whoever is signed in, not on a shared page. */
  records?: boolean
}

export function DashboardView({ dashboard, runner, editable, publicMode = false, startEditing = false, onSave, toolbar, more, actionsSlot, autoRefresh, onAutoRefreshChange, onNewQuestion, tab: tabProp, onTabChange, onMoveCard, onValuesChange, onEditingChange, summarizer, initialFilters, restoring = false, startValues, onScrolled, savedViews = false, collaborative = false, records: readsRecords = false }: DashboardViewProps) {
  const [editing, setEditing] = useState(startEditing && editable)
  useEffect(() => onEditingChange?.(editing), [editing, onEditingChange])
  const [draft, setDraftRaw] = useState({ tabs: dashboard.tabs, cards: dashboard.cards, parameters: dashboard.parameters })
  // Undo and redo while editing: each change keeps the draft before it; a burst of changes — a
  // word typed, a card dragged — is one step.
  type Draft = typeof draft
  const past = useRef<Draft[]>([])
  const future = useRef<Draft[]>([])
  const lastStep = useRef(0)
  const [, setSteps] = useState(0)
  const setDraft = useCallback((next: Draft | ((d: Draft) => Draft)) => {
    setDraftRaw((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      if (value === prev || JSON.stringify(value) === JSON.stringify(prev)) return prev
      const now = Date.now()
      if (now - lastStep.current > 600 || past.current.length === 0) {
        past.current = [...past.current.slice(-99), prev]
        setSteps((n) => n + 1)
      }
      lastStep.current = now
      future.current = []
      return value
    })
  }, [])
  const resetHistory = () => {
    past.current = []
    future.current = []
    setSteps((n) => n + 1)
  }
  const undo = useCallback(() => {
    const prev = past.current.at(-1)
    if (!prev) return
    past.current = past.current.slice(0, -1)
    setDraftRaw((cur) => {
      future.current = [cur, ...future.current]
      return prev
    })
    lastStep.current = 0
    setSteps((n) => n + 1)
  }, [])
  const redo = useCallback(() => {
    const next = future.current[0]
    if (!next) return
    future.current = future.current.slice(1)
    setDraftRaw((cur) => {
      past.current = [...past.current, cur]
      return next
    })
    lastStep.current = 0
    setSteps((n) => n + 1)
  }, [])
  const initialValues = useMemo(() => Object.fromEntries(dashboard.parameters.map((p) => [p.id, p.default ?? null])) as Values, [dashboard.parameters])
  // Back from one of its questions: the filters, the tab and the scroll one left.
  const [restored] = useState(() => (restoring ? takeReturnPoint(dashboard.id) : null))
  // Arrived by a link from another dashboard: its filters, by name, go to the filters of the same name.
  const [values, setValues] = useState<Values>(() => {
    if (restored) return { ...initialValues, ...(restored.values as Values) }
    if (startValues) return { ...initialValues, ...(Object.fromEntries(Object.entries(startValues).filter(([k]) => k in initialValues)) as Values) }
    if (!initialFilters) return initialValues
    const fold = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
    const carried = new Map(Object.entries(initialFilters).map(([k, v]) => [fold(k), v]))
    const out: Values = { ...initialValues }
    for (const p of dashboard.parameters) {
      const v = carried.get(fold(filterName(p))) ?? carried.get(fold(p.id))
      if (v !== undefined) out[p.id] = v
    }
    return out
  })
  useEffect(() => onValuesChange?.(values), [values, onValuesChange])
  const selPast = useRef<Values[]>([])
  const selFuture = useRef<Values[]>([])
  const selLast = useRef(values)
  const selMoving = useRef(false)
  const [, setSelSteps] = useState(0)
  useEffect(() => {
    if (selLast.current === values) return
    if (selMoving.current) selMoving.current = false
    else {
      selPast.current = [...selPast.current.slice(-49), selLast.current]
      selFuture.current = []
    }
    selLast.current = values
    setSelSteps((n) => n + 1)
  }, [values])
  const selectionStep = (back: boolean) => {
    const from = back ? selPast.current : selFuture.current
    const to = back ? selFuture.current : selPast.current
    const next = from.pop()
    if (!next) return
    to.push(values)
    selMoving.current = true
    setValues(next)
    setOrigins({})
  }
  const [tabState, setTabState] = useState<string | null>(dashboard.tabs[0]?.id ?? null)
  const tab = tabProp !== undefined ? tabProp : tabState
  const setTab = (id: string) => {
    if (id === tab) return
    if (onTabChange) onTabChange(id)
    else setTabState(id)
  }
  const router = useRouter()
  const qc = useQueryClient()
  const talking = collaborative && !publicMode
  const commentsKey = ['card-comments', dashboard.id]
  const annotationsKey = ['annotations', 'dashboard', dashboard.id]
  const { data: comments = [] } = useQuery({ queryKey: commentsKey, queryFn: () => api.get<CardComment[]>(`/v1/dashboards/${dashboard.id}/comments`), enabled: talking })
  const { data: annotations = [] } = useQuery({ queryKey: annotationsKey, queryFn: () => api.get<Annotation[]>(`/v1/dashboards/${dashboard.id}/annotations`), enabled: talking })
  const [annotating, setAnnotating] = useState<{ card: DashboardCard; at: string } | null>(null)
  const [tabSettings, setTabSettings] = useState<string | null>(null)
  const [draggedTab, setDraggedTab] = useState<string | null>(null)
  const [dropTab, setDropTab] = useState<{ id: string; after: boolean } | null>(null)
  /**
   * A tab copied just after itself, its cards with it: what they cite of one another (a summary's
   * cards, a text's variables) points at the copies.
   */
  const duplicateTab = (id: string) => {
    const copyId = newId('t')
    setDraft((d) => {
      const source = d.tabs.find((x) => x.id === id)
      if (!source) return d
      const own = d.cards.filter((c) => c.tab === id)
      const ids = new Map(own.map((c) => [c.id, newId('c')]))
      const remap = (x: string) => ids.get(x) ?? x
      const cards = own.map((c) => ({
        ...c,
        id: remap(c.id),
        tab: copyId,
        ...(c.summary ? { summary: { ...c.summary, cards: c.summary.cards.map(remap) } } : {}),
        ...(c.variables ? { variables: c.variables.map((v) => ('card' in v ? { ...v, card: remap(v.card) } : v)) } : {}),
      }))
      const at = d.tabs.findIndex((x) => x.id === id) + 1
      const copy = { ...source, id: copyId, label: $t('{name} (copie)', { name: source.label }) }
      return { ...d, tabs: [...d.tabs.slice(0, at), copy, ...d.tabs.slice(at)], cards: [...d.cards, ...cards] }
    })
    setTab(copyId)
  }
  const removeTab = (id: string) => setDraft((d) => ({ ...d, tabs: d.tabs.filter((x) => x.id !== id), cards: d.cards.filter((c) => c.tab !== id) }))
  /** A tab's menu acts on the draft: outside edit mode, it starts it — saving stays a choice. */
  const tabAction = (act: () => void) => {
    if (!editing) setEditing(true)
    act()
  }
  /** Leaving for a card's question: where one is, to come back to it exactly. */
  const leaveFor = (question: string) =>
    leaveDashboard({ dashboard: dashboard.id, name: dashboard.name, tab: currentTab, values, scroll: containerRef.current?.scrollTop ?? 0, question })
  useEffect(() => {
    if (!restored?.scroll) return
    // Once the cards have their height.
    const t = setTimeout(() => containerRef.current?.scrollTo({ top: restored.scroll }), 700)
    return () => clearTimeout(t)
  }, [restored])
  /** Puts a tab before — or after — another. */
  const moveTab = (id: string, target: string, after: boolean) =>
    setDraft((d) => {
      const moving = d.tabs.find((x) => x.id === id)
      if (!moving || id === target) return d
      const rest = d.tabs.filter((x) => x.id !== id)
      const at = rest.findIndex((x) => x.id === target) + (after ? 1 : 0)
      return { ...d, tabs: [...rest.slice(0, at), moving, ...rest.slice(at)] }
    })
  const talkOf = (card: DashboardCard) =>
    talking && card.kind === 'question'
      ? {
          comments: comments.filter((c) => c.card === card.id),
          annotations: annotations.filter((a) => (card.question ? a.question === card.question : a.dashboard === dashboard.id && a.card === card.id)),
          onAdd: async (body: string) => {
            await api.post(`/v1/dashboards/${dashboard.id}/comments`, { card: card.id, body })
            await qc.invalidateQueries({ queryKey: commentsKey })
          },
          onDelete: async (id: string) => {
            await api.delete(`/v1/dashboards/${dashboard.id}/comments/${id}`)
            await qc.invalidateQueries({ queryKey: commentsKey })
          },
          onDeleteAnnotation: async (id: string) => {
            await api.delete(`/v1/annotations/${id}`)
            await qc.invalidateQueries({ queryKey: annotationsKey })
          },
        }
      : undefined
  const [moving, setMoving] = useState<DashboardCard | null>(null)
  // A saved view: its filters over the defaults, its tab.
  const tabRef = useRef(setTab)
  tabRef.current = setTab
  const applyView = useCallback(
    (v: Values, t: string | null) => {
      setValues({ ...initialValues, ...v })
      setOrigins({})
      if (t) tabRef.current(t)
    },
    [initialValues],
  )
  const [tick, setTick] = useState(0)
  const [fresh, setFresh] = useState(false)
  const [selectedParam, setSelectedParam] = useState<string | null>(null)
  const [addingFilter, setAddingFilter] = useState(false)
  // Which card each click-made selection came from, by filter.
  const [origins, setOrigins] = useState<Record<string, string>>({})
  const [picker, setPicker] = useState(false)
  const [fullscreenCard, setFullscreenCard] = useState<DashboardCard | null>(null)
  const [saving, setSaving] = useState(false)
  const results = useRef(new Map<string, RunResult>())
  const columnIds = useRef(new Map<string, Readonly<Record<string, string>>>())
  const vizs = useRef(new Map<string, Viz>())
  const [, force] = useState(0)
  const { width, containerRef, mounted } = useContainerWidth()
  // Cards reached on screen, in waves: each wave rises left to right, a few dozen ms apart.
  // In edit mode, asked for less motion, or once seen, a card simply is there.
  const [revealed, setRevealed] = useState<ReadonlyMap<string, number>>(() => new Map())
  const still = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  useEffect(() => {
    const grid = containerRef.current
    if (!grid || still) return
    const io = new IntersectionObserver(
      (entries) => {
        const reached = entries
          .filter((e) => e.isIntersecting)
          .map((e) => e.target as HTMLElement)
          .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left)
        if (!reached.length) return
        for (const el of reached) {
          io.unobserve(el)
          if (el.dataset.cardId) seen.add(el.dataset.cardId)
        }
        setRevealed((cur) => {
          const fresh = reached.map((el) => el.dataset.cardId).filter((id): id is string => !!id && !cur.has(id))
          // Nothing new: the same map, so nothing renders again.
          if (!fresh.length) return cur
          const next = new Map(cur)
          fresh.forEach((id, i) => next.set(id, Math.min(i * 70, 560)))
          return next
        })
      },
      { root: grid, rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    )
    // Cards already reached are not watched again: a chart redrawing in one would otherwise
    // set the whole dashboard rendering anew, its charts redrawn, and so on.
    const seen = new Set<string>()
    let queued = 0
    const watch = () => {
      queued = 0
      grid.querySelectorAll<HTMLElement>('[data-card-id]').forEach((el) => {
        if (!seen.has(el.dataset.cardId ?? '')) io.observe(el)
      })
    }
    watch()
    // Cards placed later (a tab opened, the grid measured) are watched too — once a frame at most.
    const mo = new MutationObserver(() => {
      if (!queued) queued = requestAnimationFrame(watch)
    })
    mo.observe(grid, { childList: true, subtree: true })
    return () => {
      io.disconnect()
      mo.disconnect()
      cancelAnimationFrame(queued)
    }
  }, [containerRef, still])
  // A save remounts the dashboard: where one was in the grid is kept for the next one.
  useEffect(() => {
    const grid = containerRef.current
    if (!grid) return
    const kept = KEPT_SCROLL.get(dashboard.id)
    if (kept && Date.now() - kept.at < 5000) {
      KEPT_SCROLL.delete(dashboard.id)
      // The cards take their height as they are placed: try until the grid is tall enough (2 s).
      const until = Date.now() + 2000
      let t = 0
      const tryScroll = () => {
        if (grid.scrollHeight - grid.clientHeight >= kept.top || Date.now() > until) grid.scrollTo({ top: kept.top })
        else t = window.setTimeout(tryScroll, 80)
      }
      t = window.setTimeout(tryScroll, 60)
      const note = () => KEPT_SCROLL.set(dashboard.id, { top: grid.scrollTop, at: Date.now() })
      grid.addEventListener('scroll', note, { passive: true })
      return () => {
        clearTimeout(t)
        grid.removeEventListener('scroll', note)
      }
    }
    // Noted as one scrolls: once the grid is taken off the page, it no longer knows.
    const note = () => KEPT_SCROLL.set(dashboard.id, { top: grid.scrollTop, at: Date.now() })
    grid.addEventListener('scroll', note, { passive: true })
    return () => grid.removeEventListener('scroll', note)
  }, [containerRef, dashboard.id])

  // The grid scrolled down: the page's head folds, to leave the cards the room.
  useEffect(() => {
    const grid = containerRef.current
    if (!grid || !onScrolled) return
    let last = false
    const on = () => {
      const now = grid.scrollTop > 24
      if (now !== last) {
        last = now
        onScrolled(now)
      }
    }
    grid.addEventListener('scroll', on, { passive: true })
    return () => grid.removeEventListener('scroll', on)
  }, [onScrolled, containerRef])

  useEffect(() => {
    if (!editing) {
      setDraftRaw({ tabs: dashboard.tabs, cards: dashboard.cards, parameters: dashboard.parameters })
      past.current = []
      future.current = []
    }
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

  // Whether each conditional card and tab shows, as their probes say; unknown is hidden.
  const [shown, setShown] = useState<Record<string, boolean | undefined>>({})
  const onAnswer = useCallback((id: string, v: boolean | undefined) => setShown((m) => (m[id] === v ? m : { ...m, [id]: v })), [])
  const [conditionOf, setConditionOf] = useState<{ kind: 'card' | 'tab'; id: string } | null>(null)
  const visible = (x: { id: string; condition?: { rules: readonly unknown[] } }) => editing || !x.condition?.rules.length || shown[x.id] === true
  const tabs = draft.tabs.filter(visible)
  const currentTab = tabs.length ? (tabs.some((t) => t.id === tab) ? tab : (tabs[0]?.id ?? null)) : null
  const cards = draft.cards.filter((c) => (draft.tabs.length ? c.tab === currentTab : true)).filter(visible)
  const layout: Layout = cards.map((c) => ({ i: c.id, x: c.x, y: c.y, w: c.w, h: c.h, minW: 2, minH: c.kind === 'heading' ? 1 : 2 }))
  const selectedParameter = draft.parameters.find((p) => p.id === selectedParam) ?? null

  const onResult = useCallback((id: string, r: RunResult, viz: Viz) => {
    const had = results.current.has(id)
    results.current.set(id, r)
    vizs.current.set(id, viz)
    if (!had) force((x) => x + 1)
  }, [])

  const onColumns = useCallback((id: string, cols: Readonly<Record<string, string>>) => {
    const before = JSON.stringify(columnIds.current.get(id) ?? {})
    columnIds.current.set(id, cols)
    if (before !== JSON.stringify(cols)) force((x) => x + 1)
  }, [])

  const columnFor = (paramId: string) => {
    for (const c of draft.cards) {
      const known = columnIds.current.get(c.id)?.[paramId]
      if (known && (c.mappings ?? []).some((m) => m.parameter === paramId)) return known
      const m = (c.mappings ?? []).find((x) => x.parameter === paramId && 'column' in x.target)
      if (!m || !('column' in m.target)) continue
      const target = m.target.column
      const col = results.current.get(c.id)?.columns.find((rc) => rc.source && rc.source.field === target.field && (rc.source.join ?? '') === (target.join ?? ''))
      if (col?.source?.column) return col.source.column
    }
    return undefined
  }

  const setCard = (id: string, patch: Partial<DashboardCard>) => setDraft((d) => ({ ...d, cards: d.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
  // A card just added is brought into view and glows a moment: placed below the others,
  // it would otherwise land out of sight.
  const [landing, setLanding] = useState<string | null>(null)
  const addCards = (items: Omit<DashboardCard, 'x' | 'y' | 'tab'>[]) => {
    setDraft((d) => ({ ...d, cards: [...d.cards, ...placedAfter(d.cards, currentTab, items.map((i) => ({ ...i, tab: currentTab })))] as DashboardCard[] }))
    if (items[0]) setLanding(items[0].id)
  }
  useEffect(() => {
    if (!landing) return
    // The grid slides the card to its place (0.2 s) and grows after it: look once it has.
    const look = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(landing)}"]`)
      if (!el) return
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' })
    }, 250)
    const done = setTimeout(() => setLanding(null), 1900)
    return () => {
      clearTimeout(look)
      clearTimeout(done)
    }
  }, [landing])

  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, undo, redo])

  // While it is edited, what the copilot adds goes to the draft: saving the dashboard behind
  // the draft's back would reload it, and the changes not yet saved would be lost.
  const addRef = useRef(addCards)
  addRef.current = addCards
  useEffect(() => {
    if (!editing) return
    const sink = { id: dashboard.id, add: (cards: readonly Omit<DashboardCard, 'x' | 'y' | 'tab'>[]) => addRef.current([...cards]) }
    useUi.getState().setDashboardDraft(sink)
    return () => {
      if (useUi.getState().dashboardDraft === sink) useUi.getState().setDashboardDraft(null)
    }
  }, [editing, dashboard.id])

  // The filter of the dashboard a point's column is tied to, on that card.
  const parameterFor = (card: DashboardCard, p: PointClick) => {
    const src = p.column.source
    if (!src) return undefined
    const mapping = (card.mappings ?? []).find((m) => 'column' in m.target && m.target.column.field === src.field && (m.target.column.join ?? '') === (src.join ?? ''))
    return mapping ? draft.parameters.find((x) => x.id === mapping.parameter && x.type !== 'temporal_unit') : undefined
  }

  // A click on a point filters the dashboard by it, through the filter tied to that column.
  // A click set to open another dashboard: the value clicked goes to the filter of the same name
  // there — the one tied to the column here, or the column's own name —, with the others chosen.
  const drillTo = (card: DashboardCard, p: PointClick) => {
    const click = card.click
    if (!click?.dashboard) return
    const carried: Record<string, ParameterValue> = click.carry !== false ? carriedFilters(draft.parameters, values) : {}
    for (const point of [{ column: p.column, value: p.value }, ...(p.also ?? [])]) {
      const src = point.column.source
      const mapping = src ? (card.mappings ?? []).find((m) => 'column' in m.target && m.target.column.field === src.field && (m.target.column.join ?? '') === (src.join ?? '')) : undefined
      const param = mapping ? draft.parameters.find((x) => x.id === mapping.parameter) : undefined
      const name = param ? filterName(param) : point.column.label.replace(/ : .*$/, '')
      const value = point.column.unit && (point.column.type === 'date' || point.column.type === 'datetime') ? periodExpression(String(point.value), point.column.unit) : [String(point.value)]
      if (value !== null) carried[name] = value
    }
    const q = new URLSearchParams()
    if (click.tab) q.set('tab', click.tab)
    if (Object.keys(carried).length) q.set('filters', JSON.stringify(carried))
    router.push(`/dashboard/${click.dashboard}${q.size ? `?${q}` : ''}`)
  }

  const onPoint = (card: DashboardCard, p: PointClick) => {
    if (editing) return
    if (card.click?.action === 'dashboard' && card.click.dashboard && !publicMode) return drillTo(card, p)
    if (!p.column.source) return
    const param = parameterFor(card, p)
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
    if (value === null) toast.message($t('Filtre « {label} » retiré.', { label: filterName(param) }))
    else
      toast.success($t('Filtré : {label} = {value}', { label: filterName(param), value: valueLabelFor(param, value) }), {
        ...(param.type === 'category' && param.multiple !== false && !p.additive ? { description: $t('Maj + clic pour ajouter d’autres catégories.') } : {}),
      })
  }

  // A right click on a point: its menu, then perhaps its rows.
  const [menu, setMenu] = useState<{ card: DashboardCard; point: PointClick; values: Values; title: string } | null>(null)
  // The card's question as it was drawn: the filters it is tied to applied, as the kernel does.
  const readRecords = (card: DashboardCard, point: PointClick, values: Values, title: string) =>
    openRecords(point, title || undefined, async () => {
      const query = card.query ?? (card.question ? (await api.get<Question>(`/v1/questions/${card.question}`)).query : null)
      if (!query) throw new Error($t('Carte sans question.'))
      return query.kind === 'builder' ? applyConstraints(query, cardConstraints(card.mappings, draft.parameters, values)) : query
    })

  // The filters a card's clicks chose, and the categories they hold.
  // A filter pane: the filter it shows, read as the bar reads it — its values, the others' scope.
  const paneOf = (card: DashboardCard): FilterPane => {
    const p = draft.parameters.find((x) => x.id === card.parameter)
    return {
      parameter: p,
      value: p ? values[p.id] : undefined,
      columnId: p ? columnFor(p.id) : undefined,
      linked: draft.parameters
        .filter((o) => o.id !== p?.id && o.type === 'category' && Array.isArray(values[o.id]) && (values[o.id] as unknown[]).length > 0 && columnFor(o.id))
        .map((o) => ({ column: columnFor(o.id) as string, values: (values[o.id] as string[]).map(String) })),
      onChange: (v) => {
        if (!p) return
        setValues((x) => ({ ...x, [p.id]: v }))
        setOrigins(({ [p.id]: _, ...rest }) => rest)
      },
    }
  }
  // The values a card runs with: those a click on it chose are not its own filters.
  const selectionValues = (cardId: string): Values => {
    const own = Object.entries(origins)
      .filter(([, c]) => c === cardId)
      .map(([p]) => p)
    return own.length ? Object.fromEntries(Object.entries(values).filter(([k]) => !own.includes(k))) : values
  }
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

  // A filter left without a name keeps that of its kind.
  const named = (d: typeof draft): typeof draft => ({ ...d, parameters: d.parameters.map((p) => (p.label.trim() ? p : { ...p, label: filterName(p) })) })

  /** A card of the copilot's becomes a question of the dashboard, in place, then opens in the editor. */
  const editQuestion = async (card: DashboardCard) => {
    try {
      const q = await api.post<{ id: string }>('/v1/questions', {
        name: card.title?.trim() || $t('Question sans titre'),
        query: card.query,
        visualization: card.visualization ?? { type: 'table' },
        dashboard: dashboard.id,
        card: card.id,
      })
      window.location.assign(`/question/${q.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const save = async () => {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave(named(draft))
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
        await onSave(named(draft))
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
    if (editing && onSave && draftChanged()) await onSave(named(draft))
    await onMoveCard?.(card.id, to, toTab)
  }

  const activeFilters = Object.values(values).filter((v) => parameterHasValue(v)).length

  // What a card added is: a question, a heading, a text, a page, a filter pane.
  const addFilterPane = () => addCards([{ id: newId('c'), kind: 'filter', parameter: (draft.parameters.find((x) => x.type === 'category') ?? draft.parameters[0])?.id ?? '', ...cardSize('filter') }])

  const settingsTab = tabSettings ? draft.tabs.find((t) => t.id === tabSettings) : undefined
  // The open tab is pictured once nothing loads any more — what its preview shows elsewhere.
  const loading = useIsFetching() > 0
  useEffect(() => {
    if (!currentTab || editing || loading) return
    const grid = containerRef.current
    if (!grid) return
    const key = `${dashboard.id}:${currentTab}`
    const timer = setTimeout(() => {
      const shoot = () => void pictureTab(key, grid).catch(() => undefined)
      if ('requestIdleCallback' in window) window.requestIdleCallback(shoot, { timeout: 2000 })
      else shoot()
    }, 1200)
    return () => clearTimeout(timer)
  }, [currentTab, editing, loading, tick, dashboard.id, containerRef])
  // The filters' band: there are filters, views to apply, or filters to add.
  const band = draft.parameters.length > 0 || editing || (savedViews && !publicMode)
  // The dashboard's actions: refresh, the page's own, edit — or, while edited, cancel and save.
  const actions = (
    <div className="flex shrink-0 items-center gap-1.5">
      {editing ? (
        <>
        <span className="mr-1 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          <Pencil className="size-3" /> {$t('Mode modification')}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setDraftRaw({ tabs: dashboard.tabs, cards: dashboard.cards, parameters: dashboard.parameters })
            resetHistory()
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
          <RefreshTimer
            seconds={autoRefresh ?? null}
            since={cycle}
            onRefresh={() => {
              setFresh(true)
              setTick((x) => x + 1)
            }}
            onChange={onAutoRefreshChange}
          />
          {toolbar}
          {editable ? (
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil /> {$t('Modifier')}
            </Button>
          ) : null}
          {more}
        </>
      )}
    </div>
  )

  return (
    <div className="relative flex h-full flex-col">
      {/* Bar: the filters in a band, then — unless the page holds them by its title — the actions; tinted while edited. */}
      {band || !actionsSlot ? (
        <div className={cn('flex flex-wrap items-center gap-2 px-6 py-2.5 transition-colors', editing && 'bg-primary/[0.06]')}>
          {band ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 rounded-2xl bg-card p-1.5 shadow-[0_1px_2px_rgba(16,24,40,0.03),0_8px_24px_-20px_rgba(16,24,40,0.2)] dark:ring-1 dark:ring-border/60">
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
                onReorder={(order) => setDraft((d) => ({ ...d, parameters: order.map((id) => d.parameters.find((p) => p.id === id)).filter((p) => p !== undefined) }))}
              />
            {editing ? (
              <Popover open={addingFilter} onOpenChange={setAddingFilter}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 border border-dashed border-border bg-background/60 hover:bg-background">
                    <ListFilter /> {$t('Filtre')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[23rem] p-1.5">
                  <div className="px-2 pt-1 pb-2">
                    <div className="text-sm font-semibold">{$t('Ajouter un filtre')}</div>
                    <div className="text-xs text-muted-foreground">{$t('Il s’affiche en haut du tableau de bord et restreint, d’un coup, toutes les cartes que vous lui reliez.')}</div>
                  </div>
                  {FILTER_TYPES.map((t) => {
                    const Icon = FILTER_ICONS[t.type]
                    return (
                      <button
                        key={t.type}
                        type="button"
                        onClick={() => {
                          const id = newId('f')
                          setDraft((d) => ({ ...d, parameters: [...d.parameters, { id, label: '', type: t.type, ...(t.type === 'category' ? { multiple: true } : {}), ...(t.type === 'number' ? { operator: 'between' as const } : {}) }] }))
                          setSelectedParam(id)
                          setAddingFilter(false)
                        }}
                        className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent"
                      >
                        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', t.tone)}>
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{$t(t.label)}</span>
                          <span className="block text-xs leading-snug text-muted-foreground">{$t(t.description)}</span>
                        </span>
                      </button>
                    )
                  })}
                </PopoverContent>
              </Popover>
            ) : null}
              <span className="flex-1" />
              {!editing && draft.parameters.length ? (
                <span className="inline-flex items-center">
                  <Hint label={$t('Sélection précédente')}>
                    <span>
                      <button type="button" onClick={() => selectionStep(true)} disabled={!selPast.current.length} className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-35" aria-label={$t('Sélection précédente')}>
                        <ArrowLeft className="size-4" />
                      </button>
                    </span>
                  </Hint>
                  <Hint label={$t('Sélection suivante')}>
                    <span>
                      <button type="button" onClick={() => selectionStep(false)} disabled={!selFuture.current.length} className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-35" aria-label={$t('Sélection suivante')}>
                        <ArrowRight className="size-4" />
                      </button>
                    </span>
                  </Hint>
                </span>
              ) : null}
              {savedViews && !editing && !publicMode ? <SavedViews dashboardId={dashboard.id} values={values} tab={currentTab} onApply={applyView} applyDefault={!initialFilters} /> : null}
              {!editing && activeFilters > 0 ? (
                <Hint label={$t('Réinitialiser les filtres')}>
                  <button
                    type="button"
                    onClick={() => {
                      setValues(initialValues)
                      setOrigins({})
                    }}
                    aria-label={$t('Réinitialiser les filtres')}
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                  >
                    <FilterX className="size-4" />
                    <span className="tabular-nums">{activeFilters}</span>
                  </button>
                </Hint>
              ) : null}
            </div>
          ) : (
            <span className="flex-1" />
          )}
          {actionsSlot ? null : actions}
        </div>
      ) : null}
      {actionsSlot ? createPortal(actions, actionsSlot) : null}

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

      {/* What says whether each conditional card and tab shows: no output of its own. */}
      {draft.cards
        .filter((c) => c.condition?.rules.length && (!draft.tabs.length || c.tab === currentTab))
        .map((c) => (
          <CardCondition key={c.id} card={c} dashboardId={dashboard.id} values={selectionValues(c.id)} tick={tick} fresh={fresh} draft={editing} runner={runner} onAnswer={onAnswer} />
        ))}
      {draft.tabs
        .filter((t) => t.condition?.rules.length)
        .map((t) => (
          <TabCondition key={t.id} id={t.id} condition={t.condition as NonNullable<DashboardTab['condition']>} dashboardId={dashboard.id} values={values} tick={tick} draft={editing} runner={runner} onAnswer={onAnswer} />
        ))}

      {/* Tabs */}
      {tabs.length > 0 || editing ? (
        <TabRow className="items-center gap-1 px-6 py-2">
          {tabs.map((t: DashboardTab) => (
            <div
              key={t.id}
              className={cn(
                'group/tab relative flex items-center rounded-lg transition-all',
                // The open tab: a pill in the brand's green.
                currentTab === t.id ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_-4px_color-mix(in_oklab,var(--primary)_60%,transparent)] [&_button]:text-primary-foreground' : 'hover:bg-background/80',
                draggedTab === t.id && 'opacity-40',
              )}
              {...(editing && tabs.length > 1
                ? {
                    onDragOver: (e: React.DragEvent) => {
                      if (!draggedTab) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      const box = e.currentTarget.getBoundingClientRect()
                      const after = e.clientX > box.left + box.width / 2
                      if (dropTab?.id !== t.id || dropTab.after !== after) setDropTab({ id: t.id, after })
                    },
                    onDrop: (e: React.DragEvent) => {
                      e.preventDefault()
                      if (draggedTab && dropTab && draggedTab !== dropTab.id) moveTab(draggedTab, dropTab.id, dropTab.after)
                      setDraggedTab(null)
                      setDropTab(null)
                    },
                    onDragEnd: () => {
                      setDraggedTab(null)
                      setDropTab(null)
                    },
                  }
                : {})}
            >
              {dropTab?.id === t.id && draggedTab !== t.id ? <span className={cn('pointer-events-none absolute inset-y-2 w-0.5 rounded-full bg-primary', dropTab.after ? '-right-px' : '-left-px')} /> : null}
              {currentTab === t.id && t.color ? <TabMark color={t.color} /> : null}
              {/* The handle: what moves the tab — the tab itself stays a tab to click. */}
              {editing && tabs.length > 1 ? (
                <Hint label={$t('Glissez pour déplacer (ou Alt + flèches)')}>
                  <span
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', t.id)
                      e.dataTransfer.effectAllowed = 'move'
                      const tabBox = e.currentTarget.parentElement
                      if (tabBox) e.dataTransfer.setDragImage(tabBox, 12, tabBox.clientHeight / 2)
                      setDraggedTab(t.id)
                    }}
                    onDragEnd={() => {
                      setDraggedTab(null)
                      setDropTab(null)
                    }}
                    aria-hidden="true"
                    className="-mr-2 ml-0.5 inline-flex cursor-grab items-center rounded p-0.5 text-muted-foreground/60 hover:bg-accent hover:text-foreground active:cursor-grabbing"
                  >
                    <GripVertical className="size-3.5" />
                  </span>
                </Hint>
              ) : null}
              {/* Hovered, a tab shows what it holds; open, it needs no preview. Right-clicked, its menu. */}
              <ContextMenu>
              <Tooltip delayDuration={350}>
                <ContextMenuTrigger asChild disabled={!editing}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setTab(t.id)}
                    onDoubleClick={() => (editing ? setTabSettings(t.id) : undefined)}
                    onKeyDown={(e) => {
                      if (!editing || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
                      e.preventDefault()
                      const i = tabs.findIndex((x) => x.id === t.id)
                      const target = tabs[e.key === 'ArrowLeft' ? i - 1 : i + 1]
                      if (target) moveTab(t.id, target.id, e.key === 'ArrowRight')
                    }}
                    className={cn('px-3 py-1.5 text-[13.5px]', currentTab === t.id ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground', editing && 'pr-1')}
                  >
                    <TabLabel tab={t} className="max-w-64" />
                  </button>
                </TooltipTrigger>
                </ContextMenuTrigger>
                {currentTab !== t.id || t.description ? (
                  <TooltipContent side="bottom" align="start" className="max-w-none border bg-popover p-2 text-popover-foreground shadow-lg">
                    <TabPreview tab={t} cards={draft.cards.filter((c) => c.tab === t.id)} columns={DASHBOARD_COLUMNS} names={!publicMode} shotKey={`${dashboard.id}:${t.id}`} />
                  </TooltipContent>
                ) : null}
              </Tooltip>
              <ContextMenuContent className="w-52">
                <ContextMenuItem onSelect={() => tabAction(() => setTabSettings(t.id))}>
                  <Settings2 /> {$t('Réglages de l’onglet')}
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => tabAction(() => duplicateTab(t.id))}>
                  <Copy /> {$t('Dupliquer l’onglet')}
                </ContextMenuItem>
                {tabs.length > 1 ? (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem className="text-destructive" onSelect={() => tabAction(() => removeTab(t.id))}>
                      <Trash2 /> {$t('Supprimer l’onglet')}
                    </ContextMenuItem>
                  </>
                ) : null}
              </ContextMenuContent>
              </ContextMenu>
              {editing && t.condition?.rules.length ? (
                <Hint label={`${$t('Affiché si')} ${conditionSummary(t.condition, draft.parameters)}`}>
                  <span className="mr-0.5">{shown[t.id] === false ? <EyeOff className="size-3 text-amber-600" /> : <Eye className="size-3 text-violet-600" />}</span>
                </Hint>
              ) : null}
              {editing ? (
                <Hint label={$t('Réglages de l’onglet')}>
                  <button type="button" aria-label={$t('Réglages de l’onglet')} onClick={() => setTabSettings(t.id)} className="mr-1.5 rounded p-0.5 text-muted-foreground opacity-60 hover:bg-accent hover:text-foreground hover:opacity-100 group-hover/tab:opacity-100">
                    <Settings2 className="size-3.5" />
                  </button>
                </Hint>
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
      <div ref={containerRef} className={cn('theme-surface min-h-0 flex-1 overflow-y-auto bg-surface px-6 py-5', editing && 'pb-24')}>
        {cards.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            <EmptyScene variant="dashboard" className="mb-1 w-56" />
            <p className="font-medium text-foreground">{$t('Ce tableau de bord est vide.')}</p>
            {editable ? <p className="-mt-1.5 max-w-sm">{$t('Ajoutez-y des questions : chacune devient une carte, que vous placez et redimensionnez sur la grille.')}</p> : null}
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
              <div key={card.id} data-card-id={card.id} className={cn('rounded-xl', landing === card.id && 'card-landed')}>
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
                  onColumns={onColumns}
                  onPoint={onPoint}
                  onPointMenu={(c, point, v, title) => setMenu({ card: c, point, values: v, title })}
                  {...(editing || still || publicMode ? {} : { revealed: revealed.has(card.id), revealDelay: revealed.get(card.id) ?? 0 })}
                  {...(card.question ? { onLeave: () => leaveFor(card.question as string) } : {})}
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
                  onCondition={() => setConditionOf({ kind: 'card', id: card.id })}
                  {...(card.kind === 'filter' || card.kind === 'buttons' || card.kind === 'variable' ? { pane: paneOf(card) } : {})}
                  {...(card.kind === 'summary' ? { allCards: draft.cards, ...(summarizer ? { summarizer } : {}) } : {})}
                  {...(talkOf(card) ? { talk: talkOf(card) } : {})}
                  conditionShown={card.condition?.rules.length ? shown[card.id] : undefined}
                  publicMode={publicMode}
                  {...(editable && !publicMode && !editing && card.kind === 'question' && card.query && !card.question && dashboard.cards.some((c) => c.id === card.id)
                    ? { onEditQuestion: () => void editQuestion(card) }
                    : {})}
                  {...selectionOf(card.id)}
                />
              </div>
            ))}
          </ReactGridLayout>
        ) : null}
      </div>

      {settingsTab ? (
        <TabSettingsDialog
          tab={settingsTab}
          conditionLabel={settingsTab.condition?.rules.length ? conditionSummary(settingsTab.condition, draft.parameters) : undefined}
          canRemove={tabs.length > 1}
          onSave={(patch) =>
            setDraft((d) => ({
              ...d,
              tabs: d.tabs.map((x) => {
                if (x.id !== settingsTab.id) return x
                const { icon: _i, color: _c, description: _d, ...rest } = x
                return { ...rest, label: patch.label, ...(patch.icon ? { icon: patch.icon } : {}), ...(patch.color ? { color: patch.color } : {}), ...(patch.description ? { description: patch.description } : {}) }
              }),
            }))
          }
          onCondition={() => setConditionOf({ kind: 'tab', id: settingsTab.id })}
          onRemove={() => removeTab(settingsTab.id)}
          onDuplicate={() => duplicateTab(settingsTab.id)}
          onClose={() => setTabSettings(null)}
        />
      ) : null}
      {annotating ? (
        <AnnotateDialog
          at={annotating.at}
          onClose={() => setAnnotating(null)}
          onSave={async (a) => {
            const target = annotating.card.question ? { question: annotating.card.question } : { dashboard: dashboard.id, card: annotating.card.id }
            await api.post('/v1/annotations', { ...target, ...a })
            await qc.invalidateQueries({ queryKey: annotationsKey })
            toast.success($t('Annotation ajoutée.'))
          }}
        />
      ) : null}
      {conditionOf ? (
        <ConditionDialog
          open
          onOpenChange={(o) => !o && setConditionOf(null)}
          title={
            conditionOf.kind === 'tab'
              ? $t('Afficher l’onglet « {name} » si…', { name: draft.tabs.find((t) => t.id === conditionOf.id)?.label ?? '' })
              : $t('Afficher la carte si…')
          }
          condition={conditionOf.kind === 'tab' ? draft.tabs.find((t) => t.id === conditionOf.id)?.condition : draft.cards.find((c) => c.id === conditionOf.id)?.condition}
          parameters={draft.parameters}
          rows={conditionOf.kind === 'card' && draft.cards.find((c) => c.id === conditionOf.id)?.kind === 'question'}
          onApply={(condition) => {
            const { id, kind } = conditionOf
            setDraft((d) =>
              kind === 'tab'
                ? { ...d, tabs: d.tabs.map((t) => (t.id === id ? withCondition(t, condition) : t)) }
                : { ...d, cards: d.cards.map((c) => (c.id === id ? withCondition(c, condition) : c)) },
            )
          }}
        />
      ) : null}

      {/* While editing: what can be added, in a pill floating over the grid, as an editor's toolbar. */}
      {editing ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-4">
          <div role="toolbar" aria-label={$t('Ajouter au tableau de bord')} className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-primary p-1.5 text-primary-foreground shadow-lg shadow-primary/25 ring-1 ring-black/10">
            <span className="px-2.5 text-xs font-medium text-primary-foreground/75">{$t('Ajouter')}</span>
            <AddPill icon={BarChart3} label={$t('Question')} onClick={() => setPicker(true)} primary />
            <span className="mx-1 h-5 w-px bg-primary-foreground/25" />
            <AddPill icon={Heading} label={$t('Titre')} onClick={() => addCards([{ id: newId('c'), kind: 'heading', text: $t('Nouvelle section'), ...cardSize('heading') }])} />
            <AddPill icon={Type} label={$t('Texte')} onClick={() => addCards([{ id: newId('c'), kind: 'text', text: '', ...cardSize('text') }])} />
            <AddPill icon={ListFilter} label={$t('Volet de filtre')} onClick={addFilterPane} disabled={!draft.parameters.length} hint={draft.parameters.length ? undefined : $t('Ajoutez d’abord un filtre au tableau de bord.')} />
            <AddPill icon={MousePointerClick} label={$t('Boutons')} onClick={() => addCards([{ id: newId('c'), kind: 'buttons', parameter: draft.parameters.find((x) => x.type === 'category')?.id ?? '', ...cardSize('buttons') }])} disabled={!draft.parameters.some((x) => x.type === 'category')} hint={draft.parameters.some((x) => x.type === 'category') ? undefined : $t('Ajoutez d’abord un filtre de catégorie.')} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm font-medium hover:bg-primary-foreground/15 data-[state=open]:bg-primary-foreground/15">
                  <Plus className="size-4" /> {$t('Plus')}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-60">
                <DropdownMenuItem onSelect={() => addCards([{ id: newId('c'), kind: 'summary', title: $t('En bref'), summary: { prompt: '', cards: [] }, ...cardSize('summary') }])}>
                  <Sparkles className="text-violet-500" /> {$t('Résumé par l’IA')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => addCards([{ id: newId('c'), kind: 'variable', parameter: draft.parameters.find((x) => x.type === 'number')?.id ?? '', variable: { min: 0, max: 100, step: 1 }, ...cardSize('variable') }])}>
                  <SlidersHorizontal /> {$t('Variable')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => addCards([{ id: newId('c'), kind: 'link', title: $t('Voir le détail'), ...cardSize('link') }])}>
                  <ArrowRightLeft /> {$t('Lien vers un tableau de bord')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => addCards([{ id: newId('c'), kind: 'image', image: { url: '' }, ...cardSize('image') }])}>
                  <ImageIcon /> {$t('Image')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => addCards([{ id: newId('c'), kind: 'separator', separator: { style: 'line' }, ...cardSize('separator') }])}>
                  <Minus /> {$t('Séparateur')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => addCards([{ id: newId('c'), kind: 'embed', title: $t('Page intégrée'), url: '', ...cardSize('embed') }])}>
                  <Link2 /> {$t('Intégration')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="mx-1 h-5 w-px bg-primary-foreground/25" />
            <Hint label={`${$t('Annuler')} (Ctrl+Z)`}>
              <button type="button" onClick={undo} disabled={!past.current.length} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-primary-foreground/15 disabled:pointer-events-none disabled:opacity-40" aria-label={$t('Annuler la dernière modification')}>
                <Undo2 className="size-4" />
              </button>
            </Hint>
            <Hint label={`${$t('Rétablir')} (Ctrl+Maj+Z)`}>
              <button type="button" onClick={redo} disabled={!future.current.length} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-primary-foreground/15 disabled:pointer-events-none disabled:opacity-40" aria-label={$t('Rétablir la modification annulée')}>
                <Redo2 className="size-4" />
              </button>
            </Hint>
          </div>
        </div>
      ) : null}

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
      {menu ? (
        <PointMenu point={menu.point} onClose={() => setMenu(null)}>
          {readsRecords && recordPicks(menu.point) ? (
            <DropdownMenuItem onSelect={() => readRecords(menu.card, menu.point, menu.values, menu.title)}>
              <Rows3 /> {$t('Voir les enregistrements')}
            </DropdownMenuItem>
          ) : null}
          {parameterFor(menu.card, menu.point) ? (
            <DropdownMenuItem onSelect={() => onPoint(menu.card, { ...menu.point, additive: false })}>
              <FilterIcon /> {$t('Filtrer le tableau de bord sur cette valeur')}
            </DropdownMenuItem>
          ) : null}
          {talking && dayOf(menu.point) ? (
            <DropdownMenuItem onSelect={() => setAnnotating({ card: menu.card, at: dayOf(menu.point) as string })}>
              <Flag /> {$t('Annoter ce point…')}
            </DropdownMenuItem>
          ) : null}
        </PointMenu>
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
