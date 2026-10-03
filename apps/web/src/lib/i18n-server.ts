import { type Locale, LOCALE_COOKIE, requestLocaleOf } from '@eodia/contracts'
import { cookies, headers } from 'next/headers'
import type { Messages } from './i18n'

/**
 * La langue dans laquelle une page est servie, et ses messages : le choix de la personne
 * (un cookie, `lib/i18n.ts`), sinon l'`Accept-Language` du navigateur, et l'anglais pour un
 * navigateur qui ne parle aucune de nos langues.
 */

/** The catalogs, one module each: only the served language's is read. */
const CATALOGS: Readonly<Record<Exclude<Locale, 'fr'>, () => Promise<{ default: Messages }>>> = {
  en: () => import('@/locales/en.json'),
  es: () => import('@/locales/es.json'),
}

export async function requestLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value
  return requestLocaleOf(chosen ? `${LOCALE_COOKIE}=${chosen}` : null, (await headers()).get('accept-language'))
}

export async function messagesOf(locale: Locale): Promise<Messages> {
  // French is the source: its sentences are the keys.
  if (locale === 'fr') return {}
  return (await CATALOGS[locale]()).default
}

/** The script that hands the page its language; `<` is escaped so no message can close the tag. */
export function i18nScript(locale: Locale, messages: Messages): string {
  const json = JSON.stringify({ locale, messages }).replaceAll('<', '\\u003c')
  return `window.__EODIA_I18N__=${json};document.documentElement.lang=${JSON.stringify(locale)};`
}

/** A French sentence in the served language — for what the server writes itself. */
export function translate(messages: Messages, french: string): string {
  const message = messages[french]
  return typeof message === 'string' ? message : (message?.other ?? french)
}
