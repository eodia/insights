'use client'

import type { ResultColumn, Visualization as Viz, VisualizationSettings } from '@eodia/contracts'
import { ruleColor } from '@eodia/contracts'
import { EChart } from '@/components/app/echart'
import type { ECElementEvent } from 'echarts'
import { EmptyScene } from '@/components/app/empty-scene'
import { LookIcon } from '@/components/app/look'
import type { RunResult } from '@/lib/api'
import { LOOK_CLASSES, formatCount, formatValue } from '@/lib/format'
import { $t, $tp, intlLocale } from '@/lib/i18n'
import { type ChartModel, OTHER_CATEGORY, type Result, VIZ_LABELS, chartOption, roles, withTemporalUnits } from '@/lib/viz'
import { type PivotAxes, axesOf, pivotModel } from '@/lib/pivot'
import { PivotAxisHeader } from '@/components/app/pivot-axis'
import { useChartTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import type { LookColor } from '@eodia/contracts'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, Download, Minus, RotateCcw, Search } from 'lucide-react'
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { type ColumnFilter, HeaderCell, Pager, exportTable, fold, keepsRow, useTableLayout } from '@/components/app/table-parts'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Hint } from '@/components/ui/tooltip'

export interface PointClick {
  readonly column: ResultColumn
  readonly value: unknown
  /** The point's other values: the series of a chart split in two, the other groupings of a row. */
  readonly also?: readonly { readonly column: ResultColumn; readonly value: unknown }[]
  readonly at: { x: number; y: number }
  /** Shift, Ctrl or ⌘ held: the value adds to (or leaves) the selection rather than replace it. */
  readonly additive: boolean
}

const FADED = 0.28

/** The chart with the categories not chosen faded: bars and slices, not lines. */
function withSelection(model: ChartModel, chosen: ReadonlySet<string>): ChartModel {
  const on = (v: unknown) => chosen.has(v === null || v === undefined ? '∅' : String(v))
  const series = (Array.isArray(model.option.series) ? model.option.series : model.option.series ? [model.option.series] : []) as Record<string, unknown>[]
  const faded = series.map((s) => {
    const data = s.data as unknown[] | undefined
    if (!Array.isArray(data)) return s
    if (s.type === 'pie' || s.type === 'funnel') {
      return { ...s, data: data.map((d) => { const item = d as { raw?: unknown; itemStyle?: object }; return on(item.raw) ? item : { ...item, itemStyle: { ...item.itemStyle, opacity: FADED } } }) }
    }
    if (s.type !== 'bar' || !model.categories) return s
    return {
      ...s,
      data: data.map((d, j) => {
        if (on(model.categories?.[j])) return d
        const item = d !== null && typeof d === 'object' && 'value' in (d as object) ? (d as { value: unknown; itemStyle?: object }) : { value: d }
        return { ...item, itemStyle: { ...item.itemStyle, opacity: FADED } }
      }),
    }
  })
  return { ...model, option: { ...model.option, series: faded as never } }
}

function useDark(): boolean {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const el = document.documentElement
    const update = () => setDark(el.classList.contains('dark'))
    update()
    const obs = new MutationObserver(update)
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

const NO_SETTINGS: VisualizationSettings = {}

export function Visualization({
  result: given,
  viz,
  onPointClick,
  onPointMenu,
  compact = false,
  selected,
  persistKey,
  onSettingsChange,
  exportName,
}: {
  result: RunResult | Result
  viz: Viz
  /** A table: where this browser keeps its widths and order. */
  persistKey?: string
  /** A table whose question can be changed here: its moved columns change its order. */
  onSettingsChange?: (patch: Partial<VisualizationSettings>) => void
  /** A table: the name of its exported files. */
  exportName?: string
  onPointClick?: (p: PointClick) => void
  /** A right click on a point, or on a row of a grouped table. */
  onPointMenu?: (p: PointClick) => void
  compact?: boolean
  /** Categories chosen by clicks on this chart: the others fade, still there to be added. */
  selected?: readonly string[]
}) {
  const dark = useDark()
  const chartTheme = useChartTheme()
  // Dates a SQL query left without their grain read at it — months as months, not « 00:00 ».
  const result = useMemo(() => withTemporalUnits(given), [given])
  // A card that chose no palette takes its theme's.
  // The same empty settings from one render to the next: a new `{}` would rebuild — and replay — the chart.
  const own = (viz.settings ?? NO_SETTINGS) as VisualizationSettings
  const settings = useMemo(
    () => (!own.scheme && chartTheme.scheme ? { ...own, scheme: chartTheme.scheme, ...(chartTheme.colors ? { colors: chartTheme.colors } : {}) } : own),
    [own, chartTheme.scheme, chartTheme.colors],
  )
  const model = useMemo(() => {
    if (['table', 'scalar', 'trend', 'progress', 'pivot', 'map'].includes(viz.type)) return null
    const m = chartOption(viz.type, result, settings, { dark, ...(chartTheme.font ? { font: chartTheme.font } : {}), ...(chartTheme.still ? { animation: false } : {}), ...(chartTheme.barFill ? { barFill: chartTheme.barFill } : {}), ...(chartTheme.barRadius !== undefined ? { barRadius: chartTheme.barRadius } : {}) })
    return m && selected?.length && m.clickColumn ? withSelection(m, new Set(selected)) : m
  }, [viz.type, result, settings, dark, selected, chartTheme.font, chartTheme.still, chartTheme.barFill, chartTheme.barRadius])

  if (result.rows.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-1.5 p-3 text-center">
        <EmptyScene variant="no-rows" className="h-auto max-h-[62%] min-h-0 w-40" />
        <p className="text-sm font-medium text-foreground">{$t('Aucun résultat')}</p>
        {compact ? null : <p className="max-w-xs text-xs text-muted-foreground">{$t('La requête n’a trouvé aucune ligne : un filtre est peut-être trop étroit.')}</p>}
      </div>
    )
  }
  switch (viz.type) {
    case 'table':
      return (
        <DataTable
          result={result}
          settings={settings}
          looks={'looks' in result ? (result as RunResult).looks : undefined}
          onRowMenu={onPointMenu}
          {...(persistKey ? { persistKey } : {})}
          {...(onSettingsChange ? { onSettingsChange } : {})}
          {...(exportName ? { exportName } : {})}
        />
      )
    case 'scalar':
      return <Scalar result={result} settings={settings} compact={compact} />
    case 'trend':
      return <Trend result={result} settings={settings} />
    case 'progress':
      return <Progress result={result} settings={settings} />
    case 'pivot':
      return <Pivot result={result} settings={settings} />
    case 'map':
      return <MapPoints result={result} dark={dark} />
  }
  if (!model) {
    return <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">{$t('Ce résultat ne se prête pas à cette visualisation : il faut au moins une dimension et une mesure.')}</div>
  }
  if (viz.type === 'line_race') return <Replay option={model.option} label={$t(VIZ_LABELS.line_race)} />
  // The values a mark stands for; none for « Autres » or a forecast period, which have no rows.
  const pointOf = (e: ECElementEvent): PointClick | null => {
    const col = model.clickColumn
    if (!col) return null
    const index = e.dataIndex
    const raw = model.categories ? model.categories[index] : (e.data as { raw?: unknown })?.raw
    if (raw === OTHER_CATEGORY || (e.data as { key?: string })?.key === '__other__') return null
    if (model.forecastFrom !== undefined && index >= model.forecastFrom) return null
    const series = model.split && e.seriesIndex !== undefined ? model.split.values[e.seriesIndex] : undefined
    const native = e.event?.event as unknown as MouseEvent | undefined
    return {
      column: col,
      value: raw,
      ...(model.split && series !== undefined && series !== OTHER_CATEGORY ? { also: [{ column: model.split.column, value: series }] } : {}),
      at: { x: native?.clientX ?? 0, y: native?.clientY ?? 0 },
      additive: !!(native?.shiftKey || native?.ctrlKey || native?.metaKey),
    }
  }
  const handle = (to: ((p: PointClick) => void) | undefined) =>
    to && model.clickColumn
      ? (e: ECElementEvent) => {
          const p = pointOf(e)
          if (p) to(p)
        }
      : undefined
  const onClick = handle(onPointClick)
  const onContextMenu = handle(onPointMenu)
  // Beside the marks of an axis, the period under the pointer: its every series at once.
  const onAxisContextMenu =
    onPointMenu && model.clickColumn && model.categories
      ? (index: number, at: { x: number; y: number }) => {
          const value = model.categories?.[index]
          if (value === undefined || value === OTHER_CATEGORY || (model.forecastFrom !== undefined && index >= model.forecastFrom)) return
          onPointMenu({ column: model.clickColumn as ResultColumn, value, at, additive: false })
        }
      : undefined
  return (
    <EChart
      option={model.option}
      label={VIZ_LABELS[viz.type] ? $t(VIZ_LABELS[viz.type]) : viz.type}
      {...(onClick ? { onClick } : {})}
      {...(onContextMenu ? { onContextMenu } : {})}
      {...(onAxisContextMenu ? { onAxisContextMenu } : {})}
    />
  )
}

/** A race of lines plays once; the button draws it again. */
function Replay({ option, label }: { option: ChartModel['option']; label: string }) {
  const [round, setRound] = useState(0)
  return (
    <div className="relative size-full">
      <EChart key={round} option={option} label={label} />
      <button
        type="button"
        onClick={() => setRound((r) => r + 1)}
        className="absolute top-1 right-1 flex items-center gap-1 rounded-md border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur hover:text-foreground"
      >
        <RotateCcw className="size-3" /> {$t('Rejouer')}
      </button>
    </div>
  )
}

// ── Nombre, tendance, progression ───────────────────────────────────────────

function firstMetric(result: Result, settings: VisualizationSettings) {
  const { metrics } = roles(result, settings)
  const m = metrics[0] ?? result.columns.find((c) => c.type === 'number') ?? result.columns[0]
  return m ? { col: m, index: result.columns.indexOf(m) } : null
}

function Scalar({ result, settings, compact }: { result: Result; settings: VisualizationSettings; compact: boolean }) {
  const m = firstMetric(result, settings)
  if (!m) return null
  const value = result.rows[0]?.[m.index]
  const color = ruleColor(settings.rules, undefined, value) ?? settings.color
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center">
      <div
        className={cn('font-semibold tracking-tight tabular-nums', compact ? 'text-3xl' : 'text-5xl')}
        style={color ? { color } : undefined}
        title={formatValue(value, m.col)}
      >
        {formatValue(value, m.col, { compact: settings.compact ?? (typeof value === 'number' && Math.abs(value) >= 1e7), decimals: settings.decimals ?? null, prefix: settings.prefix, suffix: settings.suffix })}
      </div>
      {settings.caption ? <div className="text-sm text-muted-foreground">{settings.caption}</div> : null}
    </div>
  )
}

/** A small curve of the whole series, its last point marked: where the number comes from. */
function Spark({ values, kind, className }: { values: readonly number[]; kind: 'area' | 'line' | 'bars'; className?: string }) {
  const id = useId()
  const w = 120
  const h = 40
  const pad = 3
  const finite = values.filter(Number.isFinite)
  if (finite.length < 2) return null
  const lo = Math.min(...finite)
  const hi = Math.max(...finite)
  const span = hi - lo || 1
  const x = (i: number) => pad + (i * (w - 2 * pad)) / Math.max(values.length - 1, 1)
  const y = (v: number) => h - pad - ((v - lo) / span) * (h - 2 * pad)
  if (kind === 'bars') {
    const bw = Math.max(1.5, ((w - 2 * pad) / values.length) * 0.6)
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" aria-hidden="true">
        {values.map((v, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: one bar per period, in order
          <rect key={i} x={x(i) - bw / 2} y={y(v)} width={bw} height={Math.max(1, h - pad - y(v))} rx={1} fill="currentColor" opacity={i === values.length - 1 ? 1 : 0.45} />
        ))}
      </svg>
    )
  }
  // A smooth path through the points (Catmull-Rom as Bézier curves).
  const pts = values.map((v, i) => [x(i), y(v)] as const)
  let d = `M${pts[0]?.[0]},${pts[0]?.[1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    if (!p0 || !p1 || !p2 || !p3) continue
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`
  }
  const last = pts[pts.length - 1] as readonly [number, number]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden="true">
      {kind === 'area' ? (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d} L${last[0]},${h} L${pts[0]?.[0]},${h} Z`} fill={`url(#${id})`} />
        </>
      ) : null}
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill="currentColor" />
    </svg>
  )
}

function Trend({ result, settings }: { result: Result; settings: VisualizationSettings }) {
  const { dims } = roles(result, settings)
  const m = firstMetric(result, settings)
  if (!m || result.rows.length === 0) return null
  const rows = result.rows
  const last = Number(rows[rows.length - 1]?.[m.index])
  const prev = rows.length > 1 ? Number(rows[rows.length - 2]?.[m.index]) : null
  const change = prev !== null && prev !== 0 ? (last - prev) / Math.abs(prev) : null
  const good = change === null ? null : settings.invert ? change < 0 : change > 0
  const d = dims[0]
  const period = d ? formatValue(rows[rows.length - 1]?.[result.columns.indexOf(d)], d) : ''
  const prevPeriod = d && rows.length > 1 ? formatValue(rows[rows.length - 2]?.[result.columns.indexOf(d)], d) : ''
  const kind = settings.spark ?? 'area'
  const series = rows.slice(-36).map((r) => Number(r[m.index]))
  const tone = change === null || change === 0 ? 'text-primary' : good ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'
  const spark = kind !== 'none' && series.length >= 2
  const delta =
    change !== null ? (
      <div className="flex flex-wrap items-center gap-x-1 text-sm">
        <span className={cn('flex items-center gap-0.5 font-medium', change === 0 ? 'text-muted-foreground' : tone)}>
          {change > 0 ? <ArrowUp className="size-3.5" /> : change < 0 ? <ArrowDown className="size-3.5" /> : <Minus className="size-3.5" />}
          {new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 1 }).format(Math.abs(change))}
        </span>
        <span className="text-muted-foreground">{$t('vs {period} · {value}', { period: prevPeriod, value: formatValue(prev, m.col, { compact: true }) })}</span>
      </div>
    ) : null
  if (!spark) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 px-3 text-center">
        <div className="text-4xl font-semibold tracking-tight tabular-nums">{formatValue(last, m.col, { compact: Math.abs(last) >= 1e6 })}</div>
        {delta}
        {period ? <div className="text-xs text-muted-foreground">{period}</div> : null}
      </div>
    )
  }
  // The number on the left, its curve on the right, the change beneath — a key-figure card.
  return (
    <div className="@container flex h-full flex-col justify-center gap-1 px-1">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 truncate text-2xl font-semibold tracking-tight tabular-nums @[16rem]:text-3xl">{formatValue(last, m.col, { compact: Math.abs(last) >= 1e4 })}</div>
        <Spark values={series} kind={kind} className={cn('h-10 w-2/5 max-w-40 shrink-0', tone)} />
      </div>
      {change !== null ? (
        <div className="flex min-w-0 items-center gap-1 text-xs">
          <span className={cn('flex shrink-0 items-center gap-0.5 font-medium', change === 0 ? 'text-muted-foreground' : tone)}>
            {change > 0 ? '+' : change < 0 ? '−' : ''}
            {new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 1 }).format(Math.abs(change))}
          </span>
          <span className="truncate text-muted-foreground">{$t('vs {period}', { period: prevPeriod })}</span>
        </div>
      ) : period ? (
        <div className="text-xs text-muted-foreground">{period}</div>
      ) : null}
    </div>
  )
}

function Progress({ result, settings }: { result: Result; settings: VisualizationSettings }) {
  const m = firstMetric(result, settings)
  if (!m) return null
  const value = Number(result.rows[0]?.[m.index]) || 0
  const goal = settings.goal ?? settings.max ?? 100
  const ratio = goal > 0 ? value / goal : 0
  return (
    <div className="flex h-full flex-col justify-center gap-2 px-5">
      <div className="flex items-baseline justify-between">
        <span className="text-3xl font-semibold tabular-nums">{formatValue(value, m.col, { compact: true })}</span>
        <span className="text-sm text-muted-foreground">
          {$t('objectif {goal}', { goal: formatValue(goal, m.col, { compact: true }) })}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(ratio, 1) * 100}%`, background: settings.color ?? (ratio >= 1 ? '#0ca30c' : 'var(--primary)') }} />
      </div>
      <div className="text-xs text-muted-foreground">{new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 0 }).format(ratio)}</div>
    </div>
  )
}

function MapPoints({ result, dark }: { result: Result; dark: boolean }) {
  const lat = result.columns.findIndex((c) => c.semantic === 'latitude')
  const lon = result.columns.findIndex((c) => c.semantic === 'longitude')
  const option = useMemo(
    () => ({
      grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
      tooltip: { trigger: 'item' as const },
      xAxis: { type: 'value' as const, scale: true, axisLabel: { show: false }, splitLine: { lineStyle: { color: dark ? '#27272a' : '#f1f1f3' } } },
      yAxis: { type: 'value' as const, scale: true, axisLabel: { show: false }, splitLine: { lineStyle: { color: dark ? '#27272a' : '#f1f1f3' } } },
      series: [{ type: 'scatter' as const, symbolSize: 6, itemStyle: { color: dark ? '#3987e5' : '#2a78d6', opacity: 0.6 }, data: result.rows.map((r) => [Number(r[lon]), Number(r[lat])]) }],
    }),
    [result, lat, lon, dark],
  )
  return <EChart option={option} label={$t('Carte')} />
}

// ── Tableau ─────────────────────────────────────────────────────────────────

type Looks = RunResult['looks']

export function ValueCell({ value, col, looks }: { value: unknown; col: ResultColumn; looks?: Looks }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground/50">—</span>
  const look = col.source?.column ? looks?.[col.source.column]?.find((l) => l.value === String(value)) : undefined
  if (look && (look.color || look.icon || look.label)) {
    return (
      <span className={cn('inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium', LOOK_CLASSES[(look.color as LookColor) ?? 'gray'])}>
        {look.icon ? <LookIcon name={look.icon} className="size-3" /> : null}
        {look.label || String(value)}
      </span>
    )
  }
  if (col.semantic === 'image_url' || col.semantic === 'avatar_url') {
    // biome-ignore lint/performance/noImgElement: arbitrary remote images from the data
    return <img src={String(value)} alt="" className={cn('size-7 object-cover', col.semantic === 'avatar_url' ? 'rounded-full' : 'rounded')} loading="lazy" />
  }
  if (col.semantic === 'url') {
    return (
      <a href={String(value)} target="_blank" rel="noreferrer" className="text-primary hover:underline">
        {String(value)}
      </a>
    )
  }
  if (col.semantic === 'email') {
    return <span className="text-foreground">{String(value)}</span>
  }
  return <>{formatValue(value, col)}</>
}

export function DataTable({
  result,
  settings = {},
  looks,
  className,
  onCellClick,
  onRowMenu,
  persistKey,
  onSettingsChange,
  exportName,
}: {
  result: Result
  settings?: VisualizationSettings
  looks?: Looks
  className?: string
  onCellClick?: (col: ResultColumn, value: unknown, at: { x: number; y: number }) => void
  /** A right click on a row of a grouped result: its groupings, the one clicked first. */
  onRowMenu?: (p: PointClick) => void
  /** Where this browser keeps the table's widths and order (a question, a card); none: forgotten. */
  persistKey?: string
  /** The question's settings, when they can be changed here: a column moved changes its order. */
  onSettingsChange?: (patch: Partial<VisualizationSettings>) => void
  /** The name its exported files take. */
  exportName?: string
}) {
  const parent = useRef<HTMLDivElement>(null)
  const [sort, setSort] = useState<{ index: number; desc: boolean } | null>(null)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({})
  const [page, setPage] = useState(0)
  const { layout, setWidth, setOrder, reset, custom } = useTableLayout(persistKey)
  const toolbar = settings.table_toolbar !== false
  const label = (c: ResultColumn) => settings.column_labels?.[c.name] || c.label

  const columns = useMemo(() => {
    const visible = result.columns.map((c, i) => ({ c, i })).filter(({ c }) => !c.hidden)
    const chosen = settings.columns?.length ? settings.columns.map((n) => visible.find((v) => v.c.name === n)).filter((v): v is { c: ResultColumn; i: number } => !!v) : visible
    // The order this browser gave, where the question's own cannot be changed from here.
    if (onSettingsChange || !layout.order) return chosen
    const at = new Map(layout.order.map((n, k) => [n, k]))
    return [...chosen].sort((a, b) => (at.get(a.c.name) ?? Number.MAX_SAFE_INTEGER) - (at.get(b.c.name) ?? Number.MAX_SAFE_INTEGER))
  }, [result.columns, settings.columns, layout.order, onSettingsChange])

  const moveColumn = (dragged: string, before: string) => {
    const names = columns.map(({ c }) => c.name).filter((n) => n !== dragged)
    names.splice(names.indexOf(before), 0, dragged)
    if (onSettingsChange) onSettingsChange({ columns: names })
    else setOrder(names)
  }

  const rows = useMemo(() => {
    let list: readonly (readonly unknown[])[] = result.rows
    const active = Object.entries(filters)
    if (active.length) {
      const at = active.map(([name, f]) => ({ f, i: result.columns.findIndex((c) => c.name === name) })).filter((x) => x.i >= 0)
      list = list.filter((r) => at.every(({ f, i }) => keepsRow(f, r[i], result.columns[i] as ResultColumn)))
    }
    const q = fold(deferredSearch.trim())
    if (q) list = list.filter((r) => columns.some(({ c, i }) => fold(formatValue(r[i], c)).includes(q)))
    if (sort) {
      list = [...list].sort((a, b) => {
        const x = a[sort.index]
        const y = b[sort.index]
        if (x === y) return 0
        if (x === null || x === undefined) return 1
        if (y === null || y === undefined) return -1
        const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), intlLocale(), { numeric: true })
        return sort.desc ? -cmp : cmp
      })
    }
    return list
  }, [result.rows, result.columns, filters, deferredSearch, columns, sort])
  // A new filter, search or order starts back at the first page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the page follows the rows
  useEffect(() => setPage(0), [rows])

  const paged = settings.pagination !== 'scroll'
  const pageSize = Math.max(10, Math.min(settings.page_size ?? 100, 5000))
  const pages = paged ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1
  const current = Math.min(page, pages - 1)
  const shown = paged ? rows.slice(current * pageSize, (current + 1) * pageSize) : rows
  const offset = paged ? current * pageSize : 0

  const maxes = useMemo(() => {
    const out = new Map<number, number>()
    for (const name of settings.cell_bars ?? []) {
      const i = result.columns.findIndex((c) => c.name === name)
      if (i >= 0) out.set(i, Math.max(...result.rows.map((r) => Math.abs(Number(r[i]) || 0)), 1))
    }
    return out
  }, [result, settings.cell_bars])
  const totals = useMemo(() => {
    if (!settings.totals_row) return null
    return columns.map(({ c, i }) => (c.type === 'number' && !c.unit ? rows.reduce((s, r) => s + (Number(r[i]) || 0), 0) : null))
  }, [settings.totals_row, columns, rows])
  const groupings = useMemo(() => result.columns.map((c, i) => ({ c, i })).filter(({ c }) => c.role === 'dimension'), [result.columns])
  const density = settings.density ?? 'normal'
  const rowHeight = density === 'compact' ? 30 : density === 'comfortable' ? 44 : 36
  const wrap = settings.wrap_text === true
  const virtualizer = useVirtualizer({ count: shown.length, getScrollElement: () => parent.current, estimateSize: () => rowHeight, overscan: 12 })
  const filtered = Object.keys(filters).length > 0 || deferredSearch.trim() !== ''
  const exported = columns.map(({ c, i }) => ({ col: c, label: label(c), index: i }))
  const freeze = settings.freeze_first === true

  return (
    <div className={cn('flex h-full min-h-0 flex-col text-sm', className)}>
      {toolbar ? (
        <div className="flex shrink-0 items-center gap-2 px-1 pb-1.5">
          <div className="relative w-56 max-w-[50%]">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={$t('Rechercher…')} className="h-7 pl-7 text-xs" aria-label={$t('Rechercher dans la table')} />
          </div>
          {filtered ? (
            <>
              <span className="text-xs text-muted-foreground tabular-nums">{$t('{kept} sur {all}', { kept: formatCount(rows.length), all: formatCount(result.rows.length) })}</span>
              <button
                type="button"
                onClick={() => {
                  setFilters({})
                  setSearch('')
                }}
                className="text-xs text-primary hover:underline"
              >
                {$t('Effacer les filtres')}
              </button>
            </>
          ) : null}
          <span className="flex-1" />
          {custom && !onSettingsChange ? (
            <Hint label={$t('Largeurs et ordre des colonnes d’origine')}>
              <button type="button" onClick={reset} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={$t('Réinitialiser la mise en page')}>
                <RotateCcw className="size-3.5" />
              </button>
            </Hint>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                <Download className="size-3.5" /> {$t('Exporter')}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void exportTable('csv', exportName ?? '', exported, rows).catch(exportFailed)}>{$t('CSV')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportTable('xlsx', exportName ?? '', exported, rows).catch(exportFailed)}>{$t('Excel (.xlsx)')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
      <div ref={parent} className="relative min-h-0 flex-1 overflow-auto">
        <table className="w-max min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-background">
            <tr>
              {settings.row_numbers ? <th className="w-10 border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground">#</th> : null}
              {columns.map(({ c, i }, k) => (
                <HeaderCell
                  key={c.name}
                  col={c}
                  label={label(c)}
                  numeric={c.type === 'number' && !c.unit}
                  sort={sort?.index === i ? (sort.desc ? 'desc' : 'asc') : null}
                  onSort={() => setSort((s) => (s?.index === i ? (s.desc ? null : { index: i, desc: true }) : { index: i, desc: false }))}
                  width={layout.widths[c.name]}
                  onWidth={(w) => setWidth(c.name, w)}
                  onDrop={(dragged) => moveColumn(dragged, c.name)}
                  values={result.rows.map((r) => r[i])}
                  filter={filters[c.name]}
                  onFilter={(f) =>
                    setFilters((x) => {
                      const next = { ...x }
                      if (f) next[c.name] = f
                      else delete next[c.name]
                      return next
                    })
                  }
                  sticky={freeze && k === 0}
                  filters={toolbar}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {virtualizer.getVirtualItems().length > 0 ? <tr style={{ height: virtualizer.getVirtualItems()[0]?.start ?? 0 }} /> : null}
            {virtualizer.getVirtualItems().map((v) => {
              const row = shown[v.index] as readonly unknown[]
              const rowColor = (settings.rules ?? []).filter((r) => r.row).map((r) => ruleColor([r], r.column, row[result.columns.findIndex((c) => c.name === r.column)])).find(Boolean)
              const stripe = settings.zebra && (offset + v.index) % 2 === 1
              return (
                <tr
                  key={v.key}
                  data-index={v.index}
                  ref={wrap ? virtualizer.measureElement : undefined}
                  style={{ ...(wrap ? { minHeight: rowHeight } : { height: rowHeight }), ...(rowColor ? { background: `${rowColor}1f` } : {}) }}
                  className={cn('hover:bg-muted/50', stripe && 'bg-muted/30')}
                >
                  {settings.row_numbers ? <td className="border-b px-3 text-right text-xs text-muted-foreground tabular-nums">{offset + v.index + 1}</td> : null}
                  {columns.map(({ c, i }, k) => {
                    const value = row[i]
                    const numeric = c.type === 'number' && !c.unit
                    const color = (settings.rules ?? []).filter((r) => !r.row && r.column === c.name).length ? ruleColor(settings.rules?.filter((r) => !r.row), c.name, value) : null
                    const max = maxes.get(i)
                    const width = layout.widths[c.name]
                    return (
                      <td
                        key={c.name}
                        onClick={onCellClick ? (e) => onCellClick(c, value, { x: e.clientX, y: e.clientY }) : undefined}
                        onContextMenu={
                          onRowMenu && groupings.length
                            ? (e) => {
                                e.preventDefault()
                                const first = groupings.find((g) => g.c === c) ?? (groupings[0] as { c: ResultColumn; i: number })
                                onRowMenu({
                                  column: first.c,
                                  value: row[first.i],
                                  also: groupings.filter((g) => g !== first).map((g) => ({ column: g.c, value: row[g.i] })),
                                  at: { x: e.clientX, y: e.clientY },
                                  additive: false,
                                })
                              }
                            : undefined
                        }
                        className={cn(
                          'border-b px-3',
                          wrap ? 'py-1.5 break-words whitespace-normal' : 'truncate whitespace-nowrap',
                          !width && 'max-w-[420px]',
                          numeric && 'text-right tabular-nums',
                          onCellClick && 'cursor-pointer',
                          freeze && k === 0 && 'sticky left-0 z-[1] bg-background',
                        )}
                        style={{ ...(width ? { width, minWidth: width, maxWidth: width } : {}), ...(color ? { color, fontWeight: 600 } : {}) }}
                      >
                        {max !== undefined && typeof value === 'number' ? (
                          <span className="relative inline-flex w-full min-w-[120px] items-center justify-end">
                            <span className="absolute inset-y-1 left-0 rounded-sm bg-primary/15" style={{ width: `${(Math.abs(value) / max) * 100}%` }} />
                            <span className="relative">{formatValue(value, c)}</span>
                          </span>
                        ) : (
                          <ValueCell value={value} col={c} looks={looks} />
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {virtualizer.getVirtualItems().length > 0 ? <tr style={{ height: virtualizer.getTotalSize() - (virtualizer.getVirtualItems().at(-1)?.end ?? 0) }} /> : null}
            {shown.length === 0 && result.rows.length > 0 ? (
              <tr>
                <td colSpan={columns.length + (settings.row_numbers ? 1 : 0)} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {$t('Aucune ligne ne correspond à la recherche ou aux filtres.')}
                </td>
              </tr>
            ) : null}
          </tbody>
          {totals ? (
            <tfoot className="sticky bottom-0 z-10 bg-background">
              <tr>
                {settings.row_numbers ? <td className="border-t" /> : null}
                {columns.map(({ c }, k) => (
                  <td key={c.name} className={cn('border-t px-3 py-1.5 font-semibold whitespace-nowrap', totals[k] !== null && 'text-right tabular-nums', freeze && k === 0 && 'sticky left-0 bg-background')}>
                    {totals[k] !== null ? formatValue(totals[k], c) : k === 0 ? $t('Total') : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {paged && rows.length > pageSize ? <Pager page={current} pages={pages} from={offset + 1} to={offset + shown.length} total={rows.length} onPage={setPage} /> : null}
    </div>
  )
}

function exportFailed(err: unknown) {
  toast.error(err instanceof Error ? err.message : String(err))
}

/** « 2 000 lignes · 120 ms », under a result. */
export function ResultFooter({ result }: { result: RunResult }) {
  const rows = result.truncated
    ? $tp(result.rows.length, '{count} ligne (tronqué)', '{count} lignes (tronqué)')
    : $tp(result.rows.length, '{count} ligne', '{count} lignes')
  const parts = [rows, $t('{duration} ms', { duration: formatCount(result.duration_ms) })]
  if (result.cached_at) {
    const when = new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(result.cached_at))
    parts.push($t('résultat du {when}', { when }))
  }
  return <span className="text-xs text-muted-foreground tabular-nums">{parts.join(' · ')}</span>
}

// ── Tableau croisé ──────────────────────────────────────────────────────────

function Pivot({ result, settings }: { result: Result; settings: VisualizationSettings }) {
  // The order and the values come from the settings; anyone reading can change them, unsaved.
  const saved = useMemo(() => axesOf(settings), [settings])
  const [axes, setAxes] = useState<PivotAxes>(saved)
  useEffect(() => setAxes(saved), [saved])
  const model = useMemo(() => pivotModel(result, settings, axes), [result, settings, axes])
  if (!model) return <div className="p-4 text-sm text-muted-foreground">{$t('Il faut deux dimensions et une mesure.')}</div>
  const { rowDim, colDim, metric, rows, columns, max } = model
  const totals = settings.totals !== false
  const heat = (v: number | undefined) => (settings.heatmap !== false && v !== undefined ? { background: `color-mix(in oklch, #2a78d6 ${Math.round((v / max) * 38)}%, transparent)` } : undefined)
  return (
    <div className="h-full overflow-auto text-sm">
      <table className="w-max min-w-full border-separate border-spacing-0">
        <thead className="sticky top-0 z-10 bg-background">
          <tr>
            <th className="sticky left-0 z-10 border-b bg-background px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground">
              <PivotAxisHeader column={rowDim} values={model.allRows} axis={axes.rows} onChange={(a) => setAxes((x) => ({ ...x, rows: a }))} />
              <span className="mx-1.5 opacity-60">\</span>
              <PivotAxisHeader column={colDim} values={model.allColumns} axis={axes.columns} onChange={(a) => setAxes((x) => ({ ...x, columns: a }))} />
            </th>
            {columns.map((k) => (
              <th key={String(k)} className="border-b px-3 py-2 text-right text-xs font-medium whitespace-nowrap text-muted-foreground">
                {formatValue(k, colDim) || '∅'}
              </th>
            ))}
            {totals ? <th className="border-b px-3 py-2 text-right text-xs font-semibold">{$t('Total')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((rk) => (
            <tr key={String(rk)}>
              <td className="sticky left-0 border-b bg-background px-3 py-1.5 font-medium whitespace-nowrap">{formatValue(rk, rowDim) || '∅'}</td>
              {columns.map((ck) => {
                const v = model.cell(rk, ck)
                return (
                  <td key={String(ck)} className="border-b px-3 py-1.5 text-right tabular-nums" style={heat(v)}>
                    {v === undefined ? '' : formatValue(v, metric, { compact: true })}
                  </td>
                )
              })}
              {totals ? <td className="border-b px-3 py-1.5 text-right font-semibold tabular-nums">{formatValue(model.rowTotal(rk), metric, { compact: true })}</td> : null}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 2} className="px-3 py-6 text-center text-xs text-muted-foreground">
                {$t('Aucune valeur retenue : le filtre écarte tout.')}
              </td>
            </tr>
          ) : null}
        </tbody>
        {totals && rows.length > 0 ? (
          <tfoot className="sticky bottom-0 bg-background">
            <tr>
              <td className="sticky left-0 border-t bg-background px-3 py-1.5 font-semibold">{$t('Total')}</td>
              {columns.map((ck) => (
                <td key={String(ck)} className="border-t px-3 py-1.5 text-right font-semibold tabular-nums">
                  {formatValue(model.columnTotal(ck), metric, { compact: true })}
                </td>
              ))}
              <td className="border-t px-3 py-1.5 text-right font-semibold tabular-nums">{formatValue(model.total, metric, { compact: true })}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
      {model.hiddenColumns > 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {$tp(model.hiddenColumns, '{count} colonne de plus n’est pas affichée : filtrez-les pour les voir.', '{count} colonnes de plus ne sont pas affichées : filtrez-les pour les voir.')}
        </p>
      ) : null}
    </div>
  )
}
