/** Configuration de l'instance, lue une fois dans l'environnement. */
import { createHash } from 'node:crypto'
import { loadEnvFiles } from './env'

export interface Config {
  readonly databaseUrl: string
  readonly databaseSchema: string
  /** 32 bytes, hex: encrypts the sources' secrets. */
  readonly secretKey: Buffer
  readonly trinoUrl: string
  readonly trinoServiceUser: string
  readonly trinoPassword?: string
  /** Host Trino uses for `localhost` (dev: Trino in a container, the databases on the machine). */
  readonly trinoLocalhostAlias?: string
  /** Shared secret in the OPA endpoint's path. */
  readonly opaSecret: string
  /** The address people reach the application at: `http://localhost:3100`. */
  readonly publicUrl: string
  readonly cookieSecure: boolean
  readonly sessionDays: number
  readonly maxRows: number
  readonly queryTimeoutMs: number
  readonly defaultCacheTtl: number
  readonly oidc?: {
    readonly issuer: string
    readonly clientId: string
    readonly clientSecret?: string
    readonly label: string
    readonly scopes: string
    /** Claims copied as user attributes: `region,departement`. */
    readonly attributeClaims: readonly string[]
    /** Claim holding group names to mirror. */
    readonly groupsClaim?: string
  }
  readonly passwordLogin: boolean
  readonly smtp?: { readonly url: string; readonly from: string }
  readonly ai: {
    readonly provider: 'anthropic' | 'openai' | 'mistral' | 'openai-compatible' | 'none'
    readonly apiKey?: string
    readonly model: string
    readonly baseUrl?: string
    readonly hourlyQuota: number
  }
  readonly demo: boolean
  readonly inProcessWorker: boolean
}

const env = (key: string, fallback?: string) => {
  const v = process.env[key]
  return v === undefined || v === '' ? fallback : v
}

export function loadConfig(): Config {
  loadEnvFiles()
  const rawKey = env('EODIA_SECRET_KEY')
  const dev = env('NODE_ENV', 'development') !== 'production'
  if (!rawKey && !dev) throw new Error('EODIA_SECRET_KEY est obligatoire en production (64 caractères hexadécimaux).')
  const secretKey = rawKey
    ? /^[0-9a-f]{64}$/i.test(rawKey)
      ? Buffer.from(rawKey, 'hex')
      : createHash('sha256').update(rawKey).digest()
    : createHash('sha256').update('eodia-insights-dev-key').digest()

  const provider = (env('EODIA_AI_PROVIDER') ??
    (env('ANTHROPIC_API_KEY') ? 'anthropic' : env('OPENAI_API_KEY') ? 'openai' : 'none')) as Config['ai']['provider']
  const issuer = env('EODIA_OIDC_ISSUER')
  const publicUrl = env('EODIA_PUBLIC_URL', 'http://localhost:3100') as string

  return {
    databaseUrl: env('EODIA_DATABASE_URL', 'postgres://eodia:eodia@localhost:55435/eodia') as string,
    databaseSchema: env('EODIA_DATABASE_SCHEMA', 'eodia') as string,
    secretKey,
    trinoUrl: env('EODIA_TRINO_URL', 'http://localhost:58080') as string,
    trinoServiceUser: env('EODIA_TRINO_SERVICE_USER', 'eodia-service') as string,
    ...(env('EODIA_TRINO_PASSWORD') ? { trinoPassword: env('EODIA_TRINO_PASSWORD') } : {}),
    ...(env('EODIA_TRINO_LOCALHOST_ALIAS', dev ? 'host.docker.internal' : undefined)
      ? { trinoLocalhostAlias: env('EODIA_TRINO_LOCALHOST_ALIAS', 'host.docker.internal') }
      : {}),
    opaSecret: env('EODIA_OPA_SECRET', 'dev-opa-secret') as string,
    publicUrl,
    cookieSecure: publicUrl.startsWith('https://'),
    sessionDays: Number(env('EODIA_SESSION_DAYS', '14')),
    maxRows: Number(env('EODIA_MAX_ROWS', '2000')),
    queryTimeoutMs: Number(env('EODIA_QUERY_TIMEOUT_MS', '120000')),
    defaultCacheTtl: Number(env('EODIA_CACHE_TTL', '300')),
    ...(issuer
      ? {
          oidc: {
            issuer,
            clientId: env('EODIA_OIDC_CLIENT_ID', '') as string,
            ...(env('EODIA_OIDC_CLIENT_SECRET') ? { clientSecret: env('EODIA_OIDC_CLIENT_SECRET') } : {}),
            label: env('EODIA_OIDC_LABEL', 'Se connecter avec SSO') as string,
            scopes: env('EODIA_OIDC_SCOPES', 'openid email profile') as string,
            attributeClaims: (env('EODIA_OIDC_ATTRIBUTE_CLAIMS', '') as string).split(',').map((s) => s.trim()).filter(Boolean),
            ...(env('EODIA_OIDC_GROUPS_CLAIM') ? { groupsClaim: env('EODIA_OIDC_GROUPS_CLAIM') } : {}),
          },
        }
      : {}),
    passwordLogin: env('EODIA_PASSWORD_LOGIN', '1') !== '0',
    ...(env('EODIA_SMTP_URL')
      ? { smtp: { url: env('EODIA_SMTP_URL') as string, from: env('EODIA_SMTP_FROM', 'eodia insights <noreply@localhost>') as string } }
      : {}),
    ai: {
      provider,
      ...(env('EODIA_AI_API_KEY') ?? env('ANTHROPIC_API_KEY') ?? env('OPENAI_API_KEY')
        ? { apiKey: (env('EODIA_AI_API_KEY') ?? env('ANTHROPIC_API_KEY') ?? env('OPENAI_API_KEY')) as string }
        : {}),
      model:
        env('EODIA_AI_MODEL') ??
        (provider === 'anthropic' ? 'claude-sonnet-5-5' : provider === 'mistral' ? 'mistral-large-latest' : 'gpt-4.1'),
      ...(env('EODIA_AI_BASE_URL') ? { baseUrl: env('EODIA_AI_BASE_URL') } : {}),
      hourlyQuota: Number(env('EODIA_AI_HOURLY_QUOTA', '60')),
    },
    demo: env('EODIA_DEMO', dev ? '1' : '0') === '1',
    inProcessWorker: env('EODIA_INPROCESS_WORKER', dev ? '1' : '0') === '1',
  }
}
