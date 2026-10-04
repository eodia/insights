import type { ResolvedTheme } from './themes'
/**
 * Le domaine tel que l'API le sert : sources, structure, contenu, utilisateurs.
 * Une seule organisation par instance : aucune notion de tenant.
 */
import type {
  DashboardCard,
  DashboardParameter,
  DashboardTab,
  QuestionQuery,
  ResultColumn,
  Visualization,
} from './analytics'
import type {
  ColumnFormat,
  ColumnValue,
  Fingerprint,
  LookColor,
  SemanticType,
  Visibility,
} from './metadata'

// ── Moteurs ─────────────────────────────────────────────────────────────────

export const ENGINES = [
  'postgresql',
  'mysql',
  'sqlserver',
  'oracle',
  'snowflake',
  'mongodb',
  'trino',
] as const
export type Engine = (typeof ENGINES)[number]

export interface EngineField {
  readonly key: string
  readonly label: string
  readonly type: 'text' | 'number' | 'password' | 'boolean' | 'textarea'
  readonly required?: boolean
  readonly placeholder?: string
  readonly default?: string | number | boolean
  /** Stored encrypted, never sent back to the browser. */
  readonly secret?: boolean
  readonly help?: string
}

export interface EngineSpec {
  readonly engine: Engine
  readonly label: string
  /** The Trino connector the catalog is created with. */
  readonly connector: string
  readonly fields: readonly EngineField[]
  /** The engine's native SQL can be sent through `system.query`. */
  readonly nativeQuery: boolean
}

const hostPort = (port: number): EngineField[] => [
  { key: 'host', label: 'Hôte', type: 'text', required: true, placeholder: 'db.exemple.fr' },
  { key: 'port', label: 'Port', type: 'number', required: true, default: port },
]

const credentials: EngineField[] = [
  { key: 'user', label: 'Utilisateur', type: 'text', required: true },
  { key: 'password', label: 'Mot de passe', type: 'password', secret: true },
]

export const ENGINE_SPECS: Readonly<Record<Engine, EngineSpec>> = {
  postgresql: {
    engine: 'postgresql',
    label: 'PostgreSQL',
    connector: 'postgresql',
    nativeQuery: true,
    fields: [
      ...hostPort(5432),
      { key: 'database', label: 'Base de données', type: 'text', required: true },
      ...credentials,
      { key: 'ssl', label: 'SSL', type: 'boolean', default: false },
    ],
  },
  mysql: {
    engine: 'mysql',
    label: 'MySQL / MariaDB',
    connector: 'mysql',
    nativeQuery: true,
    fields: [
      ...hostPort(3306),
      {
        key: 'database',
        label: 'Base de données',
        type: 'text',
        help: 'Optionnelle : toutes les bases visibles par l’utilisateur sont exposées comme schémas.',
      },
      ...credentials,
      { key: 'ssl', label: 'SSL', type: 'boolean', default: false },
    ],
  },
  sqlserver: {
    engine: 'sqlserver',
    label: 'SQL Server',
    connector: 'sqlserver',
    nativeQuery: true,
    fields: [
      ...hostPort(1433),
      { key: 'database', label: 'Base de données', type: 'text', required: true },
      ...credentials,
      { key: 'encrypt', label: 'Chiffrer la connexion', type: 'boolean', default: true },
      {
        key: 'trust_server_certificate',
        label: 'Faire confiance au certificat du serveur',
        type: 'boolean',
        default: false,
      },
    ],
  },
  oracle: {
    engine: 'oracle',
    label: 'Oracle',
    connector: 'oracle',
    nativeQuery: true,
    fields: [
      ...hostPort(1521),
      { key: 'service', label: 'Nom de service', type: 'text', required: true, placeholder: 'ORCLPDB1' },
      ...credentials,
    ],
  },
  snowflake: {
    engine: 'snowflake',
    label: 'Snowflake',
    connector: 'snowflake',
    nativeQuery: true,
    fields: [
      {
        key: 'account',
        label: 'Compte',
        type: 'text',
        required: true,
        placeholder: 'xy12345.eu-west-1',
      },
      ...credentials,
      { key: 'database', label: 'Base de données', type: 'text', required: true },
      { key: 'warehouse', label: 'Entrepôt', type: 'text', required: true },
      { key: 'role', label: 'Rôle', type: 'text' },
    ],
  },
  mongodb: {
    engine: 'mongodb',
    label: 'MongoDB',
    connector: 'mongodb',
    nativeQuery: false,
    fields: [
      {
        key: 'connection_url',
        label: 'Chaîne de connexion',
        type: 'password',
        required: true,
        secret: true,
        placeholder: 'mongodb://utilisateur:motdepasse@hote:27017/',
      },
    ],
  },
  trino: {
    engine: 'trino',
    label: 'Connecteur Trino (avancé)',
    connector: '',
    nativeQuery: false,
    fields: [
      {
        key: 'connector',
        label: 'Connecteur',
        type: 'text',
        required: true,
        placeholder: 'tpch, iceberg, hive, clickhouse…',
      },
      {
        key: 'properties',
        label: 'Propriétés',
        type: 'textarea',
        secret: true,
        placeholder: 'tpch.splits-per-node=4',
        help: 'Une propriété par ligne, au format clé=valeur, comme dans un fichier de catalogue.',
      },
    ],
  },
}

// ── Utilisateurs ────────────────────────────────────────────────────────────

export interface UserSummary {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly color: LookColor | null
}

export interface Me extends UserSummary {
  /** Administrator of the current space — or of the instance, which administers them all. */
  readonly is_admin: boolean
  /** Administrator of the instance: every space, and the spaces themselves. */
  readonly is_instance_admin: boolean
  /** The groups the person belongs to in the current space. */
  readonly groups: readonly { id: string; name: string }[]
  /** Their personal folder in the current space. */
  readonly personal_folder: string
  readonly locale: string
  /** The space the person works in: what every screen and every query is about. */
  readonly workspace: Workspace
  /** The spaces they can enter. */
  readonly workspaces: readonly Workspace[]
  /** Rights in the current space. */
  readonly can: {
    readonly manage_sources: boolean
    readonly manage_metadata: boolean
    readonly manage_permissions: boolean
    readonly use_sql: boolean
    readonly create_folders: boolean
    /** Its name, its look, its members. */
    readonly manage_workspace: boolean
    /** Creating spaces: the instance's administrators. */
    readonly create_workspaces: boolean
  }
  readonly ai_enabled: boolean
}

// ── Espaces ─────────────────────────────────────────────────────────────────

export type WorkspaceRole = 'admin' | 'member'

/**
 * A space of the instance: a team, a subsidiary. It has its sources (and those shared with
 * it), its folders and their content, its groups and their rights; people belong to one or
 * several.
 */
export interface Workspace {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly color: LookColor | null
  /** A lucide name, `emoji:…` or `img:https://…`. */
  readonly icon: string | null
  /** The person's role; null for an instance administrator who is not a member. */
  readonly role: WorkspaceRole | null
  readonly members: number
  readonly archived: boolean
}

export interface WorkspaceMember extends UserSummary {
  readonly role: WorkspaceRole
  readonly added_at: string
}

export interface UserRow extends UserSummary {
  readonly active: boolean
  readonly groups: readonly string[]
  readonly attributes: Readonly<Record<string, string>>
  readonly created_at: string
  readonly last_login_at: string | null
  readonly auth: readonly string[]
}

export type GroupKind = 'admin' | 'all' | 'custom'

export interface Group {
  readonly id: string
  readonly name: string
  readonly kind: GroupKind
  readonly description: string | null
  readonly members: number
}

// ── Sources ─────────────────────────────────────────────────────────────────

export type SyncStatus = 'never' | 'queued' | 'running' | 'ok' | 'failed'

export interface Datasource {
  readonly id: string
  readonly name: string
  readonly engine: Engine
  /** Name of the catalog in Trino: what SQL cites, `catalog.schema.table`. */
  readonly catalog: string
  readonly description: string | null
  /** The connection settings, without any secret. */
  readonly config: Readonly<Record<string, string | number | boolean>>
  /** Which secret fields hold a value. */
  readonly secrets: readonly string[]
  readonly options: DatasourceOptions
  readonly sync: {
    readonly schedule: 'hourly' | 'daily' | 'manual'
    readonly status: SyncStatus
    readonly last_at: string | null
    readonly error: string | null
  }
  readonly stats: { readonly schemas: number; readonly tables: number; readonly columns: number }
  readonly created_at: string
  /** The space it belongs to: its connection, its sync and its metadata are managed there. */
  readonly workspace: { readonly id: string; readonly name: string }
  /** Seen from a space it is shared with: read here, managed in its own. */
  readonly shared: boolean
  /** The spaces it is shared with — told to its own space only. */
  readonly shared_with: readonly { readonly id: string; readonly name: string }[]
}

export interface DatasourceOptions {
  readonly native_sql?: boolean
  readonly timezone?: string
  /** Trino catalog properties set on top of the defaults (metadata cache, pushdown…). */
  readonly trino_properties?: Readonly<Record<string, string>>
  /** Schemas the sync skips. */
  readonly excluded_schemas?: readonly string[]
  /** Cache TTL in seconds for the results read from this source; null: the instance's. */
  readonly cache_ttl?: number | null
}

// ── Structure ───────────────────────────────────────────────────────────────

export type ItemStatus = 'active' | 'removed'

export interface TableMeta {
  readonly id: string
  readonly datasource: string
  readonly schema: string
  readonly name: string
  /** `catalog.schema.table`, quoted as Trino wants it. */
  readonly qualified: string
  readonly label: string
  readonly description: string | null
  readonly native_comment: string | null
  readonly visibility: Visibility
  readonly entity: string | null
  readonly color: LookColor | null
  readonly icon: string | null
  readonly display_column: string | null
  readonly row_count: number | null
  readonly status: ItemStatus
  readonly synced_at: string | null
  readonly columns?: readonly ColumnMeta[]
}

export interface ColumnMeta {
  readonly id: string
  readonly table: string
  readonly name: string
  readonly position: number
  /** The Trino type: `varchar`, `decimal(10,2)`, `timestamp(3) with time zone`. */
  readonly type: string
  readonly native_type: string | null
  readonly label: string
  readonly description: string | null
  readonly native_comment: string | null
  readonly visibility: Visibility
  readonly semantic: SemanticType | null
  readonly format: ColumnFormat
  readonly unit: string | null
  readonly pk: boolean
  readonly nullable: boolean
  /** The column this one points to, when a key. */
  readonly fk: { readonly column: string; readonly table: string; readonly name: string } | null
  readonly fingerprint: Fingerprint | null
  readonly has_values: boolean
  readonly status: ItemStatus
  /** The type it had before the last sync, when it changed. */
  readonly type_changed_from: string | null
}

export interface Relation {
  readonly id: string
  readonly from: { readonly table: string; readonly column: string }
  readonly to: { readonly table: string; readonly column: string }
  readonly origin: 'detected' | 'manual'
}

export interface SyncReport {
  readonly schemas: { readonly added: number; readonly removed: number }
  readonly tables: { readonly added: number; readonly removed: number }
  readonly columns: { readonly added: number; readonly removed: number; readonly retyped: number }
  readonly fingerprinted: number
  readonly values: number
}

export interface JobState {
  readonly id: string
  readonly kind: string
  readonly status: 'queued' | 'running' | 'done' | 'failed'
  readonly progress: { readonly step: string; readonly done: number; readonly total: number }
  readonly error: string | null
  readonly result: unknown
  readonly created_at: string
  readonly finished_at: string | null
}

// ── Contenu ─────────────────────────────────────────────────────────────────

export type ItemKind = 'question' | 'model' | 'metric' | 'dashboard' | 'folder'
export type ContentAccess = 'view' | 'edit' | 'manage'

export interface Folder {
  readonly id: string
  readonly parent: string | null
  readonly name: string
  readonly description: string | null
  readonly color: LookColor | null
  readonly icon: string | null
  /** The owner of a personal folder. */
  readonly personal: string | null
  readonly access: ContentAccess
  readonly path: readonly { readonly id: string; readonly name: string }[]
  /** The theme set on this folder itself (null: it inherits). */
  readonly theme: string | null
  /** The theme it wears: its own, or the nearest parent's. */
  readonly resolved_theme?: ResolvedTheme | null
}

export type QuestionType = 'question' | 'model' | 'metric'

export interface Question {
  readonly id: string
  readonly type: QuestionType
  readonly name: string
  readonly description: string | null
  readonly folder: string | null
  /** The dashboard it was created in, and belongs to: such a question sits in no folder. */
  readonly dashboard: { readonly id: string; readonly name: string } | null
  readonly query: QuestionQuery
  readonly visualization: Visualization
  /** A model's column metadata (labels, semantic types, formats), by result name. */
  readonly columns_meta: Readonly<Record<string, Partial<ResultColumnMeta>>> | null
  readonly cache_ttl: number | null
  readonly created_by: UserSummary | null
  readonly updated_by: UserSummary | null
  readonly created_at: string
  readonly updated_at: string
  readonly access: ContentAccess
  readonly archived: boolean
  /** The theme it wears: its dashboard's, or its folder's. */
  readonly resolved_theme?: ResolvedTheme | null
}

export interface ResultColumnMeta {
  readonly label: string
  readonly description: string
  readonly semantic: SemanticType | null
  readonly format: ColumnFormat
}

export interface Dashboard {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly folder: string | null
  readonly tabs: readonly DashboardTab[]
  readonly cards: readonly DashboardCard[]
  readonly parameters: readonly DashboardParameter[]
  /** Seconds between two automatic refreshes; null: never. */
  readonly auto_refresh: number | null
  readonly cache_ttl: number | null
  readonly preload: boolean
  readonly created_by: UserSummary | null
  readonly created_at: string
  readonly updated_at: string
  readonly access: ContentAccess
  readonly archived: boolean
  /** The theme set on the dashboard itself (null: its folder's). */
  readonly theme: string | null
  /** The theme it wears: its own, or its folder's (or a parent's). */
  readonly resolved_theme: ResolvedTheme | null
}

export interface ItemSummary {
  readonly kind: ItemKind
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly folder: string | null
  readonly viz?: string
  readonly updated_at: string
  readonly updated_by: UserSummary | null
  readonly bookmarked?: boolean
}

export interface Snippet {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly content: string
}

export interface QueryExecution {
  readonly id: string
  readonly user: UserSummary | null
  readonly origin: 'editor' | 'question' | 'card' | 'api' | 'mcp' | 'copilot' | 'share' | 'home'
  readonly question: string | null
  readonly sql: string
  readonly duration_ms: number
  readonly rows: number | null
  readonly error: string | null
  readonly cached: boolean
  readonly at: string
}

export type { ColumnValue, ResultColumn }
