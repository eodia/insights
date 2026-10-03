# eodia insights

**eodia insights** est un outil de BI open source, dans l'esprit de Metabase : on branche ses
bases de données, on les décrit, puis on construit des questions (sans SQL ou en SQL), des
modèles, des métriques et des tableaux de bord, que l'on partage avec des droits fins.

Ce qui le distingue :

- **Trino comme moteur unique.** Toute requête d'un utilisateur, éditeur visuel, SQL libre,
  carte de tableau de bord, copilot, API ou MCP, est exécutée par Trino. On peut donc joindre
  une table PostgreSQL et une collection MongoDB dans la même requête.
- **Les permissions sont appliquées par Trino lui-même.** Trino interroge l'endpoint OPA intégré
  à l'API (`/internal/opa/<secret>/…`) avant chaque instruction : accès aux tables, colonnes
  masquées ou cachées, règles de ligne par groupe ou par attribut. Aucun chemin, pas même le
  SQL libre, ne contourne ces règles.
- **7 moteurs** : PostgreSQL, MySQL, SQL Server, Oracle, Snowflake, MongoDB et Trino. Les pilotes
  natifs ne servent qu'à l'administration (test de connexion, introspection enrichie).
- **Copilot IA** (Anthropic, OpenAI, Mistral ou compatible OpenAI) : il décrit un schéma, écrit
  une requête, construit une question ou un tableau de bord, en streaming.
- **API REST documentée** (OpenAPI 3.1 générée depuis les schémas zod) et **serveur MCP** :
  Claude ou tout client MCP interroge vos métriques sous les droits du jeton.
- Licence **AGPL-3.0-or-later**.

## Architecture

```
                         ┌──────────────── Caddy (HTTPS) ────────────────┐
  navigateur ───────────►│  /        → web  :3100   (Next.js)            │
  scripts, SDK ─────────►│  /api/*   → api  :4100   (Hono, REST + auth)  │
  Claude, agents MCP ───►│  /mcp     → mcp  :4200   (MCP Streamable HTTP)│
                         └───────────────────────────────────────────────┘
                                          │
          ┌───────────────────────────────┼─────────────────────────────┐
          ▼                               ▼                             ▼
  ┌───────────────┐   requêtes   ┌─────────────────┐  connecteurs  ┌──────────────┐
  │ api / worker  │─────────────►│      Trino      │──────────────►│ vos bases :  │
  │ @eodia/core   │◄─────────────│ (moteur unique) │               │ PG, MySQL,   │
  └───────┬───────┘  OPA : allow,└─────────────────┘               │ SQL Server,  │
          │          filtres de ligne,                             │ Oracle,      │
          │          masques de colonne                            │ Snowflake,   │
          ▼                                                        │ MongoDB…     │
  ┌───────────────┐                                                └──────────────┘
  │  PostgreSQL   │  catalogue : utilisateurs, groupes, permissions, sources (secrets
  │  (catalogue)  │  chiffrés AES-256-GCM), métadonnées, questions, tableaux de bord, jobs
  └───────────────┘
```

- Le **web** ne parle qu'HTTP à l'API ; il ne touche jamais aux données.
- L'**API** sert le REST `/api/v1`, l'authentification (mot de passe, OIDC), les pages publiques
  et l'endpoint OPA appelé par Trino. Elle recrée les catalogues Trino au démarrage
  (`catalog.store=memory` : l'application reste la source de vérité).
- Le **worker** vide la file de jobs du catalogue (synchronisations de schéma, scan de valeurs,
  préchauffage des tableaux de bord). En développement, il tourne dans l'API.
- Le serveur **MCP** ne détient aucun secret : il relaie le jeton de chaque appel à l'API.

## Démarrage rapide (développement)

Prérequis : Node.js ≥ 22, pnpm 9, Docker.

```bash
docker compose up -d            # catalogue Postgres :55435, Trino :58080, démo Postgres :55434, démo MongoDB :57017
pnpm install
pnpm --filter @eodia/api dev    # API :4100 (worker inclus)
pnpm --filter @eodia/web dev    # interface :3100
```

Ouvrez <http://localhost:3100>. En développement, une instance de démonstration est créée au
premier démarrage (une boutique en ligne sur PostgreSQL et un support client sur MongoDB) :

| Compte | Mot de passe | Ce qu'il voit |
|---|---|---|
| `admin@eodia.local` | `eodia-insights` | Administrateur : tout |
| `analyste@eodia.local` | `eodia-insights` | Les lignes de sa région seulement, e-mails masqués |

Pour le serveur MCP en développement :

```bash
pnpm --filter @eodia/mcp dev    # http://localhost:4200/mcp
```

Créez un jeton depuis la page **API et MCP** de l'application (surface MCP), puis déclarez le
serveur dans votre client : Streamable HTTP `http://localhost:4200/mcp` avec l'en-tête
`Authorization: Bearer eoi_…`, ou en stdio :

```json
{
  "mcpServers": {
    "eodia-insights": {
      "command": "npx",
      "args": ["tsx", "/chemin/vers/eodia-insights/apps/mcp/src/server.ts", "--stdio"],
      "env": { "EODIA_URL": "http://localhost:4100", "EODIA_TOKEN": "eoi_…" }
    }
  }
}
```

Outils MCP : `list_datasources`, `search_schema`, `describe_table`, `list_metrics`,
`query_metric`, `list_questions`, `run_question`, `run_sql` (lecture seule) et `get_dashboard`.

### Vérifications

```bash
npx tsc --noEmit -p tsconfig.json          # dans apps/web
npx tsc -p tsconfig.json                   # dans chaque paquet et application
npx vitest run                             # dans packages/compiler et packages/core
pnpm catalog check                         # aucune migration publiée n'a été modifiée
```

## Variables d'environnement

Lues par `packages/core/src/config.ts` (API et worker) ; les valeurs par défaut sont celles du
développement.

| Variable | Défaut | Rôle |
|---|---|---|
| `NODE_ENV` | `development` | `production` rend `EODIA_SECRET_KEY` obligatoire et coupe la démo et le worker intégré par défaut |
| `EODIA_DATABASE_URL` | `postgres://eodia:eodia@localhost:55435/eodia` | Base PostgreSQL du catalogue |
| `EODIA_DATABASE_SCHEMA` | `eodia` | Schéma du catalogue |
| `EODIA_SECRET_KEY` | clé de développement | 64 caractères hexadécimaux : chiffre les secrets des sources (`openssl rand -hex 32`) |
| `EODIA_TRINO_URL` | `http://localhost:58080` | Adresse de Trino |
| `EODIA_TRINO_SERVICE_USER` | `eodia-service` | Utilisateur Trino du service (catalogues, synchro) |
| `EODIA_TRINO_PASSWORD` | — | Mot de passe Trino, s'il en exige un |
| `EODIA_TRINO_LOCALHOST_ALIAS` | `host.docker.internal` en dev | Nom par lequel Trino (en conteneur) joint `localhost` |
| `EODIA_OPA_SECRET` | `dev-opa-secret` | Secret du chemin de l'endpoint OPA appelé par Trino |
| `EODIA_PUBLIC_URL` | `http://localhost:3100` | Adresse publique ; `https://` rend le cookie de session `Secure` |
| `EODIA_SESSION_DAYS` | `14` | Durée d'une session |
| `EODIA_MAX_ROWS` | `2000` | Lignes lues au plus par requête de l'interface |
| `EODIA_QUERY_TIMEOUT_MS` | `120000` | Délai maximal d'une requête |
| `EODIA_CACHE_TTL` | `300` | Durée du cache de résultats (secondes) |
| `EODIA_PASSWORD_LOGIN` | `1` | `0` coupe la connexion par mot de passe (SSO seul) |
| `EODIA_OIDC_ISSUER` | — | Active le SSO OpenID Connect |
| `EODIA_OIDC_CLIENT_ID` / `EODIA_OIDC_CLIENT_SECRET` | — | Client OIDC |
| `EODIA_OIDC_LABEL` | `Se connecter avec SSO` | Libellé du bouton |
| `EODIA_OIDC_SCOPES` | `openid email profile` | Portées demandées |
| `EODIA_OIDC_ATTRIBUTE_CLAIMS` | — | Claims copiés en attributs (`region,departement`), utilisables dans les règles de ligne |
| `EODIA_OIDC_GROUPS_CLAIM` | — | Claim portant les groupes à refléter |
| `EODIA_SMTP_URL` / `EODIA_SMTP_FROM` | — | Envoi des invitations par e-mail |
| `EODIA_AI_PROVIDER` | selon la clé présente | `anthropic`, `openai`, `mistral`, `openai-compatible` ou `none` |
| `EODIA_AI_API_KEY` (ou `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) | — | Clé du fournisseur du copilot |
| `EODIA_AI_MODEL` | `claude-sonnet-5-5` (Anthropic) | Modèle du copilot |
| `EODIA_AI_BASE_URL` | — | Point d'accès d'un fournisseur compatible OpenAI |
| `EODIA_AI_HOURLY_QUOTA` | `60` | Messages du copilot par personne et par heure |
| `EODIA_DEMO` | `1` en dev, `0` en prod | Crée l'instance de démonstration |
| `EODIA_INPROCESS_WORKER` | `1` en dev, `0` en prod | Fait tourner le worker dans l'API |
| `EODIA_API_PORT` / `EODIA_API_HOST` | `4100` / `0.0.0.0` | Écoute de l'API |
| `EODIA_API_URL` | `http://localhost:4100` | Web (au build : relais `/api/*`) et serveur MCP : adresse de l'API |
| `EODIA_MCP_PORT` / `EODIA_MCP_HOST` | `4200` / `0.0.0.0` | Écoute du serveur MCP |
| `EODIA_URL` / `EODIA_TOKEN` | — | Serveur MCP en stdio : adresse de l'application et jeton |

## Production

Une image unique (`Dockerfile`) contient l'API, le web, le worker et le serveur MCP ; l'argument
du conteneur choisit le rôle : `api`, `web`, `worker`, `mcp`, ou `all` (API + web + worker dans
un seul conteneur, sous un petit superviseur ; `EODIA_WITH_MCP=1` y ajoute le MCP).

`docker-compose.prod.yml` assemble l'ensemble : PostgreSQL du catalogue, Trino (configuration de
`docker/trino/etc`, OPA pointé sur `http://api:4100/internal/opa/<secret>`), api, worker, web,
mcp et Caddy en frontal (HTTPS automatique, `docker/Caddyfile`).

```bash
cat > .env <<'EOF'
EODIA_DOMAIN=bi.exemple.fr
EODIA_SECRET_KEY=<openssl rand -hex 32>
EODIA_OPA_SECRET=<openssl rand -hex 24>
EODIA_DB_PASSWORD=<mot de passe fort>
EOF
docker compose -f docker-compose.prod.yml up -d --build
```

Puis ouvrez `https://bi.exemple.fr` : le premier écran crée le compte administrateur. Toutes les
variables facultatives sont listées en tête de `docker-compose.prod.yml`. L'endpoint OPA n'est
pas exposé par Caddy : seul Trino l'appelle, sur le réseau Docker. Gardez `EODIA_SECRET_KEY` en
lieu sûr : sans elle, les mots de passe des sources ne sont plus lisibles.

## Organisation du dépôt

```
apps/
  api/        Hono : REST /api/v1, authentification, pages publiques, endpoint OPA interne
  web/        Next.js (App Router), React 19, Tailwind v4, shadcn/ui
  worker/     file de jobs pour la production
  mcp/        serveur MCP (Streamable HTTP et stdio)
packages/
  contracts/       types et schémas zod partagés (source de l'OpenAPI)
  core/            logique métier : auth, droits, catalogue, requêtes, copilot, synchro, jobs
  catalog-schema/  migrations SQL numérotées et scellées du catalogue
  compiler/        requête du builder → SQL Trino ; règles de ligne → SQL
  engine/          Trino : catalogues dynamiques, exécution, annulation
  drivers/         pilotes natifs : test de connexion et introspection
docker/       configuration Trino, données de démo, Caddyfile, point d'entrée de l'image
scripts/      catalog.mjs (migrations du catalogue)
docs/         PLAN.md : décisions et phasage
```

Les paquets sont consommés en sources TypeScript (`exports: ./src/index.ts`) et les applications
tournent avec `tsx` : pas d'étape de compilation, sauf `next build` pour le web.

### Migrations du catalogue

```bash
pnpm catalog new ajout_des_rappels   # crée packages/catalog-schema/migrations/NNNN_ajout_des_rappels.sql
pnpm catalog status                  # scellée ou non, appliquée ou non (lit EODIA_DATABASE_URL)
pnpm catalog seal 0.2.0              # à la publication : fige les migrations non scellées
pnpm catalog check [--release]       # échoue si une migration scellée a changé
```

Une migration publiée ne se modifie jamais : les installations ont noté sa somme de contrôle
et refusent de démarrer si elle change. La correction va dans la migration suivante.

## Modèle de sécurité

- **Identité de bout en bout.** Chaque requête de données part vers Trino sous l'identité de la
  personne (ou du propriétaire du jeton). Trino demande à l'endpoint OPA de l'API ce qu'elle peut
  lire ; les décisions viennent d'une fonction pure et testée (`packages/core/src/access/decide.ts`).
- **Données** : accès par groupe à une source, un schéma ou une table ; niveau de requête par
  source (aucune, éditeur visuel, SQL) ; SQL natif réservé à qui n'a aucune restriction sur la
  source.
- **Colonnes** : cachées (absentes) ou masquées (valeur remplacée par Trino).
- **Lignes** : règles par groupe, éventuellement fondées sur les attributs de la personne
  (`region = {{user.region}}`), traduites en filtres de ligne Trino ; un attribut absent ferme
  l'accès plutôt que de l'ouvrir.
- **Contenu** : droits par dossier (lecture, modification, gestion), partages d'éléments, liens
  publics et intégration signée qui s'exécutent sous une identité dédiée.
- **Sessions et jetons** : cookie `httpOnly` `SameSite=Lax`, toute écriture exige l'en-tête
  `X-Eodia-Csrf: 1`. Les jetons d'intégration `eoi_…` portent les droits de leur propriétaire,
  sont limités à leurs surfaces (`rest`, `mcp`), révocables et éventuellement datés.
- **Secrets** : les identifiants des sources sont chiffrés en AES-256-GCM avec `EODIA_SECRET_KEY` ;
  Trino ne garde rien sur disque (`catalog.store=memory`).
- **Audit** : échecs de connexion, changements de droits, sources, jetons, partages, liens et
  secrets d'intégration sont journalisés.

## Licence

eodia insights est distribué sous licence [GNU AGPL v3 ou ultérieure](LICENSE). Si vous le
modifiez et l'offrez comme service en réseau, vous devez en publier les sources modifiées.
