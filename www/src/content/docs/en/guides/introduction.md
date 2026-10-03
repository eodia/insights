---
title: Introduction
description: What eodia insights is, and what sets it apart from other BI tools.
---

**eodia insights** is an open source BI tool in the spirit of Metabase: you connect your
databases, describe them, then build questions — point-and-click or in SQL —, models, metrics
and dashboards, which you share with fine-grained permissions. One decision drives everything
else: **every query goes through Trino, and Trino is what enforces permissions**.

## Trino, a single engine

Each connected source becomes a **Trino catalog**. A table is therefore always referenced the
same way, `catalog.schema.table`, whatever engine holds it:

```sql
SELECT c.segment, avg(t.satisfaction) AS satisfaction
FROM support.support.tickets t                  -- a MongoDB collection
JOIN boutique.public.clients c ON c.id = t.client_id  -- a PostgreSQL table
GROUP BY 1
```

The visual editor, the SQL editor, dashboard cards, the copilot, the REST API and the MCP server
all send their queries to Trino. There is only one dialect to learn, and **cross-database**
queries come naturally.

## Permissions enforced by the engine

Before each statement, Trino asks the eodia insights API what the person can read: the API
mimics an **OPA** (Open Policy Agent) server, with no need to deploy one. It answers which tables
are visible, which columns are hidden or masked, and which filter to add to each read of a table.

The consequence is simple: **no path bypasses the rules**, not even free-form SQL. A person who
may only see the customers in their region sees only those, whether they go through a dashboard,
a hand-written query or an assistant connected to the MCP server. See
[Permissions and groups](/insights/en/fonctionnalites/droits/).

## What you will find

- [Data sources](/insights/en/fonctionnalites/sources/) on **seven engines**: PostgreSQL,
  MySQL / MariaDB, SQL Server, Oracle, Snowflake, MongoDB, and any Trino connector.
- A **Structure** screen to describe tables: labels, descriptions, semantic types, formats,
  values, relationships.
- [Questions](/insights/en/fonctionnalites/questions/) built with the visual editor (joins
  included), in Trino SQL or in native SQL, and twenty-two
  [visualizations](/insights/en/fonctionnalites/visualisations/) — radar, polar bars, bubbles,
  treemap, calendar, bar and line races, key figures with a sparkline — with palettes everyone
  can read.
- [Forecasts](/insights/en/fonctionnalites/previsions/) that extend a line in dotted green, with
  seasonality and a confidence interval.
- [Models and metrics](/insights/en/fonctionnalites/modeles-et-metriques/): virtual tables and
  named aggregates, defined once.
- [Dashboards](/insights/en/fonctionnalites/tableaux-de-bord/) with **associative filters**
  (selected, possible, excluded, as in Qlik), selection with **Shift + click** on charts, tabs,
  automatic refresh that slides values to their new ones, a result cache and **PDF export**.
- [Themes](/insights/en/fonctionnalites/themes/) — fonts, colors, palette, logo — applied to a
  folder and inherited by everything in it, down to the PDF.
- [Permissions](/insights/en/fonctionnalites/droits/) by group, down to the column and the row.
- [Sharing](/insights/en/fonctionnalites/partage/): folders, item sharing, public links, iframes,
  and [signed embedding](/insights/en/integrations/integration-signee/).
- An [AI assistant](/insights/en/fonctionnalites/assistant/) to talk with your data — written
  answers, interactive charts, saved history, sources of your choice — and a
  [copilot](/insights/en/fonctionnalites/copilot/) in every screen (Anthropic, OpenAI, Mistral or
  OpenAI-compatible) that suggests questions and dashboards.
- An interface in **French, English and Spanish**: the browser's language, or the one chosen in
  the account menu; API messages follow.
- A [REST API](/insights/en/integrations/api-rest/) described in OpenAPI 3.1 and an
  [MCP server](/insights/en/integrations/mcp/) for Claude and other assistants, which even draws
  charts in the conversation.

## Who is it for?

- **Analysts**, who want to write SQL against every database in the company without juggling
  seven dialects.
- **Business teams**, who explore a table point-and-click and view dashboards filtered for them.
- **Data owners**, who want access rules enforced everywhere, not just in the interface.
- **AI agents**, which get a read-only MCP server, under the permissions of their token.

## Project status

eodia insights is free software, distributed under the
[AGPL-3.0-or-later](https://github.com/eodia/insights/blob/main/LICENSE) license, and under
active development. Its code is on [GitHub](https://github.com/eodia/insights); the
[`docs/PLAN.md`](https://github.com/eodia/insights/blob/main/docs/PLAN.md) document sets out the
decisions and the phasing.

:::note[AGPL]
If you modify eodia insights and offer it as a network service, you must publish the modified
source code.
:::

:::tip[Try it]
A development stack starts in three commands, with a demo instance. See
[installation](/insights/en/guides/installation/).
:::
