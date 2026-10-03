---
title: Principles
description: The architecture of eodia insights, the path of a query between Trino and the OPA endpoint, the security model and the catalog.
---

eodia insights rests on a few decisions, set out in
[`docs/PLAN.md`](https://github.com/eodia/insights/blob/main/docs/PLAN.md). Here is their spirit.

## Overview

```text
                         ┌──────────────── Caddy (HTTPS) ────────────────┐
  browser ──────────────►│  /        → web  :3100   (Next.js)            │
  scripts, SDK ─────────►│  /api/*   → api  :4100   (Hono, REST + auth)  │
  Claude, MCP agents ───►│  /mcp     → mcp  :4200   (MCP Streamable HTTP)│
                         └───────────────────────────────────────────────┘
                                          │
          ┌───────────────────────────────┼─────────────────────────────┐
          ▼                               ▼                             ▼
  ┌───────────────┐   queries    ┌─────────────────┐  connectors   ┌──────────────┐
  │ api / worker  │─────────────►│      Trino      │──────────────►│ your DBs:    │
  │ @eodia/core   │◄─────────────│ (single engine) │               │ PG, MySQL,   │
  └───────┬───────┘  OPA: allow, └─────────────────┘               │ SQL Server,  │
          │          row filters,                                  │ Oracle,      │
          │          column masks                                  │ Snowflake,   │
          ▼                                                        │ MongoDB…     │
  ┌───────────────┐                                                └──────────────┘
  │  PostgreSQL   │  catalog: people, groups, permissions, sources (encrypted
  │   (catalog)   │  secrets), metadata, questions, dashboards, jobs, cache
  └───────────────┘
```

| Component | Role |
|---|---|
| **web** | the Next.js interface; speaks only HTTP to the API, never touches the data |
| **api** | the `/api/v1` REST API, authentication, public pages, and the OPA endpoint called by Trino |
| **worker** | the job queue: synchronizations, value scans, pre-warming; inside the API in development |
| **mcp** | the MCP server; holds no secret, relays each call's token to the API |
| **Trino** | the single, stateless execution engine |
| **PostgreSQL** | the application catalog |

The code is a TypeScript monorepo. `@eodia/core` holds the business logic (authentication,
permissions, catalog, queries, copilot, synchronization, jobs); `@eodia/compiler` translates a
visual-editor question and a row rule into Trino SQL; `@eodia/engine` talks to Trino;
`@eodia/drivers` holds the native drivers; `@eodia/contracts` the shared types and schemas, from
which the OpenAPI is generated. The applications (`apps/api`, `apps/web`, `apps/worker`,
`apps/mcp`) are adapters, and the interface never depends on the core.

## Trino, a single engine

Every query a person runs — visual editor, SQL, card, copilot, API, MCP — is executed by Trino.
The native drivers of the seven engines are used only for administration: testing a connection,
reading keys, comments and volumes that Trino does not provide.

Each source is a **dynamic catalog** (`CREATE CATALOG … USING …`). Trino runs with
`catalog.store=memory`: **the application is the source of truth**. It keeps the configuration
and secrets of the sources, and recreates the catalogs when Trino restarts.

## The path of a query

1. A person runs a question. The API compiles it to **Trino SQL**: the visual editor through
   `@eodia/compiler`, SQL as is after variable substitution — each value becoming an escaped
   literal.
2. The API sends the statement to Trino with `X-Trino-User` = **the person's identifier**
   (or, for a signed embedding, that of a virtual visitor).
3. Before executing, Trino queries the API's OPA endpoint, `/internal/opa/<secret>/…`:

   | Endpoint | Trino's question | Answer |
   |---|---|---|
   | `allow` | may I access this catalog, this schema, these columns? execute this function? | yes or no |
   | `batch` | which of these catalogs, schemas, tables, columns are visible? | the allowed indices |
   | `row-filters` | which filter should be added to each read of this table? | a SQL expression |
   | `column-masks` | which columns should be masked, and with what? | one expression per column |

4. Trino executes the rewritten query — forbidden tables invisible, hidden columns absent, row
   filters added, masks applied — and returns the result.
5. The API caches it under a key that includes the fingerprint of the person's permissions, and
   records it in the history.

There is no OPA server to deploy: the API **mimics** its responses, from an in-memory snapshot
of the permissions. All decisions come from a single pure, tested module,
`packages/core/src/access/decide.ts`, which the OPA endpoint, the compiler, the copilot and the
interface all query in the same way.

## Security

- **Identity end to end.** Every data query goes to Trino under the identity of the person, or
  of the token owner. No path, not even free-form SQL, bypasses the rules: the engine enforces
  them.
- **Trino read-only for people.** The OPA endpoint grants people only read operations; only the
  application's service identity creates catalogs.
- **Fail closed rather than open.** A missing attribute, a rule that no longer compiles, an
  unknown identity: each time, the answer is "no rows", never "all of them".
- **Native SQL under conditions.** `catalog.system.query(…)` is granted only to people with no
  restriction at all on the source, since Trino cannot apply anything inside it.
- **A partitioned cache.** A result's key includes a fingerprint of the groups and attributes:
  two people with different permissions never share an entry.
- **Encrypted secrets.** Source credentials and embedding secrets are encrypted with AES-256-GCM
  using `EODIA_SECRET_KEY`; Trino keeps nothing on disk.
- **A private OPA endpoint.** Its path carries a secret (`EODIA_OPA_SECRET`), and Caddy does not
  expose it: only Trino calls it, over the Docker network.
- **Sessions and tokens.** `httpOnly` `SameSite=Lax` cookie; any write through a cookie requires
  the `X-Eodia-Csrf: 1` header. `eoi_…` tokens are stored hashed, limited to their surfaces,
  revocable and optionally given an expiry date.
- **An audit log** of sensitive actions.

:::note[Startup order]
Trino asks the API for authorization for **every** statement, the application's own included.
The API therefore opens the catalog (`prepare()`), starts listening, and only then talks to
Trino (`start()`) to recreate the catalogs.
:::

## The catalog and its migrations

The catalog is a PostgreSQL database, in the `EODIA_DATABASE_SCHEMA` schema (`eodia` by
default). It changes through **numbered migrations**, in
`packages/catalog-schema/migrations/`: `0001_catalogue.sql`, then the following ones.

- On startup, the API — or the worker, whichever comes first — applies pending migrations, each
  in its own transaction, under a lock that keeps other processes out.
- Each applied migration is recorded with its **checksum**. If an already-applied file has
  changed, the instance refuses to start (`CATALOG_CHECKSUM_MISMATCH`).
- When a version is released, the migrations are **sealed** in `sealed.json`: a released
  migration is never modified again, the fix goes into the next one.

```bash
pnpm catalog new ajout_des_rappels   # creates NNNN_ajout_des_rappels.sql
pnpm catalog status                  # sealed or not, applied or not
pnpm catalog seal 0.2.0              # on release: freezes unsealed migrations
pnpm catalog check [--release]       # fails if a sealed migration has changed
```

A migration is written to be **replayable** (`IF NOT EXISTS`): an upgraded installation must be
equivalent to a fresh one.
