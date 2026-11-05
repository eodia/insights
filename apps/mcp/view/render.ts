/**
 * Un graphique d'eodia insights dessiné sur le serveur, en SVG : pour les clients MCP qui
 * n'affichent pas les vues MCP Apps (Open WebUI…), `show_chart` joint l'image du graphique.
 * Même construction que l'application web (`apps/web/src/lib/viz.ts`) et que la vue.
 *
 * Empaquetée par esbuild pour Node au premier besoin (`src/render.ts`).
 */
import type { ResultColumn, VisualizationSettings, VisualizationType } from '@eodia/contracts'
import * as echarts from 'echarts'
import { formatValue } from '../../web/src/lib/format'
import { autoVisualization, chartOption } from '../../web/src/lib/viz'

export interface RenderInput {
  readonly title: string
  readonly subtitle?: string
  readonly visualization?: { readonly type: VisualizationType; readonly settings?: VisualizationSettings }
  readonly result: { readonly columns: readonly ResultColumn[]; readonly rows: ReadonlyArray<readonly unknown[]> }
}

export const FONT = 'Geist'
const WIDTH = 880
const HEIGHT = 480
const INK = '#18181b'
const MUTED = '#71717a'

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A figure alone: large, with what it measures beneath. */
function figure(input: RenderInput): string {
  const { columns, rows } = input.result
  const col = columns.find((c) => c.type === 'number') ?? columns[0]
  const i = col ? columns.indexOf(col) : 0
  const last = rows[rows.length - 1] ?? []
  const value = col ? formatValue(last[i], col) : String(last[i] ?? '')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="260" viewBox="0 0 ${WIDTH} 260">
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="32" y="48" font-family="${FONT}" font-size="20" font-weight="600" fill="${INK}">${escape(input.title)}</text>
<text x="32" y="165" font-family="${FONT}" font-size="76" font-weight="700" fill="${INK}">${escape(value)}</text>
<text x="32" y="212" font-family="${FONT}" font-size="18" fill="${MUTED}">${escape(col?.label ?? '')}</text>
</svg>`
}

const MOMENT = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?/

/**
 * A date column of raw SQL says nothing of its grain: read from its values — all at midnight on
 * the first of a quarter's month, a month, a year — so an axis reads « oct. 2024 », not
 * « 1 oct. 2024, 00:00 ».
 */
function withUnits(result: RenderInput['result']): RenderInput['result'] {
  const columns = result.columns.map((c, i) => {
    if (c.unit || !/^(date|timestamp|datetime)/i.test(c.type)) return c
    const parts = result.rows.map((r) => MOMENT.exec(String(r[i] ?? ''))).filter((m): m is RegExpExecArray => m !== null)
    if (!parts.length || parts.some((m) => (m[4] ?? '00') !== '00' || (m[5] ?? '00') !== '00' || (m[6] ?? '00') !== '00')) return c
    const firstOfMonth = parts.every((m) => m[3] === '01')
    const unit = firstOfMonth && parts.every((m) => m[2] === '01') ? 'year' : firstOfMonth && parts.every((m) => ['01', '04', '07', '10'].includes(m[2] as string)) && parts.length > 1 ? 'quarter' : firstOfMonth ? 'month' : 'day'
    return { ...c, unit } as ResultColumn
  })
  return { ...result, columns }
}

/** The chart as an SVG document, or null for what is not drawn (a table, a map). */
export function renderSvg(given: RenderInput): string | null {
  const input = { ...given, result: withUnits(given.result) }
  if (input.result.rows.length === 0) return null
  const type = input.visualization?.type ?? autoVisualization(input.result as never)
  if (type === 'scalar' || type === 'progress' || type === 'trend') return figure(input)
  if (type === 'table' || type === 'pivot' || type === 'map') return null
  const model = chartOption(type, input.result as never, input.visualization?.settings ?? {}, { dark: false, font: FONT, animation: false })
  if (!model) return null
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: WIDTH, height: HEIGHT })
  const option = model.option as Record<string, unknown>
  const grid = (option.grid ?? {}) as Record<string, unknown>
  chart.setOption({
    ...option,
    animation: false,
    backgroundColor: '#ffffff',
    title: { text: input.title, ...(input.subtitle ? { subtext: input.subtitle } : {}), left: 24, top: 16, textStyle: { fontFamily: FONT, fontSize: 18, fontWeight: 600, color: INK }, subtextStyle: { fontFamily: FONT, color: MUTED } },
    // Room for the title above the plot.
    grid: Array.isArray(grid) ? grid : { ...grid, top: Math.max(Number(grid.top) || 0, input.subtitle ? 92 : 72), left: grid.left ?? 24, right: Math.max(Number(grid.right) || 0, 48) },
  })
  const svg = chart.renderToSVGString()
  chart.dispose()
  return svg
}
