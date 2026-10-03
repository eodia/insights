/**
 * MCP Apps (extension `io.modelcontextprotocol/ui`) : `show_chart` déclare une interface,
 * `ui://eodia/chart.html`, que le client affiche dans la conversation, dans une iframe isolée.
 * La page est construite une fois, au premier besoin : esbuild empaquette `view/chart.ts`
 * (le SDK officiel, ECharts et la construction des graphiques du web) en un seul fichier,
 * sans aucune ressource externe — la politique de sécurité par défaut des clients suffit.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RESOURCE_MIME_TYPE, registerAppResource } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export const CHART_URI = 'ui://eodia/chart.html'

const STYLE = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
html, body { margin: 0; background: transparent; }
body {
  font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  color: var(--color-text-primary, #18181b);
  font-size: 13px;
}
[data-theme="dark"] body { color: var(--color-text-primary, #f4f4f5); }
#root { padding: 14px 16px 12px; }
header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
.titles { flex: 1; min-width: 0; }
h1 { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { margin: 2px 0 0; color: var(--color-text-secondary, #71717a); font-size: 12px; }
.center { text-align: center; }
.open {
  flex-shrink: 0; cursor: pointer; font: inherit; font-size: 12px; padding: 4px 10px; border-radius: var(--border-radius-md, 6px);
  border: 1px solid var(--color-border-primary, #e4e4e7); background: var(--color-background-primary, transparent); color: inherit;
}
.open:hover { background: var(--color-background-secondary, rgba(0,0,0,.04)); }
.chart { width: 100%; height: 340px; }
.scalar { font-size: 40px; font-weight: 600; text-align: center; padding: 24px 0 4px; font-variant-numeric: tabular-nums; }
.msg { margin: 24px 0; text-align: center; color: var(--color-text-secondary, #71717a); }
.msg.error { color: var(--color-text-danger, #dc2626); }
.table { max-height: 360px; overflow: auto; border: 1px solid var(--color-border-primary, #e4e4e7); border-radius: var(--border-radius-md, 8px); }
table { border-collapse: collapse; width: 100%; font-size: 12px; }
th, td { padding: 6px 10px; text-align: left; white-space: nowrap; border-bottom: 1px solid var(--color-border-secondary, #f0f0f2); }
th { position: sticky; top: 0; background: var(--color-background-secondary, #fafafa); font-weight: 600; }
[data-theme="dark"] th { background: var(--color-background-secondary, #27272a); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
`

let page: Promise<string> | null = null

/** The page, built on first use and kept: a self-contained HTML document. */
export function chartPage(): Promise<string> {
  page ??= (async () => {
    const { build } = await import('esbuild')
    const here = dirname(fileURLToPath(import.meta.url))
    const out = await build({
      entryPoints: [join(here, '../view/chart.ts')],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      minify: true,
      legalComments: 'none',
      define: { 'process.env.NODE_ENV': '"production"' },
      // The contracts' constants without their zod schemas: a lighter page.
      plugins: [
        {
          name: 'contracts-light',
          setup(b) {
            b.onResolve({ filter: /^@eodia\/contracts$/ }, () => ({
              path: join(here, '../view/contracts.ts'),
            }))
          },
        },
      ],
      logLevel: 'silent',
    })
    // `</script` inside the code would close the tag: escaped, it stays a string.
    const js = (out.outputFiles[0]?.text ?? '').replace(/<\/script/gi, '<\\/script')
    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>eodia insights</title>
<style>${STYLE}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${js}</script>
</body>
</html>`
  })()
  // A failed build is tried again on the next read.
  page.catch(() => {
    page = null
  })
  return page
}

export function registerChartApp(server: McpServer): void {
  registerAppResource(
    server,
    'Graphique eodia insights',
    CHART_URI,
    {
      description: 'Affiche le résultat de show_chart sous forme de graphique.',
      mimeType: RESOURCE_MIME_TYPE,
    },
    async () => ({
      contents: [
        {
          uri: CHART_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await chartPage(),
          _meta: { ui: { prefersBorder: true } },
        },
      ],
    }),
  )
}
