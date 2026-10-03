/**
 * Serveur MCP d'eodia insights.
 *
 * - HTTP (défaut) : transport Streamable HTTP sans session sur `POST /mcp`. Chaque requête
 *   porte son jeton `Authorization: Bearer eoi_…`, relayé tel quel à l'API : le serveur ne
 *   détient aucun secret et sert plusieurs personnes à la fois.
 * - stdio (`--stdio`) : pour un client qui lance le serveur lui-même (Claude Desktop…), avec
 *   `EODIA_URL` et `EODIA_TOKEN` dans l'environnement.
 */
import { existsSync, readFileSync } from 'node:fs'
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { parseEnv } from 'node:util'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { EodiaApi } from './api'
import { registerTools } from './tools'

/** The repository's `.env` (then `.env.local`), without overriding the real environment. */
function loadEnvFiles(): void {
  let dir = process.cwd()
  for (let i = 0; i < 8 && !existsSync(join(dir, 'pnpm-workspace.yaml')); i++) dir = dirname(dir)
  const values: Record<string, string> = {}
  for (const name of ['.env', '.env.local']) {
    const path = join(dir, name)
    if (existsSync(path)) Object.assign(values, parseEnv(readFileSync(path, 'utf8')))
  }
  for (const [key, value] of Object.entries(values)) if (process.env[key] === undefined) process.env[key] = value
}
loadEnvFiles()

const VERSION = '0.1.0'
const INSTRUCTIONS =
  "eodia insights est un outil de BI : ses données viennent de plusieurs bases, toutes interrogées par Trino sous les droits du propriétaire du jeton. Pour répondre à une question chiffrée, préférez une métrique existante (list_metrics, query_metric) ou une question enregistrée (list_questions, run_question) ; sinon repérez les tables (search_schema, describe_table) puis écrivez du SQL Trino (run_sql)."

function newServer(api: EodiaApi): McpServer {
  const server = new McpServer({ name: 'eodia-insights', version: VERSION }, { instructions: INSTRUCTIONS })
  registerTools(server, api)
  return server
}

// ── stdio ───────────────────────────────────────────────────────────────────

async function runStdio(): Promise<void> {
  const url = process.env.EODIA_URL ?? 'http://localhost:4100'
  const token = process.env.EODIA_TOKEN
  if (!token) {
    // stdout belongs to the protocol: everything else goes to stderr.
    console.error('[eodia-mcp] EODIA_TOKEN manquant : créez un jeton (surface MCP) depuis la page « API et MCP ».')
    process.exit(1)
  }
  const server = newServer(new EodiaApi(url, token))
  await server.connect(new StdioServerTransport())
  console.error(`[eodia-mcp] prêt en stdio, API ${url}`)
}

// ── HTTP ────────────────────────────────────────────────────────────────────

const MAX_BODY = 4 * 1024 * 1024

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('Corps de requête trop volumineux.'))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined)
      } catch {
        reject(new Error('JSON invalide.'))
      }
    })
    req.on('error', reject)
  })
}

function rpcError(res: ServerResponse, status: number, code: number, message: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }))
}

// Tokens travel in a header, never in a cookie: letting any origin call is safe, and lets
// browser-based MCP inspectors reach the server.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, accept, mcp-session-id, mcp-protocol-version, last-event-id',
  'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version',
}

async function handleMcp(req: IncomingMessage, res: ServerResponse, apiUrl: string): Promise<void> {
  if (req.method !== 'POST') {
    // Stateless: no session to resume a stream on, nor to close.
    rpcError(res, 405, -32000, 'Méthode non autorisée : ce serveur est sans session, utilisez POST.', { allow: 'POST, OPTIONS' })
    return
  }
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ') || auth.length < 12) {
    rpcError(res, 401, -32001, "Jeton manquant : en-tête « Authorization: Bearer eoi_… » attendu (jeton d'intégration avec la surface MCP).", {
      'www-authenticate': 'Bearer realm="eodia-insights"',
    })
    return
  }
  let body: unknown
  try {
    body = await readBody(req)
  } catch (err) {
    rpcError(res, 400, -32700, err instanceof Error ? err.message : 'Requête illisible.')
    return
  }
  const server = newServer(new EodiaApi(apiUrl, auth.slice(7).trim()))
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => {
    void transport.close()
    void server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, body)
}

function runHttp(): void {
  const port = Number(process.env.EODIA_MCP_PORT ?? 4200)
  const host = process.env.EODIA_MCP_HOST ?? '0.0.0.0'
  const apiUrl = process.env.EODIA_API_URL ?? process.env.EODIA_URL ?? 'http://localhost:4100'
  const http = createServer((req, res) => {
    for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v)
    const path = (req.url ?? '/').split('?')[0]
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }
    if (path === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, version: VERSION }))
      return
    }
    if (path !== '/mcp' && path !== '/mcp/') {
      rpcError(res, 404, -32000, 'Introuvable : le point MCP est /mcp.')
      return
    }
    handleMcp(req, res, apiUrl).catch((err: unknown) => {
      console.error('[eodia-mcp]', err)
      if (!res.headersSent) rpcError(res, 500, -32603, 'Erreur interne du serveur MCP.')
    })
  })
  http.listen(port, host, () => console.log(`[eodia-mcp] prêt sur http://localhost:${port}/mcp (API ${apiUrl})`))
  const shutdown = () => {
    http.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

if (process.argv.includes('--stdio')) await runStdio()
else runHttp()
