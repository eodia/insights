/**
 * Client de l'API REST d'eodia insights, sous le jeton de l'appelant. Le serveur MCP ne lit
 * jamais les données lui-même : chaque outil passe par l'API, donc par Trino et ses permissions.
 */

export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiCallError'
  }
}

export class EodiaApi {
  private readonly base: string

  constructor(
    baseUrl: string,
    private readonly token: string,
  ) {
    this.base = baseUrl.replace(/\/+$/, '')
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${this.base}/api${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.token}`,
          // Tells the API this call comes through MCP: a token issued for MCP alone is accepted.
          'x-eodia-surface': 'mcp',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch (err) {
      throw new ApiCallError(502, 'UNREACHABLE', `API eodia insights injoignable (${this.base}) : ${err instanceof Error ? err.message : String(err)}`)
    }
    if (!res.ok) {
      let payload: { error?: { code?: string; message?: string } } = {}
      try {
        payload = (await res.json()) as typeof payload
      } catch {}
      throw new ApiCallError(res.status, payload.error?.code ?? 'HTTP', payload.error?.message ?? `Erreur HTTP ${res.status}`)
    }
    return (await res.json()) as T
  }
}
