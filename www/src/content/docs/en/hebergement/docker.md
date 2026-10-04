---
title: Docker
description: The single eodia insights image, its roles, and the services of the production deployment.
---

eodia insights is built as **a single image** from the repository's `Dockerfile`. It contains
the API, the interface, the worker and the MCP server; the argument given to the container
chooses what it runs. `docker-compose.prod.yml` puts this image together with PostgreSQL, Trino
and Caddy. All configuration goes through
[environment variables](/insights/en/hebergement/variables/).

## The image

```bash
docker build -t eodia-insights .
```

It is based on Node 22, runs as the `node` user, and starts its processes under `tini`. The
applications run from their TypeScript sources with `tsx`; only the interface is compiled
(`next build`), at build time.

| Role | Command | Port | What it does |
|---|---|---|---|
| `api` | `docker run eodia-insights api` | 4100 | REST `/api/v1`, authentication, public pages, internal OPA endpoint |
| `web` | `docker run eodia-insights web` | 3100 | the Next.js interface |
| `worker` | `docker run eodia-insights worker` | — | the job queue: synchronizations, dashboard pre-warming |
| `mcp` | `docker run eodia-insights mcp` | 4200 | the MCP server (Streamable HTTP) |
| `all` (default) | `docker run eodia-insights` | 3100, 4100 | `api`, `web` and `worker` in a single container |

In `all` mode, a small supervisor starts the three processes, prefixes their logs (`[api]`,
`[web]`, `[worker]`), forwards shutdown, and **stops the whole container as soon as one of them
dies**: the orchestrator then restarts it in full rather than leaving a half-alive instance
running. `WITH_MCP=1` adds the MCP server to it.

:::note[`API_URL` is fixed at build time]
The interface relays `/api/*` to the API, at the `API_URL` address read **at build time**
(default: `http://127.0.0.1:4100`, which suits `all` mode). Behind Caddy, `/api/*` goes straight
to the API and this relay is not used.

```bash
docker build --build-arg API_URL=http://api:4100 -t eodia-insights .
```
:::

## The production deployment

`docker-compose.prod.yml` runs one service per role:

| Service | Image | Role |
|---|---|---|
| `catalog` | `postgres:17-alpine` | the application catalog (`catalog-data` volume) |
| `trino` | `trinodb/trino:483` | the engine; its authorizations are requested from the API |
| `api` | `eodia-insights` | the API; applies migrations on startup |
| `worker` | `eodia-insights` | the jobs (`INPROCESS_WORKER=0` for the API) |
| `web` | `eodia-insights` | the interface |
| `mcp` | `eodia-insights` | the MCP server; receives only the API address, no secret |
| `caddy` | `caddy:2-alpine` | automatic HTTPS, ports 80 and 443 (`caddy-data`, `caddy-config` volumes) |

Startup order matters: the API waits for the catalog, but **not** for Trino — it must be
listening before Trino queries it. The worker, the interface and the MCP server wait for the API
to answer its health check (`/api/health`), and the worker also waits for Trino.

```bash
docker compose -f docker-compose.prod.yml up -d --build   # build and start
docker compose -f docker-compose.prod.yml logs -f api     # follow the API
docker compose -f docker-compose.prod.yml ps              # status and health of the services
docker compose -f docker-compose.prod.yml down            # stop (volumes are kept)
```

`IMAGE` chooses the image used (default `eodia-insights:latest`).

### Trino

Trino reads three files from `docker/trino/etc`, mounted read-only:

| File | Contents |
|---|---|
| `config.properties` | a coordinator that is also a worker; dynamic catalogs (`catalog.management=dynamic`) kept in memory (`catalog.store=memory`); 1 GB of memory per query |
| `access-control.properties` | the `opa` access control, pointed at the API: `/allow`, `/batch`, `/row-filters`, `/column-masks` |
| `jvm.config` | the JVM options, including a 2 GB heap (`-Xmx2G`) |

Trino keeps **nothing** on disk: the application is the source of truth. It recreates the
catalogs of all sources on startup, during the worker's periodic tasks (at most once a minute)
if any are missing, and as soon as a query finds a catalog absent. A Trino restart therefore
repairs itself.

The OPA endpoint address comes from `OPA_URL`, which the compose file builds:
`http://api:4100/internal/opa/${OPA_SECRET}`.

### Caddy

`docker/Caddyfile` serves `DOMAIN` over HTTPS (Let’s Encrypt; `ACME_EMAIL` as the
contact), compresses responses, sets HSTS and a few security headers, then routes:

| Path | To |
|---|---|
| `/api/*` | `api:4100`, unbuffered (the copilot and synchronization progress use SSE) |
| `/mcp*` | `mcp:4200`, unbuffered |
| `/internal/*` | 404 response: the OPA endpoint is never exposed |
| everything else | `web:3100` |

## Multiple workers

Jobs live in the PostgreSQL catalog. Several workers can run together: each one claims its own
with `FOR UPDATE SKIP LOCKED`, and a job whose worker has stopped is picked up by another. The
migrations are applied by the first process to start, API or worker, under a lock.

## Backing up

Two things are enough to rebuild an instance:

- the **catalog** database (`catalog`), for example with `pg_dump`;
- the **`SECRET_KEY`** key: without it, the source passwords and embedding secrets in the
  backup cannot be read.

Trino has nothing to back up.
