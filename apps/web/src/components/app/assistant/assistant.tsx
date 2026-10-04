'use client'

import { EngineBadge } from '@/components/app/data/source-look'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Hint } from '@/components/ui/tooltip'
import { api, postStream } from '@/lib/api'
import { $t, $tp } from '@/lib/i18n'
import { useDatasources, useMe, useTables } from '@/lib/queries'
import { useCrumbs } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { Datasource } from '@eodia/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  Copy,
  Database,
  LineChart,
  PanelLeft,
  Plus,
  Search,
  Sparkles,
  Square,
  TableProperties,
  X,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CONVERSATIONS_KEY, type ConversationSummary, History } from './history'
import { Orb } from './orb'
import { AnswerParts, type Part } from './parts'

/**
 * L'assistant IA : le moteur du copilot dans un écran à lui. Il cherche dans les sources
 * choisies, écrit le SQL, l'exécute sous l'identité de la personne et montre les résultats en
 * graphiques interactifs dans la conversation. Chaque conversation est gardée, pour elle seule.
 */

type Turn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; parts: Part[]; done: boolean; error?: string }

const SOURCES_KEY = 'eodia-assistant-sources'
const HISTORY_KEY = 'eodia-assistant-history'

function readStored<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

/** The sources the assistant may look into: all of them, or those chosen. */
function SourcesPicker({
  sources,
  value,
  onChange,
}: { sources: readonly Datasource[]; value: readonly string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState('')
  const chosen = sources.filter((s) => value.includes(s.id))
  const shown = sources.filter((s) =>
    `${s.name} ${s.catalog}`.toLowerCase().includes(q.trim().toLowerCase()),
  )
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
            chosen.length
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          <Database className="size-3.5" />
          {chosen.length === 0
            ? $t('Toutes les sources')
            : chosen.length === 1
              ? chosen[0]?.name
              : $tp(chosen.length, '{count} source', '{count} sources')}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-72 p-0">
        <div className="border-b p-2">
          <label className="flex h-8 items-center gap-2 rounded-md bg-muted/60 px-2 text-sm">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={$t('Filtrer les sources')}
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <span className="flex size-7 items-center justify-center rounded-md bg-muted">
              <Sparkles className="size-3.5 text-primary" />
            </span>
            <span className="flex-1">{$t('Toutes les sources')}</span>
            {value.length === 0 ? <Check className="size-4 text-primary" /> : null}
          </button>
          {shown.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <EngineBadge engine={s.engine} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{s.name}</span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">
                  {s.catalog}
                </span>
              </span>
              {value.includes(s.id) ? <Check className="size-4 text-primary" /> : null}
            </button>
          ))}
          {sources.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              {$t('Aucune source de données pour l’instant.')}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  disabled,
  sources,
  chosen,
  onSources,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop: () => void
  busy: boolean
  disabled: boolean
  sources: readonly Datasource[]
  chosen: readonly string[]
  onSources: (v: string[]) => void
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the field grows with what is typed
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 224)}px`
  }, [value])
  return (
    <div className="group/composer relative rounded-[28px] bg-gradient-to-r from-primary/40 via-cyan-400/40 to-violet-500/40 p-px shadow-[0_8px_32px_-12px_rgba(0,0,0,.18)] transition-shadow focus-within:from-primary focus-within:via-cyan-400 focus-within:to-violet-500 focus-within:shadow-[0_12px_40px_-12px_color-mix(in_oklch,var(--primary)_45%,transparent)]">
      <div className="rounded-[27px] bg-background">
        <textarea
          ref={ref}
          // biome-ignore lint/a11y/noAutofocus: the assistant's screen exists to type in it
          autoFocus={autoFocus}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (!busy) onSend()
            }
          }}
          placeholder={
            disabled
              ? $t('L’assistant n’est pas configuré sur cette instance.')
              : $t('Demandez n’importe quoi sur vos données…')
          }
          className="block max-h-56 w-full resize-none bg-transparent px-5 pt-4 pb-2 text-[15px] leading-6 outline-none placeholder:text-muted-foreground/70"
        />
        <div className="flex items-center gap-2 px-3 pb-3">
          <SourcesPicker sources={sources} value={chosen} onChange={onSources} />
          {chosen.length > 1
            ? sources
                .filter((s) => chosen.includes(s.id))
                .slice(0, 3)
                .map((s) => (
                  <span
                    key={s.id}
                    className="hidden items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground sm:flex"
                  >
                    {s.name}
                    <button
                      type="button"
                      onClick={() => onSources(chosen.filter((c) => c !== s.id))}
                      aria-label={$t('Retirer {name}', { name: s.name })}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))
            : null}
          <span className="flex-1" />
          <span className="hidden text-[11px] text-muted-foreground/70 md:inline">
            {$t('Entrée pour envoyer · Maj+Entrée pour aller à la ligne')}
          </span>
          {busy ? (
            <Hint label={$t('Arrêter')}>
              <button
                type="button"
                onClick={onStop}
                className="flex size-9 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105"
                aria-label={$t('Arrêter')}
              >
                <Square className="size-3.5 fill-current" />
              </button>
            </Hint>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={disabled || !value.trim()}
              className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-all hover:scale-105 disabled:scale-100 disabled:bg-muted disabled:text-muted-foreground"
              aria-label={$t('Envoyer')}
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Welcome({
  name,
  onPick,
  composer,
}: { name: string; onPick: (s: string) => void; composer: React.ReactNode }) {
  const { data: tables = [] } = useTables(undefined, true)
  const hour = new Date().getHours()
  const hello =
    hour < 18 && hour >= 5 ? $t('Bonjour {name}', { name }) : $t('Bonsoir {name}', { name })
  const sample = tables.find((t) => t.visibility !== 'hidden')
  const ideas: [typeof Sparkles, string][] = [
    [Sparkles, $t('Que puis-je analyser avec mes données ?')],
    [LineChart, $t('Montre-moi l’évolution des ventes mois par mois')],
    [BarChart3, $t('Quels sont les 10 meilleurs clients cette année ?')],
    [
      TableProperties,
      sample
        ? $t('Résume la table « {table} » et ce qu’on peut en tirer', { table: sample.label })
        : $t('Quelles tables sont disponibles ?'),
    ],
  ]
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 pb-16">
      <Orb size={96} className="ai-rise mb-8" />
      <h1 className="ai-rise bg-gradient-to-br from-foreground to-foreground/55 bg-clip-text text-center text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
        {hello}
      </h1>
      <p
        className="ai-rise mt-2 text-center text-[15px] text-muted-foreground"
        style={{ animationDelay: '60ms' }}
      >
        {$t(
          'Je cherche dans vos données, j’écris le SQL et je vous montre la réponse en graphiques.',
        )}
      </p>
      <div className="ai-rise mt-8 w-full" style={{ animationDelay: '120ms' }}>
        {composer}
      </div>
      <div className="mt-5 grid w-full gap-2 sm:grid-cols-2">
        {ideas.map(([Icon, text], i) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            className="ai-rise group flex items-center gap-3 rounded-2xl border bg-background/60 px-4 py-3 text-left text-sm text-muted-foreground backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground hover:shadow-md"
            style={{ animationDelay: `${180 + i * 50}ms` }}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
              <Icon className="size-4" />
            </span>
            <span className="line-clamp-2">{text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Memoized, as the answers: typing in the composer redraws neither. */
const UserBubble = memo(function UserBubble({ text }: { text: string }) {
  return (
    <div className="ai-rise group flex justify-end">
      <div className="relative max-w-[85%] rounded-3xl rounded-br-lg bg-muted px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap">
        {text}
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard
              .writeText(text)
              .then(() => toast.success($t('Copié dans le presse-papiers')))
          }
          className="absolute top-1/2 -left-9 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent"
          aria-label={$t('Copier')}
        >
          <Copy className="size-3.5" />
        </button>
      </div>
    </div>
  )
})

/** Memoized: a turn already given does not redraw — its charts do not replay — at each key typed. */
const Answer = memo(function Answer({ turn }: { turn: Extract<Turn, { role: 'assistant' }> }) {
  const thinking = !turn.done && turn.parts.length === 0
  const text = turn.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { text: string }).text)
    .join('\n\n')
  return (
    <div className="ai-rise group flex gap-4">
      <Orb size={28} busy={!turn.done} className="mt-0.5 self-start" />
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        {thinking ? <div className="ai-shimmer text-sm font-medium">{$t('Réflexion…')}</div> : null}
        <AnswerParts parts={turn.parts} />
        {turn.error ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
            {turn.error}
          </p>
        ) : null}
        {turn.done && text ? (
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Hint label={$t('Copier la réponse')}>
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(text)
                    .then(() => toast.success($t('Copié dans le presse-papiers')))
                }
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={$t('Copier la réponse')}
              >
                <Copy className="size-3.5" />
              </button>
            </Hint>
          </div>
        ) : null}
      </div>
    </div>
  )
})

interface ReadConversation {
  readonly id: string
  readonly title: string
  readonly turns: ({ role: 'user'; text: string } | { role: 'assistant'; parts: Part[] })[]
}

export function Assistant() {
  const router = useRouter()
  const params = useSearchParams()
  const qc = useQueryClient()
  const current = params.get('c')
  const { data: me } = useMe()
  const { data: sources = [] } = useDatasources()
  const { data: info } = useQuery({
    queryKey: ['assistant-info'],
    queryFn: () =>
      api.get<{ enabled: boolean; provider?: string; model?: string }>('/v1/copilot/info'),
    staleTime: 300_000,
  })
  const { data: conversations = [] } = useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: () => api.get<ConversationSummary[]>('/v1/copilot/conversations?kind=assistant'),
  })
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [chosen, setChosen] = useState<string[]>(() => readStored<string[]>(SOURCES_KEY, []))
  const [showHistory, setShowHistory] = useState<boolean>(() =>
    readStored<boolean>(HISTORY_KEY, true),
  )
  const streaming = useRef<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  useCrumbs([{ label: $t('Assistant IA') }])

  useEffect(() => {
    try {
      localStorage.setItem(SOURCES_KEY, JSON.stringify(chosen))
      localStorage.setItem(HISTORY_KEY, JSON.stringify(showHistory))
    } catch {}
  }, [chosen, showHistory])

  // The conversation in the address: opened from the history, or Back and Forward.
  useEffect(() => {
    if (!current) {
      if (!streaming.current) setTurns([])
      return
    }
    if (current === streaming.current) return
    abort.current?.abort()
    let live = true
    api
      .get<ReadConversation>(`/v1/copilot/conversations/${current}`)
      .then((c) => {
        if (live) setTurns(c.turns.map((t) => (t.role === 'user' ? t : { ...t, done: true })))
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : String(err)))
    return () => {
      live = false
    }
  }, [current])

  const scrollDown = useCallback((smooth = true) => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: follows the answer as it grows, unless one scrolled up
  useEffect(() => {
    if (atBottom) scrollDown(false)
  }, [turns])

  const send = async (message: string) => {
    const m = message.trim()
    if (!m || busy) return
    setText('')
    setBusy(true)
    setAtBottom(true)
    const controller = new AbortController()
    abort.current = controller
    streaming.current = current
    setTurns((t) => [
      ...t,
      { role: 'user', text: m },
      { role: 'assistant', parts: [], done: false },
    ])
    const update = (
      fn: (a: Extract<Turn, { role: 'assistant' }>) => Extract<Turn, { role: 'assistant' }>,
    ) =>
      setTurns((list) => {
        const copy = [...list]
        const last = copy[copy.length - 1]
        if (last?.role === 'assistant') copy[copy.length - 1] = fn(last)
        return copy
      })
    try {
      const body = {
        ...(current ? { conversation: current } : {}),
        message: m,
        allow_run: true,
        context: { kind: 'assistant', sources: chosen },
      }
      for await (const { event, data } of postStream('/v1/copilot', body, controller.signal)) {
        const d = data as Record<string, unknown>
        if (event === 'conversation') {
          const id = String(d.id)
          if (id !== current) {
            streaming.current = id
            router.replace(`/assistant?c=${id}`, { scroll: false })
          }
        } else if (event === 'text') {
          update((a) => {
            const parts = [...a.parts]
            const last = parts[parts.length - 1]
            if (last?.type === 'text')
              parts[parts.length - 1] = { type: 'text', text: last.text + String(d.delta) }
            else parts.push({ type: 'text', text: String(d.delta) })
            return { ...a, parts }
          })
        } else if (event === 'tool') {
          update((a) => ({ ...a, parts: [...a.parts, { type: 'tool', name: String(d.name) }] }))
        } else if (event === 'tool_result') {
          update((a) => {
            const parts = [...a.parts]
            for (let i = parts.length - 1; i >= 0; i--) {
              const p = parts[i]
              if (p?.type === 'tool' && p.name === d.name && p.ok === undefined) {
                parts[i] = { ...p, ok: Boolean(d.ok), summary: String(d.summary ?? '') }
                break
              }
            }
            return { ...a, parts }
          })
        } else if (event === 'chart') {
          update((a) => ({ ...a, parts: [...a.parts, { type: 'chart', chart: d.chart as never }] }))
        } else if (event === 'proposal') {
          update((a) => ({
            ...a,
            parts: [...a.parts, { type: 'proposal', proposal: d.proposal as never }],
          }))
        } else if (event === 'error') {
          update((a) => ({ ...a, error: String(d.message) }))
        }
      }
    } catch (err) {
      if (!controller.signal.aborted)
        update((a) => ({ ...a, error: err instanceof Error ? err.message : String(err) }))
    } finally {
      update((a) => ({ ...a, done: true }))
      setBusy(false)
      streaming.current = null
      await qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    }
  }

  const newConversation = () => {
    abort.current?.abort()
    streaming.current = null
    setTurns([])
    router.push('/assistant')
  }

  const enabled = info?.enabled !== false
  const firstName = (me?.name ?? '').split(' ')[0] ?? ''
  const composer = (
    <Composer
      value={text}
      onChange={setText}
      onSend={() => void send(text)}
      onStop={() => abort.current?.abort()}
      busy={busy}
      disabled={!enabled}
      sources={sources}
      chosen={chosen}
      onSources={setChosen}
      autoFocus
    />
  )

  return (
    <div className="flex h-full min-h-0">
      {showHistory ? (
        <History
          list={conversations}
          current={current}
          onOpen={(id) => router.push(`/assistant?c=${id}`)}
          onNew={newConversation}
        />
      ) : null}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="ai-glow pointer-events-none absolute inset-0" />
        <div className="ai-grid pointer-events-none absolute inset-0" />
        <header className="relative z-10 flex h-14 shrink-0 items-center gap-2 px-4">
          <Hint label={showHistory ? $t('Masquer l’historique') : $t('Afficher l’historique')}>
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={$t('Historique')}
            >
              <PanelLeft className="size-4" />
            </button>
          </Hint>
          <span className="flex items-center gap-2 rounded-full border bg-background/70 py-1 pr-3 pl-1.5 text-xs backdrop-blur">
            <Orb size={18} busy={busy} />
            <span className="font-medium">{info?.model ?? $t('Assistant IA')}</span>
            {info?.provider ? (
              <span className="text-muted-foreground">· {info.provider}</span>
            ) : null}
          </span>
          <span className="flex-1" />
          {turns.length > 0 ? (
            <Hint label={$t('Nouvelle conversation')}>
              <button
                type="button"
                onClick={newConversation}
                className="flex items-center gap-1.5 rounded-full border bg-background/70 px-3 py-1.5 text-xs font-medium backdrop-blur hover:bg-accent"
              >
                <Plus className="size-3.5" /> {$t('Nouvelle')}
              </button>
            </Hint>
          ) : null}
        </header>

        {turns.length === 0 ? (
          <div className="relative z-10 flex min-h-0 flex-1 overflow-y-auto">
            <Welcome name={firstName} onPick={(s) => void send(s)} composer={composer} />
          </div>
        ) : (
          <>
            <div
              ref={scroller}
              onScroll={(e) => {
                const el = e.currentTarget
                setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
              }}
              className="relative z-10 min-h-0 flex-1 overflow-y-auto"
            >
              <div className="mx-auto w-full max-w-3xl space-y-8 px-6 pt-4 pb-10">
                {turns.map((t, i) =>
                  t.role === 'user' ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a conversation only grows
                    <UserBubble key={i} text={t.text} />
                  ) : (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a conversation only grows
                    <Answer key={i} turn={t} />
                  ),
                )}
              </div>
            </div>
            {!atBottom ? (
              <button
                type="button"
                onClick={() => scrollDown()}
                className="absolute bottom-36 left-1/2 z-20 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border bg-background shadow-md hover:bg-accent"
                aria-label={$t('Aller en bas')}
              >
                <ArrowDown className="size-4" />
              </button>
            ) : null}
            <div className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-5">
              {composer}
              <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
                {$t(
                  'L’assistant lit vos données sous vos droits. Vérifiez les chiffres importants.',
                )}
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
