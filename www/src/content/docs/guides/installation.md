---
title: Installation
description: Lancer la pile de développement, ou déployer eodia insights en production avec Docker Compose.
---

eodia insights a besoin de deux services à côté de lui : une base **PostgreSQL** pour son
catalogue (personnes, droits, sources, questions, tableaux de bord…) et **Trino**, le moteur qui
exécute toutes les requêtes. Le dépôt fournit deux fichiers Compose : `docker-compose.yml` pour
développer, `docker-compose.prod.yml` pour la production.

## Pour développer

Prérequis : Node.js 22 ou plus, pnpm 9 et Docker.

```bash
git clone https://github.com/eodia/insights.git && cd insights
docker compose up -d            # catalogue, Trino et deux bases de démonstration
pnpm install
pnpm --filter @eodia/api dev    # l’API, sur le port 4100 (worker inclus)
pnpm --filter @eodia/web dev    # l’interface, sur le port 3100
```

Ouvrez [http://localhost:3100](http://localhost:3100). Au premier démarrage, une **instance de
démonstration** est créée : une boutique en ligne sur PostgreSQL, un service client sur MongoDB,
des questions, un tableau de bord et deux comptes. Voir [Premiers pas](/insights/guides/premiers-pas/).

| Service | Adresse | Rôle |
|---|---|---|
| Interface | http://localhost:3100 | Next.js ; relaie `/api/*` vers l’API |
| API | http://localhost:4100 | REST `/api/v1`, authentification, endpoint OPA |
| Trino | http://localhost:58080 | le moteur de requêtes |
| Catalogue | localhost:55435 | PostgreSQL de l’application |
| Démo PostgreSQL | localhost:55434 | la base `boutique` |
| Démo MongoDB | localhost:57017 | la base `support` |

Tous les ports sont publiés sur `127.0.0.1` seulement. Pour le serveur MCP en développement :

```bash
pnpm --filter @eodia/mcp dev    # http://localhost:4200/mcp
```

:::note[L’API d’abord]
Trino interroge l’API avant chaque instruction, y compris celles de l’application elle-même
(création des catalogues, synchronisation). L’API se met donc à écouter **avant** de parler à
Trino. Si Trino n’est pas encore prêt, elle le dit dans son journal et recrée les catalogues dès
qu’il répond.
:::

## En production

Une **image unique**, construite par le `Dockerfile` du dépôt, contient l’API, l’interface, le
worker et le serveur MCP. `docker-compose.prod.yml` l’assemble avec PostgreSQL, Trino et
[Caddy](https://caddyserver.com/), qui obtient le certificat HTTPS.

Prérequis : un serveur avec Docker et Compose v2, un nom de domaine qui pointe vers lui, et les
ports 80 et 443 ouverts. Trino demande à lui seul quelques gigaoctets de mémoire (2 Go de tas dans
la configuration fournie).

### 1. Le fichier `.env`

À côté de `docker-compose.prod.yml`, créez un fichier `.env` avec les quatre valeurs
obligatoires :

```bash
EODIA_DOMAIN=bi.exemple.fr
EODIA_SECRET_KEY=<openssl rand -hex 32>
EODIA_OPA_SECRET=<openssl rand -hex 24>
EODIA_DB_PASSWORD=<un mot de passe fort>
```

| Variable | Rôle |
|---|---|
| `EODIA_DOMAIN` | le domaine public ; Caddy obtient son certificat Let’s Encrypt |
| `EODIA_SECRET_KEY` | 64 caractères hexadécimaux : chiffre les mots de passe des sources |
| `EODIA_OPA_SECRET` | le secret placé dans le chemin de l’endpoint OPA, que seul Trino appelle |
| `EODIA_DB_PASSWORD` | le mot de passe du PostgreSQL du catalogue |

Les variables facultatives — SSO, e-mails, copilot, cache… — sont listées en tête de
`docker-compose.prod.yml` et dans [Variables d’environnement](/insights/hebergement/variables/).

:::caution[La clé d’instance]
Gardez `EODIA_SECRET_KEY` en lieu sûr, avec les sauvegardes du catalogue : sans elle, les mots de
passe des sources et les secrets d’intégration ne sont plus lisibles.
:::

### 2. Démarrer

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Au premier démarrage, l’API applique les migrations du catalogue. Ouvrez ensuite
`https://bi.exemple.fr` : **le premier écran crée le compte administrateur**.

:::caution[La première visite crée l’administrateur]
Tant qu’aucun compte n’existe, la première personne qui ouvre l’interface devient
administrateur. Créez ce compte dès que l’instance est joignable.
:::

### Ce que Caddy publie

| Chemin | Service |
|---|---|
| `/api/*` | l’API (REST, authentification, copilot en SSE) |
| `/mcp` | le serveur MCP |
| tout le reste | l’interface |
| `/internal/*` | **rien** : Caddy répond 404 |

L’endpoint OPA (`/internal/opa/<secret>/…`) n’est jamais exposé : Trino l’appelle directement
sur le réseau Docker.

## Et ensuite ?

- [Premiers pas](/insights/guides/premiers-pas/) : la démo, une source, une question, un tableau
  de bord.
- [Docker](/insights/hebergement/docker/) : l’image, ses rôles et les services de production.
- [Authentification unique](/insights/hebergement/sso/) : brancher votre fournisseur OpenID Connect.
