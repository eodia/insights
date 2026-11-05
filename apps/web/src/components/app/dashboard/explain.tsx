'use client'

import type { BuilderQuery, Constraint, ExplainResult, TemporalUnit } from '@eodia/contracts'
import { Orb } from '@/components/app/assistant/orb'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { formatValue } from '@/lib/format'
import { $t, intlLocale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Loader2, Sparkles } from 'lucide-react'
import Markdown from 'react-markdown'

export interface ExplainRequest {
  readonly title: string
  readonly query: BuilderQuery
  readonly constraints: readonly Constraint[]
  readonly time: { readonly field: string; readonly join?: string; readonly unit: TemporalUnit }
  readonly previous: { readonly expr: string; readonly label: string }
  readonly current: { readonly expr: string; readonly label: string }
}

const pct = (n: number) => new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 1 }).format(n)

/**
 * « Pourquoi ça bouge ? » : how much a figure moved between two periods, and what moved it —
 * column by column, each value's change drawn as a bar, its share of the whole change beside it;
 * the conclusion on top, written by the AI when there is one.
 */
export function ExplainDialog({ request, onClose }: { request: ExplainRequest; onClose: () => void }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['explain', JSON.stringify(request)],
    queryFn: () =>
      api.post<ExplainResult>('/v1/explain', {
        query: request.query,
        constraints: request.constraints,
        time: request.time,
        previous: request.previous.expr,
        current: request.current.expr,
        labels: { previous: request.previous.label, current: request.current.label },
      }),
    staleTime: 300_000,
    retry: false,
  })
  const fmt = (n: number, compact = true) => (data ? formatValue(n, data.measure, { compact }) : String(n))
  const down = (data?.change ?? 0) < 0
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4.5 text-violet-500" /> {$t('Pourquoi ça bouge ?')}
          </DialogTitle>
          <DialogDescription>
            {request.title} · {request.current.label} {$t('comparé à')} {request.previous.label}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
            <Orb size={44} busy />
            <span className="ai-shimmer">{$t('Analyse de l’écart, colonne par colonne…')}</span>
          </div>
        ) : error ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{(error as Error).message}</p>
        ) : data ? (
          <div className="space-y-5">
            {/* The change. */}
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2 rounded-2xl bg-muted/40 px-5 py-4">
              <div>
                <div className="text-xs text-muted-foreground">{request.previous.label}</div>
                <div className="text-xl font-semibold tabular-nums">{fmt(data.previous)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{request.current.label}</div>
                <div className="text-xl font-semibold tabular-nums">{fmt(data.current)}</div>
              </div>
              <div className={cn('ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold tabular-nums', data.change === 0 ? 'bg-muted text-muted-foreground' : down ? 'bg-red-500/12 text-red-700 dark:text-red-400' : 'bg-green-500/12 text-green-700 dark:text-green-400')}>
                {down ? <ArrowDown className="size-4" /> : <ArrowUp className="size-4" />}
                {data.change > 0 ? '+' : data.change < 0 ? '−' : ''}
                {fmt(Math.abs(data.change))}
                {data.ratio !== null ? ` · ${pct(Math.abs(data.ratio))}` : ''}
              </div>
            </div>

            {/* The conclusion. */}
            <div className="flex gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/[0.05] px-4 py-3">
              <Orb size={20} className="mt-0.5 shrink-0" />
              <div className="min-w-0 text-[14px] leading-relaxed [&_p]:m-0">
                <Markdown>{data.summary}</Markdown>
                <div className="mt-1 text-[11px] text-muted-foreground">{data.ai ? $t('Conclusion rédigée par l’IA à partir des chiffres ci-dessous.') : $t('Conclusion tirée des chiffres ci-dessous.')}</div>
              </div>
            </div>

            {/* What explains it, column by column. */}
            {data.dimensions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{$t('Aucune colonne de catégories à décomposer dans cette table.')}</p>
            ) : (
              data.dimensions.slice(0, 4).map((d, i) => {
                const max = Math.max(...d.contributors.map((c) => Math.abs(c.change)), 1)
                return (
                  <section key={d.column.name} className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-sm font-semibold">
                        {$t('Par {column}', { column: d.column.label })}
                      </h3>
                      {i === 0 && d.score > 0.35 ? <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary">{$t('Explique le plus')}</span> : null}
                    </div>
                    <div className="space-y-1.5">
                      {d.contributors.map((c) => (
                        <div key={c.value} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[13px]">
                          <span className="truncate" title={c.value}>
                            {c.value || $t('(vide)')}
                          </span>
                          <span className="relative h-5">
                            <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                            <span
                              className={cn('viz-grow-x absolute inset-y-0.5 rounded-sm', c.change < 0 ? 'right-1/2 bg-red-500/70' : 'left-1/2 bg-green-500/70')}
                              style={{ width: `${(Math.abs(c.change) / max) * 50}%`, transformOrigin: c.change < 0 ? 'right' : 'left' }}
                            />
                          </span>
                          <span className="w-36 text-right tabular-nums">
                            <span className={cn('font-medium', c.change < 0 ? 'text-red-700 dark:text-red-400' : c.change > 0 ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground')}>
                              {c.change > 0 ? '+' : c.change < 0 ? '−' : ''}
                              {fmt(Math.abs(c.change))}
                            </span>
                            {data.change !== 0 ? <span className="ml-1.5 text-xs text-muted-foreground">{pct(c.share)}</span> : null}
                          </span>
                        </div>
                      ))}
                      {d.others ? <div className="text-xs text-muted-foreground">{$t('et {count} autre(s) valeur(s)', { count: d.others })}</div> : null}
                    </div>
                  </section>
                )
              })
            )}
          </div>
        ) : (
          <Loader2 className="mx-auto size-5 animate-spin" />
        )}
      </DialogContent>
    </Dialog>
  )
}
