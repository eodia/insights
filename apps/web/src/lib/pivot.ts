import type { PivotSort, ResultColumn, VisualizationSettings } from '@eodia/contracts'
import { intlLocale } from '@/lib/i18n'
import { type Result, roles } from '@/lib/viz'

/** At most this many columns are drawn: past it, a pivot is no longer read. */
export const PIVOT_MAX_COLUMNS = 60

/** One side of a pivot — its rows or its columns: in which order, and which values it keeps. */
export interface PivotAxis {
  readonly sort: PivotSort
  /** The values kept, as text; null: all of them. */
  readonly values: readonly string[] | null
}

export interface PivotAxes {
  readonly rows: PivotAxis
  readonly columns: PivotAxis
}

/** A value of a dimension, as the pivot keys it. */
export const pivotKey = (v: unknown): string => String(v)

/** The axes the settings ask for. */
export function axesOf(settings: VisualizationSettings): PivotAxes {
  return {
    rows: { sort: settings.pivot_row_sort ?? 'result', values: settings.pivot_row_values ?? null },
    columns: { sort: settings.pivot_column_sort ?? 'result', values: settings.pivot_column_values ?? null },
  }
}

/** Two values of a dimension in reading order: numbers as numbers, text as a person sorts it. */
function compareValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), intlLocale(), { numeric: true, sensitivity: 'base' })
}

/** The values of a dimension, distinct, in the order the query returned them. */
function distinct(rows: readonly (readonly unknown[])[], index: number): unknown[] {
  return [...new Map(rows.map((r) => [pivotKey(r[index]), r[index]])).values()]
}

function ordered(values: unknown[], sort: PivotSort, totalOf: (v: unknown) => number): unknown[] {
  switch (sort) {
    case 'result':
      return values
    case 'asc':
      return [...values].sort(compareValues)
    case 'desc':
      return [...values].sort((a, b) => compareValues(b, a))
    case 'total_desc':
      return [...values].sort((a, b) => totalOf(b) - totalOf(a))
    case 'total_asc':
      return [...values].sort((a, b) => totalOf(a) - totalOf(b))
  }
}

export interface PivotModel {
  readonly rowDim: ResultColumn
  readonly colDim: ResultColumn
  readonly metric: ResultColumn
  /** Every value of each side, before the filter: what its menu offers. */
  readonly allRows: readonly unknown[]
  readonly allColumns: readonly unknown[]
  readonly rows: readonly unknown[]
  readonly columns: readonly unknown[]
  /** Columns left out past `PIVOT_MAX_COLUMNS`. */
  readonly hiddenColumns: number
  cell(row: unknown, column: unknown): number | undefined
  rowTotal(row: unknown): number
  columnTotal(column: unknown): number
  readonly total: number
  /** The largest cell shown: the top of the heat map. */
  readonly max: number
}

/**
 * A result as a pivot: one dimension down, one across, a measure summed in the cells — each side
 * ordered and filtered as its axis says. Null when the result lacks two dimensions and a measure.
 */
export function pivotModel(result: Result, settings: VisualizationSettings, axes: PivotAxes = axesOf(settings)): PivotModel | null {
  const { dims, metrics } = roles(result, settings)
  const rowDim = result.columns.find((c) => c.name === settings.pivot_rows?.[0]) ?? dims[0]
  const colDim = result.columns.find((c) => c.name === settings.pivot_columns?.[0]) ?? dims[1]
  const metric = result.columns.find((c) => c.name === settings.pivot_values?.[0]) ?? metrics[0]
  if (!rowDim || !colDim || !metric) return null
  const ri = result.columns.indexOf(rowDim)
  const ci = result.columns.indexOf(colDim)
  const mi = result.columns.indexOf(metric)

  const allRows = distinct(result.rows, ri)
  const allColumns = distinct(result.rows, ci)
  const keepRow = axes.rows.values ? new Set(axes.rows.values) : null
  const keepColumn = axes.columns.values ? new Set(axes.columns.values) : null

  // The cells — and the totals that sort by them — count only what both filters keep.
  const cells = new Map<string, number>()
  const rowTotals = new Map<string, number>()
  const columnTotals = new Map<string, number>()
  let total = 0
  for (const r of result.rows) {
    const rk = pivotKey(r[ri])
    const ck = pivotKey(r[ci])
    if ((keepRow && !keepRow.has(rk)) || (keepColumn && !keepColumn.has(ck))) continue
    const v = Number(r[mi]) || 0
    const key = `${rk}\u0000${ck}`
    cells.set(key, (cells.get(key) ?? 0) + v)
    rowTotals.set(rk, (rowTotals.get(rk) ?? 0) + v)
    columnTotals.set(ck, (columnTotals.get(ck) ?? 0) + v)
    total += v
  }

  const rows = ordered(
    allRows.filter((v) => !keepRow || keepRow.has(pivotKey(v))),
    axes.rows.sort,
    (v) => rowTotals.get(pivotKey(v)) ?? 0,
  )
  const keptColumns = ordered(
    allColumns.filter((v) => !keepColumn || keepColumn.has(pivotKey(v))),
    axes.columns.sort,
    (v) => columnTotals.get(pivotKey(v)) ?? 0,
  )
  const columns = keptColumns.slice(0, PIVOT_MAX_COLUMNS)
  const shown = new Set(columns.map(pivotKey))
  let max = 1
  for (const [key, v] of cells) if (shown.has(key.slice(key.indexOf('\u0000') + 1)) && v > max) max = v

  return {
    rowDim,
    colDim,
    metric,
    allRows,
    allColumns,
    rows,
    columns,
    hiddenColumns: keptColumns.length - columns.length,
    cell: (row, column) => cells.get(`${pivotKey(row)}\u0000${pivotKey(column)}`),
    rowTotal: (row) => rowTotals.get(pivotKey(row)) ?? 0,
    columnTotal: (column) => columnTotals.get(pivotKey(column)) ?? 0,
    total,
    max,
  }
}
