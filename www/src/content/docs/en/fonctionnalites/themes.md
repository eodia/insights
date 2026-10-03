---
title: Themes and PDF
description: Dress folders, dashboards and questions in your company’s brand — fonts, colors, palette, logo — and print them to PDF.
---

A **theme** dresses what you show: the font of titles and of text (charts included), the title
color, the accent, the page and card backgrounds, card corners and shadow, the chart palette, the
logo, and the PDF layout.

## Creating a theme

*Administration › Themes* (administrators only): **New theme**, then each setting, with a live
preview beside it — a small dashboard and its charts in the theme.

| Setting | What it changes |
|---|---|
| **Fonts** | Titles, and text and charts: about twenty Google Fonts, serif or sans-serif; title weight and case |
| **Colors** | Accent (active tab, filters, links), titles, text, page background, card background and border |
| **Cards** | Corner radius, shadow |
| **Charts** | The palette every chart uses unless it chose its own — one of the checked palettes, or yours; bar fill (solid, hatched, gradient) and bar radius |
| **Logo** | An image (PNG, SVG, JPEG, WebP; 220 KB at most) or its address; height, left or right of the title |
| **PDF printing** | Landscape or portrait, cover page, footer |

In dark mode, a theme keeps its fonts, accent, palette and logo; backgrounds and text follow dark
mode.

## Applying a theme: inheritance

A theme is applied to a **folder**, from its header (the *Theme* picker, next to the icon): the
folder, its subfolders, their questions and their dashboards all wear it. A subfolder may wear
another one; everything inside it then follows its own. The picker always tells you what is
inherited and from where: *Inherited: Maison (from “Sales”)*.

A **dashboard** can also have its own (*Settings › Theme*), which wins over its folder's. A
question takes its folder's theme — or its dashboard's when it belongs to one. Share links and
embeds wear the theme of the shared content.

A theme grants no permission: it only dresses what a person can already see.

## Printing to PDF

On a dashboard, *⋯ › Export to PDF* opens its print layout, then the browser's print dialog:
choose **Save as PDF**.

- a **cover page** in the theme: logo, title, description, date and applied filters;
- the cards, tab after tab, on A4 pages: a row of cards is never split across two pages;
- vector charts (sharp at any zoom), drawn without animation, with the filters as they were on
  screen;
- in the footer, the theme's text (or the dashboard's name) and page numbers.
