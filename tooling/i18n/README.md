# Les langues d'eodia insights

L'interface parle français, anglais et espagnol (`LOCALES` de `@eodia/contracts`). Le
français est la source : chaque texte s'écrit en français, les autres langues le traduisent.

## La langue d'une page

Le choix de la personne (menu du compte › *Langue*, cookie `eodia-locale`), sinon la langue
du navigateur (`Accept-Language`), et l'anglais pour un navigateur qui ne parle aucune des
nôtres. `app/layout.tsx` sert la page avec les messages de sa langue
(`window.__EODIA_I18N__`) ; l'API lit le même cookie pour ses messages d'erreur.

## Écrire un texte de l'interface (`apps/web`)

```tsx
import { $t, $tp, msg } from '@/lib/i18n'

$t('Enregistrer')
$t('Nouveau champ dans {table}', { table: table.label })
$tp(count, '{count} ligne', '{count} lignes')        // jamais `ligne{n > 1 ? 's' : ''}`
$t('Moyenne||hauteur de ligne')                      // un mot, deux sens : le sens après ||
const LABELS = { eq: msg('est égal à') }             // traduit à l'affichage : $t(LABELS[op])
```

- La phrase française **est** la clé ; une phrase non traduite s'affiche en français.
- Une phrase entière par appel, valeurs en `{nom}` : jamais de morceaux concaténés.
- Dates et nombres par `Intl` dans la langue de la page : `intlLocale()`.

## Traduire

```sh
pnpm i18n                         # extrait les phrases et vérifie les catalogues
node tooling/i18n/check.mjs es    # une langue : manquantes, {valeurs} perdues, pluriels
node tooling/i18n/batches.mjs split            # lots à traduire (tooling/i18n/batches/)
node tooling/i18n/batches.mjs merge en <dossier>
```

- `extract.mjs` dresse `app-source.json` : chaque phrase, ses formes de pluriel, où elle sert.
- Les catalogues sont `apps/web/src/locales/<code>.json` : la phrase française → sa
  traduction, ou, pour un pluriel, ses formes CLDR (`one`, `other`…).
- Les messages de l'API (`AppError`) : `extract-api.mjs` dresse `api-source.json`, avec
  `{1}`, `{2}`… à la place de ce que le message calcule ; leurs traductions sont dans
  `packages/core/src/i18n/<code>.ts`.
