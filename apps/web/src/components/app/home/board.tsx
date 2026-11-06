'use client'

import { type HomeLayout, type ItemSummary, cardConstraints } from '@eodia/contracts'
import { DashboardView, QuestionPicker, type Runner } from '@/components/app/dashboard/view'
import { type RunResult, api } from '@/lib/api'
import { HOME_BLOCK_META, defaultCards, fetchHomeLayout, homeDashboard, homeLayoutKey, pinToHome, saveHomeLayout } from '@/lib/home'
import { $t, intlLocale } from '@/lib/i18n'
import { useDatasources, useMe, useTables } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUp, Plus, Sparkles } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/lib/router'
import { useMemo, useState } from 'react'
import { VoiceButton } from '@/components/app/voice-button'
import { type BlockContext, type HomeData, HomeBlock } from './widgets'

/** The home page's content width: wide, but not across a whole large screen. */
const HOME_WIDTH = 1312

const BLOCK_MENU = (Object.keys(HOME_BLOCK_META) as (keyof typeof HOME_BLOCK_META)[]).map((kind) => ({ kind, ...HOME_BLOCK_META[kind] }))

/**
 * The home page: a dashboard of the person's own, edited with the dashboards' editor — the
 * question to the assistant on top, then their pinned figures, their favourites and alerts,
 * titles, texts and the questions they want to see. Every card runs under their rights.
 */
export function HomeBoard() {
  const qc = useQueryClient()
  const params = useSearchParams()
  const { data: me } = useMe()
  const { data: home } = useQuery({ queryKey: ['home'], queryFn: () => api.get<HomeData & Record<string, ItemSummary[]>>('/v1/home') })
  const { data: saved } = useQuery({ queryKey: homeLayoutKey, queryFn: fetchHomeLayout })
  const { data: tables = [] } = useTables()
  const { data: sources = [] } = useDatasources()
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null)
  const [folded, setFolded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [picking, setPicking] = useState(false)
  // Bumped when the page changes from outside its editor (a figure pinned): drawn anew.
  const [version, setVersion] = useState(0)

  const starters = useMemo(
    () =>
      tables
        .filter((t) => t.visibility === 'normal')
        .sort((a, b) => (b.row_count ?? 0) - (a.row_count ?? 0))
        .slice(0, 6),
    [tables],
  )
  const ctx: BlockContext = { home, tables: starters, sources, sql: !!me?.can.use_sql }
  const dashboard = useMemo(() => {
    if (!saved) return null
    const layout: HomeLayout = saved.layout ?? { cards: defaultCards() }
    return homeDashboard($t('Accueil'), layout)
  }, [saved])

  // Each card runs as its own question, under the home page's filters if it has any.
  const runner: Runner = async (card, values, { fresh }) => {
    const constraints = cardConstraints(card.mappings, dashboard?.parameters ?? [], values)
    if (card.question) return api.post<RunResult>(`/v1/questions/${card.question}/run`, { constraints, fresh })
    const compare = (card.visualization?.settings as { compare?: string } | undefined)?.compare
    return api.post<RunResult>('/v1/query', { query: card.query, constraints, fresh, ...(compare && card.query?.kind === 'builder' ? { compare } : {}) })
  }

  // No figure pinned yet — no small question card: the place for them, and how to fill it.
  const figures = dashboard?.cards.some((c) => c.kind === 'question' && c.w <= 6) ?? true

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-surface">
      <HomeCanvas />
      <div className="relative z-10 mx-auto w-full shrink-0 px-6" style={{ maxWidth: HOME_WIDTH + 48 }}>
        <HomeTop firstName={me?.name.split(' ')[0] ?? ''} ai={!!me?.ai_enabled} folded={folded} actions={<div ref={setActionsSlot} className="flex items-center gap-2" />} />
        {!figures && !editing && !folded ? <PinStrip onPin={() => setPicking(true)} /> : null}
      </div>
      <div className="relative z-10 min-h-0 flex-1">
        {dashboard ? (
          <DashboardView
            key={`${saved?.layout ? 'saved' : 'default'}-${version}`}
            dashboard={dashboard}
            runner={runner}
            editable
            actionsSlot={actionsSlot}
            editLabel={$t('Personnaliser')}
            surface={false}
            maxWidth={HOME_WIDTH}
            restoring={params.get('back') === '1'}
            onScrolled={setFolded}
            onEditingChange={setEditing}
            blocks={{ render: (card) => (card.block ? <HomeBlock kind={card.block} ctx={ctx} /> : null), menu: BLOCK_MENU.map((b) => ({ ...b, label: $t(b.label), hint: $t(b.hint) })) }}
            onSave={async (d) => {
              const next = await saveHomeLayout({ tabs: d.tabs, cards: d.cards, parameters: d.parameters })
              qc.setQueryData(homeLayoutKey, next)
            }}
          />
        ) : null}
      </div>
      <QuestionPicker
        open={picking}
        onOpenChange={setPicking}
        title={$t('Épingler un indicateur')}
        onPick={(q) => {
          setPicking(false)
          void pinToHome(q.id, 'scalar').then(async () => {
            await qc.invalidateQueries({ queryKey: homeLayoutKey })
            setVersion((n) => n + 1)
          })
        }}
      />
    </div>
  )
}

/** The place for the figures one pins, while there is none: three small cards, and the way to fill them. */
function PinStrip({ onPin }: { onPin: () => void }) {
  return (
    <button
      type="button"
      onClick={onPin}
      className="home-rise group mt-4 mb-1 flex w-full items-center gap-4 rounded-[22px] border border-dashed border-primary/30 bg-card/60 px-5 py-4 text-left backdrop-blur transition-colors hover:border-primary/60 hover:bg-card"
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
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[13px] font-medium text-primary-foreground transition-transform group-hover:scale-[1.03]">
        <Plus className="size-4" /> {$t('Épingler un indicateur')}
      </span>
    </button>
  )
}

/**
 * The page's background, as the assistant's: a fine grid fading out, and two soft lights — green
 * and violet — drifting slowly at the top.
 */
function HomeCanvas() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="ai-grid absolute inset-0 opacity-70" />
      <div className="home-aurora home-aurora-green" />
      <div className="home-aurora home-aurora-violet" />
    </div>
  )
}

/** The top of the page: the day, a greeting, and the question to the assistant. */
function HomeTop({ firstName, ai, folded, actions }: { firstName: string; ai: boolean; folded: boolean; actions: React.ReactNode }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const greeting = new Date().getHours() < 18 ? $t('Bonjour') : $t('Bonsoir')
  const today = new Intl.DateTimeFormat(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const ask = (q: string) => {
    const t = q.trim()
    if (t) router.push(`/assistant?q=${encodeURIComponent(t)}`)
  }
  return (
    <section className={cn('flex flex-col transition-all duration-300', folded ? 'gap-2 pt-3 pb-1' : 'gap-5 pt-7 pb-2')}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className={cn('overflow-hidden transition-all duration-300', folded ? 'max-h-9' : 'max-h-28')}>
          <p className={cn('text-[13px] font-medium text-muted-foreground transition-all first-letter:uppercase', folded && 'hidden')}>{today}</p>
          <h1 className={cn('leading-[1.05] font-semibold tracking-[-0.03em] transition-all duration-300', folded ? 'text-xl' : 'mt-1 text-[clamp(30px,3.2vw,42px)]')}>
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
          className="flex items-center gap-3 rounded-full bg-card/90 py-2 pr-2 pl-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-20px_rgba(16,24,40,0.25)] ring-1 ring-border/60 backdrop-blur transition-shadow focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_14%,transparent),0_12px_32px_-20px_rgba(16,24,40,0.25)] focus-within:ring-primary/40"
        >
          <Sparkles className="size-4.5 shrink-0 text-violet-500" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={$t('Demandez n’importe quoi sur vos données…')}
            aria-label={$t('Votre question')}
            className="min-w-0 flex-1 bg-transparent text-[15.5px] outline-none placeholder:text-muted-foreground/70"
          />
          <VoiceButton onText={setText} onSend={ask} />
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
