'use client'

import { type Filter, type Question, type QuestionQuery, type RecordPick, type ResultColumn, recordsQuery, soleMetric } from '@eodia/contracts'
import type { PointClick } from '@/components/app/visualization'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { api } from '@/lib/api'
import { formatValue } from '@/lib/format'
import { $t } from '@/lib/i18n'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'

/**
 * The menu of a point of a chart — a right click on a bar, a slice, a row of a grouped table —
 * and the rows behind it, opened as a new question. Each screen gives its own entries: the
 * editor filters its question, a dashboard its filters; reading the records is the same everywhere.
 */

/** A value as the chart shows it: a link's label, a month in words, `∅` for none. */
export function valueText(value: unknown, column: ResultColumn): string {
  if (value === null || value === undefined || value === '') return '∅'
  return column.labels?.[String(value)] ?? (formatValue(value, column) || String(value))
}

/** « Mois = mars 2026 · Ville = Rennes » — as a filter reads, a label holding a colon of its own. */
export function pointText(p: PointClick): string {
  return [{ column: p.column, value: p.value }, ...(p.also ?? [])].map((v) => $t('{column} = {value}', { column: v.column.label, value: valueText(v.value, v.column) })).join(' · ')
}

/** Periods a filter can name: a rank (a weekday) or an hour has no rows of its own to read. */
const PERIODS = new Set(['day', 'week', 'month', 'quarter', 'year'])

/**
 * What the rows of a point are read by, or `null` when they cannot be: a column computed by SQL,
 * a total, a rank of a date.
 */
export function recordPicks(p: PointClick): RecordPick[] | null {
  const picks: RecordPick[] = []
  for (const { column, value } of [{ column: p.column, value: p.value }, ...(p.also ?? [])]) {
    if (column.role === 'metric' || (column.role === 'field' && !column.source)) return null
    if (column.unit !== undefined && !PERIODS.has(column.unit)) return null
    const v = value === undefined || value === null ? null : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : String(value)
    picks.push({ name: column.name, value: v, ...(column.bin ? { width: column.bin } : {}) })
  }
  return picks
}

/** Where a draft waits for the tab that opens it: a new tab does not share the session's storage. */
export const DRAFT_KEY = (id: string) => `eodia-draft:${id}`

/**
 * Opens the rows behind a point as a new question — a table, in a new tab: the screen it comes
 * from stays as it was, its edits and its filters with it. The question is the reader's own, run
 * under their identity: one who may not query the source cannot read it.
 *
 * @param queryOf the question as the point was drawn — a dashboard's filters already applied.
 */
export function openRecords(point: PointClick, title: string | undefined, queryOf: () => QuestionQuery | Promise<QuestionQuery>): void {
  const picks = recordPicks(point)
  if (!picks) return
  // Opened at the click, before anything is awaited: a tab opened later is a pop-up, and blocked.
  const tab = window.open('', '_blank')
  void (async () => {
    try {
      const query = await queryOf()
      if (query.kind !== 'builder') throw new Error($t('Les enregistrements ne se lisent que pour une question construite avec l’éditeur visuel.'))
      // A question measuring one saved metric: its rows are those the metric counts.
      const metric = soleMetric(query)
      let metricFilters: readonly Filter[] = []
      if (metric) {
        const m = await api.get<Question>(`/v1/questions/${metric}`)
        if (m.query.kind === 'builder' && m.query.source.kind === query.source.kind && m.query.source.id === query.source.id) metricFilters = m.query.filters ?? []
      }
      const records = recordsQuery(query, picks, metricFilters)
      if (!records) throw new Error($t('Les enregistrements de ce point ne se lisent pas.'))
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      localStorage.setItem(
        DRAFT_KEY(id),
        JSON.stringify({
          name: $t('Enregistrements · {title}', { title: pointText(point) }),
          description: title ? $t('Les lignes derrière un point de « {title} ».', { title }) : null,
          query: records,
          visualization: { type: 'table' },
        }),
      )
      const href = `/question/new?draft=${id}`
      if (tab) tab.location.href = href
      else window.location.href = href
    } catch (err) {
      tab?.close()
      toast.error(err instanceof Error ? err.message : String(err))
    }
  })()
}

/** The menu, opened where the click was; it closes on Escape, on a choice or a click elsewhere. */
export function PointMenu({ point, onClose, children }: { point: PointClick | null; onClose: () => void; children: ReactNode }) {
  if (!point) return null
  return (
    <DropdownMenu key={`${point.at.x}:${point.at.y}`} open modal={false} onOpenChange={(open) => !open && onClose()}>
      {/* An anchor of no size at the click, out of any card that would move it. */}
      {createPortal(
        <DropdownMenuTrigger asChild>
          <span aria-hidden className="pointer-events-none fixed size-px" style={{ left: point.at.x, top: point.at.y }} />
        </DropdownMenuTrigger>,
        document.body,
      )}
      <DropdownMenuContent align="start" className="w-64" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel className="line-clamp-2 text-xs font-normal text-muted-foreground">{pointText(point)}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
