'use client'

import { cn } from '@/lib/utils'
import type { ECElementEvent, EChartsOption } from 'echarts'
import {
  BarChart,
  CustomChart,
  FunnelChart,
  GraphChart,
  GaugeChart,
  HeatmapChart,
  SunburstChart,
  TreemapChart,
  LineChart,
  MapChart,
  PieChart,
  RadarChart,
  ScatterChart,
} from 'echarts/charts'
import {
  CalendarComponent,
  DataZoomComponent,
  PolarComponent,
  GeoComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  RadarComponent,
  TimelineComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'

/**
 * One chart, drawn by echarts — only the pieces the dashboards use, rendered in SVG: crisp
 * text at any zoom, and light enough for a dashboard of twenty cards. The options come
 * whole from `lib/analytics/charts.ts`; this only draws them, follows its box's size, and
 * hands a click — or a right click — back.
 */

echarts.use([
  CustomChart,
  GraphChart,
  PolarComponent,
  HeatmapChart,
  SunburstChart,
  TreemapChart,
  CalendarComponent,
  RadarChart,
  RadarComponent,
  MarkPointComponent,
  MarkAreaComponent,
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  FunnelChart,
  GaugeChart,
  MapChart,
  GridComponent,
  GraphicComponent,
  TimelineComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  MarkLineComponent,
  DataZoomComponent,
  VisualMapComponent,
  GeoComponent,
  SVGRenderer,
])

/**
 * What makes two options the same chart: their components and their series (type, name,
 * stack, coordinate system). With the same shape, only the data changed — it is merged, and
 * ECharts animates the marks from their old values to the new ones.
 */
function shapeOf(option: EChartsOption): string {
  const o = option as Record<string, unknown>
  if (o.baseOption !== undefined) return `timeline:${Math.random()}`
  const list = (v: unknown) => (Array.isArray(v) ? v : v === undefined ? [] : [v]) as Record<string, unknown>[]
  return JSON.stringify({
    keys: Object.keys(o).filter((k) => o[k] !== undefined).sort(),
    series: list(o.series).map((s) => [s.type, s.name, s.stack, s.coordinateSystem]),
    axes: [...list(o.xAxis), ...list(o.yAxis)].map((a) => a.type),
  })
}

/** A map's regions, registered once for every chart that draws it. */
export function registerMap(name: string, geo: unknown): void {
  if (echarts.getMap(name) !== undefined && echarts.getMap(name) !== null) return
  echarts.registerMap(name, geo as Parameters<typeof echarts.registerMap>[1])
}

export function EChart({
  option,
  onClick,
  onContextMenu,
  onAxisContextMenu,
  onBandClick,
  className,
  label,
}: {
  readonly option: EChartsOption
  readonly onClick?: (event: ECElementEvent) => void
  /** A right click on a mark: the browser's own menu gives way to the one this opens. */
  readonly onContextMenu?: (event: ECElementEvent) => void
  /**
   * A right click beside the marks, on the period the axis tooltip shows: a point of a line is
   * a small target; the period under the pointer is not.
   */
  readonly onAxisContextMenu?: (dataIndex: number, at: { x: number; y: number }) => void
  /**
   * A click beside the marks, in the band of a category: its rank on the axis — `y` for
   * horizontal bars. A thin bar is a small target; its whole band is not.
   */
  readonly onBandClick?: {
    readonly axis: 'x' | 'y'
    readonly handle: (index: number, at: { x: number; y: number }) => void
  }
  readonly className?: string
  /** What the chart shows, for whoever cannot see it. */
  readonly label?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)
  const click = useRef(onClick)
  click.current = onClick
  const menu = useRef(onContextMenu)
  menu.current = onContextMenu
  const axisMenu = useRef(onAxisContextMenu)
  axisMenu.current = onAxisContextMenu
  const band = useRef(onBandClick)
  band.current = onBandClick

  useEffect(() => {
    const element = host.current
    if (element === null) return
    const instance = echarts.init(element, undefined, { renderer: 'svg' })
    chart.current = instance
    instance.on('click', (event) => click.current?.(event as ECElementEvent))
    // The mouse event a mark answered, so that the axis does not answer it a second time.
    let answered: unknown = null
    instance.on('contextmenu', (event) => {
      const open = menu.current
      if (open === undefined) return
      answered = event.event
      ;(event.event?.event as unknown as MouseEvent | undefined)?.preventDefault()
      // The tooltip would cover the menu.
      instance.dispatchAction({ type: 'hideTip' })
      open(event as ECElementEvent)
    })
    // The period the axis tooltip shows, as long as it shows one.
    let tip: number | null = null
    instance.on('showTip', (event) => {
      const index = (event as { dataIndex?: number }).dataIndex
      tip = typeof index === 'number' ? index : null
    })
    instance.on('hideTip', () => {
      tip = null
    })
    instance.getZr().on('contextmenu', (event) => {
      const open = axisMenu.current
      const index = tip
      if (open === undefined || index === null || !instance.containPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY])) return
      const native = event.event as unknown as MouseEvent
      native.preventDefault()
      // After the marks: one that was right-clicked has opened its own menu.
      queueMicrotask(() => {
        if (answered === event) return
        instance.dispatchAction({ type: 'hideTip' })
        open(index, { x: native.clientX, y: native.clientY })
      })
    })
    instance.getZr().on('click', (event) => {
      const current = band.current
      // A mark answers through `click`; only the empty band is read here.
      if (current === undefined || (event.target !== undefined && event.target !== null)) return
      const point = [event.offsetX, event.offsetY]
      if (!instance.containPixel({ gridIndex: 0 }, point)) return
      const values = instance.convertFromPixel({ gridIndex: 0 }, point) as number[] | number
      const index = Array.isArray(values) ? values[current.axis === 'x' ? 0 : 1] : values
      const native = event.event as unknown as MouseEvent
      if (typeof index === 'number' && Number.isFinite(index)) {
        current.handle(Math.round(index), { x: native.clientX, y: native.clientY })
      }
    })
    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(element)
    return () => {
      observer.disconnect()
      instance.dispose()
      chart.current = null
    }
  }, [])

  // New data for the same chart moves its marks (ECharts' dynamic data); another chart is drawn anew.
  const shape = useRef<string | null>(null)
  useEffect(() => {
    const instance = chart.current
    if (instance === null) return
    const next = shapeOf(option)
    instance.setOption(option, next === shape.current ? { notMerge: false, replaceMerge: ['series'] } : { notMerge: true })
    shape.current = next
  }, [option])

  return (
    <div
      ref={host}
      role="img"
      aria-label={label}
      className={cn(
        'size-full min-h-0',
        (onClick !== undefined || onBandClick !== undefined) && '[&_path]:cursor-pointer',
        className,
      )}
    />
  )
}
