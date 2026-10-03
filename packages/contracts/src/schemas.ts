/**
 * Schémas zod des entrées de l'API. Ils valident chaque requête et produisent l'OpenAPI
 * (via @hono/zod-openapi), donc la documentation intégrée et le SDK.
 */
import { z } from 'zod'
import {
  AGGREGATION_FNS,
  FILTER_OPS,
  JOIN_KINDS,
  PARAMETER_TYPES,
  QUERY_LIMITS,
  SQL_FILTER_KINDS,
  SQL_VARIABLE_TYPES,
  TEMPORAL_EXTRACTIONS,
  TEMPORAL_UNITS,
  VISUALIZATIONS,
} from './analytics'
import { ENGINES } from './domain'
import { DATE_STYLES, LOOK_COLORS, NUMBER_STYLES, SEMANTIC_TYPES, VISIBILITIES } from './metadata'
import { COLUMN_ACCESS, DATA_ACCESS, FOLDER_ACCESS, QUERY_LEVELS, ROW_OPS } from './permissions'

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
    icon: z.string().max(500).nullable(),
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
  icon: z.string().max(500).nullable().optional(),
  image_url: z.string().max(2000).nullable().optional(),
})

export const DatasourceInputSchema = z.object({
  name,
  engine: z.enum(ENGINES),
  catalog: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,62}$/, 'minuscules, chiffres et _ ; commence par une lettre')
    .optional(),
  description: z.string().max(2000).nullable().optional(),
  config: z.record(z.string(), z.union([z.string().max(4000), z.number(), z.boolean()])),
  options: z
    .object({
      native_sql: z.boolean().optional(),
      timezone: z.string().max(60).optional(),
      trino_properties: z.record(z.string(), z.string().max(400)).optional(),
      excluded_schemas: z.array(z.string().max(200)).max(200).optional(),
      cache_ttl: z.number().int().min(0).max(31_536_000).nullable().optional(),
    })
    .optional(),
  schedule: z.enum(['hourly', 'daily', 'manual']).optional(),
})

export const FolderInputSchema = z.object({
  name,
  parent: id.nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  color: color.optional(),
  icon: z.string().max(500).nullable().optional(),
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
  query: QuestionQuerySchema,
  visualization: VisualizationSchema,
  columns_meta: z.record(z.string(), z.record(z.string(), z.unknown())).nullable().optional(),
  cache_ttl: z.number().int().min(0).nullable().optional(),
})

export const DashboardInputSchema = z.object({
  name,
  description: z.string().max(5000).nullable().optional(),
  folder: id.nullable().optional(),
  tabs: z.array(z.object({ id: z.string(), label: z.string().max(120) })).max(12).optional(),
  cards: z.array(z.record(z.string(), z.unknown())).max(60).optional(),
  parameters: z.array(z.record(z.string(), z.unknown())).max(16).optional(),
  auto_refresh: z.number().int().min(10).max(86_400).nullable().optional(),
  cache_ttl: z.number().int().min(0).nullable().optional(),
  preload: z.boolean().optional(),
  /** The dashboard's own theme; null: its folder's. */
  theme: id.nullable().optional(),
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
