'use client'

import type { Datasource, ItemSummary, TableMeta } from '@eodia/contracts'
import { ItemTile, KIND_LABELS, LookIcon } from '@/components/app/look'
import { itemHref } from '@/components/app/palette'
import { Visualization } from '@/components/app/visualization'
import { type RunResult, api } from '@/lib/api'
import { formatAgo, formatCount } from '@/lib/format'
import { $t } from '@/lib/i18n'
import { useQuestion } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Database } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { FavoriteIcon } from '../favorite-icon'

const CARD = 'rounded-[22px] border bg-card text-card-foreground'

function Arrow({ tone }: { tone: 'green' | 'violet' }) {
  return (
    <span
      className={cn(
        'inline-flex size-8.5 shrink-0 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5',
        tone === 'green' ? 'bg-primary/10 text-primary' : 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
      )}
    >
      <ArrowRight className="size-4" />
    </span>
  )
}

function Shortcut({ href, title, text, tone, children }: { href: string; title: string; text: string; tone: 'green' | 'violet'; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        CARD,
        'group flex flex-col overflow-hidden transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1',
        tone === 'green' ? 'hover:border-primary/35 hover:shadow-[0_24px_48px_-24px_rgba(31,138,58,0.45)]' : 'hover:border-violet-400/40 hover:shadow-[0_24px_48px_-24px_rgba(106,75,240,0.45)]',
      )}
    >
      <div className="h-33 border-b">{children}</div>
      <div className="flex items-center gap-3 px-5.5 py-4.5">
        <span className="flex-1">
          <span className="block text-base font-semibold tracking-tight">{title}</span>
          <span className="mt-0.5 block text-[13.5px] text-muted-foreground">{text}</span>
        </span>
        <Arrow tone={tone} />
      </div>
    </Link>
  )
}

/** The three ways in, each drawn as what it opens. */
export function Shortcuts({ sql, table }: { sql: boolean; table: string | null }) {
  const pill = 'rounded-lg border bg-card px-2.5 py-1.5 text-xs text-muted-foreground'
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Shortcut href="/question/new" title={$t('Nouvelle question')} text={$t('Explorer une table sans écrire de SQL')} tone="green">
        <div className="flex h-full flex-col justify-center gap-2 bg-[radial-gradient(120%_90%_at_0%_0%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_60%)] px-5.5">
          <div className="flex flex-wrap gap-1.5">
            <span className={cn(pill, 'border-primary/25 font-medium text-primary shadow-sm')}>{$t('Données')}</span>
            <span className={pill}>{$t('Filtrer')}</span>
          </div>
          <div className="ml-4.5 flex flex-wrap gap-1.5">
            <span className={pill}>{$t('Résumer')}</span>
            <span className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground">{$t('Visualiser')}</span>
          </div>
        </div>
      </Shortcut>
      {sql ? (
        <Shortcut href="/sql" title={$t('Requête SQL')} text={$t('Trino SQL sur toutes vos sources')} tone="violet">
          <div className="flex h-full flex-col justify-center gap-1 bg-[#0E1411] bg-[radial-gradient(90%_120%_at_100%_0%,rgba(124,92,255,0.35),transparent_60%)] px-5.5 font-mono text-[12.5px] leading-normal text-white/75">
            <div>
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
        </Shortcut>
      ) : null}
      <Shortcut href="/browse" title={$t('Tableaux de bord')} text={$t('Parcourir les dossiers partagés')} tone="green">
        <div className="grid h-full grid-cols-[1.3fr_1fr] grid-rows-2 gap-2 bg-muted/40 px-5.5 py-4">
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
      </Shortcut>
    </section>
  )
}

function FavoritePreview({ id }: { id: string }) {
  const { data: question } = useQuestion(id)
  const run = useQuery({
    queryKey: ['home-favorite', id],
    queryFn: () => api.post<RunResult>(`/v1/questions/${id}/run`, {}),
    staleTime: 300_000,
    retry: false,
  })
  if (!question || !run.data) return <div className="h-full animate-pulse rounded-xl bg-muted/50" />
  return <Visualization result={run.data} viz={question.visualization} compact />
}

/** The first of one's favourites, large; a question shows its result. */
export function Favorite({ item }: { item: ItemSummary }) {
  const runs = item.kind === 'question' || item.kind === 'metric'
  return (
    <Link
      href={itemHref(item)}
      className={cn(CARD, 'group relative grid gap-6 overflow-hidden rounded-3xl p-6.5 transition-[box-shadow,border-color] hover:border-primary/35 hover:shadow-[0_28px_56px_-30px_rgba(31,138,58,0.5)] md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]')}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -top-36 -right-30 size-96 rounded-full bg-[radial-gradient(closest-side,rgba(91,227,125,0.22),transparent)]" />
      <div className="relative flex flex-col justify-between gap-4">
        <div className="flex items-center gap-2 text-[12.5px] font-medium text-amber-600 dark:text-amber-400">
          <FavoriteIcon active className="size-3.5" /> {$t('Votre favori')}
        </div>
        <div>
          <div className="text-2xl font-semibold tracking-tight">{item.name}</div>
          <div className="mt-1 text-[13.5px] text-muted-foreground">
            {$t(KIND_LABELS[item.kind])}
            {item.updated_by ? ` · ${item.updated_by.name}` : ''}
          </div>
          {item.description ? <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{item.description}</p> : null}
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
          {$t('Ouvrir')} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <div className="relative h-52">
        {runs ? (
          <FavoritePreview id={item.id} />
        ) : (
          <div className="grid h-full grid-cols-3 grid-rows-2 gap-2.5">
            <div className="col-span-2 row-span-2 flex items-end gap-1.5 rounded-xl border bg-muted/30 p-3">
              {[42, 48, 45, 58, 62, 55, 70, 74, 68, 82, 88, 96].map((h, i) => (
                <span key={h} className={cn('flex-1 rounded-t-md', i === 11 ? 'bg-gradient-to-b from-emerald-400 to-primary' : 'bg-gradient-to-b from-emerald-400/55 to-primary/20')} style={{ height: `${h}%` }} />
              ))}
            </div>
            {[0, 1].map((k) => (
              <div key={k} className="flex flex-col justify-center gap-2 rounded-xl border bg-muted/30 px-3">
                <span className="h-1.5 w-1/2 rounded-full bg-muted-foreground/25" />
                <span className="h-3 w-3/4 rounded-full bg-foreground/60" />
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}

function Heading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  )
}

export function Recent({ items }: { items: readonly ItemSummary[] }) {
  return (
    <div className="space-y-3">
      <Heading title={$t('Consultés récemment')} />
      <div className={cn(CARD, 'grid gap-0.5 p-1.5 sm:grid-cols-2')}>
        {items.slice(0, 8).map((i) => (
          <Link key={i.id} href={itemHref(i)} className="flex items-center gap-3.5 rounded-2xl px-3.5 py-3 transition-colors hover:bg-muted/60">
            <ItemTile kind={i.kind} className="size-9.5 rounded-[11px]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium">{i.name}</span>
              <span className="block truncate text-[12.5px] text-muted-foreground">
                {$t(KIND_LABELS[i.kind])}
                {i.updated_by ? ` · ${i.updated_by.name}` : ''}
              </span>
            </span>
            {i.bookmarked ? <FavoriteIcon active className="size-3.5" /> : null}
          </Link>
        ))}
      </div>
    </div>
  )
}

export function Latest({ items }: { items: readonly ItemSummary[] }) {
  return (
    <div className="space-y-3">
      <Heading title={$t('Nouveautés')} />
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((i) => (
          <Link
            key={i.id}
            href={itemHref(i)}
            className={cn(CARD, 'flex items-center gap-3.5 rounded-[18px] px-4.5 py-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_14px_30px_-18px_rgba(31,138,58,0.45)]')}
          >
            <ItemTile kind={i.kind} className="size-9.5 rounded-[11px]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium">{i.name}</span>
              <span className="block truncate text-[12.5px] text-muted-foreground">
                {$t(KIND_LABELS[i.kind])} · {formatAgo(i.updated_at)}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-gradient-to-r from-[#2EA043] to-[#7C5CFF] px-2 py-0.5 text-[11px] font-semibold text-white">{$t('Nouveau')}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

/** The tables worth starting from, on a dark card: their size drawn as a bar. */
export function Tables({ tables }: { tables: readonly TableMeta[] }) {
  const total = tables.reduce((s, t) => s + (t.row_count ?? 0), 0)
  const max = Math.max(...tables.map((t) => t.row_count ?? 0), 1)
  return (
    <div className="flex flex-col gap-4.5 rounded-3xl bg-[#0E1411] bg-[radial-gradient(100%_60%_at_100%_0%,rgba(46,160,67,0.28),transparent_70%),radial-gradient(80%_50%_at_0%_100%,rgba(124,92,255,0.22),transparent_70%)] p-5.5 text-white shadow-[0_30px_60px_-34px_rgba(10,15,13,0.6)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] text-white/60">{$t('Explorer une table')}</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
            {formatCount(total)} <span className="text-[15px] font-normal tracking-normal text-white/60">{$t('lignes')}</span>
          </div>
        </div>
        <Link href="/data" className="rounded-full border border-emerald-300/30 px-3 py-1.5 text-[13px] font-medium text-emerald-200 hover:bg-emerald-300/10">
          {$t('Toutes')}
        </Link>
      </div>
      <div className="-mx-2 flex flex-col gap-0.5">
        {tables.map((t) => (
          <Link key={t.id} href={`/question/new?table=${t.id}`} className="flex flex-col gap-2 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.06]">
            <span className="flex items-baseline gap-3">
              {t.icon ? <LookIcon name={t.icon} color={t.color} className="size-3.5 self-center" /> : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium">{t.label}</span>
                <span className="block truncate font-mono text-[11.5px] text-white/50">
                  {t.schema}.{t.name}
                </span>
              </span>
              {t.row_count !== null ? <span className="font-mono text-[13px] text-white/85 tabular-nums">{formatCount(t.row_count)}</span> : null}
            </span>
            <span className="h-[3px] overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full bg-gradient-to-r from-[#5BE37D] to-[#A78BFA]" style={{ width: `${Math.round(((t.row_count ?? 0) / max) * 100)}%` }} />
            </span>
          </Link>
        ))}
        {tables.length === 0 ? <p className="px-2 text-sm text-white/60">{$t('Aucune table accessible pour l’instant.')}</p> : null}
      </div>
    </div>
  )
}

export function Sources({ sources }: { sources: readonly Datasource[] }) {
  if (sources.length === 0) return null
  return (
    <div className="space-y-3">
      <Heading title={$t('Sources')} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
        {sources.map((s) => {
          const status = s.sync.status === 'ok' ? 'ok' : s.sync.status === 'failed' ? 'failed' : 'pending'
          return (
            <Link key={s.id} href={`/data/${s.id}`} className={cn(CARD, 'flex flex-col gap-3.5 rounded-[18px] p-4 transition-colors hover:border-primary/30')}>
              <div className="flex items-center justify-between">
                <span className="inline-flex size-9 items-center justify-center rounded-[11px] bg-primary/10 text-primary">
                  <Database className="size-4.5" />
                </span>
                <span
                  className={cn(
                    'size-2 rounded-full',
                    status === 'ok' ? 'animate-[home-pulse_1.8s_ease-out_infinite] bg-green-500' : status === 'failed' ? 'bg-red-500' : 'bg-amber-400',
                  )}
                />
              </div>
              <div>
                <div className="truncate text-[15px] font-semibold">{s.name}</div>
                <div className={cn('mt-0.5 text-[12.5px]', status === 'ok' ? 'text-primary' : status === 'failed' ? 'text-destructive' : 'text-amber-600')}>
                  {status === 'ok' ? $t('Connectée') : status === 'failed' ? $t('En erreur') : $t('Synchronisation…')}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
