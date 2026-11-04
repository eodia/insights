/**
 * A dashboard pictured as the person would print it: the renderer (Gotenberg, a headless
 * Chromium) opens the interface's print page with a render token, which lets that page read
 * that one dashboard as that one person, for five minutes, and nothing else.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { ExportOptions, ParameterValue } from '@eodia/contracts'
import type { Core } from '../context'

const PREFIX = 'eor_'
const TTL_MS = 5 * 60_000

export interface RenderGrant {
  readonly userId: string
  readonly workspaceId: string
  readonly dashboardId: string
}

const sign = (core: Core, body: string) => createHmac('sha256', core.config.secretKey).update(`render:${body}`).digest('base64url')

/** A token for the print page to read one dashboard as one person, a few minutes long. */
export function renderToken(core: Core, grant: RenderGrant): string {
  const body = Buffer.from(JSON.stringify({ u: grant.userId, w: grant.workspaceId, d: grant.dashboardId, e: Date.now() + TTL_MS })).toString('base64url')
  return `${PREFIX}${body}.${sign(core, body)}`
}

export const isRenderToken = (token: string) => token.startsWith(PREFIX)

/** What a render token grants — nothing when it is forged or expired. */
export function readRenderToken(core: Core, token: string): RenderGrant | null {
  if (!isRenderToken(token)) return null
  const [body, signature] = token.slice(PREFIX.length).split('.')
  if (!body || !signature) return null
  const expected = Buffer.from(sign(core, body))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { u: string; w: string; d: string; e: number }
    if (typeof p.e !== 'number' || p.e < Date.now()) return null
    return { userId: p.u, workspaceId: p.w, dashboardId: p.d }
  } catch {
    return null
  }
}

export const renderEnabled = (core: Core) => core.config.render !== undefined

/** The dashboard as a PDF, or as an image of its pages, seen by `grant`'s person. */
export async function renderDashboard(
  core: Core,
  grant: RenderGrant,
  input: { format: 'pdf' | 'png'; values: Readonly<Record<string, ParameterValue | null>>; options: ExportOptions; locale: string },
): Promise<Buffer> {
  const render = core.config.render
  if (!render) throw new Error('Aucun service de rendu (RENDER_URL) n’est configuré.')
  const page = new URL(`${render.pageUrl}/print/dashboard/${grant.dashboardId}`)
  page.searchParams.set('values', JSON.stringify(input.values))
  page.searchParams.set('options', JSON.stringify(input.options))
  page.searchParams.set('auto', '0')
  page.searchParams.set('render', renderToken(core, grant))
  if (input.format === 'png') page.searchParams.set('screen', '1')

  const form = new FormData()
  form.set('url', page.toString())
  // The page says when every card is drawn.
  form.set('waitForExpression', 'window.__eodiaReady === true')
  form.set('waitDelay', '1s')
  // The page's language is the reader's: the interface reads it from this header.
  form.set('extraHttpHeaders', JSON.stringify({ 'Accept-Language': input.locale || 'fr' }))
  let endpoint: string
  if (input.format === 'pdf') {
    endpoint = '/forms/chromium/convert/url'
    form.set('printBackground', 'true')
    form.set('preferCssPageSize', 'true')
    // The page draws its own margins and foot (logo, numbers).
    for (const side of ['marginTop', 'marginBottom', 'marginLeft', 'marginRight']) form.set(side, '0')
  } else {
    endpoint = '/forms/chromium/screenshot/url'
    form.set('format', 'png')
    form.set('width', '1240')
    form.set('height', '1754')
    form.set('clip', 'false')
    form.set('emulatedMediaType', 'screen')
  }
  const res = await fetch(`${render.url}${endpoint}`, { method: 'POST', body: form, signal: AbortSignal.timeout(90_000) })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new Error(`Le rendu du tableau de bord a échoué (${res.status}) : ${detail}`)
  }
  return Buffer.from(await res.arrayBuffer())
}
