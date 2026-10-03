---
title: Variables d’environnement
description: Toutes les variables lues par eodia insights, et leur valeur par défaut.
---

L’API et le worker lisent leur configuration dans l’environnement, une fois, au démarrage
(`packages/core/src/config.ts`). Avec `docker-compose.prod.yml`, placez-les dans un fichier
`.env` à côté de lui : le compose les transmet aux services. **Une valeur vide vaut « non
définie ».**

Les valeurs par défaut sont celles du développement ; `NODE_ENV=production`, que l’image pose
d’office, en change quelques-unes.

## Obligatoires en production

| Variable | Rôle |
|---|---|
| `EODIA_DOMAIN` | le domaine public, servi en HTTPS par Caddy (compose de production) |
| `EODIA_SECRET_KEY` | la clé d’instance, 64 caractères hexadécimaux (`openssl rand -hex 32`) : chiffre les mots de passe des sources et les secrets d’intégration |
| `EODIA_OPA_SECRET` | le secret placé dans le chemin de l’endpoint OPA appelé par Trino (`openssl rand -hex 24`) |
| `EODIA_DB_PASSWORD` | le mot de passe du PostgreSQL du catalogue (compose de production) |

:::caution[`EODIA_SECRET_KEY`]
Sans elle, l’API refuse de démarrer en production. Une valeur qui n’est pas faite de 64
caractères hexadécimaux est acceptée et dérivée par SHA-256, mais préférez le format attendu.
La changer rend illisibles les secrets déjà enregistrés : générez-la une fois, sauvegardez-la
avec le catalogue.
:::

## Fonctionnement

| Variable | Défaut | Rôle |
|---|---|---|
| `NODE_ENV` | `development` | `production` rend `EODIA_SECRET_KEY` obligatoire et coupe par défaut la démo, le worker intégré et l’alias `localhost` de Trino |
| `EODIA_PUBLIC_URL` | `http://localhost:3100` ; en production, `https://$EODIA_DOMAIN` | l’adresse publique : liens de partage, retour OIDC ; `https://` rend le cookie de session `Secure` |
| `EODIA_SESSION_DAYS` | `14` | durée d’une session, en jours |
| `EODIA_MAX_ROWS` | `2000` | lignes lues au plus par requête de l’interface |
| `EODIA_QUERY_TIMEOUT_MS` | `120000` | délai maximal d’une requête |
| `EODIA_CACHE_TTL` | `300` | durée du cache de résultats, en secondes, quand rien d’autre ne la fixe |
| `EODIA_DEMO` | `1` en développement, `0` en production | crée l’instance de démonstration au premier démarrage |
| `EODIA_INPROCESS_WORKER` | `1` en développement, `0` en production | fait tourner le worker dans l’API |

## Catalogue

| Variable | Défaut | Rôle |
|---|---|---|
| `EODIA_DATABASE_URL` | `postgres://eodia:eodia@localhost:55435/eodia` | la base PostgreSQL du catalogue ; le compose de production la construit avec `EODIA_DB_PASSWORD` |
| `EODIA_DATABASE_SCHEMA` | `eodia` | le schéma du catalogue dans cette base |

## Trino

| Variable | Défaut | Rôle |
|---|---|---|
| `EODIA_TRINO_URL` | `http://localhost:58080` ; `http://trino:8080` dans le compose | l’adresse de Trino |
| `EODIA_TRINO_SERVICE_USER` | `eodia-service` | l’utilisateur Trino de l’application (catalogues, synchronisation), à qui l’endpoint OPA accorde tout |
| `EODIA_TRINO_PASSWORD` | — | le mot de passe Trino, si votre cluster exige une authentification |
| `EODIA_TRINO_LOCALHOST_ALIAS` | `host.docker.internal` en développement | le nom par lequel Trino, en conteneur, joint une base déclarée sur `localhost` |
| `EODIA_OPA_URL` | — | lue par **Trino** : l’adresse de l’endpoint OPA, `http://api:4100/internal/opa/<secret>` ; le compose la construit |

## Connexion

| Variable | Défaut | Rôle |
|---|---|---|
| `EODIA_PASSWORD_LOGIN` | `1` | `0` coupe la connexion par mot de passe : SSO seul |
| `EODIA_OIDC_ISSUER` | — | l’émetteur OpenID Connect ; active le SSO |
| `EODIA_OIDC_CLIENT_ID` | — | l’identifiant du client OIDC |
| `EODIA_OIDC_CLIENT_SECRET` | — | son secret, pour un client confidentiel |
| `EODIA_OIDC_LABEL` | `Se connecter avec SSO` | le libellé du bouton de connexion |
| `EODIA_OIDC_SCOPES` | `openid email profile` | les portées demandées |
| `EODIA_OIDC_ATTRIBUTE_CLAIMS` | — | les claims copiés en attributs, séparés par des virgules : `region,departement` |
| `EODIA_OIDC_GROUPS_CLAIM` | — | le claim qui porte les groupes à refléter |

Voir [Authentification unique](/insights/hebergement/sso/).

## E-mails

| Variable | Défaut | Rôle |
|---|---|---|
| `EODIA_SMTP_URL` | — | le serveur d’envoi, en URL de connexion SMTP : `smtps://utilisateur:motdepasse@smtp.exemple.fr:465` |
| `EODIA_SMTP_FROM` | `eodia insights <noreply@localhost>` | l’expéditeur |

Sans SMTP, aucun e-mail ne part : le lien d’une invitation s’affiche pour être transmis à la main.

## Copilot

| Variable | Défaut | Rôle |
|---|---|---|
| `EODIA_AI_PROVIDER` | `anthropic` si `ANTHROPIC_API_KEY` est définie, sinon `openai` si `OPENAI_API_KEY` l’est, sinon `none` | `anthropic`, `openai`, `mistral`, `openai-compatible` ou `none` |
| `EODIA_AI_API_KEY` | `ANTHROPIC_API_KEY`, sinon `OPENAI_API_KEY` | la clé du fournisseur |
| `EODIA_AI_MODEL` | `claude-sonnet-5-5` (Anthropic), `mistral-large-latest` (Mistral), `gpt-4.1` (les autres) | le modèle |
| `EODIA_AI_BASE_URL` | l’adresse du fournisseur | obligatoire pour `openai-compatible` |
| `EODIA_AI_HOURLY_QUOTA` | `60` | messages du copilot par personne et par heure |

Voir [Copilot](/insights/fonctionnalites/copilot/).

## Processus et ports

| Variable | Défaut | Lue par | Rôle |
|---|---|---|---|
| `EODIA_API_PORT`, `EODIA_API_HOST` | `4100`, `0.0.0.0` | l’API | son écoute |
| `EODIA_WEB_PORT` | `3100` | l’image (rôle `web`) | l’écoute de l’interface |
| `EODIA_API_URL` | `http://localhost:4100` | l’interface (au build), le serveur MCP | l’adresse de l’API |
| `EODIA_MCP_PORT`, `EODIA_MCP_HOST` | `4200`, `0.0.0.0` | le serveur MCP | son écoute |
| `EODIA_URL`, `EODIA_TOKEN` | `http://localhost:4100`, — | le serveur MCP en stdio | l’adresse de l’application et le jeton |
| `EODIA_WITH_MCP` | — | l’image (rôle `all`) | `1` ajoute le serveur MCP au conteneur |

## Compose de production

| Variable | Défaut | Rôle |
|---|---|---|
| `EODIA_ACME_EMAIL` | — | l’adresse de contact pour Let’s Encrypt |
| `EODIA_IMAGE` | `eodia-insights:latest` | l’image utilisée pour `api`, `worker`, `web` et `mcp` |
