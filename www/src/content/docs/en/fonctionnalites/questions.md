---
title: Questions
description: Query data with the visual editor, in Trino SQL or in native SQL, and choose a visualization.
---

A **question** is a saved query with its visualization, stored in a folder. It
can be written in three ways, all of which run in Trino under the identity of the person
reading it: their [permissions](/insights/en/fonctionnalites/droits/) on tables, columns and rows
always apply.

| Way | For whom | Query level required |
|---|---|---|
| **Visual editor** | everyone, without SQL | Visual editor |
| **Trino SQL** | analysts; joins several sources | SQL |
| **Native SQL** | the database's dialect, sent as is | Native SQL, and no restriction on the source |

Reading a saved question requires the right to read its data, not a query level,
with two exceptions: a native SQL question remains reserved for those who can write native SQL
on the source, and a visual question that contains a custom column or a condition
written in SQL requires the SQL level from its reader.

## The visual editor

**New › Question** (*Nouveau › Question*) (or **Explore a table** from the home page) opens the
step-by-step editor:

| Step | What you do there |
|---|---|
| **Data** | the starting table or [model](/insights/en/fonctionnalites/modeles-et-metriques/) |
| **Filter** | conditions on columns: is, is not, contains, starts with, between, before, after, empty…; for a date, a period (`This month`, `Last 12 months`…) |
| **Summarize** | **measures** — row count, distinct values, sum, average, median, minimum, maximum, standard deviation, cumulative count and sum, or a metric — and **groupings** |
| **Columns** | without a summary, the columns displayed |
| **Custom columns** | a column computed by a Trino SQL expression (`prix - cout`) |
| **Sort and limit** | the order of rows and their number |

A date can be grouped by minute, hour, day, week, month, quarter or year, or by rank:
hour of the day, day of the week, day of the month, week of the year, month, quarter. A number
can be grouped by values or **into bins**.

**Implicit joins.** Columns from tables linked by a foreign key — detected or
declared in [Structure](/insights/en/fonctionnalites/sources/#relationships) — are offered
alongside those of the starting table: choosing one adds the join, and removing it takes it away.

**Join data.** In the **Data** step, **Join data** adds a join of your
choice: the table, the type (**left**, **inner**, **right**, **full**) and the two
columns of the condition — the key between the two tables is suggested automatically. The join
stays even if no step references its columns; without a summary, its columns are displayed after
those of the source, and are chosen, filtered and sorted just like them. Its chip edits or
removes it (along with the steps that referenced its columns). Four joins at most.

**Drill into a point.** Clicking a bar or a point on a chart offers **Filter on
this value** or **Exclude this value**.

**Convert to SQL** turns the question into a SQL question, starting from the SQL the editor
generated.

:::note[Custom columns and SQL conditions]
A custom column or a condition written in SQL requires the **SQL** level on the
source.
:::

## The SQL editor

**SQL editor** (*Éditeur SQL*) (or **New › SQL query**) is written in Trino SQL:

- **autocompletion** knows `catalog.schema.table` and the columns of every table you
  can read, and nothing else;
- `Ctrl+Enter` runs the query, or the **selection** when there is one;
  **Cancel** stops the execution in Trino;
- **Format** (`Shift+Alt+F`) formats the SQL;
- a Trino error is placed on the line and column it points to; **Fix with the
  copilot** asks it for a fix;
- several **tabs**, kept in your browser;
- a side panel: the **schema** (click to insert a name), **snippets** and
  the **history** of your queries.

Editor queries never go through the result cache: you always see the
current state of the data. A preview reads at most 2,000 rows (`EODIA_MAX_ROWS`).

**Save as question** stores the query in a folder; it becomes a SQL question.

### Snippets

A **snippet** is a reusable SQL fragment, shared across the whole instance. Save the
current selection under a name, then reference it anywhere:

```sql
SELECT * FROM boutique.public.commandes
WHERE {{snippet: commandes_payees}}
```

### Native SQL

The **Dialect** selector offers, in addition to "Trino SQL (all sources)", a **native SQL**
for each source that allows it: the query is sent **as is** to the database, in its
own dialect, through Trino's `system.query` function. MongoDB and raw Trino connectors
don't have one.

:::caution[Reserved for full access]
Row and column rules cannot be applied to text that Trino does not read. Native
SQL is therefore reserved for people who have the **Native SQL** level on the source **and** can
read it entirely, without any restriction, on a source where the option is enabled. Trino
itself refuses it to everyone else.
:::

## Variables

A SQL question accepts **variables** `{{name}}`. Each one appears below the editor as soon
as it is written, with its type:

| Type | `{{name}}` becomes |
|---|---|
| **Text** | an escaped text literal: `'Bretagne'` |
| **Number** | a number |
| **Date** | a date: `DATE '2026-01-01'` |
| **Filter** | an **entire condition** on a SQL column, `TRUE` without a value |

A value always becomes an escaped literal: what is entered cannot change the shape
of the query. A **Filter** variable applies to a SQL expression (`c.passee_le`) and its kind
— text, number, date or timestamp —; it is the one a dashboard filter narrows down most
naturally:

```sql
SELECT canal, count(*) AS commandes
FROM boutique.public.commandes c
WHERE {{periode}}
[[ AND canal = {{canal}} ]]
GROUP BY 1
```

An **optional section** `[[ … ]]` is kept only if all its variables have a value;
otherwise it disappears. A variable outside a section with no value prevents execution.

A date accepts a date (`2026-03-01`), a relative period (`today`, `yesterday`,
`thismonth`, `lastmonth`, `past30days`, `next2weeks`…) or a range
`2026-01-01~2026-03-31`, open-ended on one side if needed (`2026-01-01~`).

## Visualizations

Sixteen chart types, organized by purpose — key figures, compare (including the **radar**), trend,
breakdown, relationship, detail —, with color-blind-safe palettes, highlighting
of a value, the average, sorting, top N… and **forecasts** that extend a
line in green dashes. Everything is described in [Visualizations](/insights/en/fonctionnalites/visualisations/)
and [Forecasts](/insights/en/fonctionnalites/previsions/).

## Export, share, organize

- **Export** downloads the result as **CSV**, **XLSX** or **JSON**, up to 100,000 rows,
  always under your permissions.
- **Add to a dashboard** places the question on an existing dashboard.
- **Move…** stores it in another folder, or hands it over to a dashboard (and to one of
  its tabs): it then belongs to the dashboard, like a question created within it.
- **Duplicate**, **Save a copy**, **Share**: see
  [Sharing](/insights/en/fonctionnalites/partage/).
- **Turn into a model** or **into a metric**: see
  [Models and metrics](/insights/en/fonctionnalites/modeles-et-metriques/).

## Query history

**History** lists every query sent to Trino with the SQL **actually executed**, its duration,
its row count, any error and its origin: editor, question, dashboard card,
API (including the MCP server), copilot or shared link. Everyone sees their own; an administrator can
display those of all users.
