import type { Locale } from '@eodia/contracts'
import en from './en'
import es from './es'

/**
 * Les messages de l'API dans la langue de la personne. Ils s'écrivent en français (`AppError`) ;
 * leurs traductions sont ici, la phrase française comme clé, et `{1}`, `{2}`… à la place de ce
 * que le message calcule (`${…}`). `tooling/i18n/extract-api.mjs` dresse la liste.
 */
const CATALOGS: Readonly<Record<Exclude<Locale, 'fr'>, Readonly<Record<string, string>>>> = { en, es }

interface Pattern {
  readonly test: RegExp
  readonly text: string
}

const compiled = new Map<Locale, Pattern[]>()

function patterns(locale: Exclude<Locale, 'fr'>): Pattern[] {
  let found = compiled.get(locale)
  if (!found) {
    found = Object.entries(CATALOGS[locale])
      .filter(([key]) => /\{\d+\}/.test(key))
      .map(([key, text]) => ({
        test: new RegExp(
          `^${key
            .split(/\{\d+\}/)
            .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('([\\s\\S]*?)')}$`,
        ),
        text,
      }))
    compiled.set(locale, found)
  }
  return found
}

/** A French message of the API in `locale`; one nobody translated stays French. */
export function localizeMessage(message: string, locale: Locale): string {
  if (locale === 'fr') return message
  const exact = CATALOGS[locale][message]
  if (exact !== undefined) return exact
  for (const p of patterns(locale)) {
    const m = p.test.exec(message)
    if (m) return p.text.replace(/\{(\d+)\}/g, (whole, n: string) => m[Number(n)] ?? whole)
  }
  return message
}
