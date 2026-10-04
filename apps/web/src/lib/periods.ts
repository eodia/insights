/**
 * Les périodes d'un filtre de date, comme les écrit une personne : des raccourcis, et le nom
 * en clair de n'importe quelle expression (`before:lastmonth` → « Avant le mois dernier »).
 * L'expression reste la valeur stockée ; `resolveDateExpression` (contracts) la lit en jours.
 */
import { type DaySpan, resolveDateExpression } from '@eodia/contracts'
import { $t, $tp, intlLocale, msg } from './i18n'
import { weekStart } from './preferences'

export const PERIOD_UNITS = ['day', 'week', 'month', 'quarter', 'year'] as const
export type PeriodUnit = (typeof PERIOD_UNITS)[number]

/** Today, in the person's time zone, as `YYYY-MM-DD`. */
export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const resolvePeriod = (expression: string): DaySpan | null => resolveDateExpression(expression, todayIso(), weekStart())

export interface PeriodPreset {
  readonly value: string
  readonly label: string
}

/** The shortcuts, by kind: the recent days, each calendar period, and what lies before. */
export const PERIOD_GROUPS: readonly { readonly label: string; readonly presets: readonly PeriodPreset[] }[] = [
  {
    label: msg('Jours'),
    presets: [
      { value: 'today', label: msg("Aujourd'hui") },
      { value: 'yesterday', label: msg('Hier') },
      { value: 'past7days', label: msg('7 derniers jours') },
      { value: 'past30days', label: msg('30 derniers jours') },
      { value: 'past90days', label: msg('90 derniers jours') },
    ],
  },
  {
    label: msg('Semaines'),
    presets: [
      { value: 'thisweek', label: msg('Cette semaine') },
      { value: 'lastweek', label: msg('Semaine dernière') },
      { value: 'thisweek~today', label: msg('Semaine à date') },
      { value: 'past4weeks', label: msg('4 dernières semaines') },
    ],
  },
  {
    label: msg('Mois'),
    presets: [
      { value: 'thismonth', label: msg('Ce mois-ci') },
      { value: 'lastmonth', label: msg('Mois dernier') },
      { value: 'thismonth~today', label: msg('Mois à date') },
      { value: 'past3months', label: msg('3 derniers mois') },
      { value: 'past6months', label: msg('6 derniers mois') },
      { value: 'past12months', label: msg('12 derniers mois') },
      { value: 'last12months', label: msg('12 derniers mois complets') },
    ],
  },
  {
    label: msg('Trimestres'),
    presets: [
      { value: 'thisquarter', label: msg('Ce trimestre') },
      { value: 'lastquarter', label: msg('Trimestre dernier') },
      { value: 'thisquarter~today', label: msg('Trimestre à date') },
      { value: 'past4quarters', label: msg('4 derniers trimestres') },
    ],
  },
  {
    label: msg('Années'),
    presets: [
      { value: 'thisyear', label: msg('Cette année') },
      { value: 'lastyear', label: msg("L'année dernière") },
      { value: 'thisyear~today', label: msg('Année à date') },
      { value: 'past3years', label: msg('3 dernières années') },
    ],
  },
  {
    label: msg('Avant, après'),
    presets: [
      { value: 'before:thismonth', label: msg('Avant ce mois-ci') },
      { value: 'before:lastmonth', label: msg('Avant le mois dernier') },
      { value: 'before:thisyear', label: msg('Avant cette année') },
      { value: 'before:lastyear', label: msg("Avant l'année dernière") },
      { value: 'lastmonth~', label: msg('Depuis le mois dernier') },
      { value: 'after:today', label: msg("Après aujourd'hui") },
    ],
  },
]

const PRESETS = new Map(PERIOD_GROUPS.flatMap((g) => g.presets.map((p) => [p.value, p.label] as const)))

// ── Words ───────────────────────────────────────────────────────────────────

// Each sentence a literal `$tp` — singular, then plural — so that the catalogs know its forms.

/** « 3 derniers mois » — the current one included. */
function pastWords(unit: PeriodUnit, n: number): string {
  switch (unit) {
    case 'day':
      return $tp(n, '{count} dernier jour', '{count} derniers jours')
    case 'week':
      return $tp(n, '{count} dernière semaine', '{count} dernières semaines')
    case 'month':
      return $tp(n, '{count} dernier mois', '{count} derniers mois')
    case 'quarter':
      return $tp(n, '{count} dernier trimestre', '{count} derniers trimestres')
    case 'year':
      return $tp(n, '{count} dernière année', '{count} dernières années')
  }
}
/** « 3 derniers mois complets » — the current one left out. */
function lastWords(unit: PeriodUnit, n: number): string {
  switch (unit) {
    case 'day':
      return $tp(n, '{count} dernier jour complet', '{count} derniers jours complets')
    case 'week':
      return $tp(n, '{count} dernière semaine complète', '{count} dernières semaines complètes')
    case 'month':
      return $tp(n, '{count} dernier mois complet', '{count} derniers mois complets')
    case 'quarter':
      return $tp(n, '{count} dernier trimestre complet', '{count} derniers trimestres complets')
    case 'year':
      return $tp(n, '{count} dernière année complète', '{count} dernières années complètes')
  }
}
function nextWords(unit: PeriodUnit, n: number): string {
  switch (unit) {
    case 'day':
      return $tp(n, '{count} prochain jour', '{count} prochains jours')
    case 'week':
      return $tp(n, '{count} prochaine semaine', '{count} prochaines semaines')
    case 'month':
      return $tp(n, '{count} prochain mois', '{count} prochains mois')
    case 'quarter':
      return $tp(n, '{count} prochain trimestre', '{count} prochains trimestres')
    case 'year':
      return $tp(n, '{count} prochaine année', '{count} prochaines années')
  }
}
/** « il y a 2 mois », on its own. */
function agoWords(unit: PeriodUnit, n: number): string {
  switch (unit) {
    case 'day':
      return $tp(n, 'il y a {count} jour', 'il y a {count} jours')
    case 'week':
      return $tp(n, 'il y a {count} semaine', 'il y a {count} semaines')
    case 'month':
      return $tp(n, 'il y a {count} mois', 'il y a {count} mois')
    case 'quarter':
      return $tp(n, 'il y a {count} trimestre', 'il y a {count} trimestres')
    case 'year':
      return $tp(n, 'il y a {count} an', 'il y a {count} ans')
  }
}
/** The period some periods ago, as the object of a sentence: « avant le mois d'il y a 2 mois ». */
function agoNoun(unit: PeriodUnit, n: number): string {
  switch (unit) {
    case 'day':
      return $tp(n, 'il y a {count} jour', 'il y a {count} jours')
    case 'week':
      return $tp(n, "la semaine d'il y a {count} semaine", "la semaine d'il y a {count} semaines")
    case 'month':
      return $tp(n, "le mois d'il y a {count} mois", "le mois d'il y a {count} mois")
    case 'quarter':
      return $tp(n, "le trimestre d'il y a {count} trimestre", "le trimestre d'il y a {count} trimestres")
    case 'year':
      return $tp(n, "l'année d'il y a {count} an", "l'année d'il y a {count} ans")
  }
}
/** The unit, as a choice reads it after a number: « jours », « mois »… */
export function unitName(unit: PeriodUnit, n: number): string {
  switch (unit) {
    case 'day':
      return $tp(n, 'jour', 'jours')
    case 'week':
      return $tp(n, 'semaine', 'semaines')
    case 'month':
      return $tp(n, 'mois', 'mois')
    case 'quarter':
      return $tp(n, 'trimestre', 'trimestres')
    case 'year':
      return $tp(n, 'année', 'années')
  }
}
/** A period as the object of a sentence: « le mois dernier », « cette semaine ». */
const THIS_NOUN: Record<PeriodUnit, string> = {
  day: msg("aujourd'hui"),
  week: msg('cette semaine'),
  month: msg('ce mois-ci'),
  quarter: msg('ce trimestre'),
  year: msg('cette année'),
}
const LAST_NOUN: Record<PeriodUnit, string> = {
  day: msg('hier'),
  week: msg('la semaine dernière'),
  month: msg('le mois dernier'),
  quarter: msg('le trimestre dernier'),
  year: msg("l'année dernière"),
}

const capitalize = (s: string) => (s ? s.charAt(0).toLocaleUpperCase(intlLocale()) + s.slice(1) : s)

const RELATIVE = /^(past|last|next)(\d{0,4})(day|week|month|quarter|year)s?$/
const THIS = /^this(day|week|month|quarter|year)$/
const AGO_RE = /^(\d{1,4})(day|week|month|quarter|year)s?ago$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y ?? 0, (m ?? 1) - 1, d ?? 1))
}

/**
 * One side of a sentence — « le mois dernier », « le 15 mars 2026 », « il y a 2 mois » — or
 * null when the expression is not one such side.
 */
function noun(expression: string): string | null {
  const e = expression.trim().toLowerCase()
  if (e === 'today') return $t("aujourd'hui")
  if (e === 'yesterday') return $t('hier')
  const current = THIS.exec(e)
  if (current) return $t(THIS_NOUN[current[1] as PeriodUnit])
  const rel = RELATIVE.exec(e)
  if (rel && rel[1] === 'last' && (rel[2] === '' || rel[2] === '1')) return $t(LAST_NOUN[rel[3] as PeriodUnit])
  const ago = AGO_RE.exec(e)
  if (ago) return agoNoun(ago[2] as PeriodUnit, Number(ago[1]))
  if (DAY.test(e)) return $t('le {day}', { day: dayLabel(e) })
  return null
}

/** « jusqu'à » + « le mois dernier » reads « jusqu'au mois dernier » ; « de » + « le » reads « du ». */
const untilNoun = (n: string) => (n.startsWith('le ') ? $t("jusqu'au {rest}", { rest: n.slice(3) }) : $t("jusqu'à {what}", { what: n }))
const fromNoun = (n: string) => (n.startsWith('le ') ? $t('du {rest}', { rest: n.slice(3) }) : $t('de {what}', { what: n }))

/** The name, in plain words, of a date expression: what a filter chip says. */
export function periodLabel(expression: string): string {
  const e = expression.trim().toLowerCase()
  const preset = PRESETS.get(e)
  if (preset) return $t(preset)
  const rel = RELATIVE.exec(e)
  if (rel) {
    const n = rel[2] === '' ? 1 : Number(rel[2])
    const unit = rel[3] as PeriodUnit
    if (rel[1] === 'last' && n === 1) return capitalize($t(LAST_NOUN[unit]))
    return (rel[1] === 'past' ? pastWords : rel[1] === 'last' ? lastWords : nextWords)(unit, n)
  }
  const side = /^(before|after):(.+)$/.exec(e)
  if (side) {
    const what = noun(side[2] ?? '') ?? periodLabel(side[2] ?? '').toLocaleLowerCase(intlLocale())
    return side[1] === 'before' ? $t('Avant {what}', { what }) : $t('Après {what}', { what })
  }
  if (e.includes('~')) {
    const [from = '', to = ''] = e.split('~')
    const a = from ? (noun(from) ?? from) : null
    const b = to ? (noun(to) ?? to) : null
    if (a && !b) return $t('Depuis {what}', { what: a })
    if (b && !a) return capitalize(untilNoun(b))
    if (DAY.test(from) && DAY.test(to)) return `${dayLabel(from)} → ${dayLabel(to)}`
    return capitalize(`${fromNoun(a ?? '')} ${untilNoun(b ?? '')}`)
  }
  const ago = AGO_RE.exec(e)
  if (ago) return capitalize(agoWords(ago[2] as PeriodUnit, Number(ago[1])))
  const one = noun(e)
  if (one) return capitalize(one)
  return expression
}

/** The days an expression covers, in words: « du 1 sept. au 30 sept. 2026 · 30 jours ». */
export function periodSpanLabel(expression: string): string | null {
  const span = resolvePeriod(expression)
  if (!span) return null
  if (span.start && span.end) {
    const days = Math.round((Date.parse(span.end) - Date.parse(span.start)) / 86_400_000) + 1
    const range = span.start === span.end ? dayLabel(span.start) : $t('du {from} au {to}', { from: dayLabel(span.start), to: dayLabel(span.end) })
    return `${range} · ${$tp(days, '{count} jour', '{count} jours')}`
  }
  if (span.start) return $t('à partir du {day}', { day: dayLabel(span.start) })
  if (span.end) return $t("jusqu'au {day} inclus", { day: dayLabel(span.end) })
  return null
}

// ── Reading an expression back into the picker's modes ──────────────────────

export type Rolling = { readonly direction: 'past' | 'next' | 'ago'; readonly count: number; readonly unit: PeriodUnit; readonly current: boolean }
export type Anchor = { readonly kind: 'today' | 'this' | 'last' | 'ago' | 'date'; readonly unit: PeriodUnit; readonly count: number; readonly date: string }
export type Bound = { readonly relation: 'before' | 'after' | 'since' | 'until'; readonly anchor: Anchor }

export type PeriodMode = { readonly mode: 'rolling'; readonly rolling: Rolling } | { readonly mode: 'bound'; readonly bound: Bound } | { readonly mode: 'dates'; readonly from: string; readonly to: string }

export const DEFAULT_ROLLING: Rolling = { direction: 'past', count: 30, unit: 'day', current: true }
export const DEFAULT_ANCHOR: Anchor = { kind: 'last', unit: 'month', count: 2, date: '' }

export function rollingExpression(r: Rolling): string {
  const n = Math.max(1, Math.min(9999, Math.round(r.count) || 1))
  if (r.direction === 'ago') return `${n}${r.unit}${n > 1 ? 's' : ''}ago`
  if (r.direction === 'next') return `next${n}${r.unit}s`
  return `${r.current ? 'past' : 'last'}${n}${r.unit}s`
}

export function anchorExpression(a: Anchor): string {
  switch (a.kind) {
    case 'today':
      return 'today'
    case 'this':
      return `this${a.unit}`
    case 'last':
      return `last${a.unit}`
    case 'ago':
      return `${Math.max(1, Math.round(a.count) || 1)}${a.unit}sago`
    case 'date':
      return a.date
  }
}

export function boundExpression(b: Bound): string {
  const x = anchorExpression(b.anchor)
  switch (b.relation) {
    case 'before':
      return `before:${x}`
    case 'after':
      return `after:${x}`
    case 'since':
      return `${x}~`
    case 'until':
      return `~${x}`
  }
}

function readAnchor(expression: string): Anchor | null {
  const e = expression.trim().toLowerCase()
  if (e === 'today') return { ...DEFAULT_ANCHOR, kind: 'today' }
  const current = THIS.exec(e)
  if (current) return { ...DEFAULT_ANCHOR, kind: 'this', unit: current[1] as PeriodUnit }
  const rel = RELATIVE.exec(e)
  if (rel && rel[1] === 'last' && (rel[2] === '' || rel[2] === '1')) return { ...DEFAULT_ANCHOR, kind: 'last', unit: rel[3] as PeriodUnit }
  const ago = AGO_RE.exec(e)
  if (ago) return { ...DEFAULT_ANCHOR, kind: 'ago', unit: ago[2] as PeriodUnit, count: Number(ago[1]) }
  if (DAY.test(e)) return { ...DEFAULT_ANCHOR, kind: 'date', date: e }
  return null
}

/** Which mode of the picker an expression opens on, with its fields filled. */
export function readPeriod(expression: string | null | undefined): PeriodMode | null {
  const e = (expression ?? '').trim().toLowerCase()
  if (!e) return null
  const rel = RELATIVE.exec(e)
  if (rel) {
    const count = rel[2] === '' ? 1 : Number(rel[2])
    return { mode: 'rolling', rolling: { direction: rel[1] === 'next' ? 'next' : 'past', count, unit: rel[3] as PeriodUnit, current: rel[1] === 'past' } }
  }
  const ago = AGO_RE.exec(e)
  if (ago) return { mode: 'rolling', rolling: { direction: 'ago', count: Number(ago[1]), unit: ago[2] as PeriodUnit, current: true } }
  const side = /^(before|after):(.+)$/.exec(e)
  if (side) {
    const anchor = readAnchor(side[2] ?? '')
    if (anchor) return { mode: 'bound', bound: { relation: side[1] as 'before' | 'after', anchor } }
  }
  if (e.includes('~')) {
    const [from = '', to = ''] = e.split('~')
    if ((from === '' || DAY.test(from)) && (to === '' || DAY.test(to))) return { mode: 'dates', from, to }
    const anchor = from && !to ? readAnchor(from) : !from && to ? readAnchor(to) : null
    if (anchor) return { mode: 'bound', bound: { relation: from ? 'since' : 'until', anchor } }
  }
  if (DAY.test(e)) return { mode: 'dates', from: e, to: e }
  return null
}
