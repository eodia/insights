import { $t } from './i18n'

/** « Mon dossier » for one's own personal folder; any other folder keeps its own name. */
export const folderLabel = (f: { readonly personal: string | null; readonly name: string }, me: string | null | undefined): string =>
  f.personal && f.personal === me ? $t('Mon dossier') : f.name
