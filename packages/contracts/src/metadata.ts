/**
 * Métadonnées : ce que l'écran « Structure » ajoute à une table ou une colonne synchronisée.
 * Elles alimentent les formats d'affichage, les visualisations automatiques, les listes de
 * filtres, les jointures implicites du builder et le contexte du copilot.
 */

// ── Types sémantiques ────────────────────────────────────────────────────────

export const SEMANTIC_GROUPS = [
  {
    key: 'identity',
    label: 'Identité',
    types: ['pk', 'fk', 'entity_name', 'title'],
  },
  {
    key: 'category',
    label: 'Catégorie',
    types: ['category', 'status', 'business_boolean'],
  },
  {
    key: 'text',
    label: 'Texte',
    types: ['description', 'comment', 'email', 'url', 'image_url', 'avatar_url', 'phone', 'json'],
  },
  {
    key: 'geo',
    label: 'Géographie',
    types: ['country', 'region', 'city', 'zip', 'address', 'latitude', 'longitude'],
  },
  {
    key: 'time',
    label: 'Temps',
    types: [
      'created_at',
      'updated_at',
      'event_at',
      'birth_date',
      'cancelled_at',
    ],
  },
  {
    key: 'measure',
    label: 'Mesure',
    types: [
      'amount',
      'price',
      'cost',
      'discount',
      'percentage',
      'quantity',
      'score',
      'rating',
      'duration',
    ],
  },
] as const

export type SemanticType = (typeof SEMANTIC_GROUPS)[number]['types'][number]

export const SEMANTIC_TYPES: readonly SemanticType[] = SEMANTIC_GROUPS.flatMap(
  (g) => g.types as readonly SemanticType[],
)

export const SEMANTIC_LABELS: Record<SemanticType, string> = {
  pk: 'Clé primaire',
  fk: 'Clé étrangère',
  entity_name: "Nom d'entité",
  title: 'Titre',
  category: 'Catégorie',
  status: 'Statut',
  business_boolean: 'Booléen métier',
  description: 'Description',
  comment: 'Commentaire',
  email: 'E-mail',
  url: 'URL',
  image_url: "URL d'image",
  avatar_url: 'Avatar',
  phone: 'Téléphone',
  json: 'JSON',
  country: 'Pays',
  region: 'Région',
  city: 'Ville',
  zip: 'Code postal',
  address: 'Adresse',
  latitude: 'Latitude',
  longitude: 'Longitude',
  created_at: 'Date de création',
  updated_at: 'Date de mise à jour',
  event_at: "Date d'événement",
  birth_date: 'Date de naissance',
  cancelled_at: "Date d'annulation",
  amount: 'Montant',
  price: 'Prix',
  cost: 'Coût',
  discount: 'Remise',
  percentage: 'Pourcentage',
  quantity: 'Quantité',
  score: 'Score',
  rating: 'Note',
  duration: 'Durée',
}

export const isSemanticType = (v: unknown): v is SemanticType =>
  typeof v === 'string' && (SEMANTIC_TYPES as readonly string[]).includes(v)

/** Semantic types of money: a currency format suits them. */
export const MONEY_TYPES: ReadonlySet<SemanticType> = new Set(['amount', 'price', 'cost', 'discount'])

/** Semantic types whose values make a category to group or filter by. */
export const CATEGORY_TYPES: ReadonlySet<SemanticType> = new Set([
  'category',
  'status',
  'business_boolean',
  'country',
  'region',
  'city',
  'zip',
])

// ── Formats ─────────────────────────────────────────────────────────────────

export const NUMBER_STYLES = [
  'integer',
  'decimal',
  'percent',
  'currency',
  'duration',
  'rating',
  'compact',
] as const
export type NumberStyle = (typeof NUMBER_STYLES)[number]

export const DATE_STYLES = ['default', 'short', 'long', 'relative', 'custom'] as const
export type DateStyle = (typeof DATE_STYLES)[number]

/** How a column's values are shown. Every key optional: the kind and semantic type decide the rest. */
export interface ColumnFormat {
  // Numbers
  readonly number_style?: NumberStyle
  readonly decimals?: number | null
  readonly currency?: string
  readonly prefix?: string
  readonly suffix?: string
  readonly separators?: boolean
  /** A percentage stored as 0.42 (true) or as 42 (false). */
  readonly percent_ratio?: boolean
  /** A duration's unit as stored. */
  readonly duration_unit?: 'ms' | 's' | 'min' | 'h' | 'd'
  readonly rating_max?: number
  // Dates
  readonly date_style?: DateStyle
  /** Pattern for `custom`: `dd/MM/yyyy HH:mm`. */
  readonly date_pattern?: string
  readonly time?: 'none' | 'minutes' | 'seconds'
  readonly default_unit?: 'day' | 'week' | 'month' | 'quarter' | 'year'
  readonly timezone?: string
}

// ── Apparence ───────────────────────────────────────────────────────────────

/** Named colours of the palette, usable on tables, values and folders. */
export const LOOK_COLORS = [
  'gray',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'pink',
  'rose',
] as const
export type LookColor = (typeof LOOK_COLORS)[number]

export interface Look {
  readonly color?: LookColor | null
  /** A lucide icon name, kebab-case. */
  readonly icon?: string | null
}

export const VISIBILITIES = ['normal', 'hidden', 'technical'] as const
export type Visibility = (typeof VISIBILITIES)[number]

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  normal: 'Normale',
  hidden: 'Masquée',
  technical: 'Technique',
}

/** A value of a category column, as the Structure screen describes it. */
export interface ColumnValue {
  readonly value: string
  readonly label?: string | null
  readonly color?: LookColor | null
  readonly icon?: string | null
  readonly image_url?: string | null
  readonly count?: number | null
}

/** What a sync measured on a sample of a column. */
export interface Fingerprint {
  readonly sample: number
  readonly distinct: number
  readonly nulls: number
  readonly min?: string | number | null
  readonly max?: string | number | null
  readonly avg_length?: number | null
  readonly avg?: number | null
}
