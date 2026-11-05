/**
 * L'image d'un graphique, pour les clients MCP sans MCP Apps (Open WebUI…) : `view/render.ts`
 * (la construction des graphiques du web, rendue en SVG par ECharts côté serveur) empaqueté par
 * esbuild au premier besoin, puis le SVG converti en PNG par resvg avec la police Geist fournie
 * — une image que tout client affiche, et que le modèle peut lire.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** What `view/render.ts` draws: the chart's title, its visualization and its result. */
export interface RenderInput {
  readonly title: string
  readonly subtitle?: string
  readonly visualization?: { readonly type: string; readonly settings?: Record<string, unknown> }
  readonly result: { readonly columns: readonly unknown[]; readonly rows: ReadonlyArray<readonly unknown[]> }
}

type Renderer = { renderSvg: (input: RenderInput) => string | null; FONT: string }

const here = dirname(fileURLToPath(import.meta.url))
let renderer: Promise<Renderer> | null = null

/** The renderer, built on first use and kept. */
function load(): Promise<Renderer> {
  renderer ??= (async () => {
    const { build } = await import('esbuild')
    const out = await build({
      entryPoints: [join(here, '../view/render.ts')],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [
        {
          // The contracts' constants without their zod schemas, as for the view.
          name: 'contracts-light',
          setup(b) {
            b.onResolve({ filter: /^@eodia\/contracts$/ }, () => ({ path: join(here, '../view/contracts.ts') }))
          },
        },
      ],
      logLevel: 'silent',
    })
    const dir = await mkdtemp(join(tmpdir(), 'eodia-mcp-'))
    const file = join(dir, 'render.mjs')
    await writeFile(file, out.outputFiles[0]?.text ?? '')
    return (await import(pathToFileURL(file).href)) as Renderer
  })()
  return renderer
}

const FONT_FILE = join(here, '../assets/Geist-Regular.ttf')

/** The chart as a PNG, or null when it is not drawn (a table) or cannot be. */
export async function chartPng(input: RenderInput): Promise<Buffer | null> {
  try {
    const { renderSvg, FONT } = await load()
    const svg = renderSvg(input)
    if (!svg) return null
    const { Resvg } = await import('@resvg/resvg-js')
    const png = new Resvg(svg, {
      font: { fontFiles: [FONT_FILE], loadSystemFonts: false, defaultFontFamily: FONT, sansSerifFamily: FONT },
      fitTo: { mode: 'zoom', value: 2 },
    })
      .render()
      .asPng()
    return Buffer.from(png)
  } catch (err) {
    console.error('[eodia-mcp] image du graphique impossible :', err instanceof Error ? err.message : err)
    return null
  }
}
