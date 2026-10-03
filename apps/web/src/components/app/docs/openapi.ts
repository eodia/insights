/**
 * Lecture du document OpenAPI 3.1 servi par l'API : la liste des endpoints, leurs schémas
 * (références résolues) et des exemples de corps pour les extraits curl et fetch.
 */
import { $t, msg } from '@/lib/i18n'

export const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const
export type Method = (typeof METHODS)[number]

export interface JsonSchema {
  readonly $ref?: string
  readonly type?: string | readonly string[]
  readonly title?: string
  readonly description?: string
  readonly properties?: Readonly<Record<string, JsonSchema>>
  readonly required?: readonly string[]
  readonly items?: JsonSchema
  readonly additionalProperties?: boolean | JsonSchema
  readonly enum?: readonly unknown[]
  readonly const?: unknown
  readonly oneOf?: readonly JsonSchema[]
  readonly anyOf?: readonly JsonSchema[]
  readonly allOf?: readonly JsonSchema[]
  readonly format?: string
  readonly default?: unknown
  readonly nullable?: boolean
  readonly minLength?: number
  readonly maxLength?: number
  readonly minimum?: number
  readonly maximum?: number
  readonly exclusiveMinimum?: number | boolean
  readonly minItems?: number
  readonly maxItems?: number
}

export interface OpenApiParameter {
  readonly name: string
  readonly in: 'path' | 'query' | 'header' | 'cookie'
  readonly required?: boolean
  readonly description?: string
  readonly schema?: JsonSchema
}

export interface OpenApiOperation {
  readonly tags?: readonly string[]
  readonly summary?: string
  readonly description?: string
  readonly parameters?: readonly OpenApiParameter[]
  readonly requestBody?: {
    readonly required?: boolean
    readonly content?: Readonly<Record<string, { readonly schema?: JsonSchema }>>
  }
  readonly security?: readonly unknown[]
  readonly responses?: Readonly<Record<string, { readonly description?: string }>>
}

export interface OpenApiDoc {
  readonly openapi: string
  readonly info: { readonly title: string; readonly version: string; readonly description?: string }
  readonly servers?: readonly { readonly url: string }[]
  readonly paths: Readonly<Record<string, Partial<Record<Method, OpenApiOperation>>>>
  readonly components?: { readonly schemas?: Readonly<Record<string, JsonSchema>> }
}

export interface Endpoint {
  readonly id: string
  readonly method: Method
  readonly path: string
  readonly tag: string
  readonly summary: string
  readonly description?: string
  readonly parameters: readonly OpenApiParameter[]
  readonly body?: JsonSchema
  readonly bodyRequired: boolean
  /** Callable without a token: login, public links. */
  readonly public: boolean
  readonly responses: readonly { readonly status: string; readonly description: string }[]
}

export const endpointId = (method: Method, path: string) => `${method}-${path.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

/**
 * The API's tags, in French as it declares them (`apps/api/src/routes`): marked here so the
 * catalog carries them, translated where the documentation shows a tag.
 */
export const API_TAGS = [
  msg('Administration'),
  msg('Authentification'),
  msg('Copilot'),
  msg('Dossiers'),
  msg('Exécution'),
  msg('Partage'),
  msg('Permissions'),
  msg('Profil'),
  msg('Public'),
  msg('Questions'),
  msg('Sources'),
  msg('Structure'),
  msg('Tableaux de bord'),
] as const

/** Every operation, grouped by tag in the order the API declares them. */
export function endpointsOf(doc: OpenApiDoc): { tag: string; endpoints: Endpoint[] }[] {
  const groups = new Map<string, Endpoint[]>()
  for (const [path, ops] of Object.entries(doc.paths)) {
    for (const method of METHODS) {
      const op = ops[method]
      if (!op) continue
      const tag = op.tags?.[0] ?? msg('Autres')
      const body = op.requestBody?.content?.['application/json']?.schema
      const e: Endpoint = {
        id: endpointId(method, path),
        method,
        path,
        tag,
        summary: op.summary ?? `${method.toUpperCase()} ${path}`,
        ...(op.description ? { description: op.description } : {}),
        parameters: op.parameters ?? [],
        ...(body ? { body } : {}),
        bodyRequired: op.requestBody?.required ?? false,
        public: Array.isArray(op.security) && op.security.length === 0,
        responses: Object.entries(op.responses ?? {}).map(([status, r]) => ({ status, description: r.description ?? '' })),
      }
      groups.set(tag, [...(groups.get(tag) ?? []), e])
    }
  }
  return [...groups.entries()].map(([tag, endpoints]) => ({ tag, endpoints }))
}

/** The schema a `$ref` points to, and the name it has in `components.schemas`. */
export function resolve(schema: JsonSchema, doc: OpenApiDoc): { schema: JsonSchema; ref?: string } {
  let current = schema
  let ref: string | undefined
  // A chain of references ends; a broken one leaves the last schema as it is.
  for (let i = 0; i < 8 && current.$ref; i++) {
    const name = current.$ref.replace(/^#\/components\/schemas\//, '')
    const target = doc.components?.schemas?.[name]
    if (!target) break
    ref = name
    current = target
  }
  return ref ? { schema: current, ref } : { schema: current }
}

const types = (s: JsonSchema): string[] => (Array.isArray(s.type) ? [...s.type] : typeof s.type === 'string' ? [s.type] : [])

/** `string`, `integer`, `objet`, `string[]`… as the tree shows it. */
export function typeLabel(schema: JsonSchema, doc: OpenApiDoc): string {
  const { schema: s, ref } = resolve(schema, doc)
  if (s.const !== undefined) return JSON.stringify(s.const)
  if (s.enum) return s.enum.length === 1 ? JSON.stringify(s.enum[0]) : 'enum'
  if (s.oneOf || s.anyOf) return $t('une des formes')
  const t = types(s).filter((x) => x !== 'null')
  if (t[0] === 'array') return `${s.items ? typeLabel(s.items, doc) : 'any'}[]`
  if (t[0] === 'object' || (!t.length && s.properties)) return ref ?? 'object'
  if (!t.length) return ref ?? 'any'
  return t.join(' | ') + (s.format ? ` (${s.format})` : '')
}

export const isNullable = (schema: JsonSchema): boolean =>
  schema.nullable === true || types(schema).includes('null') || !!schema.anyOf?.some((v) => types(v).includes('null') && Object.keys(v).length === 1)

/** Length, bounds, item counts: what a value must respect, in a few words. */
export function constraintsOf(s: JsonSchema): string[] {
  const out: string[] = []
  if (s.minLength !== undefined && s.maxLength !== undefined) out.push($t('{min}–{max} car.', { min: s.minLength, max: s.maxLength }))
  else if (s.maxLength !== undefined) out.push($t('≤ {max} car.', { max: s.maxLength }))
  else if (s.minLength !== undefined && s.minLength > 0) out.push($t('≥ {min} car.', { min: s.minLength }))
  if (s.minimum !== undefined) out.push(`≥ ${s.minimum}`)
  if (typeof s.exclusiveMinimum === 'number') out.push(`> ${s.exclusiveMinimum}`)
  if (s.maximum !== undefined) out.push(`≤ ${s.maximum}`)
  if (s.minItems !== undefined && s.minItems > 0) out.push($t('≥ {min} él.', { min: s.minItems }))
  if (s.maxItems !== undefined) out.push($t('≤ {max} él.', { max: s.maxItems }))
  if (s.default !== undefined) out.push($t('défaut {value}', { value: JSON.stringify(s.default) }))
  return out
}

/** The variants of a union, without the bare `null` one (shown as « nullable » instead). */
export function variantsOf(s: JsonSchema): JsonSchema[] {
  return [...(s.oneOf ?? s.anyOf ?? [])].filter((v) => !(types(v).length === 1 && types(v)[0] === 'null' && !v.properties))
}

/** What tells a variant apart: `kind = builder`. */
export function variantLabel(v: JsonSchema, doc: OpenApiDoc, index: number): string {
  const s = resolve(v, doc).schema
  for (const [name, p] of Object.entries(s.properties ?? {})) {
    const value = p.const ?? (p.enum?.length === 1 ? p.enum[0] : undefined)
    if (value !== undefined) return `${name} = ${String(value)}`
  }
  return `${typeLabel(v, doc)} · ${index + 1}`
}

// ── Exemples ────────────────────────────────────────────────────────────────

/** Bodies written by hand where a generated one would say little. */
const EXAMPLES: Record<string, unknown> = {
  'post /api/v1/query': { query: { kind: 'sql', sql: 'SELECT statut, count(*) AS n FROM boutique.public.commandes GROUP BY 1' }, limit: 100 },
  'post /api/v1/me/tokens': { name: 'Intégration', surfaces: ['rest', 'mcp'] },
  'post /api/auth/login': { email: 'admin@eodia.local', password: 'eodia-insights' },
  'post /api/v1/questions/{id}/run': { parameters: {} },
  'post /api/v1/query/export': { query: { kind: 'sql', sql: 'SELECT * FROM boutique.public.commandes' }, format: 'csv' },
}

function sample(schema: JsonSchema, doc: OpenApiDoc, name: string, depth: number): unknown {
  const { schema: s } = resolve(schema, doc)
  if (depth > 5) return null
  if (s.const !== undefined) return s.const
  if (s.default !== undefined) return s.default
  if (s.enum?.length) return s.enum[0]
  const variants = variantsOf(s)
  if (variants[0]) return sample(variants[0], doc, name, depth + 1)
  if (s.allOf?.length) return Object.assign({}, ...s.allOf.map((p) => sample(p, doc, name, depth + 1)))
  const t = types(s).filter((x) => x !== 'null')[0] ?? (s.properties ? 'object' : undefined)
  switch (t) {
    case 'object': {
      const props = Object.entries(s.properties ?? {})
      const required = new Set(s.required ?? [])
      // Required fields, or the first few when none is: an example, not an inventory.
      const shown = required.size ? props.filter(([k]) => required.has(k)) : props.slice(0, 3)
      return Object.fromEntries(shown.map(([k, p]) => [k, sample(p, doc, k, depth + 1)]))
    }
    case 'array':
      return s.items ? [sample(s.items, doc, name, depth + 1)] : []
    case 'integer':
    case 'number':
      return s.minimum ?? (typeof s.exclusiveMinimum === 'number' ? s.exclusiveMinimum + 1 : 1)
    case 'boolean':
      return true
    case 'string':
      if (s.format === 'email' || name === 'email') return 'nom@exemple.fr'
      if (s.format === 'date-time') return '2026-01-01T00:00:00Z'
      if (s.format === 'uri' || name.endsWith('url')) return 'https://exemple.fr'
      if (name === 'id' || name.endsWith('_id') || name === 'folder' || name === 'datasource') return '<id>'
      return name ? `<${name}>` : '<texte>'
    default:
      return null
  }
}

export function exampleBody(e: Endpoint, doc: OpenApiDoc): unknown {
  const key = `${e.method} ${e.path}`
  if (key in EXAMPLES) return EXAMPLES[key]
  return e.body ? sample(e.body, doc, '', 0) : undefined
}

/** The path with `<id>` placeholders and its required query parameters. */
export function exampleUrl(e: Endpoint, origin: string): string {
  const path = e.path.replace(/\{([^}]+)\}/g, '<$1>')
  const query = e.parameters
    .filter((p) => p.in === 'query' && p.required)
    .map((p) => `${encodeURIComponent(p.name)}=<${p.name}>`)
  return `${origin}${path}${query.length ? `?${query.join('&')}` : ''}`
}
