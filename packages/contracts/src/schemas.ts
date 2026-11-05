/**
 * Schémas zod des entrées de l'API. Ils valident chaque requête et produisent l'OpenAPI
 * (via @hono/zod-openapi), donc la documentation intégrée et le SDK.
 */
import { z } from 'zod'
import {
  AGGREGATION_FNS,
  COMPARE_MODES,
  CONDITION_LIMITS,
  FILTER_OPS,
  FILTER_TESTS,
  ROWS_TESTS,
  JOIN_KINDS,
  PARAMETER_TYPES,
  QUERY_LIMITS,
  SQL_FILTER_KINDS,
  SQL_VARIABLE_TYPES,
  TEMPORAL_EXTRACTIONS,
  TEMPORAL_UNITS,
  VISUALIZATIONS,
} from './analytics'
import { CATALOG_NAME_RE, ENGINES } from './domain'
import { DATE_STYLES, LOOK_COLORS, NUMBER_STYLES, SEMANTIC_TYPES, VISIBILITIES } from './metadata'
import { COLUMN_ACCESS, DATA_ACCESS, FOLDER_ACCESS, QUERY_LEVELS, ROW_OPS } from './permissions'

/**
 * A pictogram: a lucide name, `emoji:…`, or `img:` and an image — its `https://` address, or the
 * image itself, sent small (`data:image/…`, reduced to 96 pixels by the app).
 */
export const IconSchema = z
  .string()
  .max(20_000)
  .refine((v) => !v.startsWith('img:') || /^img:(https?:\/\/|data:image\/(png|jpeg|webp|gif|svg\+xml);base64,)/.test(v), 'Image : une adresse https ou une image envoyée.')

const id = z.string().min(1).max(64)
const name = z.string().trim().min(1).max(200)

export const ColumnRefSchema = z.object({ join: z.string().max(64).optional(), field: z.string().min(1).max(256) })

export const SourceRefSchema = z.union([
  z.object({ kind: z.literal('table'), id }),
  z.object({ kind: z.literal('question'), id }),
])

const FilterValueSchema = z.union([z.string().max(2000), z.number(), z.boolean()])

export const FilterSchema = z.union([
  z.object({
    column: ColumnRefSchema,
    op: z.enum(FILTER_OPS),
    values: z.array(FilterValueSchema).max(500),
  }),
  z.object({ sql: z.string().min(1).max(4000) }),
])

export const BuilderQuerySchema = z.object({
  kind: z.literal('builder'),
  source: SourceRefSchema,
  expressions: z
    .array(z.object({ name: z.string().min(1).max(120), expression: z.string().min(1).max(4000) }))
    .max(20)
    .optional(),
  joins: z
    .array(
      z.object({
        alias: z.string().min(1).max(64),
        source: SourceRefSchema,
        kind: z.enum(JOIN_KINDS),
        left: ColumnRefSchema,
        right: z.string().min(1).max(256),
        explicit: z.boolean().optional(),
      }),
    )
    .max(QUERY_LIMITS.joins)
    .optional(),
  filters: z.array(FilterSchema).max(QUERY_LIMITS.filters).optional(),
  aggregations: z
    .array(
      z.object({
        fn: z.enum(AGGREGATION_FNS),
        column: ColumnRefSchema.optional(),
        metric: id.optional(),
        label: z.string().max(200).optional(),
      }),
    )
    .max(QUERY_LIMITS.aggregations)
    .optional(),
  breakouts: z
    .array(
      ColumnRefSchema.extend({
        unit: z.enum([...TEMPORAL_UNITS, ...TEMPORAL_EXTRACTIONS]).optional(),
        bin: z.union([z.number().positive(), z.literal('auto')]).optional(),
      }),
    )
    .max(QUERY_LIMITS.breakouts)
    .optional(),
  fields: z.array(ColumnRefSchema).max(QUERY_LIMITS.fields).optional(),
  sort: z
    .array(
      z.object({
        target: z.union([
          z.object({ kind: z.literal('aggregation'), index: z.number().int().min(0) }),
          z.object({ kind: z.literal('breakout'), index: z.number().int().min(0) }),
          z.object({ kind: z.literal('column'), column: ColumnRefSchema }),
        ]),
        desc: z.boolean().optional(),
      }),
    )
    .max(QUERY_LIMITS.sort)
    .optional(),
  limit: z.number().int().positive().max(1_000_000).nullable().optional(),
})

const ParameterValueSchema = z.union([
  z.string().max(2000),
  z.array(z.string().max(2000)).max(500),
  z.array(z.number().nullable()).max(2),
])

export const SqlVariableSchema = z.object({
  name: z.string().min(1).max(64),
  label: z.string().max(200),
  type: z.enum(SQL_VARIABLE_TYPES),
  required: z.boolean().optional(),
  default: ParameterValueSchema.nullable().optional(),
  column: z.string().max(500).optional(),
  column_kind: z.enum(SQL_FILTER_KINDS).optional(),
})

/** A dashboard filter tied to a column of a card's question, or to a SQL variable. */
const CardMappingSchema = z.object({
  parameter: z.string().min(1).max(64),
  target: z.union([z.object({ column: z.object({ field: z.string().min(1).max(256), join: z.string().max(64).optional() }) }), z.object({ variable: z.string().min(1).max(64) })]),
})

/** When a card or a tab shows: rules on the filters, a query's yes or no, the card's rows. */
export const DisplayConditionSchema = z.object({
  match: z.enum(['all', 'any']),
  rules: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('filter'), parameter: z.string().min(1).max(64), test: z.enum(FILTER_TESTS), value: z.string().max(500).optional() }),
        z.object({
          kind: z.literal('query'),
          sql: z.string().min(1).max(CONDITION_LIMITS.sql),
          variables: z.array(SqlVariableSchema).max(QUERY_LIMITS.variables).optional(),
          mappings: z.array(CardMappingSchema).max(16).optional(),
        }),
        z.object({ kind: z.literal('rows'), test: z.enum(ROWS_TESTS), value: z.number().int().min(0).max(1_000_000).optional() }),
      ]),
    )
    .max(CONDITION_LIMITS.rules),
})

const TabSchema = z.object({
  id: z.string().max(60),
  label: z.string().max(120),
  icon: z.string().max(200_000).optional(),
  color: z.enum(LOOK_COLORS).optional(),
  description: z.string().max(300).optional(),
  condition: DisplayConditionSchema.optional(),
})

export const SqlQuerySchema = z.object({
  kind: z.literal('sql'),
  sql: z.string().min(1).max(QUERY_LIMITS.sql),
  variables: z.array(SqlVariableSchema).max(QUERY_LIMITS.variables).optional(),
})

export const NativeQuerySchema = z.object({
  kind: z.literal('native'),
  datasource: id,
  sql: z.string().min(1).max(QUERY_LIMITS.sql),
  variables: z.array(SqlVariableSchema).max(QUERY_LIMITS.variables).optional(),
})

export const QuestionQuerySchema = z.discriminatedUnion('kind', [
  BuilderQuerySchema,
  SqlQuerySchema,
  NativeQuerySchema,
])

export const VisualizationSchema = z.object({
  type: z.enum(VISUALIZATIONS),
  settings: z.record(z.string(), z.unknown()).optional(),
})

export const ConstraintSchema = z.object({
  target: z.union([z.object({ column: ColumnRefSchema }), z.object({ variable: z.string() })]),
  type: z.enum(PARAMETER_TYPES),
  operator: z.enum(['eq', 'between', 'gte', 'lte']).optional(),
  value: ParameterValueSchema,
})

export const RunQuerySchema = z.object({
  query: QuestionQuerySchema,
  /** Values of the SQL variables, by name. */
  parameters: z.record(z.string(), ParameterValueSchema.nullable()).optional(),
  constraints: z.array(ConstraintSchema).max(32).optional(),
  /** Bypass the result cache. */
  fresh: z.boolean().optional(),
  limit: z.number().int().positive().max(100_000).optional(),
  /** Beside each measure, its value in the period compared to. */
  compare: z.enum(COMPARE_MODES).optional(),
})

export const ColumnFormatSchema = z
  .object({
    number_style: z.enum(NUMBER_STYLES),
    decimals: z.number().int().min(0).max(10).nullable(),
    currency: z.string().length(3),
    prefix: z.string().max(20),
    suffix: z.string().max(20),
    separators: z.boolean(),
    percent_ratio: z.boolean(),
    duration_unit: z.enum(['ms', 's', 'min', 'h', 'd']),
    rating_max: z.number().int().min(1).max(10),
    date_style: z.enum(DATE_STYLES),
    date_pattern: z.string().max(60),
    time: z.enum(['none', 'minutes', 'seconds']),
    default_unit: z.enum(['day', 'week', 'month', 'quarter', 'year']),
    timezone: z.string().max(60),
  })
  .partial()

const color = z.enum(LOOK_COLORS).nullable()

export const TablePatchSchema = z
  .object({
    label: z.string().max(200),
    description: z.string().max(5000).nullable(),
    visibility: z.enum(VISIBILITIES),
    entity: z.string().max(120).nullable(),
    color,
    icon: IconSchema.nullable(),
    display_column: z.string().max(256).nullable(),
  })
  .partial()

export const ColumnPatchSchema = z
  .object({
    label: z.string().max(200),
    description: z.string().max(5000).nullable(),
    visibility: z.enum(VISIBILITIES),
    semantic: z.enum(SEMANTIC_TYPES as [string, ...string[]]).nullable(),
    format: ColumnFormatSchema,
    unit: z.string().max(40).nullable(),
    fk: z.string().max(64).nullable(),
  })
  .partial()

export const ColumnValueSchema = z.object({
  value: z.string().max(2000),
  label: z.string().max(200).nullable().optional(),
  color: color.optional(),
  icon: IconSchema.nullable().optional(),
  image_url: z.string().max(2000).nullable().optional(),
})

export const DatasourceInputSchema = z.object({
  name,
  engine: z.enum(ENGINES),
  catalog: z
    .string()
    .regex(CATALOG_NAME_RE, 'minuscules, chiffres, _ et - ; commence par une lettre')
    .optional(),
  description: z.string().max(2000).nullable().optional(),
  config: z.record(z.string(), z.union([z.string().max(4000), z.number(), z.boolean()])),
  options: z
    .object({
      native_sql: z.boolean().optional(),
      timezone: z.string().max(60).optional(),
      trino_properties: z.record(z.string(), z.string().max(400)).optional(),
      excluded_schemas: z.array(z.string().max(200)).max(200).optional(),
      schemas: z.array(z.string().max(200)).max(500).optional(),
      schema_labels: z.record(z.string().max(200), z.string().max(120)).optional(),
      cache_ttl: z.number().int().min(0).max(31_536_000).nullable().optional(),
    })
    .optional(),
  schedule: z.enum(['hourly', 'daily', 'manual']).optional(),
})

/** The technical catalogs a source depends on (their ids). */
export const DependenciesInputSchema = z.object({ ids: z.array(id).max(20) })
/** A source made the technical catalog of another one. */
export const MakeDependencySchema = z.object({ main: id })

export const CardCommentInputSchema = z.object({ card: z.string().min(1).max(64), body: z.string().trim().min(1).max(4000) })

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const AnnotationInputSchema = z.object({
  question: id.nullable().optional(),
  dashboard: id.nullable().optional(),
  card: z.string().max(64).nullable().optional(),
  at: day,
  end: day.nullable().optional(),
  label: z.string().trim().min(1).max(200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
})
export type AnnotationInput = z.infer<typeof AnnotationInputSchema>

/** A dashboard's view to keep: its name, its filters, its tab, for whom. */
export const SavedViewInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  values: z.record(z.string(), ParameterValueSchema.nullable()),
  tab: z.string().max(60).nullable().optional(),
  shared: z.boolean().optional(),
  is_default: z.boolean().optional(),
})
export type SavedViewInput = z.infer<typeof SavedViewInputSchema>

/** A Trino view saved from the SQL editor: where it goes, what it selects. */
export const SourceViewInputSchema = z.object({
  schema: z.string().min(1).max(128),
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/, 'Lettres, chiffres et « _ », sans commencer par un chiffre.'),
  sql: z.string().min(1).max(100_000),
  /** Replaces the view of that name; without it, a view already there is an error. */
  replace: z.boolean().optional(),
  /** Keeps the result (Iceberg): a heavy computation done once, refreshed later. */
  materialized: z.boolean().optional(),
  /** A materialized view refreshed by itself every so many hours; `null`: by hand. */
  refresh_hours: z.number().int().min(1).max(168).nullable().optional(),
})

export const ViewRefreshScheduleSchema = z.object({ hours: z.number().int().min(1).max(168).nullable() })
export type SourceViewInput = z.infer<typeof SourceViewInputSchema>

/** The owners of views allowed to read a source's catalog. */
export const ViewOwnersInputSchema = z.object({ owners: z.array(z.string().min(1).max(200)).max(50) })

/** The schemas a source shows, and their names: an empty list shows them all. */
export const SourceSchemasInputSchema = z.object({
  schemas: z.array(z.string().max(200)).max(500),
  labels: z.record(z.string().max(200), z.string().max(120)),
})

/** A dashboard copied as JSON (« Copier en JSON »), to paste in a new one. */
export const DASHBOARD_FORMAT = 'eodia-insights/dashboard'
export const DashboardImportSchema = z.object({
  format: z.literal(DASHBOARD_FORMAT),
  version: z.literal(1),
  name,
  description: z.string().max(5000).nullable().optional(),
  tabs: z.array(TabSchema).max(12).optional(),
  cards: z.array(z.record(z.string(), z.unknown())).max(60),
  parameters: z.array(z.record(z.string(), z.unknown())).max(16).optional(),
  auto_refresh: z.number().int().min(0).max(86_400).nullable().optional(),
  cache_ttl: z.number().int().min(0).max(31_536_000).nullable().optional(),
  width: z.enum(['full', 'a4']).optional(),
})
export const DashboardPasteSchema = z.object({ folder: id.nullable().optional(), dashboard: z.unknown() })

export const FolderInputSchema = z.object({
  name,
  parent: id.nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  color: color.optional(),
  icon: IconSchema.nullable().optional(),
  /** The theme of the folder and all it holds; null: the parent's. */
  theme: id.nullable().optional(),
})

export const QuestionInputSchema = z.object({
  name,
  type: z.enum(['question', 'model', 'metric']).optional(),
  description: z.string().max(5000).nullable().optional(),
  folder: id.nullable().optional(),
  /** Created in a dashboard: it belongs to it, and a card showing it is added (to `tab`, or the first). `null` moves it to `folder`. */
  dashboard: id.nullable().optional(),
  tab: z.string().max(60).nullable().optional(),
  /** With `dashboard`: the card keeping its query to itself (the copilot's) that becomes this question, in place. */
  card: z.string().max(60).optional(),
  query: QuestionQuerySchema,
  visualization: VisualizationSchema,
  columns_meta: z.record(z.string(), z.record(z.string(), z.unknown())).nullable().optional(),
  cache_ttl: z.number().int().min(0).nullable().optional(),
})

export const DashboardInputSchema = z.object({
  name,
  description: z.string().max(5000).nullable().optional(),
  folder: id.nullable().optional(),
  tabs: z.array(TabSchema).max(12).optional(),
  cards: z.array(z.record(z.string(), z.unknown())).max(60).optional(),
  parameters: z.array(z.record(z.string(), z.unknown())).max(16).optional(),
  auto_refresh: z.number().int().min(10).max(86_400).nullable().optional(),
  cache_ttl: z.number().int().min(0).nullable().optional(),
  preload: z.boolean().optional(),
  /** The dashboard's own theme; null: its folder's. */
  theme: id.nullable().optional(),
  /** All the screen's width, or an A4 page (landscape), centred. */
  width: z.enum(['full', 'a4']).optional(),
})

export const DataPermissionSchema = z.object({
  group: id,
  datasource: id,
  schema: z.string().max(256).nullable(),
  table: id.nullable(),
  access: z.enum(DATA_ACCESS),
})

export const QueryPermissionSchema = z.object({
  group: id,
  datasource: id,
  level: z.enum(QUERY_LEVELS),
})

export const ColumnRuleSchema = z.object({
  group: id,
  column: id,
  access: z.enum(COLUMN_ACCESS),
  mask: z.string().max(1000).nullable().optional(),
})

export const RowPolicyInputSchema = z.object({
  group: id,
  table: id,
  match: z.enum(['all', 'any']),
  conditions: z
    .array(
      z.object({
        column: z.string().min(1).max(256),
        op: z.enum(ROW_OPS),
        values: z.array(z.union([z.string().max(500), z.number()])).max(200),
      }),
    )
    .min(1)
    .max(12),
  description: z.string().max(500).nullable().optional(),
})

export const FolderPermissionSchema = z.object({
  group: id,
  folder: id,
  access: z.enum(FOLDER_ACCESS),
})

export const ShareInputSchema = z.object({
  item_kind: z.enum(['question', 'model', 'metric', 'dashboard', 'folder']),
  item_id: id,
  principal_kind: z.enum(['user', 'group']),
  principal_id: id,
  access: z.enum(['view', 'edit']),
})

export type DatasourceInput = z.infer<typeof DatasourceInputSchema>
export type QuestionInput = z.infer<typeof QuestionInputSchema>
export type DashboardInput = z.infer<typeof DashboardInputSchema>
export type RunQueryInput = z.infer<typeof RunQuerySchema>
export type TablePatch = z.infer<typeof TablePatchSchema>
export type ColumnPatch = z.infer<typeof ColumnPatchSchema>
export type RowPolicyInput = z.infer<typeof RowPolicyInputSchema>

/** A person's home page: a dashboard of their own — its cards, and its tabs and filters if any. */
export const HomeLayoutSchema = z.object({
  tabs: z.array(TabSchema).max(12).optional(),
  cards: z.array(z.record(z.string(), z.unknown())).max(60),
  parameters: z.array(z.record(z.string(), z.unknown())).max(16).optional(),
})

/** « Pourquoi ça bouge ? » : a card's built query, its date and grain, the two periods compared. */
export const ExplainInputSchema = z.object({
  query: BuilderQuerySchema,
  constraints: z.array(z.record(z.string(), z.unknown())).max(32).optional(),
  time: z.object({ field: z.string().min(1).max(256), join: z.string().max(128).optional(), unit: z.enum(['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year']) }),
  previous: z.string().min(1).max(64),
  current: z.string().min(1).max(64),
  labels: z.object({ previous: z.string().max(80), current: z.string().max(80) }),
})
