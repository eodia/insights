/**
 * Pré-devine le type sémantique et le format d'une colonne, d'après son nom, son type et son
 * empreinte. Une proposition seulement : ce que la personne choisit dans « Structure » prime
 * et n'est jamais écrasé par une synchronisation.
 */
import {
  type ColumnFormat,
  type ColumnKind,
  type Fingerprint,
  type SemanticType,
  kindOfTrinoType,
} from '@eodia/contracts'

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

interface Rule {
  readonly type: SemanticType
  readonly name: RegExp
  readonly kinds: readonly ColumnKind[]
}

const TEXT: ColumnKind[] = ['text']
const NUM: ColumnKind[] = ['number']
const TIME: ColumnKind[] = ['date', 'datetime']

const RULES: readonly Rule[] = [
  { type: 'email', name: /(^|_)(e?mail|courriel)(_|$)/, kinds: TEXT },
  { type: 'avatar_url', name: /avatar/, kinds: TEXT },
  { type: 'image_url', name: /(image|photo|picture|img|logo|vignette)/, kinds: TEXT },
  { type: 'url', name: /(url|lien|link|site_?web|website)/, kinds: TEXT },
  { type: 'phone', name: /(phone|tel(ephone)?|mobile|portable|fax)/, kinds: TEXT },
  { type: 'zip', name: /(code_?postal|zip|postcode|postal_code|^cp$)/, kinds: [...TEXT, ...NUM] },
  { type: 'country', name: /(^|_)(pays|country|nation)(_|$)/, kinds: TEXT },
  { type: 'region', name: /(region|state|province|departement)/, kinds: TEXT },
  { type: 'city', name: /(ville|city|commune|town|localite)/, kinds: TEXT },
  { type: 'address', name: /(adresse|address|rue|street)/, kinds: TEXT },
  { type: 'latitude', name: /(^|_)lat(itude)?$/, kinds: NUM },
  { type: 'longitude', name: /(^|_)(lon|lng|long|longitude)$/, kinds: NUM },
  { type: 'birth_date', name: /(naissance|birth|dob|anniversaire)/, kinds: TIME },
  { type: 'cancelled_at', name: /(annul|cancel)/, kinds: TIME },
  { type: 'updated_at', name: /(updated|modifi|mis_a_jour|maj_le|_maj$|last_update)/, kinds: TIME },
  { type: 'created_at', name: /(cree|created|creation|inscri|signup|registered|date_ajout)/, kinds: TIME },
  { type: 'discount', name: /(remise|discount|rabais|reduction)/, kinds: NUM },
  { type: 'cost', name: /(cout|cost|achat|depense|expense)/, kinds: NUM },
  { type: 'price', name: /(prix|price|tarif|pu_|unit_price)/, kinds: NUM },
  { type: 'amount', name: /(montant|amount|total|revenue|chiffre|^ca$|_ca$|ca_|salaire|salary|frais|budget)/, kinds: NUM },
  { type: 'percentage', name: /(pourcent|percent|pct|taux|ratio|rate$)/, kinds: NUM },
  { type: 'rating', name: /(^|_)(note|rating|stars|etoiles?|satisfaction|nps)(_|$)/, kinds: NUM },
  { type: 'score', name: /score/, kinds: NUM },
  { type: 'duration', name: /(duree|duration|delai|elapsed|temps_)/, kinds: NUM },
  { type: 'quantity', name: /(quantite|qty|quantity|^nb_|_nb$|nombre|stock|count$)/, kinds: NUM },
  { type: 'status', name: /(statut|status|etat|state$|stage|etape)/, kinds: TEXT },
  { type: 'title', name: /(^|_)(titre|title|sujet|subject)(_|$)/, kinds: TEXT },
  { type: 'entity_name', name: /^(nom|name|libelle|label|raison_sociale|full_?name|nom_complet)$/, kinds: TEXT },
  { type: 'comment', name: /(commentaire|comment|remarque|note_libre|avis_texte|message)/, kinds: TEXT },
  { type: 'description', name: /(description|desc$|resume|summary|details?)/, kinds: TEXT },
  { type: 'event_at', name: /(_le$|_at$|^date|date$|_on$|survenu|timestamp)/, kinds: TIME },
]

export interface GuessInput {
  readonly name: string
  readonly type: string
  readonly pk: boolean
  readonly fk: boolean
  readonly fingerprint: Fingerprint | null
}

export function guessSemantic(input: GuessInput): SemanticType | null {
  if (input.pk) return 'pk'
  if (input.fk) return 'fk'
  const kind = kindOfTrinoType(input.type)
  const name = fold(input.name)
  if (kind === 'json') return 'json'
  if (kind === 'boolean') return 'business_boolean'
  for (const rule of RULES) {
    if (rule.kinds.includes(kind) && rule.name.test(name)) return rule.type
  }
  // An identifier-looking number pointing nowhere: no meaning to guess.
  if (/(^id$|_id$)/.test(name)) return null
  const fp = input.fingerprint
  if (kind === 'text' && fp && fp.sample > 0) {
    const nonNull = fp.sample - fp.nulls
    if (nonNull > 0 && fp.distinct <= 50 && fp.distinct / nonNull < 0.3 && (fp.avg_length ?? 0) < 40) return 'category'
    if ((fp.avg_length ?? 0) > 80) return 'description'
  }
  if (kind === 'date' || kind === 'datetime') return 'event_at'
  return null
}

/** The format a semantic type suggests; the person can change it. */
export function defaultFormat(semantic: SemanticType | null, name: string): ColumnFormat {
  const n = fold(name)
  switch (semantic) {
    case 'amount':
    case 'price':
    case 'cost':
    case 'discount':
      return { number_style: 'currency', currency: 'EUR', decimals: 2 }
    case 'percentage':
      return { number_style: 'percent', percent_ratio: true, decimals: 1 }
    case 'rating':
      return { number_style: 'rating', rating_max: 5, decimals: 1 }
    case 'duration':
      return {
        number_style: 'duration',
        duration_unit: /_h$|heure|hour/.test(n) ? 'h' : /_min$|minute/.test(n) ? 'min' : /_ms$/.test(n) ? 'ms' : /_j$|jour|day/.test(n) ? 'd' : 's',
      }
    case 'quantity':
      return { number_style: 'integer' }
    case 'latitude':
    case 'longitude':
      return { number_style: 'decimal', decimals: 4, separators: false }
    case 'pk':
    case 'fk':
    case 'zip':
      return { separators: false }
    case 'birth_date':
      return { date_style: 'long', time: 'none' }
    default:
      return {}
  }
}

/** Whether a column's values make a list worth keeping (filters, colours, pictograms). */
export function keepsValues(kind: ColumnKind, semantic: SemanticType | null, fp: Fingerprint | null): boolean {
  if (!fp || fp.distinct === 0 || fp.distinct > 1000) return false
  if (semantic && ['pk', 'email', 'url', 'image_url', 'avatar_url', 'phone', 'description', 'comment', 'json', 'address', 'latitude', 'longitude'].includes(semantic)) return false
  if (kind === 'boolean') return true
  if (kind === 'text') return true
  if (kind === 'number') return semantic === 'rating' || semantic === 'category' || semantic === 'status' || fp.distinct <= 20
  return false
}
