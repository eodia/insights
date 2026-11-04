'use client'

import type { Alert, Datasource, HomeInsight, HomeWidget, HomeWidgetKind, ItemSummary, TableMeta } from '@eodia/contracts'
import { DashboardArt, QuestionArt, SqlArt } from '@/components/app/illustrations'
import { ItemTile, KIND_LABELS } from '@/components/app/look'
import { itemHref } from '@/components/app/palette'
import { Visualization } from '@/components/app/visualization'
import { type RunResult, api } from '@/lib/api'
import { formatAgo, formatCount, formatValue } from '@/lib/format'
import { $t, intlLocale, msg } from '@/lib/i18n'
import { useQuestion } from '@/lib/queries'
import { useUi } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BellRing,
  Clock3,
  Database,
  GripVertical,
  LayoutGrid,
  Loader2,
  type LucideIcon,
  Plus,
  Sparkles,
  Star,
  Table2,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

/** How each block is named and drawn in the « add » menu and in its own head. */
export const WIDGET_META: Record<HomeWidgetKind, { label: string; icon: LucideIcon; hint: string }> = {
  kpi: { label: msg('Indicateur'), icon: Zap, hint: msg('Un chiffre clé épinglé, calculé à chaque visite') },
  question: { label: msg('Question'), icon: LayoutGrid, hint: msg('Une question et son graphique') },
  favorites: { label: msg('Mes favoris'), icon: Star, hint: msg('Les tableaux de bord et questions étoilés') },
  alerts: { label: msg('À surveiller'), icon: BellRing, hint: msg('Vos alertes, et les chiffres qui baissent') },
  recent: { label: msg('Consultés récemment'), icon: Clock3, hint: msg('Ce que vous avez ouvert en dernier') },
  latest: { label: msg('Nouveautés'), icon: Sparkles, hint: msg('Ce qui a changé ces deux derniers mois') },
  shortcuts: { label: msg('Raccourcis'), icon: Plus, hint: msg('Créer une question, une requête SQL, un tableau de bord') },
  tables: { label: msg('Tables'), icon: Table2, hint: msg('Les plus grandes tables, à explorer') },
  sources: { label: msg('Sources'), icon: Database, hint: msg('Les sources connectées et leur état') },
}

/** The home page's data, fetched once and shared by its blocks. */
export interface HomeData {
  readonly recent: readonly ItemSummary[]
  readonly bookmarks: readonly ItemSummary[]
  readonly latest: readonly ItemSummary[]
}

/**
 * A block's frame: white, borderless, rounded like a dashboard's cards. It rises into place when
 * the page opens, one after the other; while the page is arranged, it is moved by its handle.
 */
export function Block({
  title,
  icon: Icon,
  action,
  badge,
  editing,
  onRemove,
  delay = 0,
  bare,
  children,
}: {
  title?: ReactNode
  icon?: LucideIcon
  action?: ReactNode
  badge?: ReactNode
  editing: boolean
  onRemove: () => void
  delay?: number
  /** No head: the block draws all of itself (a figure). */
  bare?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'home-rise group/block relative flex h-full flex-col overflow-hidden rounded-[22px] bg-card shadow-[0_1px_2px_rgba(16,24,40,0.03),0_10px_30px_-20px_rgba(16,24,40,0.18)] transition-shadow hover:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_40px_-20px_rgba(16,24,40,0.26)] dark:ring-1 dark:ring-border/60',
        editing && 'ring-1 ring-primary/25',
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {title ? (
        <div className="flex h-12 shrink-0 items-center gap-2 px-5">
          {editing ? <GripVertical className="home-handle -ml-1.5 size-4 shrink-0 cursor-move text-muted-foreground" /> : null}
          {Icon ? <Icon className="size-4 shrink-0 text-primary" /> : null}
          <h2 className="min-w-0 truncate text-[15px] font-semibold tracking-tight">{title}</h2>
          {badge}
          <span className="flex-1" />
          {editing ? null : action}
        </div>
      ) : editing && bare ? (
        <GripVertical className="home-handle absolute top-3 left-2 z-10 size-4 cursor-move text-muted-foreground" />
      ) : null}
      {editing ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={$t('Retirer de l’accueil')}
          className="home-still absolute top-2.5 right-2.5 z-10 inline-flex size-7 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm ring-1 ring-border transition-colors hover:text-destructive"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center px-6 pb-4 text-center text-sm text-muted-foreground">{children}</div>
}

// ── A question: a figure, or its chart ────────────────────────────────────────

/** A saved question, run under the reader's rights, drawn as it is saved. */
function useRun(id: string) {
  const { data: question, error: qError } = useQuestion(id)
  const run = useQuery({
    queryKey: ['home-run', id],
    queryFn: () => api.post<RunResult>(`/v1/questions/${id}/run`, {}),
    staleTime: 60_000,
    retry: false,
  })
  return { question, run, error: qError ?? run.error }
}

export function QuestionWidget({ widget, editing, onRemove, delay }: { widget: HomeWidget; editing: boolean; onRemove: () => void; delay: number }) {
  const id = widget.question as string
  const { question, run, error } = useRun(id)
  const kpi = widget.kind === 'kpi'
  const title = question ? (
    <Link href={`/question/${id}`} className="hover:underline">
      {question.name}
    </Link>
  ) : (
    <span className="text-muted-foreground">…</span>
  )
  return (
    <Block
      title={title}
      icon={kpi ? undefined : WIDGET_META.question.icon}
      editing={editing}
      onRemove={onRemove}
      delay={delay}
      action={
        <Link href={`/question/${id}`} aria-label={$t('Ouvrir')} className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover/block:opacity-100 hover:bg-muted hover:text-foreground">
          <ArrowRight className="size-4" />
        </Link>
      }
    >
      <div className={cn('h-full', kpi ? 'px-1 pb-2' : 'px-2 pb-3')}>
        {error ? (
          <Empty>{(error as Error).message}</Empty>
        ) : run.data && question ? (
          <Visualization result={run.data} viz={question.visualization} compact />
        ) : (
          <Empty>
            <Loader2 className="size-4 animate-spin" />
          </Empty>
        )}
      </div>
    </Block>
  )
}

// ── Favourites ────────────────────────────────────────────────────────────────

/** A favourite question, its figure or chart in small. */
function FavoriteChart({ id }: { id: string }) {
  const { question, run } = useRun(id)
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

export function FavoritesWidget({ home, editing, onRemove, delay }: { home: HomeData | undefined; editing: boolean; onRemove: () => void; delay: number }) {
  const setPalette = useUi((s) => s.setPalette)
  const items = home?.bookmarks ?? []
  return (
    <Block
      title={$t('Mes favoris')}
      icon={Star}
      editing={editing}
      onRemove={onRemove}
      delay={delay}
      action={
        <Link href="/browse" className="text-[13px] font-medium text-primary hover:underline">
          {$t('Tous les tableaux de bord')}
        </Link>
      }
    >
      <div className="grid h-full auto-rows-[200px] content-start grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 overflow-y-auto px-5 pb-5">
        {items.map((i) => (
          <Link
            key={i.id}
            href={itemHref(i)}
            className="group/fav flex flex-col overflow-hidden rounded-2xl border bg-card transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_14px_30px_-20px_rgba(31,138,58,0.45)]"
          >
            <div className="min-h-0 flex-1">{i.kind === 'dashboard' || i.kind === 'folder' ? <DashboardThumb /> : <FavoriteChart id={i.id} />}</div>
            <div className="border-t px-3.5 py-2.5">
              <div className="truncate text-[14px] font-semibold">{i.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {$t('Mis à jour {when}', { when: formatAgo(i.updated_at) })}
                {i.updated_by ? ` · ${i.updated_by.name}` : ''}
              </div>
            </div>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setPalette(true)}
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <span className="inline-flex size-8 items-center justify-center rounded-full border text-primary">
            <Plus className="size-4" />
          </span>
          {$t('Ajouter un favori')}
        </button>
      </div>
    </Block>
  )
}

// ── To watch ──────────────────────────────────────────────────────────────────

const pct = (r: number) => new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 1, signDisplay: 'always' }).format(r)

/** The key figures the API found by itself, under the reader's identity. */
const useInsights = () =>
  useQuery({
    queryKey: ['home-insights'],
    queryFn: () => api.get<HomeInsight[]>('/v1/home/insights'),
    staleTime: 300_000,
  })

export function AlertsWidget({ editing, onRemove, delay }: { editing: boolean; onRemove: () => void; delay: number }) {
  const { data: alerts = [] } = useQuery({ queryKey: ['alerts', 'mine'], queryFn: () => api.get<Alert[]>('/v1/alerts'), staleTime: 60_000 })
  const { data: insights = [] } = useInsights()
  // First what rang, then the figures falling the most, then the alerts that watch quietly.
  const rang = alerts.filter((a) => a.enabled && a.triggered)
  const quiet = alerts.filter((a) => a.enabled && !a.triggered)
  const falling = insights.filter((i) => i.delta !== null && i.delta < -0.005).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
  const count = rang.length + falling.length
  return (
    <Block
      title={$t('À surveiller')}
      icon={BellRing}
      badge={count ? <span className="rounded-full bg-red-500 px-1.5 text-[11px] leading-[18px] font-semibold text-white tabular-nums">{count}</span> : null}
      editing={editing}
      onRemove={onRemove}
      delay={delay}
      action={
        <Link href="/deliveries" className="text-[13px] font-medium text-primary hover:underline">
          {$t('Gérer')}
        </Link>
      }
    >
      <div className="flex h-full flex-col gap-2 overflow-y-auto px-4 pb-4">
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
    </Block>
  )
}

// ── Lists ─────────────────────────────────────────────────────────────────────

function ItemList({ items, when }: { items: readonly ItemSummary[]; when?: boolean }) {
  if (!items.length) return <Empty>{$t('Rien pour l’instant.')}</Empty>
  return (
    <div className="grid h-full content-start gap-0.5 overflow-y-auto px-2 pb-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
      {items.map((i) => (
        <Link key={i.id} href={itemHref(i)} className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted/60">
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

export function RecentWidget({ home, editing, onRemove, delay }: { home: HomeData | undefined; editing: boolean; onRemove: () => void; delay: number }) {
  return (
    <Block title={$t('Consultés récemment')} icon={Clock3} editing={editing} onRemove={onRemove} delay={delay}>
      <ItemList items={home?.recent ?? []} />
    </Block>
  )
}

export function LatestWidget({ home, editing, onRemove, delay }: { home: HomeData | undefined; editing: boolean; onRemove: () => void; delay: number }) {
  return (
    <Block title={$t('Nouveautés')} icon={Sparkles} editing={editing} onRemove={onRemove} delay={delay}>
      <ItemList items={home?.latest ?? []} when />
    </Block>
  )
}

/** The three ways in, each drawn as what it opens. */
export function ShortcutsWidget({ sql, table, editing, onRemove, delay }: { sql: boolean; table: string | null; editing: boolean; onRemove: () => void; delay: number }) {
  const tiles = [
    { href: '/question/new', title: $t('Nouvelle question'), text: $t('Explorer une table sans écrire de SQL'), art: <QuestionArt /> },
    ...(sql ? [{ href: '/sql', title: $t('Requête SQL'), text: $t('Trino SQL sur toutes vos sources'), art: <SqlArt table={table} /> }] : []),
    { href: '/browse', title: $t('Tableaux de bord'), text: $t('Parcourir les dossiers partagés'), art: <DashboardArt /> },
  ]
  return (
    <Block title={$t('Raccourcis')} icon={Plus} editing={editing} onRemove={onRemove} delay={delay}>
      <div className="grid h-full gap-3 px-5 pb-5" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
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
    </Block>
  )
}

export function TablesWidget({ tables, editing, onRemove, delay }: { tables: readonly TableMeta[]; editing: boolean; onRemove: () => void; delay: number }) {
  const max = Math.max(...tables.map((t) => t.row_count ?? 0), 1)
  return (
    <Block
      title={$t('Tables')}
      icon={Table2}
      editing={editing}
      onRemove={onRemove}
      delay={delay}
      action={
        <Link href="/data" className="text-[13px] font-medium text-primary hover:underline">
          {$t('Toutes')}
        </Link>
      }
    >
      {tables.length === 0 ? (
        <Empty>{$t('Aucune table accessible pour l’instant.')}</Empty>
      ) : (
        <div className="flex h-full flex-col gap-0.5 overflow-y-auto px-2 pb-3">
          {tables.map((t) => (
            <Link key={t.id} href={`/question/new?table=${t.id}`} className="flex flex-col gap-1.5 rounded-xl px-3 py-2 transition-colors hover:bg-muted/60">
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
      )}
    </Block>
  )
}

export function SourcesWidget({ sources, editing, onRemove, delay }: { sources: readonly Datasource[]; editing: boolean; onRemove: () => void; delay: number }) {
  return (
    <Block title={$t('Sources')} icon={Database} editing={editing} onRemove={onRemove} delay={delay}>
      {sources.length === 0 ? (
        <Empty>{$t('Aucune source connectée.')}</Empty>
      ) : (
        <div className="grid h-full content-start gap-2 overflow-y-auto px-4 pb-4 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
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
      )}
    </Block>
  )
}
