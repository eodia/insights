---
title: AI Assistant
description: Talk with your data in a dedicated screen — written answers, interactive charts, saved history, sources of your choice.
---

The **AI Assistant** (left menu, under *Home*) is the [copilot](/insights/en/fonctionnalites/copilot/)'s
engine in a screen of its own, to talk with your data without leaving the page.

## What it does

- It **finds** the tables, models and metrics that answer the question, reads their
  description, **writes the SQL** and **runs it with your permissions**: Trino applies your
  permissions, masked columns and row rules included.
- It **shows the data as charts**, right in the conversation: each chart is interactive, switches
  type in one click (bar, line, area, pie, table), shows its SQL and can be **saved as a
  question** to end up on a dashboard.
- It **writes** its answer: what you see, the highlights, tables when useful.
- Each step shows while it works: searching the schema, reading a table, running the query,
  preparing the chart.

## Filtering sources

The **All sources** button, in the input area, limits the assistant to one or more data sources:
it only searches their tables. The choice is kept from one visit to the next.

## History

Every conversation is saved, **for you alone**: the left column groups them by date (today,
yesterday, last 7 and 30 days), searches, renames (double-click) and deletes them. A reopened
conversation gets its charts back, computed again with your current permissions. Its address can
be bookmarked.

:::note
The assistant needs an AI provider configured on the instance (see
[Environment variables](/insights/en/hebergement/variables/)); without one, the menu entry doesn't
show.
:::
