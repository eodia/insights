import { matchLocale } from '@eodia/contracts'
// @ts-expect-error a module esbuild writes when it builds the page (`src/app.ts`)
import catalogs from 'eodia:messages'

/**
 * La langue de la vue : celle du navigateur où tourne la conversation. Importé en premier par
 * `chart.ts`, ce module pose les messages avant que `viz.ts` ne lise les siens. Le catalogue
 * ne garde que les phrases des modules de `apps/web/src/lib` que la vue embarque.
 */
const locale = matchLocale(navigator.languages?.length ? navigator.languages : [navigator.language])
window.__EODIA_I18N__ = { locale, messages: (catalogs as Record<string, Record<string, string>>)[locale] ?? {} }
document.documentElement.lang = locale
