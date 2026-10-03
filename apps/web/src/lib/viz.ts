/**
 * Des résultats aux graphiques : choisir la forme, répartir dimensions et mesures, construire
 * les options ECharts. Règles (guide dataviz) : couleurs catégorielles dans un ordre fixe,
 * jamais recyclées ; un seul axe des ordonnées ; marques fines ; légende dès deux séries ;
 * grille discrète ; info-bulle partout.
 */
import type { ResultColumn, VisualizationSettings, VisualizationType } from '@eodia/contracts'
import type { EChartsOption, SeriesOption } from 'echarts'
import { formatValue } from './format'
import { $t } from './i18n'

/** Validated categorical order (light / dark), never cycled past eight. */
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
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

export interface Result {
  readonly columns: readonly ResultColumn[]
  readonly rows: ReadonlyArray<readonly unknown[]>
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
    case 'pivot':
      return dims.length >= 2 && metrics.length >= 1
    case 'map':
      return result.columns.some((c) => c.semantic === 'latitude') && result.columns.some((c) => c.semantic === 'longitude')
    default:
      return metrics.length >= 1 && dims.length >= 1
  }
}

export const VIZ_LABELS: Record<VisualizationType, string> = {
  table: 'Tableau',
  scalar: 'Nombre',
  trend: 'Tendance',
  progress: 'Progression',
  gauge: 'Jauge',
  bar: 'Barres',
  row: 'Barres horizontales',
  line: 'Lignes',
  area: 'Aires',
  combo: 'Combiné',
  pie: 'Camembert',
  scatter: 'Nuage de points',
  funnel: 'Entonnoir',
  pivot: 'Tableau croisé',
  map: 'Carte',
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
  type S = { name: string; key: string; metric: ResultColumn; values: (number | null)[] }
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
        s = { name: k === '__other__' ? $t('Autres') : formatValue(row[si], split) || '∅', key: k, metric: metrics[0], values: categories.map(() => null) }
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
  return { x, dims, metrics, categories, series }
}

function axisLabel(col: ResultColumn | undefined, compact = true) {
  return (v: unknown) => (col ? formatValue(v, col, { compact }) : String(v))
}

export interface ChartModel {
  readonly option: EChartsOption
  /** The column a click on a point reads its value from — what it filters by. */
  readonly clickColumn?: ResultColumn
  readonly categories?: unknown[]
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
    let data = result.rows.map((r) => ({ key: keyOf(r[di]), name: formatValue(r[di], d) || '∅', value: Number(r[mi]) || 0, raw: r[di] }))
    if (settings.sort_slices !== false) data.sort((a, b) => b.value - a.value)
    const max = Math.min(Math.max(settings.slices_max ?? 7, 2), 8)
    if (type === 'pie' && data.length > max) {
      const rest = data.slice(max - 1)
      data = [...data.slice(0, max - 1), { key: '__other__', name: $t('Autres'), value: rest.reduce((s, x) => s + x.value, 0), raw: null }]
    }
    const total = data.reduce((s, x) => s + x.value, 0)
    const colored = data.map((x, i) => ({ ...x, itemStyle: { color: x.key === '__other__' ? (theme.dark ? OTHER.dark : OTHER.light) : seriesColor(i, theme) } }))
    if (type === 'funnel') {
      return {
        clickColumn: d,
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
      option: {
        ...base,
        tooltip: { ...base.tooltip, trigger: 'item', formatter: (p: unknown) => {
          const q = p as { name: string; value: number; percent: number; marker: string }
          return `${q.marker} ${q.name}<br/><b>${formatValue(q.value, m)}</b> · ${q.percent.toFixed(1)} %`
        } },
        legend: { show: settings.legend !== false, orient: 'vertical', right: 8, top: 'middle', type: 'scroll', icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: c.secondary } },
        title: donut && settings.total !== false
          ? { text: formatValue(total, m, { compact: true }), subtext: $t('Total'), left: settings.legend === false ? 'center' : '34%', top: 'center', textAlign: 'center', textStyle: { fontSize: 18, fontWeight: 600, color: c.primary }, subtextStyle: { color: c.muted, fontSize: 11 } }
          : undefined,
        series: [
          {
            type: 'pie',
            center: [settings.legend === false ? '50%' : '35%', '50%'],
            radius: donut ? [`${70 - ring}%`, '70%'] : ['0%', '70%'],
            avoidLabelOverlap: true,
            padAngle: 1,
            itemStyle: { borderColor: c.surface, borderWidth: 2, borderRadius: 3 },
            label: { show: settings.slice_labels !== 'none' && !donut, color: c.secondary, formatter: '{d} %' },
            data: colored,
          },
        ],
      },
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
          return `${mx.label} : <b>${formatValue(v[0], mx)}</b><br/>${my.label} : <b>${formatValue(v[1], my)}</b>`
        } },
        xAxis: { type: isNumeric(mx) ? 'value' : 'category', axisLabel: { formatter: axisLabel(mx), color: c.muted }, splitLine: { lineStyle: { color: c.grid, type: 'dashed' } }, axisLine: { lineStyle: { color: c.grid } } },
        yAxis: { type: 'value', axisLabel: { formatter: axisLabel(my), color: c.muted }, splitLine: { lineStyle: { color: c.grid, type: 'dashed' } } },
        series: [{ type: 'scatter', symbolSize: 9, itemStyle: { color: seriesColor(0, theme), opacity: 0.75, borderColor: c.surface, borderWidth: 1 }, data: result.rows.map((r) => [r[xi], r[yi]]) as never }],
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
            progress: { show: true, width: 14, roundCap: true, itemStyle: { color: settings.color ?? seriesColor(0, theme) } },
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

  // Cartesian: bar, row, line, area, combo.
  const { x, series, categories } = cartesian(result, settings)
  if (!x || series.length === 0) return null
  const horizontal = type === 'row'
  const stack = settings.stack && settings.stack !== 'none' ? 'total' : undefined
  const percent = settings.stack === 'percent'
  const metric = series[0]?.metric
  const totals = categories.map((_, i) => series.reduce((s, x) => s + Math.abs(x.values[i] ?? 0), 0))
  const many = categories.length > 40
  const catAxis = {
    type: 'category' as const,
    data: categories.map((v) => formatValue(v, x) || '∅'),
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
    axisLabel: { color: c.muted, formatter: percent ? (v: number) => `${v} %` : axisLabel(metric) },
    splitLine: { show: settings.grid_lines !== false, lineStyle: { color: c.grid, type: 'dashed' as const } },
    ...(settings.y_axis === false ? { show: false } : {}),
    ...(settings.y_label ? { name: settings.y_label, nameTextStyle: { color: c.muted } } : {}),
  }
  const width = settings.bar_width === 'thin' ? '35%' : settings.bar_width === 'wide' ? '80%' : '58%'
  const out: SeriesOption[] = series.map((s, i) => {
    const display = type === 'combo' ? (settings.series?.[s.key]?.display ?? (i === 0 ? 'bar' : 'line')) : type === 'row' ? 'bar' : type === 'area' ? 'area' : type === 'line' ? 'line' : 'bar'
    const color = settings.series?.[s.key]?.color ?? (series.length === 1 && settings.color ? settings.color : s.key === '__other__' ? (theme.dark ? OTHER.dark : OTHER.light) : seriesColor(i, theme))
    const data = percent ? s.values.map((v, j) => (v === null ? null : (Math.abs(v) / (totals[j] || 1)) * 100)) : s.values
    if (display === 'bar') {
      return {
        type: 'bar',
        name: s.name,
        data,
        stack,
        barMaxWidth: 48,
        barWidth: series.length > 1 && !stack ? undefined : width,
        itemStyle: { color, borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
        emphasis: { focus: 'series' },
        label: settings.values ? { show: true, position: horizontal ? 'right' : 'top', color: c.secondary, fontSize: 11, formatter: (p: { value: unknown }) => formatValue(p.value, s.metric, { compact: true }) } : undefined,
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
      areaStyle: display === 'area' ? { opacity: stack ? 0.55 : 0.14, color } : undefined,
      emphasis: { focus: 'series' },
      label: settings.values ? { show: true, position: 'top', color: c.secondary, fontSize: 11, formatter: (p: { value: unknown }) => formatValue(p.value, s.metric, { compact: true }) } : undefined,
    } as SeriesOption
  })
  if (settings.goal !== undefined && settings.goal !== null && out[0]) {
    ;(out[0] as { markLine?: unknown }).markLine = {
      symbol: 'none',
      silent: true,
      lineStyle: { color: c.secondary, type: 'dashed' },
      label: { formatter: settings.goal_label || $t('Objectif'), color: c.secondary },
      data: [horizontal ? { xAxis: settings.goal } : { yAxis: settings.goal }],
    }
  }
  const legend = series.length > 1 && settings.legend !== false
  return {
    clickColumn: x,
    categories,
    option: {
      ...base,
      color: series.map((_, i) => seriesColor(i, theme)),
      grid: { left: 8, right: 16, top: legend ? 36 : 14, bottom: many ? 34 : 6, containLabel: true },
      legend: legend ? { top: 0, left: 0, type: 'scroll', icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 18, textStyle: { color: c.secondary } } : undefined,
      tooltip: {
        ...base.tooltip,
        trigger: 'axis',
        axisPointer: { type: type === 'line' || type === 'area' ? 'line' : 'shadow', lineStyle: { color: c.muted }, shadowStyle: { color: theme.dark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.035)' } },
        valueFormatter: (v) => (percent ? `${Number(v).toFixed(1)} %` : formatValue(v, metric ?? x)),
      },
      dataZoom: many && !horizontal ? [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 4, borderColor: 'transparent', fillerColor: theme.dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)', showDetail: false }] : undefined,
      xAxis: horizontal ? valAxis : catAxis,
      yAxis: horizontal ? catAxis : valAxis,
      series: out,
    },
  }
}
