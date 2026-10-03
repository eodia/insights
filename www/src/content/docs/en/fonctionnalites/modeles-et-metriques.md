---
title: Models and metrics
description: Curated virtual tables and named aggregates, defined once and reused everywhere.
---

A question can change its nature. From the **More** menu of the question editor:

| Nature | What it is | Where it is used |
|---|---|---|
| **Question** | a query and its visualization | folders, dashboards |
| **Model** | a reusable virtual table | as a source in the visual editor, and for the copilot |
| **Metric** | a named aggregation | in the visual editor, cards, the copilot and the MCP server |

Models and metrics are stored in folders like questions, are shared the same
way, and run like them: in Trino, under the permissions of whoever reads them.

## Models

**Turn into a model** makes a question — visual or SQL — a **virtual table**: in
the **Data** step of the visual editor, it appears under **Models**, next to the tables.
Use it to freeze a preparation that everyone keeps redoing: a join, a business
filter, renamed columns.

The demo model, **Enriched orders**, joins each order to its customer's region,
city and segment:

```sql
SELECT o.id, o.passee_le, o.statut, o.canal, o.montant_total, o.remise,
       c.segment, c.region, c.ville, c.canal_acquisition
FROM boutique.public.commandes o
JOIN boutique.public.clients c ON c.id = o.client_id
```

A question built on this model no longer needs to know about the join. The row and
column rules of the underlying tables still apply: the model is a query, re-read by
Trino on every execution.

A model can carry its own **column metadata** — label, description, semantic
type, format — which dresses up its result. For now, it is defined through the API
(the `columns_meta` field of a question).

## Metrics

A **metric** is an aggregate defined once: "revenue = sum of
`montant_total` of paid, shipped or delivered orders". It is created from a
**visual editor** question that has **a single measure**: **Turn into a metric**. Its definition
keeps the question's source, measure and filters.

It is then used:

- in the visual editor, in the **Summarize › Metrics** step, like any other measure, grouped
  by month or by region; its own filters apply as is;
- on the cards of a [dashboard](/insights/en/fonctionnalites/tableaux-de-bord/), through
  the questions that reference it;
- by the [copilot](/insights/en/fonctionnalites/copilot/), which lists metrics before writing
  a calculation;
- by the [MCP server](/insights/en/integrations/mcp/): `list_metrics`, then `query_metric`,
  with a grouping by column or by period and additional filters.

:::note[One metric, one source]
In the visual editor, a metric is used on the table or model on which it is
defined; columns from tables linked by a foreign key remain available to
group it.
:::

:::tip[Change the definition once]
Editing a metric changes every question that references it: that is the whole point of
naming it rather than copying its calculation.
:::
