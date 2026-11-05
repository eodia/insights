'use client'

import { VoiceButton } from '@/components/app/voice-button'
import { Orb } from '@/components/app/assistant/orb'
import { type Chart, ChartPart, CodeBlock } from '@/components/app/assistant/parts'
import { SqlCode } from '@/components/app/sql-code'
import { speakReply } from '@/lib/voice'
import type { Dashboard, DashboardCard, TableMeta } from '@eodia/contracts'
import { DASHBOARD_COLUMNS, SEMANTIC_LABELS, cardSize, placedAfter } from '@eodia/contracts'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/ui/tooltip'
import { api, postStream } from '@/lib/api'
import { formatAgo } from '@/lib/format'
import { $t, $tp, msg } from '@/lib/i18n'
import { keys, useMe } from '@/lib/queries'
import { useUi } from '@/lib/store'
import { cn } from '@/lib/utils'
import { VIZ_LABELS } from '@/lib/viz'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Database,
  LayoutDashboard,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Table2,
  Wrench,
  X,
  BarChart3,
  ListFilter,
  ArrowRight,
  ArrowUp,
  Code2,
  Play,
  Square,
  SquarePen,
  History,
  Trash2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import { tidyFences } from '@/lib/markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { Pane } from '@/components/ui/pane'

export type Proposal =
  | { id: string; kind: 'question'; name: string; description?: string; query: unknown; visualization: unknown }
  | { id: string; kind: 'dashboard'; dashboard?: string; name: string; cards: { title: string; query: unknown; visualization: { type: string }; w: number }[] }
  | { id: string; kind: 'metadata'; table: string; patch: { label?: string; description?: string }; columns: { name: string; label?: string; description?: string; semantic?: string }[] }

type Entry =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; tools: { name: string; ok?: boolean; summary?: string }[]; proposals: Proposal[]; charts?: Chart[]; error?: string; done: boolean }

const TOOL_LABELS: Record<string, [string, typeof Search]> = {
  search_schema: [msg('Recherche dans le schéma'), Search],
  describe_table: [msg('Lecture de la table'), Table2],
  list_metrics: [msg('Lecture des métriques'), BarChart3],
  run_query: [msg('Exécution de la requête'), Database],
  propose_question: [msg('Proposition de question'), BarChart3],
  propose_dashboard: [msg('Proposition de tableau de bord'), LayoutDashboard],
  propose_metadata: [msg('Proposition de description'), Table2],
  find_filter_values: [msg('Recherche des valeurs du filtre'), Search],
  set_filters: [msg('Filtres posés sur le tableau de bord'), ListFilter],
}

/** Hands a draft question to the question page, which opens it. */
export function stashDraft(draft: unknown): void {
  sessionStorage.setItem('eodia-draft', JSON.stringify(draft))
}

export function ProposalCard({ p }: { p: Proposal }) {
  const router = useRouter()
  const qc = useQueryClient()
  const { data: me } = useMe()
  const [applied, setApplied] = useState(false)
  const [busy, setBusy] = useState(false)
  const apply = async () => {
    setBusy(true)
    try {
      if (p.kind === 'question') {
        stashDraft({ name: p.name, description: p.description, query: p.query, visualization: p.visualization })
        router.push('/question/new?draft=1')
      } else if (p.kind === 'dashboard') {
        const cardsIn = p.cards.map((c, i) => ({
          id: `c${Date.now().toString(36)}${i}`,
          tab: null,
          kind: 'question' as const,
          title: c.title,
          query: c.query,
          visualization: c.visualization,
          w: Math.min(c.w, DASHBOARD_COLUMNS),
          h: cardSize('question', c.visualization.type as never).h,
        }))
        const draft = useUi.getState().dashboardDraft
        if (p.dashboard && draft?.id === p.dashboard) {
          // The dashboard is being edited: its draft takes the cards, saved with the rest.
          draft.add(cardsIn as unknown as Parameters<typeof draft.add>[0])
          toast.success($tp(cardsIn.length, '{count} carte ajoutée : enregistrez le tableau de bord pour la garder.', '{count} cartes ajoutées : enregistrez le tableau de bord pour les garder.'))
        } else if (p.dashboard) {
          const d = await api.get<Dashboard>(`/v1/dashboards/${p.dashboard}`)
          const tab = d.tabs[0]?.id ?? null
          const placed = placedAfter(d.cards, tab, cardsIn.map((c) => ({ ...c, tab })))
          await api.patch(`/v1/dashboards/${p.dashboard}`, { cards: [...d.cards, ...placed] })
          await qc.invalidateQueries({ queryKey: keys.dashboard(p.dashboard) })
          toast.success($tp(placed.length, '{count} carte ajoutée au tableau de bord.', '{count} cartes ajoutées au tableau de bord.'))
        } else {
          const placed = placedAfter([], null, cardsIn)
          const d = await api.post<Dashboard>('/v1/dashboards', { name: p.name, folder: me?.personal_folder, cards: placed })
          router.push(`/dashboard/${d.id}`)
        }
      } else {
        const table = await api.get<TableMeta>(`/v1/tables/${p.table}`)
        if (p.patch.label || p.patch.description) await api.patch(`/v1/tables/${p.table}`, p.patch)
        for (const col of p.columns) {
          const target = table.columns?.find((c) => c.name === col.name)
          if (!target) continue
          await api.patch(`/v1/columns/${target.id}`, {
            ...(col.label ? { label: col.label } : {}),
            ...(col.description ? { description: col.description } : {}),
            ...(col.semantic ? { semantic: col.semantic } : {}),
          })
        }
        await qc.invalidateQueries({ queryKey: keys.table(p.table) })
        toast.success($t('Description appliquée.'))
      }
      setApplied(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  const Icon = p.kind === 'question' ? BarChart3 : p.kind === 'dashboard' ? LayoutDashboard : Table2
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <Icon className="size-4 text-violet-500" />
        <span className="flex-1 truncate text-sm font-medium">
          {p.kind === 'metadata' ? $t('Description de la table') : p.name}
        </span>
        <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">{$t('Proposition')}</span>
      </div>
      <div className="max-h-56 space-y-1 overflow-y-auto px-3 py-2 text-xs">
        {p.kind === 'question' ? (
          <SqlCode sql={(p.query as { sql?: string }).sql ?? ''} className="text-[11.5px]" />
        ) : p.kind === 'dashboard' ? (
          p.cards.map((c) => (
            <div key={c.title} className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-primary" />
              <span className="flex-1 truncate">{c.title}</span>
              <span className="text-muted-foreground">{c.visualization.type in VIZ_LABELS ? $t(VIZ_LABELS[c.visualization.type as keyof typeof VIZ_LABELS]) : c.visualization.type}</span>
            </div>
          ))
        ) : (
          <>
            {p.patch.description ? <p className="text-muted-foreground">{p.patch.description}</p> : null}
            {p.columns.map((c) => (
              <div key={c.name} className="flex gap-2">
                <span className="w-28 shrink-0 truncate font-mono">{c.name}</span>
                <span className="flex-1 truncate">{c.label}</span>
                {c.semantic ? <span className="text-muted-foreground">{c.semantic in SEMANTIC_LABELS ? $t(SEMANTIC_LABELS[c.semantic as keyof typeof SEMANTIC_LABELS]) : c.semantic}</span> : null}
              </div>
            ))}
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t px-3 py-2">
        <Button size="sm" variant={applied ? 'ghost' : 'default'} onClick={apply} disabled={busy || applied}>
          {busy ? <Loader2 className="animate-spin" /> : applied ? <Check /> : <Plus />}
          {applied ? $t('Appliquée') : p.kind === 'question' ? $t('Ouvrir') : $t('Appliquer')}
        </Button>
      </div>
    </div>
  )
}

/** The panel's conversation, kept while it is closed — and, by its id, across a reload. */
const kept: { entries: Entry[]; conversation: string | null } = { entries: [], conversation: null }
const KEPT_KEY = 'eodia:copilot-conversation'

interface ConversationSummary {
  readonly id: string
  readonly context_kind: string
  readonly title: string
  readonly updated_at: string
}

type ShownPart =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; ok: boolean; summary?: string }
  | { type: 'proposal'; proposal: Proposal }
  | { type: 'chart'; chart: Chart }

/** A conversation read back, in the panel's form: the words, the steps, the proposals. */
const entriesOf = (turns: readonly ({ role: 'user'; text: string } | { role: 'assistant'; parts: ShownPart[] })[]): Entry[] =>
  turns.map((t) =>
    t.role === 'user'
      ? { role: 'user', text: t.text }
      : {
          role: 'assistant',
          text: t.parts
            .filter((x): x is Extract<ShownPart, { type: 'text' }> => x.type === 'text')
            .map((x) => x.text)
            .join('\n\n'),
          tools: t.parts.filter((x): x is Extract<ShownPart, { type: 'tool' }> => x.type === 'tool').map((x) => ({ name: x.name, ok: x.ok, ...(x.summary ? { summary: x.summary } : {}) })),
          proposals: t.parts.filter((x): x is Extract<ShownPart, { type: 'proposal' }> => x.type === 'proposal').map((x) => x.proposal),
          charts: t.parts.filter((x): x is Extract<ShownPart, { type: 'chart' }> => x.type === 'chart').map((x) => x.chart),
          done: true,
        },
  )

const CONTEXT_ICONS: Record<string, typeof Search> = { general: Database, sql: Code2, question: BarChart3, dashboard: LayoutDashboard, structure: Table2 }

export function CopilotPanel() {
  const close = useUi((s) => s.closeCopilot)
  const context = useUi((s) => s.copilotContext)
  const takePrompt = useUi((s) => s.takeCopilotPrompt)
  const prompt = useUi((s) => s.copilotPrompt)
  const qc = useQueryClient()
  const [entries, setEntries] = useState<Entry[]>(() => kept.entries)
  const [conversation, setConversation] = useState<string | null>(() => kept.conversation)
  const [showHistory, setShowHistory] = useState(false)
  // After a reload: the conversation one had, by the id kept in the browser.
  const [restoring] = useState<string | null>(() => {
    if (kept.entries.length) return null
    try {
      return localStorage.getItem(KEPT_KEY)
    } catch {
      return null
    }
  })
  // Kept for the next opening; its id, for the next visit.
  useEffect(() => {
    kept.entries = entries
    kept.conversation = conversation
    try {
      if (conversation) localStorage.setItem(KEPT_KEY, conversation)
    } catch {}
  }, [entries, conversation])
  const load = async (id: string) => {
    abort.current?.abort()
    try {
      const c = await api.get<{ id: string; turns: Parameters<typeof entriesOf>[0] }>(`/v1/copilot/conversations/${id}`)
      setEntries(entriesOf(c.turns))
      setConversation(c.id)
    } catch {
      setEntries([])
      setConversation(null)
    }
  }
  // After a reload: the conversation one had, read back once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when the panel first opens
  useEffect(() => {
    if (restoring) void load(restoring)
  }, [])
  const startOver = () => {
    abort.current?.abort()
    setEntries([])
    setConversation(null)
    setShowHistory(false)
    try {
      localStorage.removeItem(KEPT_KEY)
    } catch {}
  }
  const [text, setText] = useState('')
  const [allowRun, setAllowRun] = useState(false)
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the field grows with what is typed
  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [entries])

  const send = async (message: string) => {
    if (!message.trim() || busy) return
    setShowHistory(false)
    setText('')
    setBusy(true)
    const controller = new AbortController()
    abort.current = controller
    setEntries((e) => [...e, { role: 'user', text: message }, { role: 'assistant', text: '', tools: [], proposals: [], done: false }])
    const update = (fn: (a: Extract<Entry, { role: 'assistant' }>) => Extract<Entry, { role: 'assistant' }>) =>
      setEntries((list) => {
        const copy = [...list]
        const last = copy[copy.length - 1]
        if (last?.role === 'assistant') copy[copy.length - 1] = fn(last)
        return copy
      })
    // The answer's last words — after its last tool —, read aloud if the question was spoken.
    let said = ''
    try {
      for await (const { event, data } of postStream('/v1/copilot', { ...(conversation ? { conversation } : {}), message, allow_run: allowRun, context }, controller.signal)) {
        const d = data as Record<string, unknown>
        if (event === 'conversation') setConversation(String(d.id))
        else if (event === 'text') {
          said += String(d.delta)
          update((a) => ({ ...a, text: a.text + String(d.delta) }))
        } else if (event === 'tool') {
          said = ''
          update((a) => ({ ...a, tools: [...a.tools, { name: String(d.name) }] }))
        }
        else if (event === 'tool_result')
          update((a) => {
            const tools = [...a.tools]
            const i = tools.map((t) => t.name).lastIndexOf(String(d.name))
            if (i >= 0) tools[i] = { name: String(d.name), ok: Boolean(d.ok), summary: String(d.summary ?? '') }
            return { ...a, tools }
          })
        else if (event === 'proposal') update((a) => ({ ...a, proposals: [...a.proposals, d.proposal as Proposal] }))
        // A chart the copilot shows: drawn here, its query run under the person's identity.
        else if (event === 'chart') update((a) => ({ ...a, charts: [...(a.charts ?? []), d.chart as Chart] }))
        // Filters for the dashboard on screen: set at once, Back undoes them.
        else if (event === 'filters') useUi.getState().dashboardFilters?.apply(d.values as Record<string, unknown>)
        else if (event === 'error') update((a) => ({ ...a, error: String(d.message) }))
      }
    } catch (err) {
      if (!controller.signal.aborted) update((a) => ({ ...a, error: err instanceof Error ? err.message : String(err) }))
    } finally {
      update((a) => ({ ...a, done: true }))
      setBusy(false)
      if (!controller.signal.aborted) speakReply(said)
    }
  }

  // A prompt handed by a screen (« Décrire avec le copilote ») is sent as soon as it arrives.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fire once per prompt
  useEffect(() => {
    const p = takePrompt()
    if (p) {
      setEntries([])
      setConversation(null)
      void send(p)
    }
  }, [prompt])

  const contextLabel = {
    general: $t('Toutes les données'),
    sql: $t('Éditeur SQL'),
    question: $t('Question en cours'),
    dashboard: $t('Tableau de bord'),
    structure: $t('Sources de données'),
  }[context.kind]
  const ContextIcon = { general: Database, sql: Code2, question: BarChart3, dashboard: LayoutDashboard, structure: Table2 }[context.kind]
  // What one may ask from here: the screen decides.
  const suggestions =
    context.kind === 'dashboard'
      ? [
          context.filters?.length ? $t('Seulement les 3 derniers mois') : null,
          $t('Que faut-il retenir de ce tableau de bord ?'),
          $t('Ajoute une carte du chiffre d’affaires par mois'),
        ].filter((x): x is string => !!x)
      : context.kind === 'sql'
        ? [$t('Explique cette requête'), $t('Corrige l’erreur'), $t('Rends-la plus rapide')]
        : context.kind === 'structure'
          ? [$t('Décris cette table et ses colonnes')]
          : [
              $t('Quel est le chiffre d’affaires par région sur les 6 derniers mois ?'),
              $t('Construis un tableau de bord du service client.'),
              $t('Quels clients ont passé le plus de commandes cette année ?'),
            ]

  return (
    <Pane as="aside" id="copilot" side="right" defaultSize={420} min={320} max={760} className="relative flex flex-col overflow-hidden border-l bg-background">
      {/* A light from the top, as on the assistant's screen. */}
      <div aria-hidden className="ai-glow pointer-events-none absolute inset-x-0 top-0 h-72" />
      <div className="relative z-10 flex h-[54px] shrink-0 items-center gap-2.5 px-4">
        <Orb size={22} busy={busy} />
        <span className="text-[15px] font-semibold tracking-tight">{$t('Copilote')}</span>
        <span className="inline-flex min-w-0 items-center gap-1 truncate rounded-full bg-muted/80 px-2 py-0.5 text-[11.5px] text-muted-foreground">
          <ContextIcon className="size-3 shrink-0" />
          <span className="truncate">{contextLabel}</span>
        </span>
        <span className="flex-1" />
        <Hint label={$t('Historique')}>
          <Button variant="ghost" size="icon-sm" aria-label={$t('Historique')} aria-pressed={showHistory} className={cn(showHistory && 'bg-muted')} onClick={() => setShowHistory((v) => !v)}>
            <History className="size-4" />
          </Button>
        </Hint>
        <Hint label={$t('Nouvelle conversation')}>
          <Button variant="ghost" size="icon-sm" aria-label={$t('Nouvelle conversation')} disabled={entries.length === 0 && !showHistory} onClick={startOver}>
            <SquarePen className="size-4" />
          </Button>
        </Hint>
        <Hint label={`${$t('Fermer')} (Ctrl+J)`}>
          <Button variant="ghost" size="icon-sm" onClick={close} aria-label={$t('Fermer')}>
            <X className="size-4" />
          </Button>
        </Hint>
      </div>
      {showHistory ? (
        <CopilotHistory
          current={conversation}
          onOpen={(id) => {
            setShowHistory(false)
            void load(id)
          }}
          onDeleted={(id) => {
            if (id === conversation) startOver()
            void qc.invalidateQueries({ queryKey: ['copilot-conversations'] })
          }}
        />
      ) : (
      <div className="relative z-10 flex-1 space-y-5 overflow-y-auto px-4 pt-2 pb-4">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 pt-10 text-center">
            <Orb size={56} />
            <h3 className="mt-2 text-lg font-semibold tracking-tight">{$t('Que puis-je faire pour vous ?')}</h3>
            <p className="max-w-[300px] text-[13px] leading-relaxed text-muted-foreground">
              {context.kind === 'dashboard'
                ? $t('Filtrez ce tableau de bord en le disant, demandez ce qu’il faut en retenir ou faites-y ajouter des cartes.')
                : $t('Posez une question sur vos données : le copilote cherche les tables, écrit le SQL et vous propose des questions ou des tableaux de bord à appliquer.')}
            </p>
            <div className="mt-3 flex w-full flex-col gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="group flex w-full items-center gap-2.5 rounded-xl border bg-card/80 px-3.5 py-2.5 text-left text-[13.5px] backdrop-blur transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-[0_8px_24px_-16px_rgba(31,138,58,0.5)]"
                >
                  <Sparkles className="size-3.5 shrink-0 text-violet-500" />
                  <span className="flex-1">{s}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {entries.map((e, i) =>
          e.role === 'user' ? (
            <div key={i} className="ai-rise ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[13.5px] leading-relaxed text-primary-foreground shadow-[0_6px_16px_-10px_color-mix(in_oklab,var(--primary)_70%,transparent)]">
              {e.text}
            </div>
          ) : (
            <div key={i} className="ai-rise flex gap-2.5">
              <Orb size={18} busy={!e.done} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
              {e.tools.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {e.tools.map((t, j) => {
                    const [label, Icon] = TOOL_LABELS[t.name] ?? [t.name, Wrench]
                    return (
                      <span key={j} className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px]', t.ok === false ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-muted/70 text-muted-foreground')}>
                        {t.ok === undefined ? <Loader2 className="size-3 shrink-0 animate-spin" /> : <Icon className="size-3 shrink-0" />}
                        <span className="truncate">{$t(label)}</span>
                        {t.summary ? <span className="truncate opacity-70">· {t.summary}</span> : null}
                      </span>
                    )
                  })}
                </div>
              ) : null}
              {e.text ? (
                <div className="prose-sm max-w-none text-[13.5px] leading-relaxed [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_li]:ml-4 [&_ol]:list-decimal [&_p]:my-1.5 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-code [&_pre]:p-3 [&_pre]:text-code-foreground [&_pre_code]:bg-transparent [&_table]:my-2 [&_table]:text-xs [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2 [&_ul]:list-disc">
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // A block of code — SQL above all — as the assistant shows it: laid out, coloured, to copy.
                      code: ({ className, children }) => {
                        const text = String(children ?? '')
                        const language = /language-(\w+)/.exec(className ?? '')?.[1]
                        if (language || text.includes('\n')) return <CodeBlock language={language ?? ''}>{text.replace(/\n$/, '')}</CodeBlock>
                        return <code>{children}</code>
                      },
                      pre: ({ children }) => <>{children}</>,
                    }}
                  >
                    {tidyFences(e.text)}
                  </Markdown>
                </div>
              ) : !e.done && e.tools.length === 0 ? (
                <span className="ai-shimmer text-[13px]">{$t('Réflexion…')}</span>
              ) : null}
              {(e.charts ?? []).map((c) => (
                <ChartPart key={c.id} chart={c} />
              ))}
              {e.proposals.map((p) => (
                <ProposalCard key={p.id} p={p} />
              ))}
              {e.error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{e.error}</p> : null}
              </div>
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>
      )}
      {/* The field, as in every chat: the words, and inside it, the microphone and the arrow. */}
      <form
        className="relative z-10 shrink-0 px-3 pt-1 pb-3"
        onSubmit={(e) => {
          e.preventDefault()
          void send(text)
        }}
      >
        <div className="rounded-[22px] bg-gradient-to-r from-primary/35 via-cyan-400/35 to-violet-500/35 p-px shadow-[0_8px_28px_-14px_rgba(0,0,0,.25)] transition-shadow focus-within:from-primary focus-within:via-cyan-400 focus-within:to-violet-500">
          <div className="rounded-[21px] bg-background">
            <textarea
              ref={field}
              value={text}
              rows={1}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void send(text)
                }
              }}
              placeholder={$t('Demandez au copilote…')}
              className="block max-h-40 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[14px] leading-6 outline-none placeholder:text-muted-foreground/70"
            />
            <div className="flex items-center gap-1 px-2 pb-2">
              <Hint label={allowRun ? $t('Le copilote peut exécuter des requêtes, sous vos droits') : $t('Autoriser le copilote à exécuter des requêtes, sous vos droits')}>
                <button
                  type="button"
                  onClick={() => setAllowRun((v) => !v)}
                  aria-pressed={allowRun}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium transition-colors',
                    allowRun ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Play className={cn('size-3', allowRun && 'fill-current')} />
                  {$t('Autoriser l’accès')}
                </button>
              </Hint>
              <span className="flex-1" />
              <VoiceButton onText={setText} onSend={(t) => void send(t)} disabled={busy} className="size-8" />
              {busy ? (
                <Hint label={$t('Arrêter')}>
                  <button
                    type="button"
                    onClick={() => abort.current?.abort()}
                    aria-label={$t('Arrêter')}
                    className="flex size-8 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105"
                  >
                    <Square className="size-3 fill-current" />
                  </button>
                </Hint>
              ) : (
                <button
                  type="submit"
                  disabled={!text.trim()}
                  aria-label={$t('Envoyer')}
                  className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-all hover:scale-105 disabled:scale-100 disabled:bg-muted disabled:text-muted-foreground"
                >
                  <ArrowUp className="size-4" strokeWidth={2.4} />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </Pane>
  )
}

/** The panel's past conversations: one to take up again, or to delete. */
function CopilotHistory({ current, onOpen, onDeleted }: { current: string | null; onOpen: (id: string) => void; onDeleted: (id: string) => void }) {
  const { data: list = [], isLoading } = useQuery({
    queryKey: ['copilot-conversations', 'panel'],
    queryFn: () => api.get<ConversationSummary[]>('/v1/copilot/conversations?kind=panel'),
  })
  const remove = async (id: string) => {
    try {
      await api.delete(`/v1/copilot/conversations/${id}`)
      onDeleted(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <div className="relative z-10 flex-1 overflow-y-auto px-3 pt-1 pb-4">
      <div className="px-1 pb-2 text-xs font-medium text-muted-foreground">{$t('Conversations récentes')}</div>
      {isLoading ? <Loader2 className="mx-auto mt-6 size-4 animate-spin text-muted-foreground" /> : null}
      {!isLoading && list.length === 0 ? <p className="px-1 pt-6 text-center text-sm text-muted-foreground">{$t('Aucune conversation pour l’instant.')}</p> : null}
      <div className="space-y-0.5">
        {list.map((c) => {
          const Icon = CONTEXT_ICONS[c.context_kind] ?? Sparkles
          return (
            <div key={c.id} className={cn('group flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-muted/70', c.id === current && 'bg-muted')}>
              <button type="button" onClick={() => onOpen(c.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300">
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{c.title || $t('Sans titre')}</span>
                  <span className="block text-[11.5px] text-muted-foreground">{formatAgo(c.updated_at)}</span>
                </span>
              </button>
              <Hint label={$t('Supprimer')}>
                <button
                  type="button"
                  onClick={() => void remove(c.id)}
                  aria-label={$t('Supprimer la conversation')}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background hover:text-destructive focus-visible:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </Hint>
            </div>
          )
        })}
      </div>
    </div>
  )
}
