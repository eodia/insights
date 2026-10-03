'use client'

import { type Proposal, ProposalCard, stashDraft } from '@/components/app/copilot'
import { VIZ_ICONS } from '@/components/app/question/viz-settings'
import { Visualization } from '@/components/app/visualization'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Hint } from '@/components/ui/tooltip'
import { type RunResult, api } from '@/lib/api'
import { formatCount } from '@/lib/format'
import { $t, $tp, msg } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { VIZ_LABELS, vizFits } from '@/lib/viz'
import type { VisualizationType } from '@eodia/contracts'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Database,
  Ellipsis,
  ExternalLink,
  LayoutDashboard,
  Search,
  Table2,
  Wrench,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type ReactNode, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'

/** A chart the assistant shows: its question, run here under the person's identity. */
export interface Chart {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly query: { kind: string; sql?: string }
  readonly visualization: { type: string }
}

export type Part =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'tool'
      readonly name: string
      readonly ok?: boolean
      readonly summary?: string
    }
  | { readonly type: 'chart'; readonly chart: Chart }
  | { readonly type: 'proposal'; readonly proposal: Proposal }

const STEPS: Record<string, [string, typeof Search]> = {
  search_schema: [msg('Recherche dans le schéma'), Search],
  describe_table: [msg('Lecture de la table'), Table2],
  list_metrics: [msg('Lecture des métriques'), BarChart3],
  run_query: [msg('Exécution de la requête'), Database],
  show_chart: [msg('Préparation du graphique'), BarChart3],
  propose_question: [msg('Proposition de question'), BarChart3],
  propose_dashboard: [msg('Proposition de tableau de bord'), LayoutDashboard],
  propose_metadata: [msg('Proposition de description'), Table2],
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success($t('Copié dans le presse-papiers'))
  } catch {
    toast.error($t('Copie impossible : sélectionnez le texte à la main.'))
  }
}

/** What the assistant did to answer: one line of small steps, the running one shimmering. */
export function Steps({ steps }: { steps: readonly Extract<Part, { type: 'tool' }>[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => {
        const [label, Icon] = STEPS[s.name] ?? [s.name, Wrench]
        const running = s.ok === undefined
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: steps come in order and stay
            key={i}
            className={cn(
              'ai-rise inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-2.5 py-1 text-xs backdrop-blur',
              s.ok === false
                ? 'border-red-200 text-red-600 dark:border-red-900 dark:text-red-400'
                : 'text-muted-foreground',
            )}
          >
            {running ? (
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            ) : s.ok ? (
              <Check className="size-3 text-primary" />
            ) : (
              <Icon className="size-3" />
            )}
            <span className={running ? 'ai-shimmer' : ''}>{$t(label)}</span>
            {s.summary ? <span className="max-w-40 truncate opacity-70">· {s.summary}</span> : null}
          </span>
        )
      })}
    </div>
  )
}

function CodeBlock({ language, children }: { language: string; children: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="my-3 overflow-hidden rounded-xl border bg-code text-code-foreground">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-[11px] text-code-foreground/60">
        <span className="font-mono uppercase tracking-wide">{language || 'code'}</span>
        <button
          type="button"
          onClick={async () => {
            await copy(children)
            setDone(true)
            setTimeout(() => setDone(false), 1500)
          }}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10"
        >
          {done ? <Check className="size-3" /> : <Copy className="size-3" />}{' '}
          {done ? $t('Copié') : $t('Copier')}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-[12.5px] leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  )
}

/** The assistant's prose: Markdown laid out to be read — headings, lists, tables, code. */
export function Prose({ text }: { text: string }) {
  return (
    <div className="text-[15px] leading-7 text-foreground/90 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-6 mb-2 text-xl font-semibold tracking-tight text-foreground">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-5 mb-2 text-lg font-semibold tracking-tight text-foreground">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-4 mb-1.5 text-base font-semibold text-foreground">{children}</h3>
          ),
          p: ({ children }) => <p className="my-2.5">{children}</p>,
          ul: ({ children }) => (
            <ul className="my-2.5 list-disc space-y-1 pl-6 marker:text-primary">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2.5 list-decimal space-y-1 pl-6 marker:text-muted-foreground">
              {children}
            </ol>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-primary/50 pl-4 text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-5 border-border" />,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
              {children}
            </thead>
          ),
          th: ({ children }) => <th className="px-3 py-2 font-medium">{children}</th>,
          td: ({ children }) => <td className="border-t px-3 py-2 tabular-nums">{children}</td>,
          code: ({ className, children }) => {
            const text = String(children ?? '')
            const language = /language-(\w+)/.exec(className ?? '')?.[1]
            if (language || text.includes('\n'))
              return <CodeBlock language={language ?? ''}>{text.replace(/\n$/, '')}</CodeBlock>
            return (
              <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
                {children}
              </code>
            )
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {text}
      </Markdown>
    </div>
  )
}

const QUICK: readonly VisualizationType[] = ['bar', 'line', 'area', 'pie', 'table']

/** A chart in the conversation: run here, switchable, and taken further in a click. */
export function ChartPart({ chart }: { chart: Chart }) {
  const router = useRouter()
  const [type, setType] = useState<VisualizationType>(chart.visualization.type as VisualizationType)
  const [sql, setSql] = useState(false)
  const run = useQuery({
    queryKey: ['assistant-chart', chart.id, chart.query.sql],
    queryFn: () => api.post<RunResult>('/v1/query', { query: chart.query }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
  const types = [
    ...new Set<VisualizationType>([chart.visualization.type as VisualizationType, ...QUICK]),
  ].filter((t) => !run.data || vizFits(t, run.data) || t === chart.visualization.type)
  const open = () => {
    stashDraft({
      name: chart.title,
      description: chart.description,
      query: chart.query,
      visualization: { type },
    })
    router.push('/question/new?draft=1')
  }
  let body: ReactNode
  if (run.isPending) {
    body = (
      <div className="flex h-full flex-col justify-end gap-2 p-4">
        <div className="flex h-full items-end gap-2">
          {[40, 65, 50, 80, 60, 90, 70].map((h, i) => (
            <div
              key={h}
              className="flex-1 animate-pulse rounded-t-md bg-muted"
              style={{ height: `${h}%`, animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
    )
  } else if (run.error) {
    body = (
      <div className="flex h-full items-center justify-center gap-2 px-6 text-center text-sm text-destructive">
        <AlertTriangle className="size-4 shrink-0" /> {(run.error as Error).message}
      </div>
    )
  } else if (run.data) {
    body = <Visualization result={run.data} viz={{ type }} />
  }
  return (
    <div className="ai-rise my-3 overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_-8px_rgba(0,0,0,.08)]">
      <div className="flex items-start gap-3 px-4 pt-3.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{chart.title}</div>
          {chart.description ? (
            <div className="truncate text-xs text-muted-foreground">{chart.description}</div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
          {types.slice(0, 5).map((t) => {
            const Icon = VIZ_ICONS[t]
            return (
              <Hint key={t} label={$t(VIZ_LABELS[t])}>
                <button
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    'rounded-md p-1.5 transition-colors',
                    type === t
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-label={$t(VIZ_LABELS[t])}
                  aria-pressed={type === t}
                >
                  <Icon className="size-3.5" />
                </button>
              </Hint>
            )
          })}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={$t('Plus')}>
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={open}>
              <ExternalLink /> {$t('Ouvrir comme question')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSql((v) => !v)}>
              <Code2 /> {sql ? $t('Masquer le SQL') : $t('Voir le SQL')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void copy(chart.query.sql ?? '')}>
              <Copy /> {$t('Copier le SQL')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className={cn('px-2 pb-2', type === 'table' ? 'h-80' : 'h-72')}>{body}</div>
      {sql ? (
        <pre className="max-h-52 overflow-auto border-t bg-code px-4 py-3 font-mono text-xs text-code-foreground">
          {chart.query.sql}
        </pre>
      ) : null}
      <div className="flex items-center gap-2 border-t bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
        <Database className="size-3" />
        {run.data
          ? $tp(run.data.rows.length, '{count} ligne', '{count} lignes', {
              count: formatCount(run.data.rows.length),
            })
          : $t('Exécution sous vos droits…')}
        <span className="flex-1" />
        <button
          type="button"
          onClick={open}
          className="flex items-center gap-1 font-medium text-foreground/80 hover:text-primary"
        >
          {$t('Enregistrer comme question')} <ChevronDown className="size-3 -rotate-90" />
        </button>
      </div>
    </div>
  )
}

/** One answer: its steps, prose, charts and proposals, in the order they came. */
export function AnswerParts({ parts }: { parts: readonly Part[] }) {
  const groups: (Part | { type: 'steps'; steps: Extract<Part, { type: 'tool' }>[] })[] = []
  for (const p of parts) {
    const last = groups[groups.length - 1]
    if (p.type === 'tool') {
      if (last && last.type === 'steps') last.steps.push(p)
      else groups.push({ type: 'steps', steps: [p] })
    } else groups.push(p)
  }
  return (
    <div className="space-y-2">
      {groups.map((g, i) =>
        g.type === 'steps' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts come in order and stay
          <Steps key={i} steps={g.steps} />
        ) : g.type === 'text' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts come in order and stay
          <Prose key={i} text={g.text} />
        ) : g.type === 'chart' ? (
          <ChartPart key={g.chart.id} chart={g.chart} />
        ) : g.type === 'proposal' ? (
          <ProposalCard key={g.proposal.id} p={g.proposal} />
        ) : null,
      )}
    </div>
  )
}
