/**
 * Des résultats aux graphiques : choisir la forme, répartir dimensions et mesures, construire
 * les options ECharts. Règles (guide dataviz) : couleurs catégorielles dans un ordre fixe,
 * jamais recyclées ; un seul axe des ordonnées ; marques fines ; légende dès deux séries ;
 * grille discrète ; info-bulle partout.
 */
import type { ResultColumn, TemporalUnit, VisualizationSettings, VisualizationType } from '@eodia/contracts'
import type { EChartsOption, SeriesOption } from 'echarts'
import { LOOK_HEX, formatValue } from './format'
import { $t, intlLocale, msg } from './i18n'
import { FORECAST_UNITS, type Forecast, forecast, nextPeriods } from './forecast'
import { PALETTES, schemeColors } from './palettes'

/** Validated categorical order (light / dark), never cycled past eight — see `palettes.ts`. */
export const SERIES_LIGHT = PALETTES.eodia.light
export const SERIES_DARK = PALETTES.eodia.dark
const OTHER = { light: '#a1a1aa', dark: '#71717a' }
export const SEQUENTIAL = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']

export interface Theme {
  readonly dark: boolean
}

const ink = (t: Theme) => ({
  primary: t.dark ? '#f4f4f5' : '#18181b',
  secondary: t.dark ? '#a1a1aa' : '#52525b',
  muted: t.dark ? '#71717a' : '#a1a1aa',
  grid: t.dark ? '#27272a' : '#ececef',
  surface: t.dark ? '#18181b' : '#ffffff',
})

export const seriesColor = (i: number, t: Theme) => (t.dark ? SERIES_DARK : SERIES_LIGHT)[i] ?? (t.dark ? OTHER.dark : OTHER.light)

/** The `i`-th colour of the chart's palette for `count` series; past its end, « Autres » grey. */
function paletteOf(settings: VisualizationSettings, t: Theme, count: number) {
  const colors = schemeColors(settings.scheme, settings.colors, t.dark, count)
  return (i: number) => colors[i] ?? (t.dark ? OTHER.dark : OTHER.light)
}

/** The category that sums the ones left out: a click on it filters nothing. */
export const OTHER_CATEGORY = Symbol('autres')

/** A hex colour with an alpha, for fades. */
const alpha = (hex: string, a: number) =>
  /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}` : hex

export interface Result {
  readonly columns: readonly ResultColumn[]
  readonly rows: ReadonlyArray<readonly unknown[]>
  /** Values' looks by column id: a value with a colour of its own keeps it in every chart. */
  readonly looks?: Readonly<Record<string, readonly { readonly value: string; readonly color?: string | null }[]>>
}

/** The colour a value was given in « Structure », if any. */
function valueColor(result: Result, col: ResultColumn | undefined, raw: unknown): string | undefined {
  const id = col?.source?.column
  if (!id || raw === null || raw === undefined) return undefined
  const name = result.looks?.[id]?.find((l) => l.value === String(raw))?.color
  return name ? LOOK_HEX[name as keyof typeof LOOK_HEX] : undefined
}

const isNumeric = (c: ResultColumn) => c.type === 'number' && !c.unit
const isTemporal = (c: ResultColumn) => c.type === 'date' || c.type === 'datetime'

/** Which columns are dimensions and which are measures, by settings or by their kind. */
export function roles(result: Result, settings: VisualizationSettings = {}): { dims: ResultColumn[]; metrics: ResultColumn[] } {
  const by = (names: readonly string[] | undefined) =>
    (names ?? []).map((n) => result.columns.find((c) => c.name === n)).filter((c): c is ResultColumn => !!c)
  const visible = result.columns.filter((c) => !c.hidden)
  let dims = by(settings.dimensions)
  let metrics = by(settings.metrics)
  if (dims.length === 0) {
    dims = visible.filter((c) => c.role === 'dimension')
    if (dims.length === 0) dims = visible.filter((c) => c.role !== 'metric' && (!isNumeric(c) || isTemporal(c))).slice(0, 2)
  }
  if (metrics.length === 0) {
    metrics = visible.filter((c) => c.role === 'metric')
    if (metrics.length === 0) metrics = visible.filter((c) => isNumeric(c) && !dims.includes(c) && c.semantic !== 'pk' && c.semantic !== 'fk')
  }
  return { dims, metrics }
}

/** The visualization a result suggests: a number, a curve over time, bars by category, a table. */
export function autoVisualization(result: Result): VisualizationType {
  const { dims, metrics } = roles(result)
  if (result.rows.length === 1 && metrics.length >= 1 && dims.length === 0) return 'scalar'
  if (metrics.length === 0) return 'table'
  if (dims.length === 1 && dims[0] && isTemporal(dims[0])) return result.rows.length > 1 ? 'line' : 'scalar'
  if (dims.length === 1 && result.rows.length <= 6 && metrics.length === 1) return 'pie'
  if (dims.length >= 1 && dims.length <= 2 && result.rows.length <= 60) return dims[0] && isTemporal(dims[0]) ? 'line' : 'bar'
  return 'table'
}

/** Which visualizations make sense for a result. */
export function vizFits(type: VisualizationType, result: Result): boolean {
  const { dims, metrics } = roles(result)
  switch (type) {
    case 'table':
      return true
    case 'scalar':
    case 'progress':
    case 'gauge':
      return metrics.length >= 1
    case 'trend':
      return metrics.length >= 1 && dims.length >= 1 && !!dims[0] && isTemporal(dims[0])
    case 'pie':
    case 'funnel':
      return metrics.length >= 1 && dims.length >= 1
    case 'scatter':
      return metrics.length >= 2 || (metrics.length >= 1 && dims.length >= 1)
    case 'radar': {
      // Three to thirty spokes: fewer is not a shape, more is not readable.
      const d = dims[0]
      if (!d || metrics.length < 1) return false
      const i = result.columns.indexOf(d)
      const n = new Set(result.rows.map((r) => String(r[i]))).size
      return n >= 3 && n <= 30
    }
    case 'bar_race':
    case 'line_race': {
      // A period that moves on, and things that compete: a second dimension, or several measures.
      const time = dims.find(isTemporal)
      if (!time || metrics.length < 1) return false
      const i = result.columns.indexOf(time)
      return new Set(result.rows.map((r) => keyOf(r[i]))).size >= 2 && (dims.length >= 2 || metrics.length >= 2 || type === 'line_race')
    }
    case 'pivot':
      return dims.length >= 2 && metrics.length >= 1
    case 'map':
      return result.columns.some((c) => c.semantic === 'latitude') && result.columns.some((c) => c.semantic === 'longitude')
    default:
      return metrics.length >= 1 && dims.length >= 1
  }
}

export const VIZ_LABELS: Record<VisualizationType, string> = {
  table: msg('Tableau'),
  scalar: msg('Nombre'),
  trend: msg('Tendance'),
  progress: msg('Progression'),
  gauge: msg('Jauge'),
  bar: msg('Barres'),
  row: msg('Barres horizontales'),
  line: msg('Lignes'),
  area: msg('Aires'),
  combo: msg('Combiné'),
  pie: msg('Camembert'),
  scatter: msg('Nuage de points'),
  funnel: msg('Entonnoir'),
  radar: msg('Radar'),
  bar_race: msg('Course de barres'),
  line_race: msg('Course de courbes'),
  pivot: msg('Tableau croisé'),
  map: msg('Carte'),
}

const keyOf = (v: unknown) => (v === null || v === undefined ? '∅' : String(v))

/** Series of a cartesian chart: one per measure, or one per value of the second dimension. */
function cartesian(result: Result, settings: VisualizationSettings) {
  const { dims, metrics } = roles(result, settings)
  const x = dims[0]
  const split = dims[1]
  const xi = x ? result.columns.indexOf(x) : -1
  const categories: unknown[] = []
  const seen = new Set<string>()
  for (const row of result.rows) {
    const k = keyOf(row[xi])
    if (!seen.has(k)) {
      seen.add(k)
      categories.push(row[xi])
    }
  }
  const index = new Map(categories.map((c, i) => [keyOf(c), i]))
  type S = { name: string; key: string; metric: ResultColumn; values: (number | null)[]; look?: string }
  const series: S[] = []
  if (split && metrics[0]) {
    const si = result.columns.indexOf(split)
    const mi = result.columns.indexOf(metrics[0])
    const bySplit = new Map<string, S>()
    // Totals decide which split values keep a colour; the rest fold into « Autres ».
    const totals = new Map<string, number>()
    for (const row of result.rows) totals.set(keyOf(row[si]), (totals.get(keyOf(row[si])) ?? 0) + Math.abs(Number(row[mi]) || 0))
    const kept = new Set([...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k]) => k))
    const fold = totals.size > 8
    for (const row of result.rows) {
      const raw = keyOf(row[si])
      const k = fold && !kept.has(raw) ? '__other__' : raw
      let s = bySplit.get(k)
      if (!s) {
        const look = k === '__other__' ? undefined : valueColor(result, split, row[si])
        s = { name: k === '__other__' ? $t('Autres') : formatValue(row[si], split) || '∅', key: k, metric: metrics[0], values: categories.map(() => null), ...(look ? { look } : {}) }
        bySplit.set(k, s)
      }
      const at = index.get(keyOf(row[xi])) as number
      s.values[at] = (s.values[at] ?? 0) + (Number(row[mi]) || 0)
    }
    series.push(...[...bySplit.values()].sort((a, b) => (a.key === '__other__' ? 1 : b.key === '__other__' ? -1 : 0)))
  } else {
    for (const m of metrics.slice(0, 8)) {
      const mi = result.columns.indexOf(m)
      const values = categories.map(() => null as number | null)
      for (const row of result.rows) {
        const v = row[mi]
        values[index.get(keyOf(row[xi])) as number] = v === null || v === undefined ? null : Number(v)
      }
      series.push({ name: settings.series?.[m.name]?.label ?? m.label, key: m.name, metric: m, values })
    }
  }
  // Categories (not periods) by their value, or only the largest ones with the rest in « Autres ».
  const categorical = !!x && !isTemporal(x) && !isNumeric(x)
  const sort = settings.sort_values ?? 'none'
  const top = categorical && settings.top_n && settings.top_n > 0 && categories.length > settings.top_n ? settings.top_n : null
  if (categorical && (sort !== 'none' || top)) {
    const total = categories.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0))
    const order = categories.map((_, i) => i)
    if (sort !== 'none' || top) order.sort((a, b) => (sort === 'asc' && !top ? (total[a] as number) - (total[b] as number) : (total[b] as number) - (total[a] as number)))
    const kept = top ? order.slice(0, top) : order
    if (top && sort === 'asc') kept.reverse()
    const rest = top ? order.slice(top) : []
    const next = kept.map((i) => categories[i])
    for (const s of series) {
      const values = kept.map((i) => s.values[i] ?? null)
      if (rest.length) values.push(rest.reduce((sum, i) => sum + (s.values[i] ?? 0), 0))
      s.values = values
    }
    if (rest.length) next.push(OTHER_CATEGORY)
    categories.splice(0, categories.length, ...next)
  }
  return { x, dims, metrics, categories, series }
}

interface RaceEntry {
  readonly key: string
  readonly name: string
  readonly look?: string
  /** One value per period. */
  values: number[]
}

/**
 * A race's data: the periods in order and, for each competitor — a value of the other
 * dimension, or a measure —, its value in each period; a running total when asked.
 */
function raceData(result: Result, settings: VisualizationSettings) {
  const { dims, metrics } = roles(result, settings)
  const time = dims.find(isTemporal)
  const metric = metrics[0]
  if (!time || !metric) return null
  const other = dims.find((d) => d !== time)
  const ti = result.columns.indexOf(time)
  const byKey = new Map<string, unknown>()
  for (const row of result.rows) if (!byKey.has(keyOf(row[ti]))) byKey.set(keyOf(row[ti]), row[ti])
  const periods = [...byKey.values()].sort((a, b) =>
    typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? '')),
  )
  const at = new Map(periods.map((p, j) => [keyOf(p), j]))
  const entries: RaceEntry[] = []
  if (other) {
    const oi = result.columns.indexOf(other)
    const mi = result.columns.indexOf(metric)
    const found = new Map<string, RaceEntry>()
    for (const row of result.rows) {
      const k = keyOf(row[oi])
      let e = found.get(k)
      if (!e) {
        const look = valueColor(result, other, row[oi])
        e = { key: k, name: formatValue(row[oi], other) || '∅', values: periods.map(() => 0), ...(look ? { look } : {}) }
        found.set(k, e)
        entries.push(e)
      }
      const j = at.get(keyOf(row[ti])) as number
      e.values[j] = (e.values[j] ?? 0) + (Number(row[mi]) || 0)
    }
  } else {
    for (const m of metrics) {
      const mi = result.columns.indexOf(m)
      const values = periods.map(() => 0)
      for (const row of result.rows) {
        const j = at.get(keyOf(row[ti])) as number
        values[j] = (values[j] ?? 0) + (Number(row[mi]) || 0)
      }
      entries.push({ key: m.name, name: settings.series?.[m.name]?.label ?? m.label, values })
    }
  }
  if (settings.race_cumulative) {
    for (const e of entries) {
      let sum = 0
      e.values = e.values.map((v) => (sum += v))
    }
  }
  return { time, metric, periods, entries }
}

function axisLabel(col: ResultColumn | undefined, compact = true) {
  return (v: unknown) => (col ? formatValue(v, col, { compact }) : String(v))
}

export interface ChartModel {
  readonly option: EChartsOption
  /** The column a click on a point reads its value from — what it filters by. */
  readonly clickColumn?: ResultColumn
  readonly categories?: unknown[]
  /** What can take a colour of its own — series, slices or bars —, with the one it has. */
  readonly targets?: readonly ColorTarget[]
  /** The first forecast category: from it on, nothing is clicked to filter. */
  readonly forecastFrom?: number
}

/** The green of insights, for what is forecast rather than measured. */
export const FORECAST_GREEN = { light: '#2da31d', dark: '#42cd2a' } as const

/** Names of the series a tooltip leaves out (the forecast interval's two halves). */
const HIDDEN = '\u200b'

/** A share in percent (`12.5` → `12,5 %`), as the language writes it. */
const percentText = (value: number, decimals = 1) =>
  new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: decimals }).format(value / 100)

export interface ColorTarget {
  /** Its key in `settings.series`. */
  readonly key: string
  readonly name: string
  readonly color: string
}

export function chartOption(type: VisualizationType, result: Result, settings: VisualizationSettings, theme: Theme): ChartModel | null {
  const c = ink(theme)
  const base: EChartsOption = {
    animationDuration: 300,
    // The family the page really uses: ECharts measures labels on a canvas, which reads no CSS variable.
    textStyle: { fontFamily: typeof document === 'undefined' ? 'sans-serif' : getComputedStyle(document.body).fontFamily, color: c.secondary, fontSize: 12 },
    tooltip: {
      backgroundColor: theme.dark ? '#27272a' : '#ffffff',
      borderColor: theme.dark ? '#3f3f46' : '#e4e4e7',
      textStyle: { color: c.primary, fontSize: 12 },
      extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,.12); border-radius: 8px;',
    },
  }

  if (type === 'pie' || type === 'funnel') {
    const { dims, metrics } = roles(result, settings)
    const d = dims[0]
    const m = metrics[0]
    if (!d || !m) return null
    const di = result.columns.indexOf(d)
    const mi = result.columns.indexOf(m)
    let data: { key: string; name: string; value: number; raw: unknown }[] = result.rows.map((r) => ({ key: keyOf(r[di]), name: formatValue(r[di], d) || '∅', value: Number(r[mi]) || 0, raw: r[di] }))
    if (settings.sort_slices !== false) data.sort((a, b) => b.value - a.value)
    const max = Math.min(Math.max(settings.slices_max ?? 7, 2), 8)
    if (type === 'pie' && data.length > max) {
      const rest = data.slice(max - 1)
      data = [...data.slice(0, max - 1), { key: '__other__', name: $t('Autres'), value: rest.reduce((s, x) => s + x.value, 0), raw: null }]
    }
    const total = data.reduce((s, x) => s + x.value, 0)
    // The colour chosen for a slice, else the value's own, else the palette's next in its order.
    const pal = paletteOf(settings, theme, data.length)
    let next = 0
    const colored = data.map((x) => ({
      ...x,
      itemStyle: { color: x.key === '__other__' ? (theme.dark ? OTHER.dark : OTHER.light) : (settings.series?.[x.key]?.color ?? valueColor(result, d, x.raw) ?? pal(next++)) },
    }))
    if (type === 'funnel') {
      return {
        clickColumn: d,
        targets: colored.filter((x) => x.key !== '__other__').map((x) => ({ key: x.key, name: x.name, color: x.itemStyle.color })),
        option: {
          ...base,
          tooltip: { ...base.tooltip, trigger: 'item', valueFormatter: (v) => formatValue(v, m) },
          series: [{ type: 'funnel', left: '10%', width: '80%', top: 12, bottom: 12, gap: 2, sort: 'descending', label: { color: c.primary, formatter: (p) => `${p.name} · ${formatValue(p.value, m, { compact: true })}` }, itemStyle: { borderColor: c.surface, borderWidth: 2 }, data: colored }],
        },
      }
    }
    const donut = settings.donut !== false
    const ring = Math.min(Math.max(settings.ring_width ?? 38, 10), 70)
    return {
      clickColumn: d,
      targets: colored.filter((x) => x.key !== '__other__').map((x) => ({ key: x.key, name: x.name, color: x.itemStyle.color })),
      option: {
        ...base,
        tooltip: { ...base.tooltip, trigger: 'item', formatter: (p: unknown) => {
          const q = p as { name: string; value: number; percent: number; marker: string }
          return `${q.marker} ${q.name}<br/><b>${formatValue(q.value, m)}</b> · ${percentText(q.percent)}`
        } },
        legend: { show: settings.legend !== false, orient: 'vertical', right: 8, top: 'middle', type: 'scroll', icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: c.secondary } },
        title: donut && settings.total !== false
          ? { text: formatValue(total, m, { compact: true }), subtext: $t('Total'), left: settings.legend === false ? 'center' : '34%', top: settings.half ? '52%' : 'center', textAlign: 'center', textStyle: { fontSize: 18, fontWeight: 600, color: c.primary }, subtextStyle: { color: c.muted, fontSize: 11 } }
          : undefined,
        series: [
          {
            type: 'pie',
            center: [settings.legend === false ? '50%' : '35%', '50%'],
            radius: donut ? [`${70 - ring}%`, '70%'] : ['0%', '70%'],
            ...(settings.half ? { startAngle: 180, endAngle: 360, center: [settings.legend === false ? '50%' : '35%', '70%'] } : {}),
            ...(settings.rose ? { roseType: 'radius' as const } : {}),
            avoidLabelOverlap: true,
            padAngle: 1,
            itemStyle: { borderColor: c.surface, borderWidth: 2, borderRadius: 3 },
            label: {
              show: (settings.slice_labels ?? (donut ? 'none' : 'percent')) !== 'none',
              position: settings.labels_outside ? 'outside' : 'inside',
              ...(settings.labels_outside ? { alignTo: 'edge' as const, edgeDistance: 8, overflow: 'break' as const } : {}),
              color: settings.labels_outside ? c.secondary : '#ffffff',
              fontSize: 11,
              formatter: (params: unknown) => {
                const p = params as { name: string; value: number; percent: number }
                const pc = percentText(p.percent, 0)
                const v = formatValue(p.value, m, { compact: true })
                switch (settings.slice_labels ?? 'percent') {
                  case 'value':
                    return v
                  case 'name':
                    return p.name
                  case 'name_percent':
                    return `${p.name} · ${pc}`
                  case 'name_value':
                    return `${p.name} · ${v}`
                  default:
                    return pc
                }
              },
            },
            labelLine: { show: !!settings.labels_outside },
            data: colored,
          },
        ],
      },
    }
  }

  if (type === 'bar_race' || type === 'line_race') {
    const race = raceData(result, settings)
    if (!race) return null
    const { time, metric, periods, entries } = race
    const speed = Math.min(Math.max(settings.race_speed ?? 1000, 300), 5000)
    const muted = theme.dark ? OTHER.dark : OTHER.light
    // The largest get the palette's colours, in its order; a colour chosen or owned comes first.
    const pal = paletteOf(settings, theme, entries.length)
    const rank = entries.map((_, i) => i).sort((a, b) => Math.max(...(entries[b]?.values ?? [0])) - Math.max(...(entries[a]?.values ?? [0])))
    const colors: string[] = entries.map(() => muted)
    let next = 0
    for (const i of rank) {
      const e = entries[i] as RaceEntry
      colors[i] = settings.series?.[e.key]?.color ?? e.look ?? pal(next++)
    }
    const targets = entries.map((e, i) => ({ key: e.key, name: e.name, color: colors[i] as string }))
    const periodText = periods.map((p) => formatValue(p, time) || '∅')
    const show = (v: unknown) => formatValue(v, metric, { compact: true })

    if (type === 'line_race') {
      // The lines draw themselves period after period, each named at its tip with its value.
      // The eight largest: past them, the lines tangle and the names overlap.
      const kept = rank.slice(0, 8).sort((a, b) => a - b)
      const lines = kept.map((i) => entries[i] as RaceEntry)
      const lineColors = kept.map((i) => colors[i] as string)
      return {
        targets: kept.map((i) => targets[i] as ColorTarget),
        option: {
          ...base,
          animationDuration: speed * periods.length,
          animationEasing: 'linear',
          color: lineColors,
          grid: { left: 8, right: 132, top: 14, bottom: 6, containLabel: true },
          tooltip: { ...base.tooltip, trigger: 'axis', order: 'valueDesc', valueFormatter: (v) => formatValue(v, metric) },
          xAxis: {
            type: 'category',
            data: periodText,
            boundaryGap: false,
            axisTick: { show: false },
            axisLine: { lineStyle: { color: c.grid } },
            axisLabel: { color: c.muted, hideOverlap: true },
          },
          yAxis: {
            type: 'value',
            axisLabel: { color: c.muted, formatter: axisLabel(metric) },
            splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
          },
          series: lines.map((e, i) => ({
            type: 'line',
            name: e.name,
            data: e.values,
            showSymbol: false,
            smooth: settings.line_style === 'smooth',
            lineStyle: { width: 2.5, color: lineColors[i] },
            itemStyle: { color: lineColors[i] },
            emphasis: { focus: 'series' },
            endLabel: {
              show: true,
              color: lineColors[i],
              fontSize: 11,
              fontWeight: 600,
              distance: 6,
              valueAnimation: true,
              formatter: (p: { seriesName?: string; value?: unknown }) => `${p.seriesName ?? ''} · ${show(p.value)}`,
            },
            labelLayout: { moveOverlap: 'shiftY' },
          })) as SeriesOption[],
        },
      }
    }

    // Bars that overtake each other: one frame per period, played by the timeline.
    const top = Math.min(Math.max(settings.top_n ?? 10, 3), 30)
    const autoplay = settings.race_autoplay !== false
    const accent = colors[rank[0] ?? 0] ?? pal(0)
    const big = Math.max(...entries.flatMap((e) => e.values))
    return {
      targets,
      option: {
        baseOption: {
          ...base,
          animationDuration: 0,
          animationDurationUpdate: speed,
          animationEasing: 'linear',
          animationEasingUpdate: 'linear',
          timeline: {
            axisType: 'category',
            data: periodText,
            autoPlay: autoplay,
            playInterval: speed,
            loop: false,
            currentIndex: autoplay ? 0 : periods.length - 1,
            left: 8,
            right: 8,
            bottom: 0,
            height: 44,
            symbol: 'circle',
            symbolSize: 5,
            lineStyle: { color: c.grid, width: 2 },
            itemStyle: { color: c.grid },
            label: { color: c.muted, fontSize: 10 },
            checkpointStyle: { color: accent, borderColor: c.surface, borderWidth: 2, symbolSize: 12, animationDuration: Math.min(speed, 600) },
            progress: { lineStyle: { color: accent }, itemStyle: { color: accent }, label: { color: c.secondary } },
            controlStyle: { color: c.secondary, borderColor: c.secondary, itemSize: 18 },
            emphasis: { label: { color: c.primary }, itemStyle: { color: accent }, controlStyle: { color: accent, borderColor: accent } },
          },
          grid: { left: 8, right: 72, top: 8, bottom: 64, containLabel: true },
          tooltip: { ...base.tooltip, trigger: 'item', valueFormatter: (v) => formatValue(v, metric) },
          xAxis: {
            type: 'value',
            max: (v: { max: number }) => Math.max(v.max, big > 0 ? 0 : 1),
            axisLabel: { color: c.muted, formatter: axisLabel(metric) },
            splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
          },
          yAxis: {
            type: 'category',
            data: entries.map((e) => e.name),
            inverse: true,
            max: Math.min(top, entries.length) - 1,
            animationDuration: 300,
            animationDurationUpdate: 300,
            axisTick: { show: false },
            axisLine: { lineStyle: { color: c.grid } },
            axisLabel: { color: c.secondary, width: 150, overflow: 'truncate' },
          },
          series: [
            {
              type: 'bar',
              realtimeSort: true,
              barMaxWidth: 28,
              itemStyle: { borderRadius: [0, 4, 4, 0] },
              label: { show: true, position: 'right', valueAnimation: true, color: c.secondary, fontSize: 11, formatter: (p: { value: unknown }) => show(p.value) },
            },
          ],
        },
        // Each period: its bars, and its name written large in the corner.
        options: periods.map((_, j) => ({
          series: [{ data: entries.map((e, i) => ({ value: e.values[j] ?? 0, itemStyle: { color: colors[i] } })) }],
          graphic: {
            elements: [
              {
                type: 'text',
                right: 84,
                bottom: 76,
                z: 100,
                silent: true,
                style: { text: periodText[j], fill: c.muted, opacity: 0.55, font: `600 ${periodText[j] && periodText[j].length > 9 ? 22 : 34}px ${base.textStyle && 'fontFamily' in base.textStyle ? base.textStyle.fontFamily : 'sans-serif'}`, textAlign: 'right' },
              },
            ],
          },
        })),
      } as EChartsOption,
    }
  }

  if (type === 'scatter') {
    const { dims, metrics } = roles(result, settings)
    const [mx, my] = metrics.length >= 2 ? metrics : [dims[0], metrics[0]]
    if (!mx || !my) return null
    const xi = result.columns.indexOf(mx)
    const yi = result.columns.indexOf(my)
    return {
      option: {
        ...base,
        grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
        tooltip: { ...base.tooltip, trigger: 'item', formatter: (p: unknown) => {
          const v = (p as { value: unknown[] }).value
          return `${$t('{column} : {value}', { column: mx.label, value: `<b>${formatValue(v[0], mx)}</b>` })}<br/>${$t('{column} : {value}', { column: my.label, value: `<b>${formatValue(v[1], my)}</b>` })}`
        } },
        xAxis: { type: isNumeric(mx) ? 'value' : 'category', axisLabel: { formatter: axisLabel(mx), color: c.muted }, splitLine: { lineStyle: { color: c.grid, type: 'dashed' } }, axisLine: { lineStyle: { color: c.grid } } },
        yAxis: { type: 'value', axisLabel: { formatter: axisLabel(my), color: c.muted }, splitLine: { lineStyle: { color: c.grid, type: 'dashed' } } },
        series: [{ type: 'scatter', symbolSize: 9, itemStyle: { color: settings.color ?? paletteOf(settings, theme, 1)(0), opacity: 0.75, borderColor: c.surface, borderWidth: 1 }, data: result.rows.map((r) => [r[xi], r[yi]]) as never }],
      },
    }
  }

  if (type === 'gauge') {
    const { metrics } = roles(result, settings)
    const m = metrics[0]
    if (!m) return null
    const value = Number(result.rows[0]?.[result.columns.indexOf(m)]) || 0
    const max = settings.max ?? settings.goal ?? (value > 0 ? 10 ** Math.ceil(Math.log10(value * 1.1)) : 100)
    return {
      option: {
        ...base,
        series: [
          {
            type: 'gauge',
            min: settings.min ?? 0,
            max,
            startAngle: 210,
            endAngle: -30,
            radius: '92%',
            center: ['50%', '58%'],
            progress: { show: true, width: 14, roundCap: true, itemStyle: { color: settings.color ?? paletteOf(settings, theme, 1)(0) } },
            axisLine: { lineStyle: { width: 14, color: [[1, c.grid]] }, roundCap: true },
            pointer: { show: false },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { show: false },
            anchor: { show: false },
            title: { show: false },
            detail: { valueAnimation: true, offsetCenter: [0, '0%'], fontSize: 24, fontWeight: 600, color: c.primary, formatter: (v: number) => formatValue(v, m, { compact: true }) },
            data: [{ value }],
          },
        ],
      },
    }
  }

  if (type === 'radar') {
    const { x, series, categories } = cartesian(result, settings)
    if (!x || series.length === 0 || categories.length < 3) return null
    const pal = paletteOf(settings, theme, series.length)
    let next = 0
    const colors = series.map((s) => settings.series?.[s.key]?.color ?? (s.key === '__other__' ? (theme.dark ? OTHER.dark : OTHER.light) : (s.look ?? pal(next++))))
    // One scale for every spoke: the shapes compare.
    const top = Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)))
    const max = top > 0 ? 10 ** Math.floor(Math.log10(top)) * Math.ceil(top / 10 ** Math.floor(Math.log10(top))) : 1
    const legend = series.length > 1 && settings.legend !== false
    return {
      targets: series.map((s, i) => ({ key: s.key, name: s.name, color: colors[i] as string })),
      option: {
        ...base,
        color: colors,
        legend: legend ? { top: 0, left: 0, type: 'scroll', icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 18, textStyle: { color: c.secondary } } : undefined,
        tooltip: { ...base.tooltip, trigger: 'item' },
        radar: {
          indicator: categories.map((v) => ({ name: v === OTHER_CATEGORY ? $t('Autres') : formatValue(v, x) || '∅', max })),
          center: ['50%', legend ? '56%' : '52%'],
          radius: '66%',
          splitNumber: 4,
          axisName: { color: c.secondary, fontSize: 11 },
          splitLine: { lineStyle: { color: c.grid } },
          splitArea: { show: false },
          axisLine: { lineStyle: { color: c.grid } },
        },
        series: [
          {
            type: 'radar',
            symbol: 'circle',
            symbolSize: 5,
            data: series.map((s, i) => ({
              name: s.name,
              value: s.values.map((v) => v ?? 0),
              lineStyle: { color: colors[i], width: 2 },
              itemStyle: { color: colors[i], borderColor: c.surface, borderWidth: 1 },
              areaStyle: { color: alpha(colors[i] as string, series.length > 1 ? 0.1 : 0.18) },
              label: settings.values ? { show: true, color: c.secondary, fontSize: 10, formatter: (p: { value: unknown }) => formatValue(p.value, s.metric, { compact: true }) } : undefined,
            })),
          },
        ] as SeriesOption[],
      },
    }
  }

  // Cartesian: bar, row, line, area, combo.
  const { x, series, categories } = cartesian(result, settings)
  if (!x || series.length === 0) return null
  // A forecast prolongs a series in time: its periods join the axis, drawn in dashes.
  const unit = x.unit as TemporalUnit | undefined
  const horizon = Math.min(Math.max(Math.round(settings.forecast ?? 0), 0), 36)
  let forecasts: (Forecast | null)[] = []
  let forecastFrom: number | undefined
  // The forecast series, by name: the legend and the tooltip tell them apart.
  const forecastNames = new Set<string>()
  const forecastName = (series: string) => {
    const name = $t('{series} · prévision', { series })
    forecastNames.add(name)
    return name
  }
  if (horizon > 0 && isTemporal(x) && unit && FORECAST_UNITS.includes(unit) && type !== 'row' && settings.stack !== 'percent') {
    const future = nextPeriods(categories[categories.length - 1], unit, horizon)
    forecasts = future ? series.map((s) => (s.key === '__other__' ? null : forecast(s.values, horizon, settings.forecast_method ?? 'auto', unit))) : []
    if (future && forecasts.some(Boolean)) {
      forecastFrom = categories.length
      categories.push(...future)
    } else forecasts = []
  }
  const brand = theme.dark ? FORECAST_GREEN.dark : FORECAST_GREEN.light
  const horizontal = type === 'row'
  const stack = settings.stack && settings.stack !== 'none' ? 'total' : undefined
  const percent = settings.stack === 'percent'
  const metric = series[0]?.metric
  const totals = categories.map((_, i) => series.reduce((s, x) => s + Math.abs(x.values[i] ?? 0), 0))
  const many = categories.length > 40
  const catAxis = {
    type: 'category' as const,
    data: categories.map((v) => (v === OTHER_CATEGORY ? $t('Autres') : formatValue(v, x) || '∅')),
    axisTick: { show: false },
    axisLine: { lineStyle: { color: c.grid } },
    axisLabel: { color: c.muted, hideOverlap: true, ...(horizontal ? { width: 180, overflow: 'truncate' as const } : {}), ...(settings.x_rotate ? { rotate: settings.x_rotate } : {}) },
    ...(settings.x_axis === false ? { show: false } : {}),
    inverse: horizontal,
  }
  const valAxis = {
    type: settings.y_scale === 'log' ? ('log' as const) : ('value' as const),
    ...(settings.y_min !== undefined && settings.y_min !== null ? { min: settings.y_min } : {}),
    ...(settings.y_max !== undefined && settings.y_max !== null ? { max: percent ? 100 : settings.y_max } : percent ? { max: 100 } : {}),
    axisLabel: { color: c.muted, formatter: percent ? (v: number) => percentText(v) : axisLabel(metric) },
    splitLine: { show: settings.grid_lines !== false, lineStyle: { color: c.grid, type: 'dashed' as const } },
    ...(settings.y_axis === false ? { show: false } : {}),
    ...(settings.y_label ? { name: settings.y_label, nameTextStyle: { color: c.muted } } : {}),
  }
  const width = settings.bar_width === 'thin' ? '35%' : settings.bar_width === 'wide' ? '80%' : '58%'
  // A series per value: the value's own colour, else the palette's next — the chosen colour above all.
  const pal = paletteOf(settings, theme, series.length)
  let next = 0
  const muted = theme.dark ? OTHER.dark : OTHER.light
  const colors = series.map((s) =>
    settings.series?.[s.key]?.color ?? (series.length === 1 && settings.color ? settings.color : s.key === '__other__' ? muted : (s.look ?? pal(next++))),
  )
  // One series over categories: each bar takes its category's colour — chosen, or its own look.
  const single = series.length === 1 && !settings.color && !settings.series?.[series[0]?.key ?? '']?.color
  const barLooks = single && !isTemporal(x)
    ? categories.map((v) => (v === OTHER_CATEGORY ? muted : (settings.series?.[keyOf(v)]?.color ?? valueColor(result, x, v))))
    : []
  // One mark stands out — the highest, the lowest or the last —, the others recede.
  // « Autres » sums the rest: it is neither the highest nor part of an average.
  const first = (series[0]?.values ?? []).map((v, j) => (categories[j] === OTHER_CATEGORY ? null : v))
  const spot =
    series.length === 1 && settings.highlight && settings.highlight !== 'none' && first.some((v) => v !== null)
      ? settings.highlight === 'last'
        ? first.length - 1 - [...first].reverse().findIndex((v) => v !== null)
        : first.reduce<number>((best, v, j) => (v === null ? best : best < 0 || (settings.highlight === 'max' ? v > (first[best] as number) : v < (first[best] as number)) ? j : best), -1)
      : -1
  const lines = series.length >= 2 && series.length <= 4 && (type === 'line' || type === 'area') && !horizontal
  // Names at the end of measured lines would sit on their forecast: not with one.
  const endLabels = lines && settings.end_labels !== false && forecastFrom === undefined
  const out: SeriesOption[] = series.map((s, i) => {
    const display = type === 'combo' ? (settings.series?.[s.key]?.display ?? (i === 0 ? 'bar' : 'line')) : type === 'row' ? 'bar' : type === 'area' ? 'area' : type === 'line' ? 'line' : 'bar'
    const color = colors[i] as string
    const values = percent ? s.values.map((v, j) => (v === null ? null : (Math.abs(v) / (totals[j] || 1)) * 100)) : s.values
    const data =
      display === 'bar' && (barLooks.some(Boolean) || spot >= 0)
        ? values.map((v, j) => {
            const own = spot >= 0 ? (j === spot ? (barLooks[j] ?? color) : alpha(barLooks[j] ?? color, 0.28)) : barLooks[j]
            return own ? { value: v, itemStyle: { color: own } } : v
          })
        : values
    // Values on the marks: all of them when they are few; else the extremes and the last only.
    const finite = values.filter((v): v is number => v !== null)
    const hi = Math.max(...finite)
    const lo = Math.min(...finite)
    const lastIndex = values.length - 1 - [...values].reverse().findIndex((v) => v !== null)
    const fewEnough = categories.length <= 16
    const label = (position: string) =>
      settings.values || spot >= 0
        ? {
            show: true,
            position,
            color: c.secondary,
            fontSize: 11,
            formatter: (p: { value: unknown; dataIndex: number }) => {
              const v = p.value as number | null
              if (v === null || v === undefined) return ''
              const shown = spot >= 0 && !settings.values ? p.dataIndex === spot : fewEnough || v === hi || v === lo || p.dataIndex === lastIndex
              return shown ? (percent ? percentText(v, 0) : formatValue(v, s.metric, { compact: true })) : ''
            },
          }
        : undefined
    // In a stack, only the outer end is rounded; a hairline of the surface parts the segments.
    const lastBar = stack ? i === series.length - 1 : true
    const radius = lastBar ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0
    const fc = forecasts[i]
    const fcColor = series.length === 1 ? brand : color
    if (display === 'bar' && fc) {
      // Forecast bars: the green of insights, in dashes, lightly filled.
      ;(data as unknown[]).push(
        ...Array.from({ length: (forecastFrom as number) - values.length }, () => null),
        ...fc.values.map((v) => ({ value: v, itemStyle: { color: alpha(fcColor, 0.18), borderColor: fcColor, borderType: 'dashed', borderWidth: 1.5, borderRadius: radius } })),
      )
    }
    if (display === 'bar') {
      const totalsLabel =
        stack && !percent && settings.stack_totals && i === series.length - 1
          ? { show: true, position: horizontal ? 'right' : 'top', color: c.primary, fontSize: 11, fontWeight: 600, formatter: (p: { dataIndex: number }) => formatValue(totals[p.dataIndex], s.metric, { compact: true }) }
          : undefined
      return {
        type: 'bar',
        name: s.name,
        data,
        stack,
        barMaxWidth: 48,
        barWidth: series.length > 1 && !stack ? undefined : width,
        itemStyle: { color, borderRadius: radius, ...(stack ? { borderColor: c.surface, borderWidth: 1 } : {}) },
        emphasis: { focus: 'series' },
        label: totalsLabel ?? (stack ? (settings.values ? { ...label('inside'), color: '#ffffff' } : undefined) : label(horizontal ? 'right' : 'top')),
      } as SeriesOption
    }
    const smooth = settings.line_style === 'smooth'
    return {
      type: 'line',
      name: s.name,
      data,
      stack,
      smooth,
      step: settings.line_style === 'step' ? 'middle' : undefined,
      connectNulls: true,
      showSymbol: settings.markers === 'always' || (settings.markers !== 'never' && categories.length <= 24),
      symbolSize: 7,
      lineStyle: { width: 2, color },
      itemStyle: { color, borderColor: c.surface, borderWidth: 2 },
      areaStyle:
        display === 'area'
          ? settings.gradient === false || stack
            ? { opacity: stack ? 0.55 : 0.14, color }
            : { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: alpha(color, 0.32) }, { offset: 1, color: alpha(color, 0.02) }] } }
          : undefined,
      emphasis: { focus: 'series' },
      label: label('top'),
      // The highlighted point, ringed and labelled.
      ...(spot >= 0 ? { markPoint: { symbol: 'circle', symbolSize: 12, itemStyle: { color, borderColor: c.surface, borderWidth: 3 }, label: { show: false }, data: [{ coord: [spot, values[spot]] }] } } : {}),
      // Two to four lines are named at their end: the eye need not go back to the legend.
      ...(endLabels ? { endLabel: { show: true, formatter: '{a}', color, fontSize: 11, fontWeight: 600, distance: 6 }, labelLayout: { moveOverlap: 'shiftY' } } : {}),
    } as SeriesOption
  })
  if (forecastFrom !== undefined) {
    const n = forecastFrom
    const label = (j: number) => (catAxis.data[j] as string) ?? ''
    series.forEach((s, i) => {
      const fc = forecasts[i]
      const display = type === 'combo' ? (settings.series?.[s.key]?.display ?? (i === 0 ? 'bar' : 'line')) : type === 'area' ? 'area' : type === 'line' ? 'line' : 'bar'
      if (!fc || display === 'bar') return
      const fcColor = series.length === 1 ? brand : (colors[i] as string)
      // From the last measured point on, so the dashes continue the line.
      const lastAt = s.values.length - 1 - [...s.values].reverse().findIndex((v) => v !== null)
      const data: (number | null)[] = Array.from({ length: n + horizon }, () => null)
      data[lastAt] = s.values[lastAt] ?? null
      fc.values.forEach((v, k) => {
        data[n + k] = v
      })
      out.push({
        type: 'line',
        name: forecastName(s.name),
        data,
        ...(stack ? { stack: 'forecast' } : {}),
        smooth: settings.line_style === 'smooth',
        connectNulls: true,
        showSymbol: horizon <= 12,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, type: 'dashed', color: fcColor },
        itemStyle: { color: fcColor, borderColor: c.surface, borderWidth: 2 },
        areaStyle:
          display === 'area'
            ? { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: alpha(fcColor, 0.2) }, { offset: 1, color: alpha(fcColor, 0.02) }] } }
            : undefined,
        emphasis: { focus: 'series' },
      } as SeriesOption)
      // The 80 % interval of a single forecast: a band that widens with the horizon.
      if (series.length === 1 && !stack && settings.forecast_band !== false) {
        const base: (number | null)[] = Array.from({ length: n + horizon }, () => null)
        const width: (number | null)[] = Array.from({ length: n + horizon }, () => null)
        base[lastAt] = s.values[lastAt] ?? null
        width[lastAt] = 0
        fc.lower.forEach((v, k) => {
          base[n + k] = v
          width[n + k] = (fc.upper[k] as number) - v
        })
        const quiet = { type: 'line', stack: 'band', symbol: 'none', connectNulls: true, silent: true, lineStyle: { opacity: 0 }, emphasis: { disabled: true }, smooth: settings.line_style === 'smooth' }
        out.push({ ...quiet, name: `${HIDDEN}bas`, data: base } as SeriesOption)
        out.push({ ...quiet, name: `${HIDDEN}haut`, data: width, areaStyle: { color: alpha(fcColor, 0.13) } } as SeriesOption)
      }
    })
    // The forecast periods, shaded and named.
    const host = out[0] as { markArea?: unknown }
    host.markArea = {
      silent: true,
      itemStyle: { color: alpha(brand, theme.dark ? 0.08 : 0.06) },
      label: { show: true, position: 'insideTop', color: brand, fontSize: 10, fontWeight: 600, formatter: $t('Prévision') },
      data: [[{ xAxis: label(n) }, { xAxis: label(n + horizon - 1) }]],
    }
  }

  // Reference lines: a goal, the average, the median — on the first series.
  const marks: unknown[] = []
  if (settings.goal !== undefined && settings.goal !== null) {
    marks.push({ ...(horizontal ? { xAxis: settings.goal } : { yAxis: settings.goal }), label: { formatter: settings.goal_label || $t('Objectif') } })
  }
  const counted = first.filter((v): v is number => v !== null).sort((a, b) => a - b)
  for (const kind of counted.length ? (settings.ref_lines ?? []) : []) {
    const name = kind === 'average' ? $t('Moyenne') : $t('Médiane')
    const mid = Math.floor(counted.length / 2)
    const value =
      kind === 'average'
        ? counted.reduce((a, b) => a + b, 0) / counted.length
        : counted.length % 2
          ? (counted[mid] as number)
          : ((counted[mid - 1] as number) + (counted[mid] as number)) / 2
    marks.push({ ...(horizontal ? { xAxis: value } : { yAxis: value }), label: { formatter: `${name} · ${formatValue(value, metric ?? x, { compact: true })}` } })
  }
  if (marks.length && out[0] && !percent) {
    ;(out[0] as { markLine?: unknown }).markLine = {
      symbol: 'none',
      silent: true,
      lineStyle: { color: c.secondary, type: 'dashed', width: 1 },
      label: { color: c.secondary, fontSize: 11, position: horizontal ? 'end' : 'insideEndTop' },
      data: marks,
    }
  }
  const legend = series.length > 1 && settings.legend !== false
  const targets: ColorTarget[] =
    single && !isTemporal(x) && categories.length <= 40
      ? categories.flatMap((v, j) => (v === OTHER_CATEGORY ? [] : [{ key: keyOf(v), name: formatValue(v, x) || '∅', color: barLooks[j] ?? (colors[0] as string) }]))
      : series.filter((s) => s.key !== '__other__').map((s) => ({ key: s.key, name: s.name, color: colors[series.indexOf(s)] as string }))
  return {
    clickColumn: x,
    categories,
    targets,
    ...(forecastFrom !== undefined ? { forecastFrom } : {}),
    option: {
      ...base,
      color: colors,
      grid: { left: 8, right: endLabels ? 72 : 16, top: legend || forecastFrom !== undefined ? 36 : 14, bottom: many ? 34 : 6, containLabel: true },
      legend:
        legend || forecastFrom !== undefined
          ? {
              top: 0,
              left: 0,
              type: 'scroll',
              icon: 'roundRect',
              itemWidth: 10,
              itemHeight: 10,
              itemGap: 18,
              textStyle: { color: c.secondary },
              // Several forecasts wear their series' colour in dashes: the legend need not repeat them.
              data: out
                .map((o) => (o as { name?: string }).name)
                .filter((name): name is string => !!name && !name.startsWith(HIDDEN) && (series.length === 1 || !forecastNames.has(name))),
            }
          : undefined,
      tooltip: {
        ...base.tooltip,
        trigger: 'axis',
        ...(forecastFrom !== undefined
          ? {
              formatter: (params: unknown) => {
                const list = (Array.isArray(params) ? params : [params]) as { seriesName: string; value: unknown; marker: string; axisValueLabel: string; dataIndex: number }[]
                const shown = list.filter((p) => !p.seriesName.startsWith(HIDDEN) && p.value !== null && p.value !== undefined && (p.dataIndex >= (forecastFrom as number) || !forecastNames.has(p.seriesName)))
                if (!shown.length) return ''
                const head = `${list[0]?.axisValueLabel ?? ''}${(list[0]?.dataIndex ?? 0) >= (forecastFrom as number) ? ` · <i>${$t('prévision')}</i>` : ''}`
                return [head, ...shown.map((p) => `${p.marker} ${p.seriesName} <b style="float:right;margin-left:16px">${formatValue(typeof p.value === 'object' && p.value !== null && 'value' in p.value ? (p.value as { value: unknown }).value : p.value, metric ?? x)}</b>`)].join('<br/>')
              },
            }
          : {}),
        axisPointer: { type: type === 'line' || type === 'area' ? 'line' : 'shadow', lineStyle: { color: c.muted }, shadowStyle: { color: theme.dark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.035)' } },
        valueFormatter: (v) => (percent ? percentText(Number(v)) : formatValue(v, metric ?? x)),
      },
      dataZoom: many && !horizontal ? [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 4, borderColor: 'transparent', fillerColor: theme.dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)', showDetail: false }] : undefined,
      xAxis: horizontal ? valAxis : catAxis,
      yAxis: horizontal ? catAxis : valAxis,
      series: out,
    },
  }
}
