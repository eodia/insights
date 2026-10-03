---
title: Getting started
description: The demo, a first source, a first question and a first dashboard.
---

This guide assumes a [development stack](/insights/en/guides/installation/#for-development)
is running: the interface responds at [http://localhost:3100](http://localhost:3100).

## The demo

In development, the first start creates a demo instance: two sources, a **Sales** folder and a
**Customer service** folder, a metric, a model, about ten questions and a dashboard. The sign-in
screen lists the two accounts: clicking one of them fills in the form. The demo content is
created in French; this guide gives its names in English.

| Account | Password | What it sees |
|---|---|---|
| `admin@eodia.local` | `eodia-insights` | everything: it is an administrator |
| `analyste@eodia.local` | `eodia-insights` | the customers in its region and the orders from its channel, e-mails masked |

The two demo sources:

| Source | Engine | Trino catalog | Contents |
|---|---|---|---|
| Shop | PostgreSQL | `boutique` | customers, orders, products… |
| Customer support | MongoDB | `support` | customer service tickets, web events |

### See permissions at work

1. Sign in as the administrator and open the **Shop sales** dashboard,
   in the **Sales** folder. Its **Customer service** tab shows a
   **cross-database** question: MongoDB tickets joined to PostgreSQL customers.
2. Open **Administration › People**: the analyst carries the
   attributes `region = Bretagne` and `canal = Web`, and belongs to the **Regional team** group.
3. In **Administration › Permissions**, this group reads the Shop source with
   **Restricted** access: a row rule on `clients` (`region = {{user.region}}`),
   another on `commandes` (`canal = {{user.canal}}`), and the `email` column masked.
4. Sign out, then sign in as `analyste@eodia.local`: the same dashboard now shows only Bretagne
   and the Web channel. Open the **SQL editor** and run
   `SELECT * FROM boutique.public.clients`: the result is filtered the same way, and the e-mails
   are masked. Trino enforces these rules, not the interface.

## A first source

You need the **Manage data sources** permission (administrators have it).

1. Open **Data sources**, then **Add a data source**.
2. Choose the engine, then fill in the connection: host, port, database, user, password… The
   Trino catalog name is derived from the source name.
3. **Test connection** tries the engine's native driver.
4. **Add and sync** creates the catalog in Trino, saves the
   source and starts the schema synchronization, whose progress is displayed.

:::tip[localhost in development]
In development, Trino runs in Docker: a `localhost` host is automatically translated to
`host.docker.internal` so that Trino can reach a database on your machine.
:::

A new source is readable by the **All users** group, which can also
write SQL against it. Tighten these permissions in **Administration › Permissions** if needed.
The details are in [Data sources](/insights/en/fonctionnalites/sources/).

## A first question

1. From the home page, **Explore a table**, or **New › Question** in the top bar.
2. In **Data**, choose a table (or a model).
3. **Filter**: for example `statut` is `livrée`.
4. **Summarize**: a measure (`Sum` of `montant_total`) and a grouping (`passee_le`
   by month). Columns from tables linked by a foreign key are offered too: the join happens on
   its own.
5. Choose a visualization in the right-hand panel, then **Save**: name,
   description and folder.

Prefer SQL? **New › SQL query** opens the SQL editor, where
`Ctrl+Enter` runs the query (or the selection). See
[Questions](/insights/en/fonctionnalites/questions/).

## A first dashboard

1. **New › Dashboard**, then choose its name and folder.
2. In edit mode, **Add a question** places a card; title, text
   (Markdown) and embedded page cards can be added too.
3. **Filter** adds a filter (period, category, text, number or date granularity); on
   each card, choose the column it restricts.
4. **Save**. The dashboard can then be shared from **Share**, with people, groups
   or through a link.

An open question can also be added to an existing dashboard with **Add to a dashboard**.
See [Dashboards](/insights/en/fonctionnalites/tableaux-de-bord/).
