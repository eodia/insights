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
| **Compare** | Bar, Row, **Radar** | categories against each other; the radar compares profiles across 3 to 30 criteria, on a common scale |
| **Trend** | Line, Area, Combo, **Bar race**, **Line race**, **Calendar** | tracking over time — and [forecasting](/insights/en/fonctionnalites/previsions/); races replay history period by period |
| **Distribution** | Pie (on several rings), **Treemap**, Funnel | shares, shares of shares, stages |
| **Relationship** | Scatter | two measures against each other |
| **Detail** | Table, Pivot table, Map | rows, a cross-tabulated measure, values by region |

### Shares on several levels

A **pie with several dimensions** — say type, reason, sub-reason — becomes rings: the first
level in the center, each next level around it, in shades of its parent slice. Click a slice to
zoom into it; click the center to go back. The **treemap** lays out the same levels as nested
rectangles, each as large as its value, with each group's name in its header; click to zoom,
and the breadcrumb at the top takes you back. Three levels at most.

### Calendar

One value per day, laid out on the calendar of the three most recent years: **Points**, a dot that
grows with the value, or **colored squares** with their legend. Weekdays, seasons and gaps show
at a glance. Clicking a day filters the dashboard.

### Time and periods

On a dated line or area, **Continuous time axis** spaces dates by the real time between them: a
missing month leaves a gap instead of being skipped. **Highlighted periods** marks one or more
periods — a promotion, a sale, a strike — with a named band, and on a single line the line
itself takes the period's color.

### Races

A **bar race** plays the periods one after another: at each date the bars take their value and
overtake each other, the period is written large in the corner, and a timeline at the bottom
lets you play, pause or jump to a date. A **line race** draws the lines over time, each named at
its tip with its value; **Replay** starts it again.

They need a date (the race moves forward with it), a measure, and competitors: the values of a
second dimension (countries, products) or several measures. Settings: the **Speed** (slow, normal,
fast), how many **Bars shown** (5 to 20), **Accumulate periods** for a race on the running total
rather than each month's value, and **Start the race on open**.

## Colors

**Six palettes**, each an ordering of hues: **eodia** (default), **Vivid**, **Ocean**,
**Earth**, **Soft** and **Gradient** (from light to dark, for ordered categories — 5 at
most). All are **validated in light and dark mode**: two neighboring colors can be told apart,
including by a color-blind person (protanopia, deuteranopia), and each one stays legible on the background.

**Custom** builds your own palette, up to 8 colors in order. It is checked
while you build it, against the same thresholds: neighboring colors confused by a color-blind
person, too close, too pale or too gray. In dark theme, each color is adjusted to stay
legible.

**Color of each item**: each series, slice or bar can take its own color —
from the palette, from the application or any color at all —, and go back to the palette.

The order of priority: the color chosen for the element, then the value's color in
[Structure](/insights/en/fonctionnalites/sources/#values) ("delivered" in green, "cancelled" in
red, in every chart), then the palette. "Other" stays gray.

## Making a chart speak

| Setting | Effect |
|---|---|
| **Highlight** | the highest, the lowest or the latest value stands out; the others fade |
| **Average line**, **median line** | a reference line, with its value |
| **Goal** | a line at the target value, with its label |
| **Category order** | that of the result, descending or ascending |
| **Only the top ones** | the N largest categories; the rest in "Other" (which counts neither in the average nor in the highlight) |
| **Extend the trend by** | see [Forecasts](/insights/en/fonctionnalites/previsions/) |

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
