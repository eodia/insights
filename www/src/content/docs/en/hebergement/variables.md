---
title: Environment variables
description: Every variable read by eodia insights, and its default value.
---

The API and the worker read their configuration from the environment, once, on startup
(`packages/core/src/config.ts`). With `docker-compose.prod.yml`, put them in a `.env` file next
to it: the compose file passes them on to the services. **An empty value counts as "not set".**

The default values are the development ones; `NODE_ENV=production`, which the image sets
automatically, changes a few of them.

## Required in production

| Variable | Role |
|---|---|
| `EODIA_DOMAIN` | the public domain, served over HTTPS by Caddy (production compose) |
| `EODIA_SECRET_KEY` | the instance key, 64 hexadecimal characters (`openssl rand -hex 32`): encrypts the source passwords and embedding secrets |
| `EODIA_OPA_SECRET` | the secret placed in the path of the OPA endpoint called by Trino (`openssl rand -hex 24`) |
| `EODIA_DB_PASSWORD` | the password of the catalog's PostgreSQL (production compose) |

:::caution[`EODIA_SECRET_KEY`]
Without it, the API refuses to start in production. A value that is not made of 64 hexadecimal
characters is accepted and derived with SHA-256, but prefer the expected format. Changing it
makes already-stored secrets unreadable: generate it once, and back it up with the catalog.
:::

## Operation

| Variable | Default | Role |
|---|---|---|
| `NODE_ENV` | `development` | `production` makes `EODIA_SECRET_KEY` required and turns off by default the demo, the in-process worker and Trino's `localhost` alias |
| `EODIA_PUBLIC_URL` | `http://localhost:3100`; in production, `https://$EODIA_DOMAIN` | the public address: sharing links, OIDC callback; `https://` makes the session cookie `Secure` |
| `EODIA_SESSION_DAYS` | `14` | session lifetime, in days |
| `EODIA_MAX_ROWS` | `2000` | maximum rows read per interface query |
| `EODIA_QUERY_TIMEOUT_MS` | `120000` | maximum duration of a query |
| `EODIA_CACHE_TTL` | `300` | result cache lifetime, in seconds, when nothing else sets it |
| `EODIA_DEMO` | `1` in development, `0` in production | creates the demo instance on first start |
| `EODIA_INPROCESS_WORKER` | `1` in development, `0` in production | runs the worker inside the API |

## Catalog

| Variable | Default | Role |
|---|---|---|
| `EODIA_DATABASE_URL` | `postgres://eodia:eodia@localhost:55435/eodia` | the catalog's PostgreSQL database; the production compose builds it with `EODIA_DB_PASSWORD` |
| `EODIA_DATABASE_SCHEMA` | `eodia` | the catalog schema in that database |

## Trino

| Variable | Default | Role |
|---|---|---|
| `EODIA_TRINO_URL` | `http://localhost:58080`; `http://trino:8080` in the compose file | the Trino address |
| `EODIA_TRINO_SERVICE_USER` | `eodia-service` | the application's Trino user (catalogs, synchronization), which the OPA endpoint grants everything |
| `EODIA_TRINO_PASSWORD` | — | the Trino password, if your cluster requires authentication |
| `EODIA_TRINO_LOCALHOST_ALIAS` | `host.docker.internal` in development | the name through which Trino, in its container, reaches a database declared on `localhost` |
| `EODIA_OPA_URL` | — | read by **Trino**: the OPA endpoint address, `http://api:4100/internal/opa/<secret>`; the compose file builds it |

## Sign-in

| Variable | Default | Role |
|---|---|---|
| `EODIA_PASSWORD_LOGIN` | `1` | `0` turns off password sign-in: SSO only |
| `EODIA_OIDC_ISSUER` | — | the OpenID Connect issuer; enables SSO |
| `EODIA_OIDC_CLIENT_ID` | — | the OIDC client identifier |
| `EODIA_OIDC_CLIENT_SECRET` | — | its secret, for a confidential client |
| `EODIA_OIDC_LABEL` | `Se connecter avec SSO` | the label of the sign-in button |
| `EODIA_OIDC_SCOPES` | `openid email profile` | the requested scopes |
| `EODIA_OIDC_ATTRIBUTE_CLAIMS` | — | the claims copied into attributes, comma-separated: `region,departement` |
| `EODIA_OIDC_GROUPS_CLAIM` | — | the claim that carries the groups to mirror |

See [Single sign-on](/insights/en/hebergement/sso/).

## E-mail

| Variable | Default | Role |
|---|---|---|
| `EODIA_SMTP_URL` | — | the outgoing server, as an SMTP connection URL: `smtps://utilisateur:motdepasse@smtp.exemple.fr:465` |
| `EODIA_SMTP_FROM` | `eodia insights <noreply@localhost>` | the sender |

Without SMTP, no e-mail is sent: an invitation's link is displayed so it can be passed on by hand.

## Copilot

| Variable | Default | Role |
|---|---|---|
| `EODIA_AI_PROVIDER` | `anthropic` if `ANTHROPIC_API_KEY` is set, otherwise `openai` if `OPENAI_API_KEY` is, otherwise `none` | `anthropic`, `openai`, `mistral`, `openai-compatible` or `none` |
| `EODIA_AI_API_KEY` | `ANTHROPIC_API_KEY`, otherwise `OPENAI_API_KEY` | the provider key |
| `EODIA_AI_MODEL` | `claude-sonnet-5-5` (Anthropic), `mistral-large-latest` (Mistral), `gpt-4.1` (the others) | the model |
| `EODIA_AI_BASE_URL` | the provider's address | required for `openai-compatible` |
| `EODIA_AI_HOURLY_QUOTA` | `60` | copilot messages per person per hour |

See [Copilot](/insights/en/fonctionnalites/copilot/).

## Processes and ports

| Variable | Default | Read by | Role |
|---|---|---|---|
| `EODIA_API_PORT`, `EODIA_API_HOST` | `4100`, `0.0.0.0` | the API | where it listens |
| `EODIA_WEB_PORT` | `3100` | the image (`web` role) | where the interface listens |
| `EODIA_API_URL` | `http://localhost:4100` | the interface (at build time), the MCP server | the API address |
| `EODIA_MCP_PORT`, `EODIA_MCP_HOST` | `4200`, `0.0.0.0` | the MCP server | where it listens |
| `EODIA_URL`, `EODIA_TOKEN` | `http://localhost:4100`, — | the MCP server over stdio | the application address and the token |
| `EODIA_WITH_MCP` | — | the image (`all` role) | `1` adds the MCP server to the container |

## Production compose

| Variable | Default | Role |
|---|---|---|
| `EODIA_ACME_EMAIL` | — | the contact address for Let’s Encrypt |
| `EODIA_IMAGE` | `eodia-insights:latest` | the image used for `api`, `worker`, `web` and `mcp` |
