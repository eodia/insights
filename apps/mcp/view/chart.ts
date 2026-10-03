import './locale'
import type { ResultColumn, VisualizationSettings, VisualizationType } from '@eodia/contracts'
import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps'
/**
 * La vue MCP App de `show_chart` : un graphique d'eodia insights rendu dans la conversation,
 * dans l'iframe que le client (Claude, ChatGPT, VS Code…) lui donne. Elle reçoit le résultat
 * de l'outil (`structuredContent`) et le dessine avec la même construction que l'application
 * web (`apps/web/src/lib/viz.ts`) : mêmes formes, couleurs, formats et apparences de valeurs.
 *
 * Empaquetée par esbuild au démarrage du serveur MCP (`src/app.ts`) en un seul fichier HTML.
 */
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from '@modelcontextprotocol/ext-apps/app-with-deps'
import {
  BarChart,
  FunnelChart,
  GaugeChart,
  LineChart,
  PieChart,
  RadarChart,
  ScatterChart,
} from 'echarts/charts'
import {
  DataZoomComponent,
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
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { formatValue } from '../../web/src/lib/format'
import { autoVisualization, chartOption } from '../../web/src/lib/viz'

echarts.use([
  RadarChart,
  RadarComponent,
  MarkPointComponent,
  MarkAreaComponent,
  BarChart,
  LineChart,
  PieChart,
  FunnelChart,
  ScatterChart,
  GaugeChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkLineComponent,
  TitleComponent,
  GraphicComponent,
  TimelineComponent,
  SVGRenderer,
])

/** What `show_chart` hands the view. */
interface ChartPayload {
  readonly title: string
  readonly subtitle?: string
  readonly url?: string
  readonly visualization: {
    readonly type: VisualizationType
    readonly settings?: VisualizationSettings
  }
  readonly result: {
    readonly columns: readonly ResultColumn[]
    readonly rows: ReadonlyArray<readonly unknown[]>
    readonly looks?: Record<string, { value: string; color?: string | null }[]>
    readonly truncated?: boolean
  }
}

const root = document.getElementById('root') as HTMLElement
let payload: ChartPayload | null = null
let chart: echarts.ECharts | null = null
let dark = false

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

function message(text: string, error = false): void {
  chart?.dispose()
  chart = null
  root.replaceChildren(el('p', error ? 'msg error' : 'msg', text))
}

/** A table, for what has no chart: its first rows, formatted as in the app. */
function tableOf(p: ChartPayload): HTMLElement {
  const cols = p.result.columns.filter((c) => !c.hidden)
  const idx = cols.map((c) => p.result.columns.indexOf(c))
  const wrap = el('div', 'table')
  const t = el('table')
  const head = el('tr')
  for (const c of cols) head.append(el('th', c.type === 'number' ? 'num' : '', c.label || c.name))
  t.append(el('thead'))
  t.tHead?.append(head)
  const body = el('tbody')
  for (const row of p.result.rows.slice(0, 200)) {
    const tr = el('tr')
    cols.forEach((c, i) =>
      tr.append(el('td', c.type === 'number' ? 'num' : '', formatValue(row[idx[i] as number], c))),
    )
    body.append(tr)
  }
  t.append(body)
  wrap.append(t)
  return wrap
}

function render(): void {
  if (!payload) return
  const p = payload
  const header = el('header')
  const titles = el('div', 'titles')
  titles.append(el('h1', '', p.title))
  if (p.subtitle) titles.append(el('p', 'sub', p.subtitle))
  header.append(titles)
  if (p.url) {
    const open = el('button', 'open', 'Ouvrir ↗')
    open.title = 'Ouvrir dans eodia insights'
    open.addEventListener('click', () => void app.openLink({ url: p.url as string }))
    header.append(open)
  }
  chart?.dispose()
  chart = null
  const body = el('div', 'body')
  root.replaceChildren(header, body)
  if (p.result.rows.length === 0) {
    body.append(el('p', 'msg', 'Aucun résultat.'))
    return
  }
  const type = p.visualization.type
  const settings = p.visualization.settings ?? {}
  if (type === 'scalar' || type === 'progress' || type === 'trend') {
    const col = p.result.columns.find((c) => c.type === 'number') ?? p.result.columns[0]
    const i = col ? p.result.columns.indexOf(col) : 0
    const last = p.result.rows[p.result.rows.length - 1] ?? []
    body.append(el('div', 'scalar', col ? formatValue(last[i], col) : String(last[i] ?? '')))
    if (col) body.append(el('p', 'sub center', col.label))
    return
  }
  const model =
    type === 'table' || type === 'pivot' || type === 'map'
      ? null
      : chartOption(type, p.result, settings, { dark })
  if (!model) {
    body.append(tableOf(p))
    return
  }
  const box = el('div', 'chart')
  body.append(box)
  chart = echarts.init(box, undefined, { renderer: 'svg' })
  chart.setOption({ ...model.option, backgroundColor: 'transparent' })
  if (p.result.truncated)
    body.append(el('p', 'sub', 'Résultat tronqué : seules les premières lignes sont dessinées.'))
}

function applyContext(ctx: McpUiHostContext | undefined): void {
  if (!ctx) return
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme)
    dark = ctx.theme === 'dark'
  }
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables)
  render()
}

const app = new App({ name: 'eodia-insights-chart', version: '0.1.0' })

app.ontoolinput = () => {
  if (!payload) message('Exécution de la requête…')
}
app.ontoolresult = (result) => {
  if (result.isError) {
    const text = result.content?.find((c) => c.type === 'text')
    message(text && 'text' in text ? String(text.text) : 'La requête a échoué.', true)
    return
  }
  const data = result.structuredContent as ChartPayload | undefined
  if (!data?.result) {
    message('Rien à dessiner.', true)
    return
  }
  payload = {
    ...data,
    visualization: data.visualization ?? { type: autoVisualization(data.result) },
  }
  render()
}
app.onhostcontextchanged = (ctx) => applyContext({ ...app.getHostContext(), ...ctx })
app.onteardown = async () => {
  chart?.dispose()
  return {}
}

window.addEventListener('resize', () => chart?.resize())

await app.connect()
applyContext(app.getHostContext())
if (!payload) message('En attente du résultat…')
