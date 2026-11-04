/** The words of what is sent — e-mails, posts in a channel — in the language of whoever reads them. */
import { type Locale, isLocale } from '@eodia/contracts'

const WORDS = {
  open: { fr: 'Ouvrir le tableau de bord', en: 'Open the dashboard', es: 'Abrir el panel' },
  openQuestion: { fr: 'Ouvrir la question', en: 'Open the question', es: 'Abrir la pregunta' },
  attached: { fr: 'Le tableau de bord est joint à ce message.', en: 'The dashboard is attached to this message.', es: 'El panel va adjunto a este mensaje.' },
  pdf: { fr: 'Télécharger le PDF', en: 'Download the PDF', es: 'Descargar el PDF' },
  filters: { fr: 'Filtres', en: 'Filters', es: 'Filtros' },
  sentBy: {
    fr: 'Envoyé par eodia insights à la demande de {name}. Les chiffres sont ceux que vous verriez en ouvrant le tableau.',
    en: 'Sent by eodia insights on behalf of {name}. The figures are those you would see opening the dashboard.',
    es: 'Enviado por eodia insights a petición de {name}. Las cifras son las que vería al abrir el panel.',
  },
  sentChannel: { fr: 'Envoyé par eodia insights à la demande de {name}.', en: 'Sent by eodia insights on behalf of {name}.', es: 'Enviado por eodia insights a petición de {name}.' },
  more: { fr: '… et {count} lignes de plus', en: '… and {count} more rows', es: '… y {count} filas más' },
  noRows: { fr: 'Aucune ligne.', en: 'No rows.', es: 'Ninguna fila.' },
  failed: { fr: 'Cette carte n’a pas pu être calculée : {error}', en: 'This card could not be computed: {error}', es: 'Esta tarjeta no se pudo calcular: {error}' },
  alertSubject: { fr: 'Alerte : {name}', en: 'Alert: {name}', es: 'Alerta: {name}' },
  alertRows: { fr: 'La question « {question} » renvoie {count} ligne(s).', en: 'The question “{question}” returns {count} row(s).', es: 'La pregunta «{question}» devuelve {count} fila(s).' },
  alertNoRows: { fr: 'La question « {question} » ne renvoie plus aucune ligne.', en: 'The question “{question}” returns no rows any more.', es: 'La pregunta «{question}» ya no devuelve ninguna fila.' },
  alertValue: { fr: '{column} vaut {value} ({op} {threshold}).', en: '{column} is {value} ({op} {threshold}).', es: '{column} vale {value} ({op} {threshold}).' },
  alertWhy: {
    fr: 'Vous recevez ce message parce que {name} a créé cette alerte sur eodia insights.',
    en: 'You receive this message because {name} set up this alert on eodia insights.',
    es: 'Recibe este mensaje porque {name} creó esta alerta en eodia insights.',
  },
  test: { fr: '[Essai] ', en: '[Test] ', es: '[Prueba] ' },
} as const

export type WordKey = keyof typeof WORDS

export function word(locale: string | null | undefined, key: WordKey, vars: Record<string, string | number> = {}): string {
  const lang: Locale = isLocale(locale) ? locale : 'fr'
  return WORDS[key][lang].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
}

export const OP_SIGNS = { lt: '<', lte: '≤', gt: '>', gte: '≥', eq: '=', ne: '≠' } as const

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const PERIODS: Readonly<Record<string, Readonly<Record<Locale, string>>>> = {
  today: { fr: 'aujourd’hui', en: 'today', es: 'hoy' },
  yesterday: { fr: 'hier', en: 'yesterday', es: 'ayer' },
  thisweek: { fr: 'cette semaine', en: 'this week', es: 'esta semana' },
  lastweek: { fr: 'la semaine dernière', en: 'last week', es: 'la semana pasada' },
  thismonth: { fr: 'ce mois-ci', en: 'this month', es: 'este mes' },
  lastmonth: { fr: 'le mois dernier', en: 'last month', es: 'el mes pasado' },
  thisquarter: { fr: 'ce trimestre', en: 'this quarter', es: 'este trimestre' },
  lastquarter: { fr: 'le trimestre dernier', en: 'last quarter', es: 'el trimestre pasado' },
  thisyear: { fr: 'cette année', en: 'this year', es: 'este año' },
  lastyear: { fr: 'l’année dernière', en: 'last year', es: 'el año pasado' },
}
const PAST_UNITS: Readonly<Record<string, Readonly<Record<Locale, string>>>> = {
  days: { fr: '{n} derniers jours', en: 'last {n} days', es: 'últimos {n} días' },
  weeks: { fr: '{n} dernières semaines', en: 'last {n} weeks', es: 'últimas {n} semanas' },
  months: { fr: '{n} derniers mois', en: 'last {n} months', es: 'últimos {n} meses' },
  quarters: { fr: '{n} derniers trimestres', en: 'last {n} quarters', es: 'últimos {n} trimestres' },
  years: { fr: '{n} dernières années', en: 'last {n} years', es: 'últimos {n} años' },
}

/** A date filter's value as people say it: `past12months` → « 12 derniers mois », a range → its two days. */
export function periodLabel(value: string, locale: string | null | undefined): string {
  const lang: Locale = isLocale(locale) ? locale : 'fr'
  const one = (token: string): string => {
    const known = PERIODS[token]
    if (known) return known[lang]
    const past = /^(?:past|last)(\d+)(days|weeks|months|quarters|years)$/.exec(token)
    if (past?.[1] && past[2]) return (PAST_UNITS[past[2]]?.[lang] ?? token).replace('{n}', past[1])
    if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return new Date(`${token}T00:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })
    return token
  }
  const [from, to] = value.split('~')
  if (to === undefined) return one(value.replace(/^(before|after):/, ''))
  return `${from ? one(from) : '…'} → ${to ? one(to) : '…'}`
}
