'use client'

import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * Small drawings of what each way in opens — a question built in steps, a SQL editor, a
 * dashboard —, shared by the home page and the « + Nouveau » menu.
 */

/** A question: data, filtered, summed up, drawn. */
export function QuestionArt({ className }: { className?: string }) {
  const pill = 'rounded-lg border bg-card px-2.5 py-1.5 text-xs text-muted-foreground'
  return (
    <div className={cn('flex h-full flex-col justify-center gap-2 bg-[radial-gradient(120%_90%_at_0%_0%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_60%)] px-5.5', className)}>
      <div className="flex flex-wrap gap-1.5">
        <span className={cn(pill, 'border-primary/25 font-medium text-primary shadow-sm')}>{$t('Données')}</span>
        <span className={pill}>{$t('Filtrer')}</span>
      </div>
      <div className="ml-4.5 flex flex-wrap gap-1.5">
        <span className={pill}>{$t('Résumer')}</span>
        <span className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground">{$t('Visualiser')}</span>
      </div>
    </div>
  )
}

/** A SQL editor, its cursor blinking. */
export function SqlArt({ table, className }: { table?: string | null; className?: string }) {
  return (
    <div className={cn('flex h-full flex-col justify-center gap-1 bg-[#0E1411] bg-[radial-gradient(90%_120%_at_100%_0%,rgba(124,92,255,0.35),transparent_60%)] px-5.5 font-mono text-[12.5px] leading-normal text-white/75', className)}>
      <div className="truncate">
        <span className="text-violet-300">SELECT</span> *, <span className="text-emerald-300">COUNT</span>(*) <span className="text-violet-300">OVER</span> ()
      </div>
      <div className="truncate">
        <span className="text-violet-300">FROM</span> {table ?? 'catalogue.schema.table'}
      </div>
      <div>
        <span className="text-violet-300">LIMIT</span> 100
        <span className="ml-1 inline-block h-3.5 w-[7px] animate-pulse bg-violet-400 align-text-bottom" />
      </div>
    </div>
  )
}

/** A dashboard: a chart and two figures. */
export function DashboardArt({ className }: { className?: string }) {
  return (
    <div className={cn('grid h-full grid-cols-[1.3fr_1fr] grid-rows-2 gap-2 bg-muted/40 px-5.5 py-4', className)}>
      <div className="row-span-2 flex items-end gap-1 rounded-[10px] border bg-card p-2.5">
        {[40, 55, 48, 70, 62, 80, 74, 92].map((h, i) => (
          <span key={h} className={cn('flex-1 rounded-t-[3px]', i === 7 ? 'bg-primary' : 'bg-primary/30')} style={{ height: `${h}%` }} />
        ))}
      </div>
      {[0, 1].map((k) => (
        <div key={k} className="flex flex-col justify-center gap-1.5 rounded-[10px] border bg-card px-2.5">
          <span className="h-1.5 w-1/2 rounded-full bg-muted-foreground/25" />
          <span className="h-2.5 w-3/4 rounded-full bg-foreground/70" />
        </div>
      ))}
    </div>
  )
}
