---
title: MCP server
description: Connect Claude or any MCP client to eodia insights, over HTTP or stdio, and the ten tools it exposes.
---

eodia insights exposes an **MCP server** (Model Context Protocol): Claude, a coding assistant
or your own agent can discover your sources, read your metrics and questions, and
write Trino SQL — **read-only**, with the token's permissions.

The server holds **no secret** and never reads the data itself: it relays each call's
token to the [REST API](/insights/en/integrations/api-rest/), and therefore to Trino and its
permissions. It serves several people at once, each with their own token.

## Creating a token

From **My profile** (*Mon profil*) or the **API and MCP** page (*API et MCP*), create a token with the **MCP** surface checked
(see [tokens](/insights/en/integrations/api-rest/#tokens)). It starts with `eoi_` and is
displayed only once. A token limited to MCP cannot be used on the REST API.

## Over HTTP

The server speaks **Streamable HTTP**, stateless, on `POST /mcp`:

| Context | Address |
|---|---|
| Production (behind Caddy) | `https://bi.exemple.fr/mcp` |
| Development | `http://localhost:4200/mcp` (`pnpm --filter @eodia/mcp dev`) |

Each request carries the `Authorization: Bearer eoi_…` header. For a client that accepts an
HTTP configuration (Cursor, VS Code…):

```json
{
  "mcpServers": {
    "eodia-insights": {
      "type": "http",
      "url": "https://bi.exemple.fr/mcp",
      "headers": { "Authorization": "Bearer eoi_…" }
    }
  }
}
```

With **Claude Code**:

```bash
claude mcp add --transport http eodia-insights https://bi.exemple.fr/mcp \
  --header "Authorization: Bearer $EODIA_TOKEN"
```

With **Claude Desktop**, through the `mcp-remote` bridge (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "eodia-insights": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://bi.exemple.fr/mcp", "--header", "Authorization:${EODIA_AUTH}"],
      "env": { "EODIA_AUTH": "Bearer eoi_…" }
    }
  }
}
```

The server accepts calls from any origin (the token travels in a header, never in a
cookie), which lets in-browser MCP inspectors reach it. `GET /health`
responds without a token.

## Over stdio

For a client that launches the server itself, from a clone of the repository, with the
`--stdio` option. The application address and the token are passed through the environment:

```json
{
  "mcpServers": {
    "eodia-insights": {
      "command": "npx",
      "args": ["tsx", "/chemin/vers/eodia-insights/apps/mcp/src/server.ts", "--stdio"],
      "env": { "EODIA_URL": "https://bi.exemple.fr", "EODIA_TOKEN": "eoi_…" }
    }
  }
}
```

| Variable | Default | Purpose |
|---|---|---|
| `EODIA_URL` | `http://localhost:4100` | the application address (the API is under `/api`) |
| `EODIA_TOKEN` | — | the token; without it, the server refuses to start |

## The ten tools

| Tool | Purpose |
|---|---|
| `list_datasources` | the readable sources, their engine and their Trino catalog |
| `search_schema` | search tables and columns by keywords (name, label, description) |
| `describe_table` | a table: qualified name, columns (type, semantic type, keys, description) and values of category columns |
| `list_metrics` | the saved [metrics](/insights/en/fonctionnalites/modeles-et-metriques/) |
| `query_metric` | compute a metric, grouped by a column or by period (day, week, month, quarter, year), with additional filters |
| `list_questions` | search questions, models, metrics and dashboards |
| `run_question` | run a saved question; variables are passed in `parameters` |
| `run_sql` | run read-only Trino SQL: `SELECT`, `WITH`, `SHOW`, `DESCRIBE`, `EXPLAIN`, `VALUES` or `TABLE` |
| `get_dashboard` | summarize a dashboard: tabs, filters, cards and the ID of their question |
| `show_chart` | **display a chart in the conversation**: a saved question (with its visualization) or Trino SQL, with the desired chart type, stacking and title |

All are annotated as read-only. The server advises the agent to prefer an existing metric or
question, then to locate the tables before writing SQL. Results reach it
as Markdown tables of at most 50 rows; `run_sql` reads 200 rows by default, 10,000
at most.

## Charts in the conversation (MCP Apps)

`show_chart` declares an interface, `ui://eodia/chart.html`, following the **MCP Apps** extension
(`io.modelcontextprotocol/ui`): clients that support it — Claude, ChatGPT, VS Code… — draw
the chart **in the conversation**, in a sandboxed frame. It is built as in
the application: same chart types (radar included), same palettes, same formats, same value
colors; it follows the client's light or dark theme, and **Open ↗** (*Ouvrir ↗*) leads to the question in
eodia insights (`EODIA_PUBLIC_URL`).

A client without MCP Apps receives the same result as a Markdown table. The page is a single HTML
file, with no external resource: the clients' default security policy is enough.

```text
Montre-moi les commandes par mois et par statut, en barres empilées.
```

## What an agent does not do

- **It writes nothing**: no tool creates, modifies or deletes. Trino, in any case,
  only accepts reads from people.
- **It never has more permissions** than its token's owner: row rules, masked and hidden
  columns apply as in the interface.
- **It loses access immediately** when the token is revoked.

Its queries appear in the token owner's [history](/insights/en/fonctionnalites/questions/#query-history),
with the origin "API": the MCP server goes through the REST API.
