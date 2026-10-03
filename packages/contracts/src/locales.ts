/**
 * Les langues de l'interface. Le français est la source : chaque texte s'écrit en français,
 * et les autres langues le traduisent (`apps/web/src/locales/<code>.json`).
 */
export const LOCALES = ['fr', 'en', 'es'] as const

export type Locale = (typeof LOCALES)[number]

/** The language the texts are written in. */
export const SOURCE_LOCALE: Locale = 'fr'

/** The language of a browser that asks for none of ours. */
export const FALLBACK_LOCALE: Locale = 'en'

/** Each language by its own name — what a language picker lists. */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
}

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value)

/** The language a tag asks for, if we speak it: `en-GB` reads English, `es-MX` Spanish. */
export function localeOfTag(tag: string): Locale | null {
  const language = tag.trim().toLowerCase().split(/[-_]/)[0] ?? ''
  return LOCALES.find((l) => l === language) ?? null
}

/**
 * The first language of a list we speak — a browser's `navigator.languages`, or the tags of
 * an `Accept-Language` header in order of preference — and English otherwise.
 */
export function matchLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    const found = localeOfTag(tag)
    if (found !== null) return found
  }
  return FALLBACK_LOCALE
}

/** The tags of an `Accept-Language` header, most wanted first. */
export function acceptedLanguages(header: string | null | undefined): string[] {
  if (header === null || header === undefined) return []
  return header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';')
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
      const weight = q === undefined ? 1 : Number(q.slice(2))
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index }
    })
    .filter((entry) => entry.tag !== '' && entry.tag !== '*' && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((entry) => entry.tag)
}

/**
 * The cookie that holds the language a person chose in the interface. The API reads it as
 * the web does (the web relays `/api/*` with its cookies), so its messages follow; without
 * it, `Accept-Language` decides.
 */
export const LOCALE_COOKIE = 'eodia-locale'

/** The language of a request: the cookie's choice, else the browser's. */
export function requestLocaleOf(cookie: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  const chosen = cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1)
  if (isLocale(chosen)) return chosen
  return matchLocale(acceptedLanguages(acceptLanguage))
}
