# eodia insights

BI open source (AGPL-3.0-or-later) : toute requête passe par **Trino** ; les permissions sont appliquées par Trino lui-même, qui interroge l'endpoint OPA de l'API (`/internal/opa/<secret>/…`, `packages/core/src/access/opa.ts`). Plan : `docs/PLAN.md`.

## Lancer en développement

- `docker compose up -d` (catalogue Postgres :55435, Trino :58080, démo Postgres :55434, démo MongoDB :57017).
- `pnpm --filter @eodia/api dev` (API :4100, worker dans le processus) puis `pnpm --filter @eodia/web dev` (web :3100).
- Démo : `admin@eodia.local` / `eodia-insights` ; `analyste@eodia.local` voit des lignes filtrées et des e-mails masqués.
- L'API doit écouter **avant** de parler à Trino (`prepare()` puis `start()`) : Trino interroge l'OPA pour chaque requête, y compris celles du service.

## Règles

- **La sécurité ne se contourne pas** : jamais de requête de données hors `core.engine.run(…, { user })` sous l'identité de la personne (ou `actor.dataUser` pour une intégration signée). Les droits sur les données se décident dans `access/decide.ts` (pur, testé) ; ne les dupliquez pas ailleurs.
- **Catalogue par migrations numérotées** (`packages/catalog-schema/migrations/`) : ne modifiez jamais une migration publiée (`sealed.json`) — `pnpm catalog new <nom>` en crée une nouvelle, rejouable (`IF NOT EXISTS`).
- **Tout texte d'interface en français dans `$t('…')`** (`apps/web/src/lib/i18n.ts`), valeurs en `{nom}`, pluriels avec `$tp`. Dates et nombres par `Intl` (`lib/format.ts`).
- Les paquets sont consommés en sources TypeScript (`exports: ./src/index.ts`) ; l'API tourne avec `tsx`, le web transpile `@eodia/contracts`.
- Le web ne dépend jamais de `@eodia/core` : il parle HTTP (`/api/*` relayé vers l'API, CSRF par l'en-tête `x-eodia-csrf: 1`).
- Les fichiers `page.tsx` n'exportent que leur composant par défaut.
- Vérifier : `npx tsc --noEmit -p tsconfig.json` dans `apps/web`, `npx tsc -p tsconfig.json` dans chaque paquet, `npx vitest run` dans `packages/compiler` et `packages/core`.
