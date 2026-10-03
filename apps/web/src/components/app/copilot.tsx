'use client'

import type { Dashboard, DashboardCard, TableMeta } from '@eodia/contracts'
import { DASHBOARD_COLUMNS, SEMANTIC_LABELS, cardSize, placedAfter } from '@eodia/contracts'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Hint } from '@/components/ui/tooltip'
import { api, postStream } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { keys, useMe } from '@/lib/queries'
import { useUi } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Database, History, LayoutDashboard, Loader2, Plus, Search, Send, Sparkles, Table2, Wrench, X, BarChart3 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'

type Proposal =
  | { id: string; kind: 'question'; name: string; description?: string; query: unknown; visualization: unknown }
  | { id: string; kind: 'dashboard'; dashboard?: string; name: string; cards: { title: string; query: unknown; visualization: { type: string }; w: number }[] }
  | { id: string; kind: 'metadata'; table: string; patch: { label?: string; description?: string }; columns: { name: string; label?: string; description?: string; semantic?: string }[] }

type Entry =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; tools: { name: string; ok?: boolean; summary?: string }[]; proposals: Proposal[]; error?: string; done: boolean }

const TOOL_LABELS: Record<string, [string, typeof Search]> = {
  search_schema: ['Recherche dans le schéma', Search],
  describe_table: ['Lecture de la table', Table2],
  list_metrics: ['Lecture des métriques', BarChart3],
  run_query: ['Exécution de la requête', Database],
  propose_question: ['Proposition de question', BarChart3],
  propose_dashboard: ['Proposition de tableau de bord', LayoutDashboard],
  propose_metadata: ['Proposition de description', Table2],
}

/** Hands a draft question to the question page, which opens it. */
export function stashDraft(draft: unknown): void {
  sessionStorage.setItem('eodia-draft', JSON.stringify(draft))
}

function ProposalCard({ p }: { p: Proposal }) {
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
        if (p.dashboard) {
          const d = await api.get<Dashboard>(`/v1/dashboards/${p.dashboard}`)
          const tab = d.tabs[0]?.id ?? null
          const placed = placedAfter(d.cards, tab, cardsIn.map((c) => ({ ...c, tab })))
          await api.patch(`/v1/dashboards/${p.dashboard}`, { cards: [...d.cards, ...placed] })
          await qc.invalidateQueries({ queryKey: keys.dashboard(p.dashboard) })
          toast.success($t('{n} cartes ajoutées au tableau de bord.', { n: placed.length }))
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
          <pre className="font-mono whitespace-pre-wrap text-muted-foreground">{(p.query as { sql?: string }).sql}</pre>
        ) : p.kind === 'dashboard' ? (
          p.cards.map((c) => (
            <div key={c.title} className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-primary" />
              <span className="flex-1 truncate">{c.title}</span>
              <span className="text-muted-foreground">{c.visualization.type}</span>
            </div>
          ))
        ) : (
          <>
            {p.patch.description ? <p className="text-muted-foreground">{p.patch.description}</p> : null}
            {p.columns.map((c) => (
              <div key={c.name} className="flex gap-2">
                <span className="w-28 shrink-0 truncate font-mono">{c.name}</span>
                <span className="flex-1 truncate">{c.label}</span>
                {c.semantic ? <span className="text-muted-foreground">{SEMANTIC_LABELS[c.semantic as keyof typeof SEMANTIC_LABELS] ?? c.semantic}</span> : null}
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

export function CopilotPanel() {
  const close = useUi((s) => s.closeCopilot)
  const context = useUi((s) => s.copilotContext)
  const takePrompt = useUi((s) => s.takeCopilotPrompt)
  const prompt = useUi((s) => s.copilotPrompt)
  const [entries, setEntries] = useState<Entry[]>([])
  const [conversation, setConversation] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [allowRun, setAllowRun] = useState(false)
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [entries])

  const send = async (message: string) => {
    if (!message.trim() || busy) return
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
    try {
      for await (const { event, data } of postStream('/v1/copilot', { conversation, message, allow_run: allowRun, context }, controller.signal)) {
        const d = data as Record<string, unknown>
        if (event === 'conversation') setConversation(String(d.id))
        else if (event === 'text') update((a) => ({ ...a, text: a.text + String(d.delta) }))
        else if (event === 'tool') update((a) => ({ ...a, tools: [...a.tools, { name: String(d.name) }] }))
        else if (event === 'tool_result')
          update((a) => {
            const tools = [...a.tools]
            const i = tools.map((t) => t.name).lastIndexOf(String(d.name))
            if (i >= 0) tools[i] = { name: String(d.name), ok: Boolean(d.ok), summary: String(d.summary ?? '') }
            return { ...a, tools }
          })
        else if (event === 'proposal') update((a) => ({ ...a, proposals: [...a.proposals, d.proposal as Proposal] }))
        else if (event === 'error') update((a) => ({ ...a, error: String(d.message) }))
      }
    } catch (err) {
      if (!controller.signal.aborted) update((a) => ({ ...a, error: err instanceof Error ? err.message : String(err) }))
    } finally {
      update((a) => ({ ...a, done: true }))
      setBusy(false)
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
    structure: $t('Structure'),
  }[context.kind]

  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l bg-background">
      <div className="flex h-[54px] items-center gap-2 border-b px-4">
        <Sparkles className="size-4 text-violet-500" />
        <span className="font-semibold">{$t('Copilote')}</span>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{contextLabel}</span>
        <span className="flex-1" />
        <Hint label={$t('Nouvelle conversation')}>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              abort.current?.abort()
              setEntries([])
              setConversation(null)
            }}
          >
            <History className="size-4" />
          </Button>
        </Hint>
        <Button variant="ghost" size="icon-sm" onClick={close} aria-label={$t('Fermer')}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {entries.length === 0 ? (
          <div className="space-y-3 pt-6 text-center">
            <span className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-950">
              <Sparkles className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">{$t('Posez une question sur vos données : le copilote cherche les tables, écrit le SQL et vous propose des questions ou des tableaux de bord à appliquer.')}</p>
            <div className="space-y-2 pt-2">
              {[
                $t('Quel est le chiffre d’affaires par région sur les 6 derniers mois ?'),
                $t('Construis un tableau de bord du service client.'),
                $t('Quels clients ont passé le plus de commandes cette année ?'),
              ].map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="block w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {entries.map((e, i) =>
          e.role === 'user' ? (
            <div key={i} className="ml-10 rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">
              {e.text}
            </div>
          ) : (
            <div key={i} className="space-y-2">
              {e.tools.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {e.tools.map((t, j) => {
                    const [label, Icon] = TOOL_LABELS[t.name] ?? [t.name, Wrench]
                    return (
                      <span key={j} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs', t.ok === false ? 'border-red-200 text-red-600' : 'text-muted-foreground')}>
                        {t.ok === undefined ? <Loader2 className="size-3 animate-spin" /> : <Icon className="size-3" />}
                        {$t(label)}
                        {t.summary ? <span className="opacity-70">· {t.summary}</span> : null}
                      </span>
                    )
                  })}
                </div>
              ) : null}
              {e.text ? (
                <div className="prose-sm max-w-none text-sm leading-relaxed [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_li]:ml-4 [&_ol]:list-decimal [&_p]:my-1.5 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-code [&_pre]:p-3 [&_pre]:text-code-foreground [&_pre_code]:bg-transparent [&_table]:my-2 [&_table]:text-xs [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2 [&_ul]:list-disc">
                  <Markdown remarkPlugins={[remarkGfm]}>{e.text}</Markdown>
                </div>
              ) : !e.done && e.tools.length === 0 ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : null}
              {e.proposals.map((p) => (
                <ProposalCard key={p.id} p={p} />
              ))}
              {e.error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{e.error}</p> : null}
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>
      <form
        className="space-y-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void send(text)
        }}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(text)
            }
          }}
          rows={3}
          placeholder={$t('Demandez au copilote…')}
          className="resize-none"
        />
        <div className="flex items-center gap-2">
          <label className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={allowRun} onCheckedChange={setAllowRun} />
            {$t('Autoriser l’exécution de requêtes (sous vos droits)')}
          </label>
          {busy ? (
            <Button type="button" size="sm" variant="outline" onClick={() => abort.current?.abort()}>
              {$t('Arrêter')}
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!text.trim()}>
              <Send /> {$t('Envoyer')}
            </Button>
          )}
        </div>
      </form>
    </aside>
  )
}
