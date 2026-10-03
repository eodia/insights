import { locale } from './i18n'

/** Préférences de lecture : la semaine commence le lundi, le dimanche en anglais (américain). */
export const weekStart = (): 0 | 1 => (locale() === 'en' ? 0 : 1)
