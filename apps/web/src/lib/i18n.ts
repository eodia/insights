import { LOCALES, LOCALE_COOKIE, LOCALE_NAMES, type Locale, SOURCE_LOCALE, isLocale, matchLocale } from '@eodia/contracts'

/**
 * L'interface dans la langue de la personne. Tout texte s'écrit en français dans `$t('…')` :
 * la phrase française EST la clé. La page reçoit les messages de sa langue
 * (`app/layout.tsx` les met dans `window.__EODIA_I18N__` avant tout script de l'application),
 * et `$t` les lit ; une phrase que personne n'a encore traduite s'affiche en français.
 *
 * La langue ne change pas pendant la vie d'une page : en choisir une autre la recharge. C'est
 * ce qui permet à une table de libellés d'appeler `$t` une fois, au chargement de son module.
 */

/** A message: a sentence, or one per plural category of the language (CLDR). */
export type Message = string | Readonly<Partial<Record<Intl.LDMLPluralRule, string>>>

export type Messages = Readonly<Record<string, Message>>

interface Loaded {
  readonly locale: Locale
  readonly messages: Messages
}

declare global {
  interface Window {
    __EODIA_I18N__?: Loaded
  }
}

const SOURCE: Loaded = { locale: SOURCE_LOCALE, messages: {} }

/** What the page was served with — French on the server and before the layout's script. */
function loaded(): Loaded {
  if (typeof window === 'undefined') return SOURCE
  return window.__EODIA_I18N__ ?? SOURCE
}

/** The language of the page. */
export const locale = (): Locale => loaded().locale

/** The tag `Intl` formats numbers and dates with. */
export const intlLocale = (): string => {
  const l = loaded().locale
  return l === 'fr' ? 'fr-FR' : l === 'es' ? 'es-ES' : 'en-US'
}

/** Values given to a message: `{name}` in its text is replaced by `values.name`. */
export type Values = Readonly<Record<string, string | number | boolean | null | undefined>>

function valueText(value: Values[string]): string {
  return value === null || value === undefined || value === false ? '' : String(value)
}

function interpolate(text: string, values: Values | undefined): string {
  if (values === undefined) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(values, name) ? valueText(values[name]) : whole,
  )
}

/**
 * One French word, two meanings: the key then carries its meaning after `||` —
 * `$t('Moyenne||hauteur de ligne')` —, which French does not show and a translator reads.
 */
const CONTEXT = '||'

function shown(french: string): string {
  const at = french.indexOf(CONTEXT)
  return at === -1 ? french : french.slice(0, at)
}

/** The spaces around a sentence are the code's, not the translator's. */
function sameEdges(french: string, text: string): string {
  const lead = /^\s*/.exec(french)?.[0] ?? ''
  const trail = /\s*$/.exec(french)?.[0] ?? ''
  return `${lead}${text.trim()}${trail}`
}

/**
 * A French sentence in the reader's language. `{name}` is replaced by `values.name`:
 * `$t('Nouveau champ dans {table}', { table: table.label })`. A `{name}` with no value is left
 * as it is.
 */
export function $t(french: string, values?: Values): string {
  const message = loaded().messages[french]
  if (message === undefined) return interpolate(shown(french), values)
  const text = typeof message === 'string' ? message : (message.other ?? shown(french))
  return interpolate(sameEdges(shown(french), text), values)
}

/**
 * A French text translated where it is SHOWN, not where it is written: a label in a table,
 * a status. `msg` only marks it for the catalog (`tooling/i18n/extract.mjs`); the display
 * calls `$t` on the value.
 */
export const msg = <T extends string>(french: T): T => french

const rules = new Map<string, Intl.PluralRules>()
function pluralRule(tag: string, count: number): Intl.LDMLPluralRule {
  let rule = rules.get(tag)
  if (rule === undefined) {
    rule = new Intl.PluralRules(tag)
    rules.set(tag, rule)
  }
  return rule.select(count)
}

/**
 * A sentence that depends on a number: its French singular and plural — the plural is the
 * key —, and `{count}` replaced by the number as the language writes it.
 * `$tp(n, '{count} ligne', '{count} lignes')`.
 */
export function $tp(count: number, one: string, other: string, values?: Values): string {
  const { locale: tag, messages } = loaded()
  const message = messages[other]
  let text: string
  if (typeof message === 'object') {
    text = message[pluralRule(tag, count)] ?? message.other ?? other
  } else if (typeof message === 'string') {
    text = message
  } else {
    // French: 0 and 1 are singular.
    text = pluralRule(SOURCE_LOCALE, count) === 'one' ? one : other
  }
  return interpolate(text, { count: new Intl.NumberFormat(intlLocale()).format(count), ...values })
}

/** The language the browser asks for, among ours. */
export function browserLocale(): Locale {
  if (typeof navigator === 'undefined') return SOURCE_LOCALE
  return matchLocale(navigator.languages?.length ? navigator.languages : [navigator.language])
}

/** The choice this browser remembers, if any (`null`: follow the browser). */
export function rememberedLocale(): Locale | null {
  if (typeof document === 'undefined') return null
  const found = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`))
  const value = found?.slice(LOCALE_COOKIE.length + 1)
  return isLocale(value) ? value : null
}

/** Chooses a language (`null`: the browser's) and reloads the page in it. */
export function chooseLocale(chosen: Locale | null): void {
  const year = 60 * 60 * 24 * 365
  document.cookie =
    chosen === null
      ? `${LOCALE_COOKIE}=; path=/; max-age=0; samesite=lax`
      : `${LOCALE_COOKIE}=${chosen}; path=/; max-age=${year}; samesite=lax`
  window.location.reload()
}

export { LOCALES, LOCALE_NAMES, type Locale }

/** The two groups every instance has, named in French by the catalogue. */
const SYSTEM_GROUPS: ReadonlySet<string> = new Set([
  msg('Administrateurs'),
  msg('Tous les utilisateurs'),
  msg('Tous les droits sur l’instance'),
  msg('Chaque personne de l’instance en fait partie'),
])

/** A group's name (or the description of a system group) as the reader reads it. */
export const groupName = (label: string): string =>
  SYSTEM_GROUPS.has(label.replaceAll("'", '’')) ? $t(label.replaceAll("'", '’')) : label
