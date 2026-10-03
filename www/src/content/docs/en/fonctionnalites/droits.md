---
title: Permissions and groups
description: Groups, data access, query levels, hidden or masked columns, row rules, folder permissions and shares.
---

Permissions are granted to **groups**, never to people one by one, and they **add up**: a person
receives the union of the permissions of all their groups. Data permissions are enforced **by
Trino itself**, which queries the API before each statement: the visual editor, SQL, dashboards,
the copilot, the API and the MCP server all go through it. See
[Principles](/insights/en/architecture/principes/).

## Groups and people

Two groups always exist:

| Group | Role |
|---|---|
| **Administrators** (*Administrateurs*) | read everything, can do everything; their permissions cannot be configured |
| **All users** (*Tous les utilisateurs*) | every person belongs to it; its membership cannot be changed. Whatever is granted to it, everyone has |

Other groups are created in **Administration › Groups** (*Administration › Groupes*). Grant broad
access to dedicated groups rather than to **All users**.

In **Administration › People** (*Administration › Personnes*), an administrator:

- **creates** a person, with a password (at least 10 characters) or without one — they will then
  sign in through [single sign-on](/insights/en/hebergement/sso/);
- **invites** them: a link valid for 7 days, sent by e-mail if an SMTP server is configured, to
  be passed on by hand otherwise;
- sets their **groups** and **attributes**;
- **deactivates** them: their sessions are closed immediately.

### Administrative permissions

Without being administrators, a group can receive three permissions, which only administrators
can grant:

| Permission | Allows |
|---|---|
| **Manage sources** (*Gérer les sources*) | connecting databases, changing their settings, starting a sync |
| **Manage metadata** (*Gérer les métadonnées*) | labels, descriptions, semantic types, relationships and values in **Structure** |
| **Manage permissions** (*Gérer les permissions*) | groups, members, data permissions |

## Data access

**Administration › Permissions** sets, for a group, access to an entire **source**, then refines
it per **schema** or per **table**. For a group, the most specific setting wins; **Inherited**
(*Hérité*) takes the level from above.

| Access | Effect |
|---|---|
| **No access** (*Aucun accès*) | the source, schema or table does not exist for the group |
| **Read** (*Lecture*) | all rows and all columns |
| **Restricted** (*Restreint*) | readable, under the group’s column and row rules; never in native SQL |

“Read” wins over “Restricted”: if another of the person’s groups reads the whole table, this
group’s column and row rules do not apply.

A forbidden table is invisible everywhere: autocomplete does not suggest it, `SHOW TABLES` does
not list it, and a query that mentions it fails with “Data access denied” (*Accès aux données
refusé*).

### The query level

Alongside access, each group receives a **query level** per source: what it can **write**
against it.

| Level | Allows |
|---|---|
| **No queries** (*Aucune requête*) | reading existing questions and dashboards, without writing any |
| **Visual editor** (*Éditeur visuel*) | building questions with the mouse |
| **SQL** | writing Trino SQL, custom columns and SQL conditions |
| **Native SQL** (*SQL natif*) | writing in the database’s dialect, if the source allows it |

:::caution[Native SQL requires full access]
A native query is sent as is to the database: Trino cannot apply any rule to it. It is therefore
only allowed for those who have the **Native SQL** level **and** read the whole source with
**Read**, without any restricted schema or table. A group with “Restricted” access writes Trino
SQL.
:::

## Columns

On a table with **Restricted** access, each column is configured for the group:

| Access | Effect |
|---|---|
| **Readable** (*Lisible*) | the value as is (default) |
| **Masked** (*Masquée*) | the column exists, but Trino replaces its value |
| **Hidden** (*Cachée*) | the column no longer exists for the group: absent from `SELECT *`, rejected if named |

The mask of a masked column is a **Trino expression** on the column, for example
`substr(email, 1, 3) || '…'`. Without an expression, a text keeps its first two characters
followed by `•••`, and any other value becomes `NULL`.

## Rows

A table with **Restricted** access can carry, for a group, a **row rule**: conditions on its
columns, combined with **all conditions** (and) or **at least one condition** (or). Operators:
is equal to, is not equal to, is one of, is not one of, greater than, less than, contains, is
empty, is not empty.

A value can reference an **attribute of the person reading**:

```text
region   est égal à   {{user.region}}
canal    est parmi    {{user.canaux}}
vendeur  est égal à   {{user.email}}
```

The rule is translated into a **row filter** that Trino adds to every read of the table, wherever
it comes from.

- **Attributes** are entered on the person (**Administration › People**), or come from the claims
  of your [OIDC](/insights/en/hebergement/sso/) provider. Three are built in and are not entered:
  `{{user.id}}`, `{{user.email}}` and `{{user.name}}`.
- **Multiple values.** An attribute containing commas (`Bretagne,Normandie`) holds multiple
  values: `est égal à {{user.region}}` (is equal to) then lets both regions through.
- **A missing attribute closes access.** A person without the referenced attribute sees **no**
  rows: a missing attribute never opens access.
- **Multiple groups.** A person sees the rows that any one of their rules lets through. A group
  with Restricted access **without a rule** on the table reads all its rows.
- **A broken rule closes access.** If a referenced column disappears, the rule lets nothing
  through, rather than everything.

:::tip[Checking a rule]
Sign in with a test account from the group, or look at the demo: the analyst
`analyste@eodia.local` reads `clients` under `region = {{user.region}}`. See
[Getting started](/insights/en/guides/premiers-pas/#see-permissions-at-work).
:::

## Folders and shares

Content — questions, models, metrics, dashboards — is organized in **folders**, whose
permissions are also set per group, in the **Folders** (*Dossiers*) tab of
**Administration › Permissions**:

| Permission | Allows |
|---|---|
| **None** (*Aucun*) | the folder is invisible |
| **Read** (*Lecture*) | opening its content |
| **Edit** (*Modification*) | creating, editing, moving and deleting content in it |
| **Manage** (*Gestion*) | as well as setting the folder’s permissions |

A folder’s permissions apply to its content and its subfolders, unless set more finely.
Personal folders remain private. An item can additionally be **shared** with a person or a
group, for reading or editing. The two mechanisms add up: see
[Sharing](/insights/en/fonctionnalites/partage/).

:::note[Content does not open the data]
Seeing a question grants no permission on its data. A person who opens a shared dashboard sees
only what their own permissions let them read, and a card whose source is forbidden to them
displays “Data access denied”.
:::

## Sessions and tokens

- The session is an `httpOnly`, `SameSite=Lax` cookie, valid for 14 days by default
  (`EODIA_SESSION_DAYS`); it becomes `Secure` when the public URL uses `https://`.
- Any write made with this cookie requires the `X-Eodia-Csrf: 1` header, which another site
  cannot set.
- An [integration token](/insights/en/integrations/api-rest/#tokens) `eoi_…` carries its owner’s
  permissions, no more and no less.

## The audit log

**Administration › Audit log** (*Administration › Journal d’audit*) keeps a record of every
sensitive action: failed sign-ins, password changes, people, groups and members, permissions,
sources and metadata, folders, shares and links, tokens, invitations, integration secrets and
settings. You can filter it by action type or by person.
