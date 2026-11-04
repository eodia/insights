---
title: Dashboards
description: Cards, associative filters, tabs, forecasts, auto-refresh and result caching.
---

A **dashboard** arranges cards on a **24-column** grid, split into tabs if needed, and filtered
together. Each card runs in Trino under the permissions of the person viewing it: two people with
different permissions see different numbers on the same dashboard.

## Editing a dashboard

**Edit** opens a **draft**: nothing is visible to others until **Save**, and
**Cancel** discards the changes. In it, you move and resize
cards with the mouse, and add tabs, cards and filters.

| Limit | Value |
|---|---|
| Cards | 60 |
| Tabs | 12 |
| Filters | 16 |

## Cards

| Card | Content |
|---|---|
| **Question** | a saved question, model or metric, with its visualization — or a different one, specific to the card |
| **Title** | a section heading: size, weight, alignment, font, colour, capitals, subtitle, and a highlight (line beneath, bar on the left, colour band) — the brush next to the title, in edit mode |
| **Text** | Markdown; `{{filter_id}}` displays a filter's value |
| **Filter pane** | a filter's list, laid in the grid |
| **Buttons** | a row of buttons, one per value of a category filter (“Web · Mobile · Marketplace”): a click chooses it, **All** clears it; values the other filters exclude fade |
| **Variable** | a number the reader sets, with a slider or the keyboard — an objective, a rate: the value of a number filter, which SQL questions cite as `{{objective}}` |
| **Link to a dashboard** | a button or a tile opening another dashboard (and one of its tabs); the filters chosen go to the filters of the same name there |
| **AI summary** | a few lines the assistant writes from the chosen cards, filters applied, as instructed; rewritten when the filters change |
| **Image** | a logo, a diagram, a photo, by its URL; a click may open a page |
| **Separator** | a line (solid, dashed, dotted) or just room |
| **Embedded page** | a page from elsewhere, by its URL |

In edit mode, the header takes a tint and a floating bar, at the bottom, adds cards: **Question**,
**Title**, **Text**, **Filter pane**, **Buttons**, and **More** for the others. A card's settings
(its filter, its link, its image, its instruction…) are in its menu, **Settings…**.

**The AI summary** reads, for each chosen card (eight at most), a few dozen rows of its result —
with the rights of whoever looks, filters applied — and nothing else: enough to say what matters
without spending too much. The same text is kept ten minutes for the same filters; **Rewrite**
asks for a new one. An AI provider must be configured.

**Add a question** searches the questions, models and metrics you can
read; each one shows its folder. A question can also come from its own screen (**Add to a
dashboard**) or from a suggestion by the
[copilot](/insights/en/fonctionnalites/copilot/).

A card's title opens its question. Its menu lets you **refresh** it, **expand** it to full
screen, **open the question**, **duplicate** it, **remove** it — removing a card does not delete
the question —, and **move** it:

- **To tab ›** sends it to another tab of the same dashboard;
- **To another dashboard…** places it on another dashboard,
  in the chosen tab. Its links to filters stay behind: filters are not the same from one
  dashboard to another.

The open tab is part of the URL (`?tab=…`): a link opens the right tab, and the browser’s
**Back** / **Forward** buttons move from one tab to another.

### A question created in the dashboard

**New question**, in **Add a question** or in the dashboard’s **…** menu,
opens the editor; when you save, the card is placed in the tab you started from and the
dashboard reopens. This question **belongs to the dashboard**:

- it does not appear in any folder or in search;
- it takes the dashboard’s permissions (sharing the dashboard shares it too);
- it is copied with the dashboard and deleted with it; removing its card archives it, putting
  the card back restores it;
- **Move…**, in the editor, files it in a folder (it becomes a question like any
  other) or sends it to another dashboard.

## Filters

**Filter** adds a filter to the dashboard. Five types:

| Type | Value | Connects to |
|---|---|---|
| **Period** | a predefined period (`This month`, `Last 12 months`…) or a specific one | a date column |
| **Category** | one or more values, chosen from the list of the column’s values | a text, number or boolean column |
| **Text** | a text, searched for in the column | a text column |
| **Number** | equal to, between, at least, at most | a numeric column |
| **Date granularity** | day, week, month… among those offered | a grouped date column |

Each filter has a label, an identifier (`{{periode}}`) and a **default value** (**use the current value**
takes the one currently displayed). A category
filter may or may not accept multiple values.

**Configuring a filter.** In edit mode, select a filter: a panel shows its type, its name,
whether it accepts multiple values, its default value (**use the current value**) and how many
cards it drives.

**Connecting a filter to cards.** Each card offers the column the filter restricts — a column of
its table or of a related table — or, for a SQL question, one of its
[variables](/insights/en/fonctionnalites/questions/#variables). **Link all cards** does it all at once: it lists the columns the cards have in common, with the
number of cards that have each one, and suggests the one bearing the filter’s name. **Unlink
all** removes the links. A card that is not connected ignores the filter.

### Associative filters

A category filter’s list reads as in Qlik:

| Color | What it is |
|---|---|
| **Green** | the selected values |
| **White** | the possible values: the other filters leave them some rows |
| **Gray**, below | the values excluded by the other filters |

Each value shows its rows within the scope of the other filters (and its total), with a
proportional bar; the filter’s header and chip show **the share of rows** the selection keeps
(“74 %”). The values come from the data, read under your permissions; the colors and icons are
the ones defined in [Structure](/insights/en/fonctionnalites/sources/).

| Action | Effect |
|---|---|
| Click | selects or deselects the value |
| **Shift** + click | selects the range from the last value clicked |
| **Ctrl** (⌘) + click | keeps only this value |
| ↑ ↓, **Space** | move, select |
| **Shift** + ↑ ↓ | extend the selection |
| **Ctrl** + **A** | all possible values |
| **Delete** | no value |
| **Enter** | close |

The **All**, **Excluded** (the grayed-out values), **Invert** and **Clear**
buttons do the rest. Selections apply as you go; the list keeps the
order it had when opened. Only filters set on the **same table** restrict the possible values.

### Click a chart to filter

Outside edit mode, clicking a bar, a slice or a point applies its value to the filter connected
to that column: clicking the “Web” bar filters the whole dashboard on that channel.

- **Shift** (or **Ctrl**, ⌘) + click **adds** the category to the selection, or removes it;
- clicking the only selected category removes the filter;
- on a period, **Shift** + click extends the period to the one clicked.

The chart the selection starts from is not restricted by it: it keeps all its categories, with
the unselected ones faded, so you can add more. The other cards are filtered.

:::note[The server decides what a card filters]
The filters a card receives are read from the saved dashboard, on the server side: a caller sends
values, never the list of columns to filter. A shared link therefore cannot be used to hijack a
card.
:::

### A filter pane in the grid

**Filter pane** (in edit mode) lays a card showing a dashboard filter as it is: a category
filter's green, white and grey associative list, or the choice of a period, a number, a text.
What is chosen there is the filter's value: the top bar, the other cards and clicks on charts
follow, and the pane follows them in turn.

## Display conditions

A card — or a whole tab — can show only under a condition, as in Qlik: in edit mode, the card's
⋯ menu › **Display condition…**, or the eye next to the tab's name. Three kinds of rules, to
combine (**all** or **at least one**):

| Rule | Example |
|---|---|
| **On a filter** | *Status* has exactly one value chosen, at least one, none; is, or is not, a given value |
| **SQL query** | `SELECT count(*) > 5000 FROM boutique.public.commandes WHERE {{statut}}`: yes if the first value is true |
| **On the card's result** | has at least one row, none, at least or at most N rows |

When the condition does not hold, the card or the tab **disappears**; a card below moves up. A
rule on a filter is read without a query, and a card it hides does not run its own. In a SQL
query, `{{name}}` receives a filter's value, as a condition on the column given; the query runs
with the rights of whoever looks, a shared link included. In edit mode, everything stays visible:
a **Conditional** or **Hidden** badge tells where each card stands.

## Card charts

Each card is configured like a question: shape (including **radar**), palette, colors per series,
highlighting, average, sorting, top N… — see
[Visualizations](/insights/en/fonctionnalites/visualisations/) — and can **extend its trend**:
see [Forecasts](/insights/en/fonctionnalites/previsions/).

## Refresh and display

- **Auto-refresh**: the timer in the toolbar — never, every minute, every 5 or 15 minutes, or
  every hour; its gauge fills up until the next refresh.
- **Refresh** reruns the cards, bypassing the cache. Cards stay on screen while they are
  recomputed: their marks slide to the new values, as when you change a filter.
- **Export to PDF**: an A4 layout in the dashboard's [theme](/insights/en/fonctionnalites/themes/),
  with a cover page, applied filters and page numbers.
- **Full screen**, for a wall display.
- **Duplicate**, **Add to favorites**, **Share** (see
  [Sharing](/insights/en/fonctionnalites/partage/)).

## Result caching

Trino does not keep results: eodia insights does it for it. A card or question result is kept
for a certain time, and the card then displays “result from …”.

The cache **key** is made of the compiled SQL **and a fingerprint of the person’s permissions**
(their groups and attributes): two people with different permissions never share an entry. SQL
editor queries are never cached, and any permission change clears the cache.

The retention time is decided from the most specific to the most general:

1. the **question**’s (configurable through the API, field `cache_ttl`);
2. the **dashboard**’s (**Settings › Cache**: no cache, 5 minutes, 1 hour,
   24 hours, or the instance’s);
3. the one of the **sources** read (the shortest, if several set one);
4. the **instance**’s, in **Administration › Settings**: a fixed
   duration, or an **adaptive duration**, proportional to the time the query took (a 10-second
   query is kept about 17 minutes, between 1 minute and 24 hours);
5. failing that, `CACHE_TTL` (300 seconds).

Results are kept in the PostgreSQL catalog, shared by all replicas, with a small in-memory cache
in front. **Clear cache**, in **Administration › Settings**, forces the
next queries to hit the sources again.

### Preloaded dashboards

A dashboard marked **Preloaded** (in its **Settings**) is kept warm by the worker:
every 15 minutes, it runs its cards with the filters’ default values, **under its author’s
permissions**. People who have the same permissions as the author then find their results
already ready; the others trigger their own queries, as usual.

:::tip[An icon before the title]
In edit mode, the button left of a card's title picks its icon — an icon, an emoji or an image — then shown in a small badge before the title, and in the PDF.
:::
