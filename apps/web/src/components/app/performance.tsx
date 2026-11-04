'use client'

import type { PerformanceReport, QueryAdvice, QueryPerformance } from '@eodia/contracts'
import { Prose } from '@/components/app/assistant/parts'
import { Empty, Spinner } from '@/components/app/admin/common'
import { ItemTile } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { Hint } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { formatAgo, formatCount } from '@/lib/format'
import { $t, $tp, intlLocale } from '@/lib/i18n'
import { useMe } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronRight, Code2, Gauge, Loader2, RotateCw, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

/** A duration as people read it: 840 ms, 2,4 s, 3 min 10 s. */
export function duration(ms: number): string {
  if (ms < 1000) return `${formatCount(Math.round(ms))} ms`
  if (ms < 60_000) return `${new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 1 }).format(ms / 1000)} s`
  const m = Math.floor(ms / 60_000)
  return `${m} min ${Math.round((ms % 60_000) / 1000)} s`
}

/** How a time reads against the slowness threshold: calm, to watch, slow. */
const tone = (ms: number, slow: number) => (ms >= slow ? 'text-red-600 dark:text-red-400' : ms >= slow / 4 ? 'text-amber-600 dark:text-amber-400' : '')

function Stat({ label, value, hint, className }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', className)}>{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  )
}

/** The rewritten query of an advice, when it gives one. */
const rewritten = (advice: string) => /```sql\s*\n([\s\S]*?)```/i.exec(advice)?.[1]?.trim() ?? null

function Advice({ sql }: { sql: string }) {
  const advise = useMutation({ mutationFn: () => api.post<QueryAdvice>('/v1/performance/advice', { sql }) })
  const [plan, setPlan] = useState(false)
  if (!advise.data && !advise.isPending && !advise.error) {
    return (
      <Button size="sm" variant="outline" onClick={() => advise.mutate()}>
        <Sparkles className="text-violet-500" /> {$t('Optimiser avec l’IA')}
      </Button>
    )
  }
  if (advise.isPending) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {$t('Lecture du plan Trino et analyse…')}
      </div>
    )
  }
  if (advise.error) {
    return (
      <div className="flex items-center gap-2">
        <p className="flex-1 rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">{(advise.error as Error).message}</p>
        <Button size="sm" variant="ghost" onClick={() => advise.mutate()}>
          <RotateCw /> {$t('Réessayer')}
        </Button>
      </div>
    )
  }
  const data = advise.data as QueryAdvice
  const better = rewritten(data.advice)
  return (
    <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="size-4 text-violet-500" /> {$t('Conseils de l’IA')}
        <span className="flex-1" />
        {better ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/sql?sql=${encodeURIComponent(better)}`}>
              <Code2 /> {$t('Essayer la requête réécrite')}
            </Link>
          </Button>
        ) : null}
        {data.plan ? (
          <Button size="sm" variant="ghost" onClick={() => setPlan(!plan)}>
            {plan ? $t('Masquer le plan') : $t('Voir le plan Trino')}
          </Button>
        ) : null}
        <Hint label={$t('Analyser à nouveau')}>
          <Button size="icon-sm" variant="ghost" onClick={() => advise.mutate()} aria-label={$t('Analyser à nouveau')}>
            <RotateCw />
          </Button>
        </Hint>
      </div>
      {plan && data.plan ? <pre className="max-h-80 overflow-auto rounded-lg bg-code p-3 font-mono text-[11px] text-code-foreground">{data.plan}</pre> : null}
      <Prose text={data.advice} />
    </div>
  )
}

function Row({ q, max, slow, ai }: { q: QueryPerformance; max: number; slow: number; ai: boolean }) {
  const [open, setOpen] = useState(false)
  const first = q.sql.replace(/\s+/g, ' ').trim()
  return (
    <div className={cn('border-t first:border-t-0', open && 'bg-muted/30')}>
      <button type="button" onClick={() => setOpen(!open)} className="grid w-full grid-cols-[1.25rem_minmax(0,1fr)_4.5rem_5.5rem_5.5rem_8rem] items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/40" aria-expanded={open}>
        <ChevronRight className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className="min-w-0">
          {q.question ? (
            <span className="flex items-center gap-1.5 truncate font-medium">
              <ItemTile kind="question" className="size-4" />
              {q.question.name}
            </span>
          ) : (
            <span className="block truncate font-mono text-xs">{first}</span>
          )}
          <span className="block truncate text-[11px] text-muted-foreground">
            {$t('dernière {when}', { when: formatAgo(q.last_at) })}
            {q.errors ? ` · ${$tp(q.errors, '{count} erreur', '{count} erreurs')}` : ''}
            {q.cached ? ` · ${$tp(q.cached, '{count} servie par le cache', '{count} servies par le cache')}` : ''}
          </span>
        </span>
        <span className="text-right tabular-nums">{formatCount(q.runs)}</span>
        <span className={cn('text-right tabular-nums', tone(q.avg_ms, slow))}>{duration(q.avg_ms)}</span>
        <span className={cn('text-right tabular-nums', tone(q.p95_ms, slow))}>{duration(q.p95_ms)}</span>
        <span className="flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary/70" style={{ width: `${max ? Math.max(2, (q.total_ms / max) * 100) : 0}%` }} />
          </span>
          <span className="w-14 text-right text-xs tabular-nums">{duration(q.total_ms)}</span>
        </span>
      </button>
      {open ? (
        <div className="space-y-3 px-4 pb-4 pl-12">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>
              {$t('Maximum')} <strong className="text-foreground tabular-nums">{duration(q.max_ms)}</strong>
            </span>
            {q.question ? (
              <Link href={`/question/${q.question.id}`} className="text-primary hover:underline">
                {$t('Ouvrir la question')}
              </Link>
            ) : null}
            <Link href={`/sql?sql=${encodeURIComponent(q.sql)}`} className="text-primary hover:underline">
              {$t('Ouvrir dans l’éditeur SQL')}
            </Link>
          </div>
          <pre className="max-h-64 overflow-auto rounded-lg bg-code p-3 font-mono text-xs whitespace-pre-wrap text-code-foreground">{q.sql}</pre>
          {ai ? <Advice sql={q.sql} /> : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Where the time goes: the queries of a period ranked by the time they cost Trino, all runs
 * together — the few worth optimising first —, and the assistant's advice on each.
 */
export function PerformancePanel() {
  const { data: me } = useMe()
  const [days, setDays] = useState('7')
  const [all, setAll] = useState(false)
  const everyone = all && !!me?.is_admin
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['performance', days, everyone],
    queryFn: () => api.get<PerformanceReport>(`/v1/performance?${new URLSearchParams({ days, ...(everyone ? { all: '1' } : {}) })}`),
  })
  const max = Math.max(0, ...(data?.queries ?? []).map((q) => q.total_ms))
  const cacheRate = data?.runs ? Math.round((data.cached / data.runs) * 100) : 0
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <Segmented
          value={days}
          onValueChange={setDays}
          aria-label={$t('Période')}
          inline
          options={[
            { value: '1', label: $t('24 heures') },
            { value: '7', label: $t('7 jours') },
            { value: '30', label: $t('30 jours') },
          ]}
        />
        {me?.is_admin ? (
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={all} onCheckedChange={setAll} aria-label={$t('Toutes les personnes')} />
            {$t('Toutes les personnes')}
          </label>
        ) : null}
        <span className="flex-1" />
        <Hint label={$t('Actualiser')}>
          <Button variant="outline" size="icon" onClick={() => void refetch()} aria-label={$t('Actualiser')}>
            <RotateCw className={cn(isFetching && 'animate-spin')} />
          </Button>
        </Hint>
      </div>
      {isLoading ? <Spinner className="my-8" /> : null}
      {error ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{(error as Error).message}</p> : null}
      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label={$t('Requêtes')} value={formatCount(data.runs)} hint={data.errors ? $tp(data.errors, '{count} erreur', '{count} erreurs') : $t('aucune erreur')} />
            <Stat label={$t('Temps moyen')} value={duration(data.avg_ms)} className={tone(data.avg_ms, data.slow_ms)} />
            <Stat label={$t('95 % en moins de')} value={duration(data.p95_ms)} className={tone(data.p95_ms, data.slow_ms)} />
            <Stat label={$t('Lentes')} value={formatCount(data.slow)} hint={$t('plus de {s}', { s: duration(data.slow_ms) })} className={data.slow ? 'text-red-600 dark:text-red-400' : ''} />
            <Stat label={$t('Servies par le cache')} value={`${cacheRate} %`} hint={$t('sans passer par Trino')} />
          </div>
          {data.queries.length ? (
            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_4.5rem_5.5rem_5.5rem_8rem] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
                <span />
                <span>{$t('Requête')}</span>
                <span className="text-right">{$t('Exécutions')}</span>
                <span className="text-right">{$t('Moyenne')}</span>
                <span className="text-right">{$t('95 %')}</span>
                <span className="text-right">{$t('Temps total')}</span>
              </div>
              {data.queries.map((q) => (
                <Row key={q.key} q={q} max={max} slow={data.slow_ms} ai={!!me?.ai_enabled} />
              ))}
            </div>
          ) : (
            <Empty icon={<Gauge className="size-5" />} title={$t('Aucune requête sur la période.')}>
              {$t('Les requêtes apparaîtront ici dès leur exécution.')}
            </Empty>
          )}
          <p className="text-xs text-muted-foreground">{$t('Classées par temps total passé dans Trino : une requête rapide mais lancée mille fois peut coûter plus qu’une lente lancée une fois. Les résultats servis par le cache ne comptent pas dans les temps.')}</p>
        </>
      ) : null}
    </div>
  )
}
