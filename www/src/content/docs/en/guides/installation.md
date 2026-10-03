---
title: Installation
description: Start the development stack, or deploy eodia insights in production with Docker Compose.
---

eodia insights needs two services alongside it: a **PostgreSQL** database for its catalog
(people, permissions, sources, questions, dashboards…) and **Trino**, the engine that runs every
query. The repository provides two Compose files: `docker-compose.yml` for development,
`docker-compose.prod.yml` for production.

## For development

Prerequisites: Node.js 22 or later, pnpm 9 and Docker.

```bash
git clone https://github.com/eodia/insights.git && cd insights
docker compose up -d            # catalog, Trino and two demo databases
pnpm install
pnpm --filter @eodia/api dev    # the API, on port 4100 (worker included)
pnpm --filter @eodia/web dev    # the interface, on port 3100
```

Open [http://localhost:3100](http://localhost:3100). On first start, a **demo instance** is
created: an online shop on PostgreSQL, a customer service on MongoDB, questions, a dashboard and
two accounts. See [Getting started](/insights/en/guides/premiers-pas/).

| Service | Address | Role |
|---|---|---|
| Interface | http://localhost:3100 | Next.js; relays `/api/*` to the API |
| API | http://localhost:4100 | REST `/api/v1`, authentication, OPA endpoint |
| Trino | http://localhost:58080 | the query engine |
| Catalog | localhost:55435 | the application's PostgreSQL |
| Demo PostgreSQL | localhost:55434 | the `boutique` database |
| Demo MongoDB | localhost:57017 | the `support` database |

All ports are published on `127.0.0.1` only. For the MCP server in development:

```bash
pnpm --filter @eodia/mcp dev    # http://localhost:4200/mcp
```

:::note[The API first]
Trino queries the API before each statement, including the application's own (catalog creation,
synchronization). The API therefore starts listening **before** it talks to Trino. If Trino is
not ready yet, the API says so in its log and recreates the catalogs as soon as Trino responds.
:::

## In production

A **single image**, built by the repository's `Dockerfile`, contains the API, the interface, the
worker and the MCP server. `docker-compose.prod.yml` puts it together with PostgreSQL, Trino and
[Caddy](https://caddyserver.com/), which obtains the HTTPS certificate.

Prerequisites: a server with Docker and Compose v2, a domain name pointing to it, and ports 80
and 443 open. Trino alone needs a few gigabytes of memory (a 2 GB heap in the provided
configuration).

### 1. The `.env` file

Next to `docker-compose.prod.yml`, create a `.env` file with the four required values:

```bash
EODIA_DOMAIN=bi.example.com
EODIA_SECRET_KEY=<openssl rand -hex 32>
EODIA_OPA_SECRET=<openssl rand -hex 24>
EODIA_DB_PASSWORD=<a strong password>
```

| Variable | Role |
|---|---|
| `EODIA_DOMAIN` | the public domain; Caddy obtains its Let’s Encrypt certificate |
| `EODIA_SECRET_KEY` | 64 hexadecimal characters: encrypts the source passwords |
| `EODIA_OPA_SECRET` | the secret placed in the path of the OPA endpoint, which only Trino calls |
| `EODIA_DB_PASSWORD` | the password of the catalog's PostgreSQL |

Optional variables — SSO, e-mail, copilot, cache… — are listed at the top of
`docker-compose.prod.yml` and in [Environment variables](/insights/en/hebergement/variables/).

:::caution[The instance key]
Keep `EODIA_SECRET_KEY` somewhere safe, together with the catalog backups: without it, the
source passwords and the embedding secrets can no longer be read.
:::

### 2. Start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

On first start, the API applies the catalog migrations. Then open `https://bi.example.com`:
**the first screen creates the administrator account**.

:::caution[The first visit creates the administrator]
As long as no account exists, the first person to open the interface becomes administrator.
Create this account as soon as the instance is reachable.
:::

### What Caddy publishes

| Path | Service |
|---|---|
| `/api/*` | the API (REST, authentication, copilot over SSE) |
| `/mcp` | the MCP server |
| everything else | the interface |
| `/internal/*` | **nothing**: Caddy responds 404 |

The OPA endpoint (`/internal/opa/<secret>/…`) is never exposed: Trino calls it directly on the
Docker network.

## What next?

- [Getting started](/insights/en/guides/premiers-pas/): the demo, a source, a question, a
  dashboard.
- [Docker](/insights/en/hebergement/docker/): the image, its roles and the production services.
- [Single sign-on](/insights/en/hebergement/sso/): connect your OpenID Connect provider.
