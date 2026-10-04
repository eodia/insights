'use client'

import type { LookColor, QueryExecution } from '@eodia/contracts'
import { Empty, PageHeader, Spinner, dateTime } from '@/components/app/admin/common'
import { Avatar, Chip } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Switch } from '@/components/ui/switch'
import { Hint } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { formatAgo, formatCount } from '@/lib/format'
import { $t, $tp, intlLocale, msg } from '@/lib/i18n'
import { useMe } from '@/lib/queries'
import { useCrumbs } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Code2, History, Loader2, RotateCw, Zap } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

const PAGE = 100

const ORIGINS: Record<QueryExecution['origin'], { label: string; color: LookColor }> = {
  editor: { label: msg('Éditeur SQL'), color: 'sky' },
  question: { label: msg('Question'), color: 'blue' },
  card: { label: msg('Carte'), color: 'green' },
  api: { label: msg('API'), color: 'amber' },
  mcp: { label: msg('MCP'), color: 'violet' },
  copilot: { label: msg('Copilot'), color: 'pink' },
  share: { label: msg('Partage'), color: 'teal' },
  home: { label: msg('Accueil'), color: 'gray' },
}

function duration(ms: number): string {
  if (ms < 1000) return `${formatCount(ms)} ms`
  return `${new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 1 }).format(ms / 1000)} s`
}

function Execution({ run, showUser }: { run: QueryExecution; showUser: boolean }) {
  const [open, setOpen] = useState(false)
  const origin = ORIGINS[run.origin] ?? { label: run.origin, color: 'gray' as const }
  const firstLine = run.sql.replace(/\s+/g, ' ').trim()
  return (
    <div className={cn('border-t first:border-t-0', open && 'bg-muted/30')}>
      <div className="flex items-start gap-3 px-4 py-3">
        <button type="button" onClick={() => setOpen(!open)} className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground" aria-label={open ? $t('Replier') : $t('Déplier')} aria-expanded={open}>
          <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
        </button>
        <div className="w-28 shrink-0 whitespace-nowrap">
          <Hint label={dateTime(run.at)}>
            <span className="text-sm tabular-nums">{new Date(run.at).toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </Hint>
          <div className="truncate text-xs text-muted-foreground">
            {new Date(run.at).toDateString() === new Date().toDateString() ? formatAgo(run.at) : new Date(run.at).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
        {showUser ? (
          <div className="flex w-40 shrink-0 items-center gap-2">
            {run.user ? (
              <>
                <Avatar name={run.user.name} color={run.user.color} size="sm" />
                <span className="truncate text-sm">{run.user.name}</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </div>
        ) : null}
        <div className="min-w-0 flex-1 space-y-1.5">
          <button type="button" onClick={() => setOpen(!open)} className="block w-full min-w-0 text-left">
            <code className={cn('block truncate font-mono text-[13px]', run.error && 'text-muted-foreground')}>{firstLine}</code>
          </button>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Chip color={origin.color}>{$t(origin.label)}</Chip>
            {run.cached ? (
              <Chip color="lime">
                <Zap className="size-3" /> {$t('Cache')}
              </Chip>
            ) : null}
            <span>{duration(run.duration_ms)}</span>
            {run.rows !== null ? <span>· {$tp(run.rows, '{count} ligne', '{count} lignes')}</span> : null}
          </div>
          {run.error ? <p className={cn('text-sm text-destructive', !open && 'line-clamp-1')}>{run.error}</p> : null}
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href={`/sql?sql=${encodeURIComponent(run.sql)}`}>
            <Code2 /> {$t("Ouvrir dans l'éditeur")}
          </Link>
        </Button>
      </div>
      {open ? (
        <div className="px-4 pb-4 pl-11">
          <pre className="max-h-96 overflow-auto rounded-lg border bg-background p-3 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">{run.sql}</pre>
        </div>
      ) : null}
    </div>
  )
}

export default function HistoryPage() {
  useCrumbs([{ label: $t('Historique') }])
  const { data: me } = useMe()
  const [all, setAll] = useState(false)
  const [origin, setOrigin] = useState('')
  const [errors, setErrors] = useState(false)
  const everyone = all && !!me?.is_admin
  const q = useInfiniteQuery({
    queryKey: ['history', everyone, origin, errors],
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      api.get<QueryExecution[]>(
        `/v1/history?${new URLSearchParams({ ...(everyone ? { all: '1' } : {}), ...(origin ? { origin } : {}), ...(errors ? { errors: '1' } : {}), ...(pageParam ? { before: pageParam } : {}) })}`,
      ),
    getNextPageParam: (last) => (last.length >= PAGE ? last[last.length - 1]?.id : undefined),
  })
  const runs = q.data?.pages.flat() ?? []

  return (
    <div className="mx-auto max-w-6xl px-8 py-6">
      <PageHeader
        title={$t('Historique des requêtes')}
        description={$t('Chaque requête envoyée à Trino, avec le SQL réellement exécuté : depuis l’éditeur, une question, un tableau de bord, l’API, le serveur MCP ou le copilot.')}
        actions={
          <Hint label={$t('Actualiser')}>
            <Button variant="outline" size="icon" onClick={() => q.refetch()} aria-label={$t('Actualiser')}>
              <RotateCw className={cn(q.isFetching && 'animate-spin')} />
            </Button>
          </Hint>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Choice
          value={origin}
          onValueChange={setOrigin}
          options={[{ value: '', label: $t('Toutes les origines') }, ...Object.entries(ORIGINS).map(([value, o]) => ({ value, label: $t(o.label) }))]}
          aria-label={$t('Origine')}
          className="w-52"
          size="default"
          searchable={false}
        />
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={errors} onCheckedChange={setErrors} aria-label={$t('Erreurs seulement')} />
          {$t('Erreurs seulement')}
        </label>
        {me?.is_admin ? (
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={all} onCheckedChange={setAll} aria-label={$t('Toutes les personnes')} />
            {$t('Toutes les personnes')}
          </label>
        ) : null}
        <span className="flex-1" />
        <span className="text-sm text-muted-foreground">{q.hasNextPage ? $t('{count}+ requêtes', { count: runs.length }) : $tp(runs.length, '{count} requête', '{count} requêtes')}</span>
      </div>
      <div className="overflow-hidden rounded-xl border">
        {runs.map((r) => (
          <Execution key={r.id} run={r} showUser={everyone} />
        ))}
        {q.isLoading ? <Spinner className="my-8" /> : null}
        {q.error ? <p className="p-4 text-sm text-destructive">{(q.error as Error).message}</p> : null}
        {!q.isLoading && runs.length === 0 ? (
          <Empty icon={<History className="size-5" />} title={$t('Aucune requête.')}>
            {errors ? $t('Aucune erreur : tout s’est bien passé.') : $t('Les requêtes apparaîtront ici dès leur exécution.')}
          </Empty>
        ) : null}
      </div>
      {q.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            {q.isFetchingNextPage ? <Loader2 className="animate-spin" /> : <ChevronDown />}
            {$t('Charger plus')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
