/**
 * Les extraits de code de la colonne de droite : curl et fetch pour un endpoint, configuration
 * des clients MCP. Le jeton n'y figure jamais en clair : `$EODIA_TOKEN`, ou `eoi_…` à remplacer.
 */
import { type McpTool, mcpUrl } from './mcp-tools'
import { type Endpoint, type OpenApiDoc, exampleBody, exampleUrl } from './openapi'

export interface Sample {
  readonly id: string
  readonly label: string
  readonly code: string
}

const origin = () => (typeof window === 'undefined' ? 'http://localhost:3100' : window.location.origin)

/** A JSON body inside single quotes, as a shell reads it. */
const shellQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`

export function endpointSamples(e: Endpoint, doc: OpenApiDoc): Sample[] {
  const url = exampleUrl(e, origin())
  const body = e.method === 'get' || e.method === 'delete' ? undefined : exampleBody(e, doc)
  const json = body === undefined ? null : JSON.stringify(body, null, 2)

  const curl = [
    `curl${e.method === 'get' ? '' : ` -X ${e.method.toUpperCase()}`} ${shellQuote(url)}`,
    ...(e.public ? [] : [`  -H "Authorization: Bearer $EODIA_TOKEN"`]),
    ...(json ? [`  -H 'Content-Type: application/json'`, `  -d ${shellQuote(json)}`] : []),
  ].join(' \\\n')

  const headers = [
    ...(e.public ? [] : ['    Authorization: `Bearer ${process.env.EODIA_TOKEN}`,']),
    ...(json ? ["    'Content-Type': 'application/json',"] : []),
  ]
  const fetchCode = [
    `const res = await fetch('${url.replace(/'/g, "\\'")}', {`,
    `  method: '${e.method.toUpperCase()}',`,
    ...(headers.length ? ['  headers: {', ...headers, '  },'] : []),
    ...(json ? [`  body: JSON.stringify(${json.replace(/\n/g, '\n  ')}),`] : []),
    '})',
    "if (!res.ok) throw new Error((await res.json()).error?.message ?? res.statusText)",
    'const data = await res.json()',
  ].join('\n')

  return [
    { id: 'curl', label: 'curl', code: curl },
    { id: 'fetch', label: 'fetch', code: fetchCode },
  ]
}

export function overviewSamples(): Sample[] {
  const base = origin()
  return [
    {
      id: 'curl',
      label: 'curl',
      code: [
        '# Qui suis-je ? Vérifie que le jeton est valide',
        `curl ${shellQuote(`${base}/api/v1/me`)} \\`,
        '  -H "Authorization: Bearer $EODIA_TOKEN"',
        '',
        '# Une requête SQL Trino, sous vos droits',
        `curl -X POST ${shellQuote(`${base}/api/v1/query`)} \\`,
        '  -H "Authorization: Bearer $EODIA_TOKEN" \\',
        "  -H 'Content-Type: application/json' \\",
        `  -d '{"query": {"kind": "sql", "sql": "SELECT 1"}}'`,
      ].join('\n'),
    },
    {
      id: 'fetch',
      label: 'fetch',
      code: [
        'const api = (path, init = {}) =>',
        `  fetch('${base}/api' + path, {`,
        '    ...init,',
        '    headers: {',
        '      Authorization: `Bearer ${process.env.EODIA_TOKEN}`,',
        "      'Content-Type': 'application/json',",
        '    },',
        '  }).then((r) => r.json())',
        '',
        "const me = await api('/v1/me')",
        "const result = await api('/v1/query', {",
        "  method: 'POST',",
        "  body: JSON.stringify({ query: { kind: 'sql', sql: 'SELECT 1' } }),",
        '})',
      ].join('\n'),
    },
  ]
}

export function mcpSetupSamples(): Sample[] {
  const url = mcpUrl()
  const stdio = {
    mcpServers: {
      'eodia-insights': {
        command: 'npx',
        args: ['tsx', '/chemin/vers/eodia-insights/apps/mcp/src/server.ts', '--stdio'],
        env: { EODIA_URL: origin(), EODIA_TOKEN: 'eoi_…' },
      },
    },
  }
  const desktop = {
    mcpServers: {
      'eodia-insights': {
        command: 'npx',
        args: ['-y', 'mcp-remote', url, '--header', 'Authorization:${EODIA_AUTH}'],
        env: { EODIA_AUTH: 'Bearer eoi_…' },
      },
    },
  }
  const http = { mcpServers: { 'eodia-insights': { type: 'http', url, headers: { Authorization: 'Bearer eoi_…' } } } }
  return [
    { id: 'http', label: 'HTTP', code: `// Client Streamable HTTP (Cursor, VS Code…)\n${JSON.stringify(http, null, 2)}` },
    { id: 'desktop', label: 'Claude Desktop', code: `// claude_desktop_config.json — passerelle mcp-remote vers le serveur HTTP\n${JSON.stringify(desktop, null, 2)}` },
    { id: 'code', label: 'Claude Code', code: `claude mcp add --transport http eodia-insights ${url} \\\n  --header "Authorization: Bearer $EODIA_TOKEN"` },
    { id: 'stdio', label: 'stdio', code: `// Le client lance le serveur lui-même, depuis le dépôt\n${JSON.stringify(stdio, null, 2)}` },
  ]
}

export function mcpToolSamples(tool: McpTool): Sample[] {
  const url = mcpUrl()
  const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool.name, arguments: tool.example } }
  return [
    {
      id: 'curl',
      label: 'curl (JSON-RPC)',
      code: [
        `curl -X POST ${shellQuote(url)} \\`,
        '  -H "Authorization: Bearer $EODIA_TOKEN" \\',
        "  -H 'Content-Type: application/json' \\",
        "  -H 'Accept: application/json, text/event-stream' \\",
        `  -d ${shellQuote(JSON.stringify(call, null, 2))}`,
      ].join('\n'),
    },
    {
      id: 'args',
      label: 'arguments',
      code: JSON.stringify(tool.example, null, 2),
    },
  ]
}
