---
title: Subscriptions and alerts
description: Receive a dashboard at set times, by e-mail or in Teams and Slack, as a PDF, an image or a summary; be told when a question crosses a threshold.
---

Two things leave eodia insights on their own:

- a **subscription** sends a dashboard on a schedule — “every Monday at 8” — to people of
  the space and to Teams or Slack channels;
- an **alert** checks a question at intervals and tells you when it says what you wait for:
  “today's revenue drops under €10k”, “rows come back”.

Both are listed under **Subscriptions and alerts**, in your profile menu.

## Subscriptions

From a dashboard, menu **⋯ › Subscriptions…**, then **New subscription**:

| Setting | What it does |
|---|---|
| **When** | every day (some days only, if you like), every week, every month — the 1st, the 15th, the last day —, at your time zone's hour |
| **In what form** | a **PDF** attached to the message, an **image** in its body, or a written **summary**: each card's key figures and first rows |
| **With the current filters** | keeps the filters chosen on screen; otherwise, the dashboard's defaults |
| **Layout** | the tabs sent, orientation, paper (A4, A3, Letter), cover page and its note, page numbers |
| **To whom** | people of the space |
| **Teams and Slack channels** | the channel's incoming webhook address (see below) |
| **Message** | the e-mail's subject and a word at the top |

Each row of the list shows the last sending (green: sent, orange: partly, red: failed, the
reason on hover) and the next one. **Send me a test** sends it to you alone, right away; **Send
now to everyone**, to all its recipients.

:::note[Each person sees their own figures]
A recipient receives the dashboard **as they would see it** opening it: each card is computed
under their identity, their row filters and masks applied. Someone who can no longer open the
dashboard receives nothing. A Teams or Slack channel is read by people eodia insights does not
know: what is posted there is what **you** see.
:::

### PDF export

The same settings serve the manual export: menu **⋯ › Export as PDF…** picks the tabs, paper,
cover page, title and note, then opens the preview to print or save as PDF. The choices are
remembered for that dashboard, in your browser.

## Alerts

From a question (menu **⋯ › Alerts…**) or a dashboard card showing one:

- **A threshold is crossed**: a numeric column compared to a value (drops under, exceeds,
  reaches at least…), reading the first row, the last, the sum, the minimum or the maximum.
  “Revenue per day, the last row drops under 10,000”.
- **Rows come back**: the question returns at least one row — stuck orders, late tickets —, or
  on the contrary returns none any more.

It is checked every 15 minutes, every hour, every day or every week, and tells you **once**,
when the condition becomes true (then nothing while it stays so), or **at every check** where it
holds. By e-mail to you, and in Teams or Slack channels. **Check now** tries it at once and sends
the message if it holds.

An alert reads the question under your identity, like everything you open.

## Teams and Slack

A channel is connected by its **incoming webhook**:

- **Teams**: in the channel, **Workflows › Post to a channel when a webhook request is
  received**; copy the address given (`https://…logic.azure.com/…` or `…powerplatform.com/…`).
- **Slack**: an app with **Incoming Webhooks**, tied to the channel; the address starts with
  `https://hooks.slack.com/`.

The address is encrypted in the catalog and never goes back to the browser: to change it, paste
a new one. An image subscription posts the image, a PDF one a button to the file (kept a month,
behind an address with a token), a summary its key figures.

## Installation

- E-mails go through the instance's SMTP server (`SMTP_URL`). Without it, only channels receive.
- PDF and image need a rendering service, [Gotenberg](https://gotenberg.dev), which pictures the
  print page (`RENDER_URL`, `RENDER_PAGE_URL`): the production compose's `render` profile starts
  it. Without it, the written summary is sent instead.

See [Environment variables](/insights/en/hebergement/variables/).
