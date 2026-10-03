/**
 * Convention BaseDB : tout texte de l'interface s'écrit en français dans `$t('…')`, ses valeurs
 * en `{nom}` ; un texte qui dépend d'un nombre passe par `$tp`. Les catalogues des autres
 * langues viendront de l'extraction de ces appels ; le français est la langue source.
 */

export type Locale =
  | 'fr'
  | 'en'
  | 'de'
  | 'es'
  | 'it'
  | 'pt-BR'
  | 'nl'
  | 'pl'
  | 'cs'
  | 'sv'
  | 'da'
  | 'nb'
  | 'fi'
  | 'ro'
  | 'hu'
  | 'tr'
  | 'uk'
  | 'ja'
  | 'zh-CN'
  | 'ko'

const catalogs: Partial<Record<Locale, Record<string, string>>> = {}
let current: Locale = 'fr'

export const locale = (): Locale => current
export const intlLocale = (): string => (current === 'fr' ? 'fr-FR' : current)

export function setLocale(next: Locale, catalog?: Record<string, string>): void {
  current = next
  if (catalog) catalogs[next] = catalog
}

function interpolate(text: string, values?: Record<string, string | number>): string {
  if (!values) return text
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole))
}

export function $t(text: string, values?: Record<string, string | number>): string {
  return interpolate(catalogs[current]?.[text] ?? text, values)
}

/** `$tp(n, '{count} ligne', '{count} lignes')` */
export function $tp(count: number, one: string, many: string, values?: Record<string, string | number>): string {
  const rule = new Intl.PluralRules(intlLocale()).select(count)
  const text = rule === 'one' ? one : many
  return interpolate(catalogs[current]?.[text] ?? text, { count: new Intl.NumberFormat(intlLocale()).format(count), ...values })
}
