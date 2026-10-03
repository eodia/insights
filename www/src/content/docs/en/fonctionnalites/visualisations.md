---
title: Visualizations
description: Sixteen chart types, palettes everyone can read, highlighting, average, sorting and top N.
---

The **Visualization** panel of a question — or of a dashboard card — chooses the
shape of the result and configures it. The formats and value appearance defined in
[Structure](/insights/en/fonctionnalites/sources/#values) apply automatically.

## Chart types

The picker organizes chart types by purpose. A sparkle marks the **recommended** type for the
result; a type that doesn't suit it is dimmed, and its tooltip explains why.

| Family | Types | For |
|---|---|---|
| **Key figures** | Number, Trend, Progress, Gauge | a figure, its change, its share of a goal |
| **Compare** | Bars, Horizontal bars, **Radar** | categories against each other; the radar compares profiles across 3 to 30 criteria, on a common scale |
| **Trend** | Lines, Areas, Combo | tracking over time — and [forecasting](/insights/en/fonctionnalites/previsions/) |
| **Breakdown** | Pie, Funnel | shares, stages |
| **Relationship** | Scatter plot | two measures against each other |
| **Detail** | Table, Pivot table, Map | rows, a cross-tabulated measure, values by region |

## Colors

**Six palettes**, each an ordering of hues: **eodia** (default), **Vive**, **Océan**,
**Terre**, **Douce** and **Dégradé** (from light to dark, for ordered categories — 5 at
most). All are **validated in light and dark mode**: two neighboring colors can be told apart,
including by a color-blind person (protanopia, deuteranopia), and each one stays legible on the background.

**Custom** (*Personnalisée*) builds your own palette, up to 8 colors in order. It is checked
while you build it, against the same thresholds: neighboring colors confused by a color-blind
person, too close, too pale or too gray. In dark theme, each color is adjusted to stay
legible.

**Color of each element**: each series, slice or bar can take its own color —
from the palette, from the application or any color at all —, and go back to the palette.

The order of priority: the color chosen for the element, then the value's color in
[Structure](/insights/en/fonctionnalites/sources/#values) ("livrée" in green, "annulée" in
red, in every chart), then the palette. "Other" stays gray.

## Making a chart speak

| Setting | Effect |
|---|---|
| **Highlight** | the highest, the lowest or the latest value stands out; the others fade |
| **Average line**, **median line** | a reference line, with its value |
| **Goal** | a line at the target value, with its label |
| **Category order** | that of the result, descending or ascending |
| **Only the top** | the N largest categories; the rest in "Other" (which counts neither in the average nor in the highlight) |
| **Extend the trend** | see [Forecasts](/insights/en/fonctionnalites/previsions/) |

## Shape and labels

- **Stacking**: side by side, stacked or 100%; segments in a stack are separated by a
  thin line, and only the end of the stack is rounded. **Total above stacks**.
- Line **style**: straight, smooth or stepped; **points** depending on their number, always or
  never; **gradient area**.
- **Values on marks**: all of them when there are few, otherwise only the extremes and the
  latest.
- Two to four lines are **labeled at the end of their path**.
- **Axes**: linear or logarithmic scale, minimum and maximum, labels horizontal, slanted or
  vertical, axes and grid shown or not.
- **Pie**: donut and its thickness, total in the center, half circle, rose, what each
  slice displays (percentage, value, name…), inside or outside, number of slices before
  "Other".

Choices among four options or fewer are made with one click, on illustrated buttons.

## Clicking a chart

In a dashboard, clicking a bar or a slice filters the dashboard, and **Shift** + click
adds more categories: see [Dashboards](/insights/en/fonctionnalites/tableaux-de-bord/#click-a-chart-to-filter).
In the editor, it offers to filter the question on the value, or to exclude it.
