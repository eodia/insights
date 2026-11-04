'use client'

import type { Alert, Datasource, HomeBlockKind, HomeInsight, ItemSummary, TableMeta } from '@eodia/contracts'
import { FavoriteIcon } from '@/components/app/favorite-icon'
import { DashboardArt, QuestionArt, SqlArt } from '@/components/app/illustrations'
import { ItemTile, KIND_LABELS } from '@/components/app/look'
import { itemHref } from '@/components/app/palette'
import { Visualization } from '@/components/app/visualization'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { type RunResult, api } from '@/lib/api'
import { formatAgo, formatCount, formatValue } from '@/lib/format'
import { $t, intlLocale } from '@/lib/i18n'
import { useQuestion } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BellRing, Plus, Search, TrendingDown, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, useState } from 'react'

/** The home page's data, fetched once and shared by its blocks. */
export interface HomeData {
  readonly recent: readonly ItemSummary[]
  readonly bookmarks: readonly ItemSummary[]
  readonly latest: readonly ItemSummary[]
}

/** What a block draws from, gathered by the page. */
export interface BlockContext {
  readonly home: HomeData | undefined
  readonly tables: readonly TableMeta[]
  readonly sources: readonly Datasource[]
  readonly sql: boolean
}

/** One of the home page's own blocks, inside its card — the card gives it its frame and title. */
export function HomeBlock({ kind, ctx }: { kind: HomeBlockKind; ctx: BlockContext }) {
  switch (kind) {
    case 'favorites':
      return <Favorites items={ctx.home?.bookmarks ?? []} />
    case 'alerts':
      return <Watch />
    case 'recent':
      return <ItemList items={ctx.home?.recent ?? []} />
    case 'latest':
      return <ItemList items={ctx.home?.latest ?? []} when />
    case 'shortcuts':
      return <Shortcuts sql={ctx.sql} table={ctx.tables[0]?.qualified ?? null} />
    case 'tables':
      return <Tables tables={ctx.tables} />
    case 'sources':
      return <Sources sources={ctx.sources} />
  }
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center px-6 pb-2 text-center text-sm text-muted-foreground">{children}</div>
}

/** A link at the block's foot: where the whole list lives. */
function More({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
      {children} <ArrowRight className="size-3.5" />
    </Link>
  )
}

// ── Favourites ────────────────────────────────────────────────────────────────

/** A favourite question, its figure or chart in small, run under the reader's rights. */
function FavoriteChart({ id }: { id: string }) {
  const { data: question } = useQuestion(id)
  const run = useQuery({ queryKey: ['home-run', id], queryFn: () => api.post<RunResult>(`/v1/questions/${id}/run`, {}), staleTime: 60_000, retry: false })
  if (!run.data || !question) return <div className="h-full animate-pulse rounded-lg bg-muted/50" />
  return <Visualization result={run.data} viz={question.visualization} compact />
}

/** A dashboard, drawn as one: rising bars, the last one darker. */
function DashboardThumb() {
  return (
    <div className="flex h-full items-end gap-1 bg-gradient-to-b from-primary/[0.07] to-transparent px-3 pt-4">
      {[34, 40, 38, 46, 52, 50, 58, 62, 74, 66].map((h, i) => (
        <span
          key={i}
          className={cn('viz-grow-y flex-1 rounded-t-[4px]', i === 8 ? 'bg-gradient-to-b from-emerald-400 to-primary' : 'bg-gradient-to-b from-emerald-300/70 to-emerald-200/40 dark:from-emerald-400/40 dark:to-emerald-400/10')}
          style={{ height: `${h}%`, animationDelay: `${i * 30}ms` }}
        />
      ))}
    </div>
  )
}

function Favorites({ items }: { items: readonly ItemSummary[] }) {
  const qc = useQueryClient()
  const [picking, setPicking] = useState(false)
  // While a tile is dragged: the order shown, the dragged one moving among the others.
  const [dragged, setDragged] = useState<string | null>(null)
  const [order, setOrder] = useState<string[] | null>(null)
  const byId = new Map(items.map((i) => [i.id, i]))
  const shown = (order ?? items.map((i) => i.id)).map((id) => byId.get(id)).filter((i): i is ItemSummary => !!i)

  /** The home data changed at once, and on the server: the list in its new order, or without one. */
  const keep = (next: readonly ItemSummary[]) => qc.setQueryData<HomeData>(['home'], (d) => (d ? { ...d, bookmarks: next } : d))
  const drop = () => {
    if (order) {
      keep(shown)
      void api.post('/v1/bookmarks/order', { ids: order })
    }
    setDragged(null)
    setOrder(null)
  }
  const remove = async (item: ItemSummary) => {
    keep(items.filter((i) => i.id !== item.id))
    await api.post('/v1/bookmarks', { kind: item.kind, id: item.id, on: false })
    await qc.invalidateQueries({ queryKey: ['home'] })
  }

  return (
    <>
      <div className="grid h-full auto-rows-[190px] grid-cols-[repeat(auto-fill,minmax(200px,1fr))] content-start gap-3 overflow-y-auto px-2 pb-1">
        {shown.map((i) => (
          <Link
            key={i.id}
            href={itemHref(i)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              setDragged(i.id)
              setOrder(items.map((x) => x.id))
            }}
            onDragOver={(e) => {
              if (!dragged || dragged === i.id || !order) return
              e.preventDefault()
              const next = order.filter((id) => id !== dragged)
              next.splice(next.indexOf(i.id) + (order.indexOf(dragged) < order.indexOf(i.id) ? 1 : 0), 0, dragged)
              if (next.join() !== order.join()) setOrder(next)
            }}
            onDrop={(e) => {
              e.preventDefault()
              drop()
            }}
            onDragEnd={drop}
            title={$t('Glissez pour déplacer')}
            className={cn(
              'group/fav relative flex flex-col overflow-hidden rounded-2xl border bg-card transition-[transform,box-shadow,border-color,opacity] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_14px_30px_-20px_rgba(31,138,58,0.45)]',
              dragged === i.id && 'scale-[0.98] opacity-50',
            )}
          >
            <div className="pointer-events-none min-h-0 flex-1">{i.kind === 'dashboard' || i.kind === 'folder' ? <DashboardThumb /> : <FavoriteChart id={i.id} />}</div>
            <div className="border-t px-3.5 py-2.5">
              <div className="truncate text-[14px] font-semibold">{i.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {$t('Mis à jour {when}', { when: formatAgo(i.updated_at) })}
                {i.updated_by ? ` · ${i.updated_by.name}` : ''}
              </div>
            </div>
            <button
              type="button"
              aria-label={$t('Retirer des favoris')}
              title={$t('Retirer des favoris')}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                void remove(i)
              }}
              className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-full bg-background/90 text-amber-500 opacity-0 shadow-sm ring-1 ring-border transition-opacity group-hover/fav:opacity-100 hover:text-muted-foreground focus-visible:opacity-100"
            >
              <FavoriteIcon active className="size-3.5" />
            </button>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <span className="inline-flex size-8 items-center justify-center rounded-full border text-primary">
            <Plus className="size-4" />
          </span>
          {$t('Ajouter un favori')}
        </button>
      </div>
      {picking ? <FavoritePicker starred={items} onClose={() => setPicking(false)} /> : null}
    </>
  )
}

/** A dashboard or a question to star, found by its name. */
function FavoritePicker({ starred, onClose }: { starred: readonly ItemSummary[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const { data } = useQuery({ queryKey: ['search', q, 'favorite'], queryFn: () => api.get<{ items: ItemSummary[] }>(`/v1/search?q=${encodeURIComponent(q)}`) })
  const on = new Set(starred.map((i) => i.id))
  const toggle = async (i: ItemSummary) => {
    await api.post('/v1/bookmarks', { kind: i.kind, id: i.id, on: !on.has(i.id) })
    await qc.invalidateQueries({ queryKey: ['home'] })
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{$t('Ajouter un favori')}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={$t('Rechercher un tableau de bord, une question…')} className="pl-9" />
        </div>
        <div className="max-h-[380px] space-y-0.5 overflow-y-auto">
          {(data?.items ?? []).map((i) => (
            <button key={i.id} type="button" onClick={() => void toggle(i)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent">
              <ItemTile kind={i.kind} className="size-8" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{i.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{$t(KIND_LABELS[i.kind])}</span>
              </span>
              <FavoriteIcon active={on.has(i.id)} className="size-4 shrink-0" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── To watch ──────────────────────────────────────────────────────────────────

const pct = (r: number) => new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 1, signDisplay: 'always' }).format(r)

function Watch() {
  const { data: alerts = [] } = useQuery({ queryKey: ['alerts', 'mine'], queryFn: () => api.get<Alert[]>('/v1/alerts'), staleTime: 60_000 })
  const { data: insights = [] } = useQuery({ queryKey: ['home-insights'], queryFn: () => api.get<HomeInsight[]>('/v1/home/insights'), staleTime: 300_000 })
  // First what rang, then the figures falling the most, then the alerts that watch quietly.
  const rang = alerts.filter((a) => a.enabled && a.triggered)
  const quiet = alerts.filter((a) => a.enabled && !a.triggered)
  const falling = insights.filter((i) => i.delta !== null && i.delta < -0.005).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {rang.map((a) => (
          <Link key={a.id} href={`/question/${a.question}`} className="flex items-center gap-3 rounded-xl bg-red-500/[0.07] px-3 py-2.5 ring-1 ring-red-500/15 transition-colors hover:bg-red-500/10">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-600">
              <BellRing className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold">{a.name || a.question_name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {$t('Alerte déclenchée')}
                {a.last_value !== null ? ` · ${new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 2 }).format(a.last_value)}` : ''}
              </span>
            </span>
          </Link>
        ))}
        {falling.slice(0, 6).map((i) => (
          <div key={i.id} className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-red-500 shadow-xs">
              <TrendingDown className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className="truncate text-[13.5px] font-semibold">{i.column?.label ?? i.table.label}</span>
                <span className="shrink-0 text-[12.5px] font-semibold text-red-600 tabular-nums">{pct(i.delta ?? 0)}</span>
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {formatValue(i.value, i.value_column, { compact: true })} · {i.table.label} · {$t('vs mois précédent')}
              </span>
            </span>
          </div>
        ))}
        {quiet.slice(0, 4).map((a) => (
          <Link key={a.id} href={`/question/${a.question}`} className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted/50">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <TrendingUp className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium">{a.name || a.question_name}</span>
              <span className="block truncate text-xs text-muted-foreground">{a.checked_at ? $t('Vérifiée {when}', { when: formatAgo(a.checked_at) }) : $t('Pas encore vérifiée')}</span>
            </span>
          </Link>
        ))}
        {rang.length + falling.length + quiet.length === 0 ? <Empty>{$t('Rien à signaler : aucune alerte déclenchée, aucun chiffre en baisse.')}</Empty> : null}
      </div>
      <div className="px-1">
        <More href="/deliveries">{$t('Gérer les alertes')}</More>
      </div>
    </div>
  )
}

// ── Lists ─────────────────────────────────────────────────────────────────────

function ItemList({ items, when }: { items: readonly ItemSummary[]; when?: boolean }) {
  if (!items.length) return <Empty>{$t('Rien pour l’instant.')}</Empty>
  return (
    <div className="grid h-full content-start gap-0.5 overflow-y-auto [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
      {items.map((i) => (
        <Link key={i.id} href={itemHref(i)} className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-muted/60">
          <ItemTile kind={i.kind} className="size-8.5 rounded-[10px]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium">{i.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {$t(KIND_LABELS[i.kind])}
              {when ? ` · ${formatAgo(i.updated_at)}` : i.updated_by ? ` · ${i.updated_by.name}` : ''}
            </span>
          </span>
        </Link>
      ))}
    </div>
  )
}

/** The three ways in, each drawn as what it opens. */
function Shortcuts({ sql, table }: { sql: boolean; table: string | null }) {
  const tiles = [
    { href: '/question/new', title: $t('Nouvelle question'), text: $t('Explorer une table sans écrire de SQL'), art: <QuestionArt /> },
    ...(sql ? [{ href: '/sql', title: $t('Requête SQL'), text: $t('Trino SQL sur toutes vos sources'), art: <SqlArt table={table} /> }] : []),
    { href: '/browse', title: $t('Tableaux de bord'), text: $t('Parcourir les dossiers partagés'), art: <DashboardArt /> },
  ]
  return (
    <div className="grid h-full gap-3 px-1 pb-1" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
      {tiles.map((t) => (
        <Link key={t.href} href={t.href} className="group/s flex min-h-0 flex-col overflow-hidden rounded-2xl border transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_14px_30px_-20px_rgba(31,138,58,0.45)]">
          <div className="min-h-0 flex-1 border-b">{t.art}</div>
          <div className="flex items-center gap-2 px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">{t.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{t.text}</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-primary transition-transform group-hover/s:translate-x-0.5" />
          </div>
        </Link>
      ))}
    </div>
  )
}

function Tables({ tables }: { tables: readonly TableMeta[] }) {
  const max = Math.max(...tables.map((t) => t.row_count ?? 0), 1)
  if (tables.length === 0) return <Empty>{$t('Aucune table accessible pour l’instant.')}</Empty>
  return (
    <div className="flex h-full flex-col gap-0.5 overflow-y-auto">
      {tables.map((t) => (
        <Link key={t.id} href={`/question/new?table=${t.id}`} className="flex flex-col gap-1.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-muted/60">
          <span className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{t.label}</span>
            {t.row_count !== null ? <span className="font-mono text-[12.5px] text-muted-foreground tabular-nums">{formatCount(t.row_count)}</span> : null}
          </span>
          <span className="h-[3px] overflow-hidden rounded-full bg-muted">
            <span className="viz-grow-x block h-full rounded-full bg-gradient-to-r from-emerald-400 to-violet-400" style={{ width: `${Math.round(((t.row_count ?? 0) / max) * 100)}%` }} />
          </span>
        </Link>
      ))}
    </div>
  )
}

function Sources({ sources }: { sources: readonly Datasource[] }) {
  if (sources.length === 0) return <Empty>{$t('Aucune source connectée.')}</Empty>
  return (
    <div className="grid h-full content-start gap-2 overflow-y-auto [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
      {sources.map((s) => {
        const status = s.sync.status === 'ok' ? 'ok' : s.sync.status === 'failed' ? 'failed' : 'pending'
        return (
          <Link key={s.id} href={`/data/${s.id}`} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors hover:border-primary/30">
            <span className={cn('size-2 shrink-0 rounded-full', status === 'ok' ? 'bg-green-500' : status === 'failed' ? 'bg-red-500' : 'bg-amber-400')} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold">{s.name}</span>
              <span className="block text-xs text-muted-foreground">{status === 'ok' ? $t('Connectée') : status === 'failed' ? $t('En erreur') : $t('Synchronisation…')}</span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}
