---
title: REST API
description: The /api/v1 API, its eoi_… integration tokens, its OpenAPI 3.1 specification and what it covers.
---

Everything the interface does goes through the **REST API**: the interface has no private route. A
script, a reporting tool or your own application calls it the same way, with the permissions of
the token it presents.

| Address | Purpose |
|---|---|
| `https://bi.example.com/api/v1/…` | the API, served behind Caddy (in development: `http://localhost:4100`, or `http://localhost:3100`, which relays `/api/*`) |
| `/api/v1/openapi.json` | the **OpenAPI 3.1** specification, generated from the route schemas |
| `/api/health` | the status of the API and Trino, without authentication |

The application's **API and MCP** page presents the same reference, filterable, with a
`curl` and `fetch` example for each endpoint and a button to download the specification.

## Tokens

An **integration token** starts with `eoi_` and is passed in the `Authorization` header:

```bash
curl https://bi.example.com/api/v1/me \
  -H "Authorization: Bearer $EODIA_TOKEN"
```

You create it from **My profile** or the **API and MCP** page, with:

- a **name**, which says where it is used ("Reporting script", "Claude Desktop");
- its **surfaces**: **REST API**, **MCP**, or both. A token is only accepted on the
  surfaces it declares: an MCP-only token is rejected by the REST API;
- an **expiration**: 30 days, 90 days, 1 year, or never.

The token is **displayed only once**: only its hash is kept. The list of your tokens
shows when each was last used, and **Revoke** cuts them off immediately. A token cannot
create another token, and it stops working if its owner is deactivated. Creations and
revocations are recorded in the audit log.

:::caution[A token carries your permissions]
A token acts with its owner's permissions, no more and no less: their data, column and row
permissions apply to everything it reads. Store it like a password.
:::

### From the browser

The interface authenticates with a session cookie. With this cookie, any request that writes
(`POST`, `PUT`, `PATCH`, `DELETE`) must carry the `X-Eodia-Csrf: 1` header, otherwise it is
rejected (`CSRF`). A `Bearer` token does not need it.

## Querying data

`POST /api/v1/query` runs a query — Trino SQL, visual editor or native SQL — in Trino,
under the caller's identity:

```bash
curl -X POST https://bi.example.com/api/v1/query \
  -H "Authorization: Bearer $EODIA_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "query": {
      "kind": "sql",
      "sql": "SELECT region, count(*) AS clients FROM boutique.public.clients GROUP BY 1"
    }
  }'
```

The response gives the columns (`name`, `label`, `type`…), the rows, a `truncated` flag,
the duration and the executed SQL. `limit` sets the number of rows read (100,000 at most), `parameters`
gives the values of the [variables](/insights/en/fonctionnalites/questions/#variables), and
`fresh: true` bypasses the cache.

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/query` | run a query |
| `POST /api/v1/query/cancel` | cancel an execution, by its `execution_id` |
| `POST /api/v1/query/export` | download a result as CSV, JSON or XLSX |
| `POST /api/v1/questions/{id}/run` | run a saved question, with its variables |
| `POST /api/v1/questions/{id}/export` | export a question's result |
| `POST /api/v1/dashboards/{id}/cards/{card}/run` | run a card with the filter values |

The query level matters: without the **SQL** level on any source, `POST /api/v1/query`
rejects a SQL query. See [Permissions](/insights/en/fonctionnalites/droits/#the-query-level).

## What the API covers

| Group | Examples |
|---|---|
| **Profile** | `GET /api/v1/me`, your tokens (`/api/v1/me/tokens`) |
| **Sources** | available engines, sources, connection test, synchronization, job status (also over SSE) |
| **Structure** | tables, columns, metadata, values, relationships, configuration copy-paste |
| **Execution** | queries, cancellation, export, history, snippets |
| **Questions** | questions, models (`/api/v1/models`), metrics (`/api/v1/metrics`), duplication |
| **Dashboards** | reading, creation, editing, duplication, running a card |
| **Folders** | folders and their contents, search, favorites, home, item shares |
| **Sharing** | share links (`/api/v1/share-links`) |
| **Copilot** | conversation over SSE (`POST /api/v1/copilot`), saved conversations |
| **Administration** | people, invitations, groups, permissions, audit log, cache, integration secrets |

Administration routes require the corresponding permissions (**Manage data sources**, **Manage
metadata**, **Manage permissions**) or being an administrator. A few public routes,
without a token, handle sign-in (`/api/auth/…`) and shared content (`/api/public/…`).

## Errors

An error returns an HTTP status and a body of the form:

```json
{ "error": { "code": "DATA_ACCESS_DENIED", "message": "Data access denied: …" } }
```

The `code` is stable and machine-readable; the `message` is ready to display, in the
caller’s language: the one chosen in the interface (`eodia-locale` cookie), otherwise the
`Accept-Language` header, otherwise English.

| Code | Status | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | token missing, invalid, expired, or not allowed on this surface |
| `FORBIDDEN`, `CSRF` | 403 | missing permission; cookie-based write without `X-Eodia-Csrf` |
| `DATA_ACCESS_DENIED` | 403 | Trino denied access to a table or column |
| `NOT_FOUND` | 404 | not found — or not visible to you |
| `INVALID_INPUT` | 400 | invalid body or parameters |
| `CONFLICT` | 409 | conflict: address or catalog already taken |
| `QUERY_FAILED` | 400 | Trino rejected the query; `details.location` pinpoints the error |
| `QUERY_TIMEOUT` | 408 | timeout exceeded (`EODIA_QUERY_TIMEOUT_MS`) |
| `QUERY_CANCELLED` | 499 | query cancelled |
| `CONNECTION_FAILED` | 400 | a source's connection test failed |
| `ENGINE_UNAVAILABLE` | 503 | Trino or the identity provider unreachable |
| `AI_DISABLED`, `AI_QUOTA` | 400, 429 | copilot not configured; quota reached |
| `INTERNAL` | 500 | internal error |
