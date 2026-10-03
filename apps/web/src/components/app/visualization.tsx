'use client'

import type { ResultColumn, Visualization as Viz, VisualizationSettings } from '@eodia/contracts'
import { ruleColor } from '@eodia/contracts'
import { EChart } from '@/components/app/echart'
import { LookIcon } from '@/components/app/look'
import type { RunResult } from '@/lib/api'
import { LOOK_CLASSES, formatCount, formatValue } from '@/lib/format'
import { $t, $tp, intlLocale } from '@/lib/i18n'
import { type ChartModel, OTHER_CATEGORY, type Result, VIZ_LABELS, chartOption, roles } from '@/lib/viz'
import { cn } from '@/lib/utils'
import type { LookColor } from '@eodia/contracts'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ArrowUpDown, Minus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

export interface PointClick {
  readonly column: ResultColumn
  readonly value: unknown
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

export function Visualization({
  result,
  viz,
  onPointClick,
  compact = false,
  selected,
}: {
  result: RunResult | Result
  viz: Viz
  onPointClick?: (p: PointClick) => void
  compact?: boolean
  /** Categories chosen by clicks on this chart: the others fade, still there to be added. */
  selected?: readonly string[]
}) {
  const dark = useDark()
  const settings = (viz.settings ?? {}) as VisualizationSettings
  const model = useMemo(() => {
    if (['table', 'scalar', 'trend', 'progress', 'pivot', 'map'].includes(viz.type)) return null
    const m = chartOption(viz.type, result, settings, { dark })
    return m && selected?.length ? withSelection(m, new Set(selected)) : m
  }, [viz.type, result, settings, dark, selected])

  if (result.rows.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{$t('Aucun résultat')}</div>
  }
  switch (viz.type) {
    case 'table':
      return <DataTable result={result} settings={settings} looks={'looks' in result ? (result as RunResult).looks : undefined} />
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
  return (
    <EChart
      option={model.option}
      label={VIZ_LABELS[viz.type] ? $t(VIZ_LABELS[viz.type]) : viz.type}
      {...(onPointClick && model.clickColumn
        ? {
            onClick: (e) => {
              const col = model.clickColumn as ResultColumn
              const index = e.dataIndex
              const raw = model.categories ? model.categories[index] : (e.data as { raw?: unknown })?.raw
              if (raw === OTHER_CATEGORY || (e.data as { key?: string })?.key === '__other__') return
              // A forecast period has no rows to filter by.
              if (model.forecastFrom !== undefined && index >= model.forecastFrom) return
              const native = e.event?.event as unknown as MouseEvent | undefined
              onPointClick({
                column: col,
                value: raw,
                at: { x: native?.clientX ?? 0, y: native?.clientY ?? 0 },
                additive: !!(native?.shiftKey || native?.ctrlKey || native?.metaKey),
              })
            },
          }
        : {})}
    />
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
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-3 text-center">
      <div className="text-4xl font-semibold tracking-tight tabular-nums">{formatValue(last, m.col, { compact: Math.abs(last) >= 1e6 })}</div>
      {change !== null ? (
        <div className={cn('flex items-center gap-1 text-sm font-medium', change === 0 ? 'text-muted-foreground' : good ? 'text-green-600' : 'text-red-600')}>
          {change > 0 ? <ArrowUp className="size-3.5" /> : change < 0 ? <ArrowDown className="size-3.5" /> : <Minus className="size-3.5" />}
          {new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 1 }).format(Math.abs(change))}
          <span className="font-normal text-muted-foreground">
            {$t('vs {period} · {value}', { period: prevPeriod, value: formatValue(prev, m.col, { compact: true }) })}
          </span>
        </div>
      ) : null}
      {period ? <div className="text-xs text-muted-foreground">{period}</div> : null}
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
}: {
  result: Result
  settings?: VisualizationSettings
  looks?: Looks
  className?: string
  onCellClick?: (col: ResultColumn, value: unknown, at: { x: number; y: number }) => void
}) {
  const parent = useRef<HTMLDivElement>(null)
  const [sort, setSort] = useState<{ index: number; desc: boolean } | null>(null)
  const columns = useMemo(() => {
    const visible = result.columns.map((c, i) => ({ c, i })).filter(({ c }) => !c.hidden)
    if (!settings.columns?.length) return visible
    const order = settings.columns
    return order.map((n) => visible.find((v) => v.c.name === n)).filter((v): v is { c: ResultColumn; i: number } => !!v)
  }, [result.columns, settings.columns])
  const rows = useMemo(() => {
    if (!sort) return result.rows
    const copy = [...result.rows]
    copy.sort((a, b) => {
      const x = a[sort.index]
      const y = b[sort.index]
      if (x === y) return 0
      if (x === null || x === undefined) return 1
      if (y === null || y === undefined) return -1
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), intlLocale(), { numeric: true })
      return sort.desc ? -cmp : cmp
    })
    return copy
  }, [result.rows, sort])
  const maxes = useMemo(() => {
    const out = new Map<number, number>()
    for (const name of settings.cell_bars ?? []) {
      const i = result.columns.findIndex((c) => c.name === name)
      if (i >= 0) out.set(i, Math.max(...result.rows.map((r) => Math.abs(Number(r[i]) || 0)), 1))
    }
    return out
  }, [result, settings.cell_bars])
  const density = settings.density ?? 'normal'
  const rowHeight = density === 'compact' ? 30 : density === 'comfortable' ? 44 : 36
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => rowHeight, overscan: 12 })

  return (
    <div ref={parent} className={cn('relative h-full overflow-auto text-sm', className)}>
      <table className="w-max min-w-full border-separate border-spacing-0">
        <thead className="sticky top-0 z-10 bg-background">
          <tr>
            {settings.row_numbers ? <th className="w-10 border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground">#</th> : null}
            {columns.map(({ c, i }) => {
              const numeric = c.type === 'number' && !c.unit
              return (
                <th key={c.name} className={cn('border-b px-3 py-2 text-xs font-medium whitespace-nowrap text-muted-foreground', numeric ? 'text-right' : 'text-left')}>
                  <button
                    type="button"
                    onClick={() => setSort((s) => (s?.index === i ? (s.desc ? null : { index: i, desc: true }) : { index: i, desc: false }))}
                    className={cn('inline-flex items-center gap-1 hover:text-foreground', numeric && 'flex-row-reverse')}
                  >
                    {settings.column_labels?.[c.name] ?? c.label}
                    {sort?.index === i ? sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" /> : <ArrowUpDown className="size-3 opacity-0 group-hover:opacity-40" />}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {virtualizer.getVirtualItems().length > 0 ? (
            <tr style={{ height: virtualizer.getVirtualItems()[0]?.start ?? 0 }} />
          ) : null}
          {virtualizer.getVirtualItems().map((v) => {
            const row = rows[v.index] as readonly unknown[]
            const rowColor = (settings.rules ?? []).filter((r) => r.row).map((r) => ruleColor([r], r.column, row[result.columns.findIndex((c) => c.name === r.column)])).find(Boolean)
            return (
              <tr key={v.key} style={{ height: rowHeight, ...(rowColor ? { background: `${rowColor}1f` } : {}) }} className="hover:bg-muted/50">
                {settings.row_numbers ? <td className="border-b px-3 text-right text-xs text-muted-foreground tabular-nums">{v.index + 1}</td> : null}
                {columns.map(({ c, i }) => {
                  const value = row[i]
                  const numeric = c.type === 'number' && !c.unit
                  const color = (settings.rules ?? []).filter((r) => !r.row && r.column === c.name).length ? ruleColor(settings.rules?.filter((r) => !r.row), c.name, value) : null
                  const max = maxes.get(i)
                  return (
                    <td
                      key={c.name}
                      onClick={onCellClick ? (e) => onCellClick(c, value, { x: e.clientX, y: e.clientY }) : undefined}
                      className={cn('max-w-[420px] truncate border-b px-3 whitespace-nowrap', numeric && 'text-right tabular-nums', onCellClick && 'cursor-pointer')}
                      style={color ? { color, fontWeight: 600 } : undefined}
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
          {virtualizer.getVirtualItems().length > 0 ? (
            <tr style={{ height: virtualizer.getTotalSize() - (virtualizer.getVirtualItems().at(-1)?.end ?? 0) }} />
          ) : null}
        </tbody>
      </table>
    </div>
  )
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
  const { dims, metrics } = roles(result, settings)
  const rowDim = result.columns.find((c) => c.name === settings.pivot_rows?.[0]) ?? dims[0]
  const colDim = result.columns.find((c) => c.name === settings.pivot_columns?.[0]) ?? dims[1]
  const metric = result.columns.find((c) => c.name === settings.pivot_values?.[0]) ?? metrics[0]
  if (!rowDim || !colDim || !metric) return <div className="p-4 text-sm text-muted-foreground">{$t('Il faut deux dimensions et une mesure.')}</div>
  const ri = result.columns.indexOf(rowDim)
  const ci = result.columns.indexOf(colDim)
  const mi = result.columns.indexOf(metric)
  const rowKeys = [...new Map(result.rows.map((r) => [String(r[ri]), r[ri]])).values()]
  const colKeys = [...new Map(result.rows.map((r) => [String(r[ci]), r[ci]])).values()].slice(0, 60)
  const cells = new Map<string, number>()
  for (const r of result.rows) cells.set(`${String(r[ri])}\u0000${String(r[ci])}`, (cells.get(`${String(r[ri])}\u0000${String(r[ci])}`) ?? 0) + (Number(r[mi]) || 0))
  const max = Math.max(...cells.values(), 1)
  const total = (k: unknown, byRow: boolean) => (byRow ? colKeys : rowKeys).reduce((s: number, o) => s + (cells.get(byRow ? `${String(k)}\u0000${String(o)}` : `${String(o)}\u0000${String(k)}`) ?? 0), 0)
  const totals = settings.totals !== false
  return (
    <div className="h-full overflow-auto text-sm">
      <table className="w-max min-w-full border-separate border-spacing-0">
        <thead className="sticky top-0 bg-background">
          <tr>
            <th className="sticky left-0 border-b bg-background px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              {rowDim.label} \ {colDim.label}
            </th>
            {colKeys.map((k) => (
              <th key={String(k)} className="border-b px-3 py-2 text-right text-xs font-medium whitespace-nowrap text-muted-foreground">
                {formatValue(k, colDim) || '∅'}
              </th>
            ))}
            {totals ? <th className="border-b px-3 py-2 text-right text-xs font-semibold">{$t('Total')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rowKeys.map((rk) => (
            <tr key={String(rk)}>
              <td className="sticky left-0 border-b bg-background px-3 py-1.5 font-medium whitespace-nowrap">{formatValue(rk, rowDim) || '∅'}</td>
              {colKeys.map((ck) => {
                const v = cells.get(`${String(rk)}\u0000${String(ck)}`)
                return (
                  <td key={String(ck)} className="border-b px-3 py-1.5 text-right tabular-nums" style={settings.heatmap !== false && v !== undefined ? { background: `color-mix(in oklch, #2a78d6 ${Math.round((v / max) * 38)}%, transparent)` } : undefined}>
                    {v === undefined ? '' : formatValue(v, metric, { compact: true })}
                  </td>
                )
              })}
              {totals ? <td className="border-b px-3 py-1.5 text-right font-semibold tabular-nums">{formatValue(total(rk, true), metric, { compact: true })}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
