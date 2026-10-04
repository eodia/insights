---
title: Docker
description: L’image unique d’eodia insights, ses rôles, et les services du déploiement de production.
---

eodia insights se construit en **une seule image** à partir du `Dockerfile` du dépôt. Elle
contient l’API, l’interface, le worker et le serveur MCP ; l’argument donné au conteneur choisit
ce qu’il fait tourner. `docker-compose.prod.yml` assemble cette image avec PostgreSQL, Trino et
Caddy. Toute la configuration passe par des
[variables d’environnement](/insights/hebergement/variables/).

## L’image

```bash
docker build -t eodia-insights .
```

Elle repose sur Node 22, tourne sous l’utilisateur `node`, et lance ses processus sous `tini`.
Les applications s’exécutent depuis leurs sources TypeScript avec `tsx` ; seule l’interface est
compilée (`next build`), au moment du build.

| Rôle | Commande | Port | Ce qu’il fait |
|---|---|---|---|
| `api` | `docker run eodia-insights api` | 4100 | REST `/api/v1`, authentification, pages publiques, endpoint OPA interne |
| `web` | `docker run eodia-insights web` | 3100 | l’interface Next.js |
| `worker` | `docker run eodia-insights worker` | — | la file de jobs : synchronisations, préchauffage des tableaux de bord |
| `mcp` | `docker run eodia-insights mcp` | 4200 | le serveur MCP (Streamable HTTP) |
| `all` (défaut) | `docker run eodia-insights` | 3100, 4100 | `api`, `web` et `worker` dans un seul conteneur |

En mode `all`, un petit superviseur lance les trois processus, préfixe leurs journaux
(`[api]`, `[web]`, `[worker]`), relaie l’arrêt, et **arrête tout le conteneur dès que l’un d’eux
meurt** : l’orchestrateur le relance alors entier plutôt que de laisser tourner une instance à
moitié vivante. `WITH_MCP=1` y ajoute le serveur MCP.

:::note[`API_URL` est figé au build]
L’interface relaie `/api/*` vers l’API, à l’adresse `API_URL` lue **au build** (défaut :
`http://127.0.0.1:4100`, ce qui convient au mode `all`). Derrière Caddy, `/api/*` va directement
à l’API et ce relais ne sert pas.

```bash
docker build --build-arg API_URL=http://api:4100 -t eodia-insights .
```
:::

## Le déploiement de production

`docker-compose.prod.yml` fait tourner un service par rôle :

| Service | Image | Rôle |
|---|---|---|
| `catalog` | `postgres:17-alpine` | le catalogue de l’application (volume `catalog-data`) |
| `trino` | `trinodb/trino:483` | le moteur ; ses autorisations sont demandées à l’API |
| `api` | `eodia-insights` | l’API ; applique les migrations au démarrage |
| `worker` | `eodia-insights` | les jobs (`INPROCESS_WORKER=0` pour l’API) |
| `web` | `eodia-insights` | l’interface |
| `mcp` | `eodia-insights` | le serveur MCP ; ne reçoit que l’adresse de l’API, aucun secret |
| `caddy` | `caddy:2-alpine` | HTTPS automatique, ports 80 et 443 (volumes `caddy-data`, `caddy-config`) |

L’ordre de démarrage compte : l’API attend le catalogue, mais **pas** Trino — elle doit écouter
avant que Trino ne l’interroge. Le worker, l’interface et le serveur MCP attendent que l’API
réponde à sa vérification de santé (`/api/health`), et le worker attend aussi Trino.

```bash
docker compose -f docker-compose.prod.yml up -d --build   # construire et démarrer
docker compose -f docker-compose.prod.yml logs -f api     # suivre l’API
docker compose -f docker-compose.prod.yml ps              # état et santé des services
docker compose -f docker-compose.prod.yml down            # arrêter (les volumes restent)
```

`IMAGE` choisit l’image utilisée (défaut `eodia-insights:latest`).

### Trino

Trino lit trois fichiers de `docker/trino/etc`, montés en lecture seule :

| Fichier | Contenu |
|---|---|
| `config.properties` | un coordinateur qui est aussi worker ; catalogues dynamiques (`catalog.management=dynamic`) gardés en mémoire (`catalog.store=memory`) ; 1 Go de mémoire par requête |
| `access-control.properties` | le contrôle d’accès `opa`, pointé sur l’API : `/allow`, `/batch`, `/row-filters`, `/column-masks` |
| `jvm.config` | les options de la JVM, dont 2 Go de tas (`-Xmx2G`) |

Trino ne garde **rien** sur disque : l’application est la source de vérité. Elle recrée les
catalogues de toutes les sources à son démarrage, lors des tâches périodiques du worker (au plus une fois par minute)
s’il en manque, et dès qu’une requête trouve un catalogue absent. Un redémarrage de Trino se
répare donc seul.

L’adresse de l’endpoint OPA vient de `OPA_URL`, que le compose construit :
`http://api:4100/internal/opa/${OPA_SECRET}`.

### Caddy

`docker/Caddyfile` sert `DOMAIN` en HTTPS (Let’s Encrypt ; `ACME_EMAIL` en contact),
compresse les réponses, pose HSTS et quelques en-têtes de sécurité, puis répartit :

| Chemin | Vers |
|---|---|
| `/api/*` | `api:4100`, sans tampon (le copilot et la progression des synchronisations parlent en SSE) |
| `/mcp*` | `mcp:4200`, sans tampon |
| `/internal/*` | réponse 404 : l’endpoint OPA n’est jamais exposé |
| le reste | `web:3100` |

## Plusieurs workers

Les jobs vivent dans le catalogue PostgreSQL. Plusieurs workers peuvent tourner ensemble : chacun
prend les siens par `FOR UPDATE SKIP LOCKED`, et un job dont le worker s’est arrêté est repris
par un autre. Les migrations sont appliquées par le premier processus qui démarre, API ou
worker, sous un verrou.

## Sauvegarder

Deux choses suffisent à reconstruire une instance :

- la base du **catalogue** (`catalog`), par exemple avec `pg_dump` ;
- la clé **`SECRET_KEY`** : sans elle, les mots de passe des sources et les secrets
  d’intégration de la sauvegarde sont illisibles.

Trino n’a rien à sauvegarder.
