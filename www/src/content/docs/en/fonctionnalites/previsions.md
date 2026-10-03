---
title: Forecasts
description: Extend a line, an area or bars by a few periods, with seasonality and a confidence interval.
---

A line tells what happened. A **forecast** extends it: a few more months, quarters or
days, drawn in **green dashes**, over an area marked "Forecast", with the
range within which what comes next is likely to fall.

## Extending a trend

In the **Visualization** panel, **Forecast** section: **Extend the trend by** (*Prolonger la
tendance de*) N periods — **+3**, **+6** or **+12** in one click, up to 36.

| What you need | |
|---|---|
| A chart type | Lines, Areas, Bars or Combo |
| An axis | a date grouped by **day**, **week**, **month**, **quarter** or **year** |
| Data | at least 3 periods |

Forecast periods are added to the axis. The tooltip flags them ("forecast") and clicking
one of them filters nothing: it has no rows yet.

## The drawing

- **One series**: the forecast takes **insights green**, in dashes; forecast bars
  have a dashed outline and a light fill.
- **The 80% interval** surrounds a single forecast with a green band that **widens with
  the horizon**: the further ahead you look, the more uncertain what comes next. It can be hidden with a setting.
- **Several series**: each forecast keeps the color of its series, in dashes — otherwise you
  could no longer tell which forecast extends which line; they are not added to the legend.
- A series that is always positive (sales, visits) is never forecast below zero.

## Methods

| Method | What it does | When |
|---|---|---|
| **Automatic** | chooses among the three below | by default |
| **Seasonal** (additive Holt-Winters) | a trend **and** a repeating pattern: 12 months, 4 quarters, 7 days | as soon as the series covers **two seasons** |
| **Smoothed** (Holt) | a trend that follows the latest movements | from 6 points |
| **Linear** (least squares) | the straight line that passes closest to the points | otherwise |

Smoothing parameters are chosen by minimizing the **one-step-ahead** forecast error on the
series itself; the interval comes from that same error. The calculation is done in the browser,
on the displayed result: it doesn't rerun any query and sees only what you see.

:::caution[A forecast is not a promise]
It extends what the series has already shown. A change the data does not contain —
a new offering, a crisis, a competitor — does not appear in it. Read the interval as much as
the line.
:::

## Wherever your charts are

Forecasts can be set on a question as well as on a dashboard card, and the MCP
server draws them in Claude too: see [MCP](/insights/en/integrations/mcp/#charts-in-the-conversation-mcp-apps).
