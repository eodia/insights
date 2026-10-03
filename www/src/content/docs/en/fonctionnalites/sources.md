---
title: Data sources
description: Connect a database from one of seven engines, sync it, then describe it in the Structure screen.
---

A **source** is a database connected to eodia insights. Each source becomes a
**Trino catalog**: its tables are referenced in SQL as `catalog.schema.table`, and a single query
can join several sources. Adding, editing or deleting a source requires the
**Manage data sources** permission.

## The seven engines

| Engine | Trino connector | Connection | Native SQL |
|---|---|---|---|
| **PostgreSQL** | `postgresql` | host, port (5432), database, user, password, SSL | yes |
| **MySQL / MariaDB** | `mysql` | host, port (3306), optional database, user, password, SSL | yes |
| **SQL Server** | `sqlserver` | host, port (1433), database, user, password, encryption, trust server certificate | yes |
| **Oracle** | `oracle` | host, port (1521), service name, user, password | yes |
| **Snowflake** | `snowflake` | account, user, password, database, warehouse, optional role | yes |
| **MongoDB** | `mongodb` | `mongodb://…` connection string | no |
| **Trino connector (advanced)** | the one you name | connector name and `key=value` properties | no |

When no database is specified, a MySQL source exposes every database visible to the user as a
schema. The **Trino connector** engine opens any connector your Trino knows —
`tpch`, `iceberg`, `hive`, `clickhouse`… — with its properties, one per line, as in a
catalog file.

Secret fields (passwords, MongoDB connection string, Trino connector properties) are
**encrypted** with AES-256-GCM using the instance key, and never sent back to the browser:
left empty in the edit form, they keep their value.

## Adding a source

**Data sources › Add a data source**, then the engine and
the connection form.

1. **Test connection** tries the engine's **native driver**. Native drivers are used only for
   this and for introspection: no data query ever goes through them.
2. **Add and sync** tests again, creates the catalog in Trino
   (`CREATE CATALOG … USING …`), saves the source, then starts the sync. A source
   that Trino refuses to open is not saved.

The **catalog name** is derived from the source name (`Sales Europe` → `sales_europe`):
lowercase letters, digits and `_`, starting with a letter. It never changes afterwards, since
SQL references it.

When created, a source is readable by the **All users** group, which can write Trino SQL
against it. Tighten these permissions in [Permissions](/insights/en/fonctionnalites/droits/).

:::note[Two paths to the database]
The connection test runs from the API, queries run from Trino: in production, both
must be able to reach the database. In development, a `localhost` host is translated to
`host.docker.internal` for Trino, which runs in Docker
(`EODIA_TRINO_LOCALHOST_ALIAS`).
:::

### Options

| Option | Effect |
|---|---|
| **Schema sync** | hourly (default), daily, or manual only |
| **Allow native SQL** | lets authorized people write in the database's dialect (enabled by default) |
| **Result cache (seconds)** | how long results read from this source are cached; empty: the instance setting |
| **Trino catalog properties** (Advanced) | added to the connector's default settings |

Every SQL catalog automatically gets a 10-minute metadata cache
(`metadata.cache-ttl=10m`) and case-insensitive name matching. The
**Advanced** tab adds or overrides properties: timeouts, *pushdown*, cache size…

Deleting a source removes its catalog from Trino, its metadata and its permissions; the
questions that use it stop working.

## Syncing

**Sync the database schema** starts a background job in three passes, whose progress the screen
follows live:

1. **Schema**: the schemas, tables and columns read from Trino's `information_schema`,
   supplemented by the native driver — primary and foreign keys, comments, estimated
   row counts. The result is compared with the known structure: new items are added, what has
   disappeared is marked **removed** without losing its metadata, and a type change is
   flagged.
2. **Fingerprint**: on a sample of 10,000 rows, the number of distinct values, the share
   of nulls, the minimum, the maximum, the average or the average length. It is used to
   **pre-guess the semantic type** and the format of each column.
3. **Values**: the distinct values of category columns (1,000 at most), which feed
   the filter lists and the appearance of values.

Each engine's system schemas are ignored. If the native driver fails, the sync
makes do with Trino: keys and comments simply remain unknown this time.

:::tip[What you write is never overwritten]
The guessed semantic type is only a suggestion: what you choose in **Structure**
takes precedence, and a sync does not replace it.
:::

## The Structure screen

**Structure** shows the source › schema › table tree on the left, and the table's columns on the
right. Everyone can view it for the tables they can read; editing it requires the
**Manage metadata** permission.

### The table

| Setting | Purpose |
|---|---|
| **Label** and **description** | what the table contains, for analysts and the copilot |
| **Entity** | what a row represents: *Order*, *Customer*… |
| **Color** and **icon** | the table's appearance in lists (see below) |
| **Visibility** | normal, hidden or technical |
| **Display column** | what names a row when another table refers to it |

A **hidden** table or column is no longer offered by SQL autocompletion or to
searches by the copilot and the MCP server; a hidden column also disappears from the visual
editor's lists. It is a convenience setting, not a
permission: to forbid a column, see [Permissions](/insights/en/fonctionnalites/droits/).

### The column

| Setting | Purpose |
|---|---|
| **Label**, **description**, **visibility** | as for the table |
| **Semantic type** | what the column means (see below) |
| **Format** | how its values are displayed |
| **Foreign key** | the column it points to in another table |
| **Unit** | `kg`, `km`, `€`, `days`… |

The screen also shows the column's **fingerprint** (sample, distinct values, nulls,
minimum, maximum, average), its Trino type and its native type, and flags a type change
detected at the last sync.

The **semantic types**:

| Family | Types |
|---|---|
| Identity | primary key, foreign key, entity name, title |
| Category | category, status, business boolean |
| Text | description, comment, e-mail, URL, image URL, avatar, phone, JSON |
| Geography | country, region, city, postal code, address, latitude, longitude |
| Time | creation, update, event, birth, cancellation date |
| Measure | amount, price, cost, discount, percentage, quantity, score, rating, duration |

The **formats**:

- **number**: integer, decimal, percentage (stored as a ratio or not), currency, duration (with
  the stored unit), rating (with its maximum), compact; decimal places, prefix, suffix, thousands
  separators;
- **date**: default, short, long, relative style or custom pattern
  (`dd/MM/yyyy HH:mm`); hours or seconds; default granularity; time zone.

This metadata is used everywhere: visualizations, display formats, filter lists,
the visual editor's implicit joins and the copilot's context.

### Values

For a category column, the **Values** tab lists the values found by the
sync. Each one gets a **label**, a **color**, an **icon** or an **image**:
`shipped` then displays as "Shipped", in blue, with a truck. Results, filters and
**charts** reuse this appearance: a colored value keeps its color in every
series, slice and bar (see [Visualizations](/insights/en/fonctionnalites/visualisations/#colors)).

### Icons

Wherever an icon is chosen — a table, a value, a folder — the picker has three
tabs:

- **Icons**: nearly 300 icons organized by theme (statuses, commerce, people, places, time,
  data, communication, technical, documents, nature), and a search across the more than
  2,000 of [lucide](https://lucide.dev/icons) — the names are in English: `truck`, `star`…;
- **Emoji**: by theme, or pasted;
- **Image**: a logo, a photo, a flag, by its `https://` address, with a preview.

### Relationships

**View relationships** opens a source's diagram: its tables and their foreign keys,
**detected** by the native driver or **declared by hand**. Drag from a column to another
table's key to declare a relationship; select one and press Delete to
remove it. This is essential for MongoDB, for which no key is detected: without relationships,
the visual editor cannot join its collections on its own.

### Copy, paste, describe

- **Copy configuration** of a table or a column puts it in JSON on the
  clipboard; **Paste configuration** applies it elsewhere. Columns are
  matched by name; missing ones are left unchanged.
- **Describe with the copilot** asks the [copilot](/insights/en/fonctionnalites/copilot/) for a
  label, a description and, for each column, a label, a description and a semantic
  type. You apply its proposal or not.
