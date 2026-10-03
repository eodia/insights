/**
 * Le client HTTP du front. Même origine (les `/api/*` sont relayés vers l'API) : le cookie de
 * session part seul ; chaque écriture porte `X-Eodia-Csrf`.
 */
import type { ErrorCode, QueryResult } from '@eodia/contracts'
import { $t } from './i18n'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(method === 'GET' ? {} : { 'x-eodia-csrf': '1' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...init,
  })
  if (!res.ok) {
    let payload: { error?: { code?: ErrorCode; message?: string; details?: unknown } } = {}
    try {
      payload = await res.json()
    } catch {}
    const err = new ApiError(res.status, payload.error?.code ?? 'INTERNAL', payload.error?.message ?? $t('Erreur {status}', { status: res.status }), payload.error?.details)
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth') && !path.startsWith('/public')) {
      const back = window.location.pathname + window.location.search
      if (!window.location.pathname.startsWith('/login')) window.location.href = `/login?return=${encodeURIComponent(back)}`
    }
    throw err
  }
  const type = res.headers.get('content-type') ?? ''
  return (type.includes('application/json') ? res.json() : res.text()) as Promise<T>
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>('GET', path, undefined, init),
  post: <T>(path: string, body: unknown = {}, init?: RequestInit) => request<T>('POST', path, body, init),
  put: <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown = {}) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}

/** A result as the API sends it: with the SQL run and the looks of its values. */
export interface RunResult extends QueryResult {
  readonly sql: string
  readonly looks?: Record<string, { value: string; label?: string | null; color?: string | null; icon?: string | null; image_url?: string | null }[]>
}

/** Downloads a POSTed export (CSV, JSON, XLSX). */
export async function download(path: string, body: unknown): Promise<void> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-eodia-csrf': '1' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new ApiError(res.status, payload.error?.code ?? 'INTERNAL', payload.error?.message ?? $t('Export impossible.'))
  }
  const blob = await res.blob()
  const name = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get('content-disposition') ?? '')?.[1]
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name ? decodeURIComponent(name) : 'export'
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Reads a server-sent event stream from a POST (the copilot). */
export async function* postStream(path: string, body: unknown, signal?: AbortSignal): AsyncGenerator<{ event: string; data: unknown }> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-eodia-csrf': '1' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  })
  if (!res.ok || !res.body) {
    const payload = await res.json().catch(() => ({}))
    throw new ApiError(res.status, payload.error?.code ?? 'INTERNAL', payload.error?.message ?? $t('Erreur du copilot.'))
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep = buffer.indexOf('\n\n')
    while (sep >= 0) {
      const chunk = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      sep = buffer.indexOf('\n\n')
      let event = 'message'
      const data: string[] = []
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      }
      if (data.length) {
        try {
          yield { event, data: JSON.parse(data.join('\n')) }
        } catch {
          yield { event, data: data.join('\n') }
        }
      }
    }
  }
}
