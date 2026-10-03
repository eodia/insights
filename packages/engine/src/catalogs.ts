/**
 * Catalogues dynamiques : chaque source devient un catalogue Trino, créé par
 * `CREATE CATALOG … USING <connecteur> WITH (…)`. Trino tourne avec `catalog.store=memory` :
 * l'application est la source de vérité, garde les secrets chiffrés, et recrée les catalogues
 * à chaque démarrage du coordinateur.
 */
import { ENGINE_SPECS, type Engine } from '@eodia/contracts'
import { quoteTrinoIdent, quoteTrinoString } from './trino'

export interface CatalogDefinition {
  readonly catalog: string
  readonly engine: Engine
  /** Connection settings and secrets, merged. */
  readonly settings: Readonly<Record<string, string | number | boolean | undefined>>
  /** Extra properties from the source's « Avancé » tab. */
  readonly extra?: Readonly<Record<string, string>>
  /**
   * The host Trino must use for `localhost`: in development the API runs on the machine and
   * Trino in a container, which reaches the machine as `host.docker.internal`.
   */
  readonly localhostAlias?: string
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v))
const bool = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1'

function hostFor(def: CatalogDefinition): string {
  const host = str(def.settings.host).trim()
  if (def.localhostAlias && /^(localhost|127\.0\.0\.1|::1)$/i.test(host)) return def.localhostAlias
  return host
}

/** Defaults every SQL catalog gets: metadata cache, pushdown, case-insensitive names. */
const JDBC_DEFAULTS: Record<string, string> = {
  'metadata.cache-ttl': '10m',
  'metadata.cache-missing': 'true',
  'case-insensitive-name-matching': 'true',
}

/** The catalog properties of a source, without the extras. */
export function catalogProperties(def: CatalogDefinition): Record<string, string> {
  const s = def.settings
  const host = hostFor(def)
  switch (def.engine) {
    case 'postgresql': {
      const params = bool(s.ssl) ? '?sslmode=require' : ''
      return {
        'connection-url': `jdbc:postgresql://${host}:${str(s.port) || '5432'}/${str(s.database)}${params}`,
        'connection-user': str(s.user),
        'connection-password': str(s.password),
        ...JDBC_DEFAULTS,
        'postgresql.array-mapping': 'AS_ARRAY',
      }
    }
    case 'mysql': {
      const params = bool(s.ssl) ? '?sslMode=REQUIRED' : ''
      return {
        'connection-url': `jdbc:mysql://${host}:${str(s.port) || '3306'}${params}`,
        'connection-user': str(s.user),
        'connection-password': str(s.password),
        ...JDBC_DEFAULTS,
      }
    }
    case 'sqlserver': {
      const parts = [
        `jdbc:sqlserver://${host}:${str(s.port) || '1433'}`,
        `databaseName=${str(s.database)}`,
        `encrypt=${bool(s.encrypt) ? 'true' : 'false'}`,
        ...(bool(s.trust_server_certificate) ? ['trustServerCertificate=true'] : []),
      ]
      return {
        'connection-url': parts.join(';'),
        'connection-user': str(s.user),
        'connection-password': str(s.password),
        ...JDBC_DEFAULTS,
      }
    }
    case 'oracle':
      return {
        'connection-url': `jdbc:oracle:thin:@//${host}:${str(s.port) || '1521'}/${str(s.service)}`,
        'connection-user': str(s.user),
        'connection-password': str(s.password),
        ...JDBC_DEFAULTS,
      }
    case 'snowflake': {
      const account = str(s.account).replace(/\.snowflakecomputing\.com$/i, '')
      return {
        'connection-url': `jdbc:snowflake://${account}.snowflakecomputing.com`,
        'connection-user': str(s.user),
        'connection-password': str(s.password),
        'snowflake.account': account,
        'snowflake.database': str(s.database),
        'snowflake.warehouse': str(s.warehouse),
        ...(str(s.role) ? { 'snowflake.role': str(s.role) } : {}),
        ...JDBC_DEFAULTS,
      }
    }
    case 'mongodb': {
      let url = str(s.connection_url)
      if (def.localhostAlias) {
        url = url.replace(/@(localhost|127\.0\.0\.1)([:/])/i, `@${def.localhostAlias}$2`)
        url = url.replace(/^(mongodb(?:\+srv)?:\/\/)(localhost|127\.0\.0\.1)([:/])/i, `$1${def.localhostAlias}$3`)
      }
      return { 'mongodb.connection-url': url, 'mongodb.case-insensitive-name-matching': 'true' }
    }
    case 'trino':
      return parseProperties(str(s.properties))
  }
}

/** `clé=valeur` lines, `#` comments ignored. */
export function parseProperties(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return out
}

export function connectorOf(def: CatalogDefinition): string {
  if (def.engine === 'trino') return str(def.settings.connector).trim()
  return ENGINE_SPECS[def.engine].connector
}

const CATALOG_NAME = /^[a-z][a-z0-9_]{0,62}$/

/** The statement creating the catalog. Every value is a quoted literal. */
export function createCatalogSql(def: CatalogDefinition): string {
  if (!CATALOG_NAME.test(def.catalog)) throw new Error(`Nom de catalogue invalide : ${def.catalog}`)
  const connector = connectorOf(def)
  if (!/^[a-z][a-z0-9_]*$/.test(connector)) throw new Error(`Connecteur invalide : ${connector}`)
  const props = { ...catalogProperties(def), ...(def.extra ?? {}) }
  const entries = Object.entries(props).filter(([, v]) => v !== '')
  const withClause =
    entries.length === 0
      ? ''
      : ` WITH (${entries.map(([k, v]) => `${quoteTrinoIdent(k)} = ${quoteTrinoString(v)}`).join(', ')})`
  return `CREATE CATALOG ${quoteTrinoIdent(def.catalog)} USING ${connector}${withClause}`
}

export const dropCatalogSql = (catalog: string) => `DROP CATALOG IF EXISTS ${quoteTrinoIdent(catalog)}`

/** A short catalog name from a source name: `Ventes Europe` → `ventes_europe`. */
export function catalogNameFor(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^(\d)/, 's_$1')
      .slice(0, 50) || 'source'
  const reserved = new Set(['system', 'information_schema', ...taken])
  if (!reserved.has(base)) return base
  for (let i = 2; ; i++) {
    const candidate = `${base}_${i}`
    if (!reserved.has(candidate)) return candidate
  }
}
