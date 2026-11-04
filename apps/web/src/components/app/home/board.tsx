'use client'

import type { HomeWidget, HomeWidgetKind, ItemSummary } from '@eodia/contracts'
import { QuestionPicker } from '@/components/app/dashboard/view'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { api } from '@/lib/api'
import { defaultWidgets, fetchHomeLayout, HOME_COLUMNS, HOME_ROW_HEIGHT, homeLayoutKey, placeWidget, saveHomeLayout, SINGLE_WIDGETS } from '@/lib/home'
import { $t, intlLocale } from '@/lib/i18n'
import { useDatasources, useMe, useTables } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUp, Check, LayoutGrid, Plus, RotateCcw, Settings2, Sparkles, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import ReactGridLayout, { useContainerWidth, verticalCompactor } from 'react-grid-layout'
import { AlertsWidget, FavoritesWidget, type HomeData, LatestWidget, QuestionWidget, RecentWidget, ShortcutsWidget, SourcesWidget, TablesWidget, WIDGET_META } from './widgets'

/** Under this width the blocks are stacked, in their order, rather than laid on the grid. */
const STACKED_BELOW = 760

/**
 * The home page, arranged by each person: their pinned figures, their favourites and alerts, the
 * questions they want to see — on a grid like a dashboard's. The question to the assistant stays
 * on top.
 */
export function HomeBoard() {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const { data: home } = useQuery({ queryKey: ['home'], queryFn: () => api.get<HomeData & Record<string, ItemSummary[]>>('/v1/home') })
  const { data: saved, isSuccess } = useQuery({ queryKey: homeLayoutKey, queryFn: fetchHomeLayout })
  const { data: tables = [] } = useTables()
  const { data: sources = [] } = useDatasources()
  const [widgets, setWidgets] = useState<HomeWidget[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [picking, setPicking] = useState<'kpi' | 'question' | null>(null)
  const { width, containerRef, mounted } = useContainerWidth()

  // The saved layout, or the page's own; taken again when it changes elsewhere (a pin).
  useEffect(() => {
    if (isSuccess) setWidgets(saved.layout ? [...saved.layout.widgets] : defaultWidgets())
  }, [isSuccess, saved])

  // Every change kept, a moment after the last one.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const change = (next: HomeWidget[] | null) => {
    setWidgets(next ?? defaultWidgets())
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void saveHomeLayout(next).then((r) => qc.setQueryData(homeLayoutKey, r))
    }, 500)
  }

  const list = widgets ?? []
  const add = (kind: HomeWidgetKind, question?: string) => change(placeWidget(list, kind, question))
  const remove = (id: string) => change(list.filter((w) => w.id !== id))
  const starters = tables
    .filter((t) => t.visibility === 'normal')
    .sort((a, b) => (b.row_count ?? 0) - (a.row_count ?? 0))
    .slice(0, 6)
  const kpis = list.filter((w) => w.kind === 'kpi').length
  const missing = SINGLE_WIDGETS.filter((k) => !list.some((w) => w.kind === k))

  const render = (w: HomeWidget, i: number) => {
    const props = { editing, onRemove: () => remove(w.id), delay: Math.min(i * 70, 560) }
    switch (w.kind) {
      case 'kpi':
      case 'question':
        return <QuestionWidget widget={w} {...props} />
      case 'favorites':
        return <FavoritesWidget home={home} {...props} />
      case 'alerts':
        return <AlertsWidget {...props} />
      case 'recent':
        return <RecentWidget home={home} {...props} />
      case 'latest':
        return <LatestWidget home={home} {...props} />
      case 'shortcuts':
        return <ShortcutsWidget sql={!!me?.can.use_sql} table={starters[0]?.qualified ?? null} {...props} />
      case 'tables':
        return <TablesWidget tables={starters} {...props} />
      case 'sources':
        return <SourcesWidget sources={sources} {...props} />
    }
  }
  const ordered = [...list].sort((a, b) => a.y - b.y || a.x - b.x)

  return (
    <div className="flex flex-col gap-6">
      <HomeTop
        firstName={me?.name.split(' ')[0] ?? ''}
        ai={!!me?.ai_enabled}
        actions={
          editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setPicking('kpi')}>
                <Zap /> {$t('Indicateur')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPicking('question')}>
                <LayoutGrid /> {$t('Question')}
              </Button>
              {missing.length ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus /> {$t('Bloc')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">{$t('Ajouter à l’accueil')}</DropdownMenuLabel>
                    {missing.map((k) => {
                      const Icon = WIDGET_META[k].icon
                      return (
                        <DropdownMenuItem key={k} onSelect={() => add(k)} className="items-start">
                          <Icon className="mt-0.5 text-primary" />
                          <span>
                            <span className="block font-medium">{$t(WIDGET_META[k].label)}</span>
                            <span className="block text-xs text-muted-foreground">{$t(WIDGET_META[k].hint)}</span>
                          </span>
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" aria-label={$t('Plus')}>
                    <RotateCcw />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => change(null)}>
                    <RotateCcw /> {$t('Rétablir l’accueil par défaut')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => change([])}>{$t('Tout retirer')}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" onClick={() => setEditing(false)}>
                <Check /> {$t('Terminer')}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="bg-card" onClick={() => setEditing(true)}>
              <Settings2 /> {$t('Personnaliser')}
            </Button>
          )
        }
      />

      {/* No figure pinned yet: the place for them, and how to fill it. */}
      {widgets && kpis === 0 ? (
        <button
          type="button"
          onClick={() => setPicking('kpi')}
          className="home-rise group flex items-center gap-4 rounded-[22px] border border-dashed border-primary/30 bg-card/60 px-5 py-4 text-left transition-colors hover:border-primary/60 hover:bg-card"
        >
          <span className="flex gap-1.5">
            {[0, 1, 2].map((k) => (
              <span key={k} className="flex h-10 w-14 flex-col justify-center gap-1 rounded-lg bg-muted/70 px-2">
                <span className="h-1 w-1/2 rounded-full bg-muted-foreground/25" />
                <span className="h-2 w-3/4 rounded-full bg-primary/50" />
              </span>
            ))}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{$t('Épinglez vos chiffres clés')}</span>
            <span className="block text-[13px] text-muted-foreground">{$t('Chiffre d’affaires, commandes, satisfaction… calculés à chaque visite, sous vos droits.')}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[13px] font-medium text-primary-foreground transition-transform group-hover:scale-[1.03]">
            <Plus className="size-4" /> {$t('Épingler un indicateur')}
          </span>
        </button>
      ) : null}

      <div ref={containerRef}>
        {!widgets || !mounted ? null : list.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[22px] border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
            {$t('Votre accueil est vide.')}
            <Button size="sm" variant="outline" onClick={() => change(null)}>
              <RotateCcw /> {$t('Rétablir l’accueil par défaut')}
            </Button>
          </div>
        ) : width < STACKED_BELOW ? (
          <div className="flex flex-col gap-4">
            {ordered.map((w, i) => (
              <div key={w.id} style={{ height: w.h * HOME_ROW_HEIGHT + (w.h - 1) * 16 }}>
                {render(w, i)}
              </div>
            ))}
          </div>
        ) : (
          <ReactGridLayout
            layout={list.map((w) => ({ i: w.id, x: w.x, y: w.y, w: w.w, h: w.h, minW: 2, minH: 3 }))}
            width={width}
            gridConfig={{ cols: HOME_COLUMNS, rowHeight: HOME_ROW_HEIGHT, margin: [16, 16], containerPadding: [0, 0] }}
            dragConfig={{ enabled: editing, handle: '.home-handle', cancel: '.home-still', threshold: 3 }}
            resizeConfig={{ enabled: editing, handles: ['se'] }}
            compactor={verticalCompactor}
            onLayoutChange={(next) => {
              if (!editing) return
              const moved = list.map((w) => {
                const l = next.find((x) => x.i === w.id)
                return l ? { ...w, x: l.x, y: l.y, w: l.w, h: l.h } : w
              })
              if (moved.some((w, k) => w.x !== list[k]?.x || w.y !== list[k]?.y || w.w !== list[k]?.w || w.h !== list[k]?.h)) change(moved)
            }}
          >
            {list.map((w) => (
              <div key={w.id}>{render(w, ordered.indexOf(w))}</div>
            ))}
          </ReactGridLayout>
        )}
      </div>

      <QuestionPicker
        open={picking !== null}
        onOpenChange={(o) => !o && setPicking(null)}
        title={picking === 'kpi' ? $t('Épingler un indicateur') : $t('Ajouter une question')}
        onPick={(q) => {
          if (picking) add(picking, q.id)
          setPicking(null)
        }}
      />
    </div>
  )
}

/** The top of the page: a greeting, the day, and the question to the assistant. */
function HomeTop({ firstName, ai, actions }: { firstName: string; ai: boolean; actions: React.ReactNode }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const hour = new Date().getHours()
  const greeting = hour < 18 ? $t('Bonjour') : $t('Bonsoir')
  const today = new Intl.DateTimeFormat(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const ask = (q: string) => {
    const t = q.trim()
    if (t) router.push(`/assistant?q=${encodeURIComponent(t)}`)
  }
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-muted-foreground first-letter:uppercase">{today}</p>
          <h1 className="mt-1 text-[clamp(30px,3.2vw,42px)] leading-[1.05] font-semibold tracking-[-0.03em]">
            {greeting}
            {firstName ? (
              <>
                , <span className="accent-serif text-[1.08em]">{firstName}</span>
              </>
            ) : null}
          </h1>
        </div>
        {actions}
      </div>
      {ai ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            ask(text)
          }}
          className="group flex items-center gap-3 rounded-full bg-card py-2 pr-2 pl-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-20px_rgba(16,24,40,0.25)] ring-1 ring-border/60 transition-shadow focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_14%,transparent),0_12px_32px_-20px_rgba(16,24,40,0.25)] focus-within:ring-primary/40"
        >
          <Sparkles className="size-4.5 shrink-0 text-violet-500" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={$t('Demandez n’importe quoi sur vos données…')}
            aria-label={$t('Votre question')}
            className="min-w-0 flex-1 bg-transparent text-[15.5px] outline-none placeholder:text-muted-foreground/70"
          />
          <button
            type="submit"
            aria-label={$t('Envoyer')}
            className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-[transform,opacity] hover:scale-105', !text.trim() && 'opacity-40')}
          >
            <ArrowUp className="size-4.5" strokeWidth={2.4} />
          </button>
        </form>
      ) : null}
    </section>
  )
}
