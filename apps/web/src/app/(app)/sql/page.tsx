'use client'

import type { Question, QueryExecution, Snippet, VisualizationType } from '@eodia/contracts'
import { sqlVariableNames } from '@eodia/contracts'
import { SaveDialog } from '@/components/app/dialogs'
import { KindIcon } from '@/components/app/question/pickers'
import { VizPicker } from '@/components/app/question/viz-settings'
import { type SqlError, SqlEditor } from '@/components/app/sql-editor'
import { DataTable, ResultFooter, Visualization } from '@/components/app/visualization'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Hint } from '@/components/ui/tooltip'
import { ApiError, type RunResult, api, download } from '@/lib/api'
import { formatAgo } from '@/lib/format'
import { $t } from '@/lib/i18n'
import { useDatasources, useMe, useSchemaTree } from '@/lib/queries'
import { useCrumbs, useUi } from '@/lib/store'
import { autoVisualization } from '@/lib/viz'
import { cn } from '@/lib/utils'
import { kindOfTrinoType } from '@eodia/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3,
  ChevronRight,
  Database,
  Download,
  FileCode2,
  History,
  Loader2,
  Play,
  Plus,
  Save,
  Sparkles,
  Square,
  Table2,
  Wand2,
  X,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Pane } from '@/components/ui/pane'
import { TabRow } from '@/components/ui/tab-row'

interface Tab {
  id: string
  name: string
  sql: string
  native: string | null
}

const STORE = 'eodia-sql-tabs'
const newTab = (n: number, sql = ''): Tab => ({ id: Math.random().toString(36).slice(2), name: `${$t('Requête')} ${n}`, sql, native: null })

function loadTabs(): Tab[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Tab[] | null
    if (raw?.length) return raw
  } catch {}
  return [newTab(1, 'SELECT *\nFROM boutique.public.commandes\nLIMIT 100')]
}

function SchemaBrowser({ onInsert }: { onInsert: (text: string) => void }) {
  const { data: tree } = useSchemaTree()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const toggle = (k: string) => setOpen((s) => {
    const n = new Set(s)
    n.has(k) ? n.delete(k) : n.add(k)
    return n
  })
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  return (
    <div className="flex h-full flex-col">
      <div className="p-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={$t('Filtrer les tables…')} className="h-8 text-sm" />
      </div>
      <div className="flex-1 overflow-y-auto px-1 pb-3 text-sm">
        {(tree?.datasources ?? []).map((ds) => (
          <div key={ds.id}>
            <button type="button" onClick={() => toggle(ds.id)} className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 font-medium hover:bg-accent">
              <ChevronRight className={cn('size-3.5 transition-transform', (open.has(ds.id) || q) && 'rotate-90')} />
              <Database className="size-3.5 text-indigo-500" />
              <span className="truncate">{ds.name}</span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">{ds.catalog}</span>
            </button>
            {open.has(ds.id) || q
              ? ds.tables
                  .filter((t) => !q || fold(`${t.name} ${t.label}`).includes(fold(q)))
                  .map((t) => {
                    const key = `${ds.id}.${t.id}`
                    const full = `${ds.catalog}.${t.schema}.${t.name}`
                    return (
                      <div key={t.id} className="pl-4">
                        <div className="group flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-accent">
                          <button type="button" onClick={() => toggle(key)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                            <ChevronRight className={cn('size-3 shrink-0 transition-transform', open.has(key) && 'rotate-90')} />
                            <Table2 className="size-3.5 shrink-0 text-teal-600" />
                            <span className="truncate">{t.name}</span>
                          </button>
                          <Hint label={$t('Insérer {name}', { name: full })}>
                            <button type="button" onClick={() => onInsert(full)} className="opacity-0 group-hover:opacity-100">
                              <Plus className="size-3.5 text-muted-foreground" />
                            </button>
                          </Hint>
                        </div>
                        {open.has(key)
                          ? t.columns.map((c) => (
                              <button key={c.name} type="button" onClick={() => onInsert(c.name)} className="flex w-full items-center gap-1.5 rounded-md py-0.5 pr-2 pl-9 text-left text-xs hover:bg-accent" title={c.label}>
                                <KindIcon kind={kindOfTrinoType(c.type)} />
                                <span className="truncate font-mono">{c.name}</span>
                                <span className="ml-auto truncate text-[10px] text-muted-foreground">{c.type}</span>
                              </button>
                            ))
                          : null}
                      </div>
                    )
                  })
              : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function SnippetsPanel({ onInsert, current }: { onInsert: (text: string) => void; current: string }) {
  const qc = useQueryClient()
  const { data = [] } = useQuery({ queryKey: ['snippets'], queryFn: () => api.get<Snippet[]>('/v1/snippets') })
  const [name, setName] = useState('')
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {data.map((s) => (
          <div key={s.id} className="group rounded-lg border p-2">
            <div className="flex items-center gap-2">
              <FileCode2 className="size-3.5 text-muted-foreground" />
              <span className="flex-1 truncate text-sm font-medium">{s.name}</span>
              <button type="button" className="text-xs text-primary opacity-0 group-hover:opacity-100" onClick={() => onInsert(`{{snippet: ${s.name}}}`)}>
                {$t('Citer')}
              </button>
              <button type="button" className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100" onClick={() => onInsert(s.content)}>
                {$t('Insérer')}
              </button>
              <button type="button" className="opacity-0 group-hover:opacity-100" onClick={async () => { await api.delete(`/v1/snippets/${s.id}`); await qc.invalidateQueries({ queryKey: ['snippets'] }) }}>
                <X className="size-3.5 text-muted-foreground" />
              </button>
            </div>
            <pre className="mt-1 line-clamp-3 font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">{s.content}</pre>
          </div>
        ))}
        {data.length === 0 ? <p className="p-3 text-xs text-muted-foreground">{$t('Un snippet est un fragment SQL réutilisable : citez-le avec {{snippet: nom}}.')}</p> : null}
      </div>
      <div className="space-y-2 border-t p-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={$t('Nom du snippet')} className="h-8 text-sm" />
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={!name.trim() || !current.trim()}
          onClick={async () => {
            try {
              await api.post('/v1/snippets', { name, content: current })
              setName('')
              await qc.invalidateQueries({ queryKey: ['snippets'] })
            } catch (err) {
              toast.error(err instanceof Error ? err.message : String(err))
            }
          }}
        >
          {$t('Enregistrer la sélection courante')}
        </Button>
      </div>
    </div>
  )
}

function HistoryPanel({ onOpen }: { onOpen: (sql: string) => void }) {
  const { data = [] } = useQuery({ queryKey: ['history', 'editor'], queryFn: () => api.get<QueryExecution[]>('/v1/history?origin=editor'), refetchInterval: 10_000 })
  return (
    <div className="h-full space-y-1 overflow-y-auto p-2">
      {data.map((h) => (
        <button key={h.id} type="button" onClick={() => onOpen(h.sql)} className="w-full rounded-lg border p-2 text-left hover:bg-accent">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className={cn('size-1.5 rounded-full', h.error ? 'bg-red-500' : 'bg-green-500')} />
            {formatAgo(h.at)}
            <span className="ml-auto tabular-nums">{h.duration_ms} ms</span>
          </div>
          <pre className="mt-1 line-clamp-3 font-mono text-[11px] whitespace-pre-wrap">{h.sql}</pre>
        </button>
      ))}
    </div>
  )
}

function SqlWorkspace() {
  const params = useSearchParams()
  const router = useRouter()
  const { data: me } = useMe()
  const { data: tree } = useSchemaTree()
  const { data: sources = [] } = useDatasources()
  const setCopilotContext = useUi((s) => s.setCopilotContext)
  const openCopilot = useUi((s) => s.openCopilot)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState<string>('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [side, setSide] = useState<'schema' | 'snippets' | 'history'>('schema')
  const [results, setResults] = useState<Record<string, { result?: RunResult; error?: ApiError; running?: boolean; execution?: string }>>({})
  const [view, setView] = useState<'table' | 'viz'>('table')
  const [vizType, setVizType] = useState<VisualizationType>('table')
  const [values, setValues] = useState<Record<string, string>>({})
  const [saveOpen, setSaveOpen] = useState(false)
  const editorApi = useRef<{ format: () => void; insert: (t: string) => void } | null>(null)
  useCrumbs([{ label: $t('Éditeur SQL') }])

  useEffect(() => {
    const loaded = loadTabs()
    const sql = params.get('sql')
    const next = sql ? [...loaded, newTab(loaded.length + 1, sql)] : loaded
    setTabs(next)
    setActive(next[next.length - 1]?.id ?? '')
    if (sql) router.replace('/sql')
    // biome-ignore lint/correctness/useExhaustiveDependencies: once
  }, [])
  useEffect(() => {
    if (tabs.length) localStorage.setItem(STORE, JSON.stringify(tabs))
  }, [tabs])

  const tab = tabs.find((t) => t.id === active)
  const state = tab ? results[tab.id] ?? {} : {}
  const variables = useMemo(() => sqlVariableNames(tab?.sql ?? ''), [tab?.sql])
  useEffect(() => setCopilotContext({ kind: 'sql', sql: tab?.sql ?? '', ...(state.error ? { error: state.error.message } : {}) }), [tab?.sql, state.error, setCopilotContext])

  const patchTab = (patch: Partial<Tab>) => setTabs((ts) => ts.map((t) => (t.id === active ? { ...t, ...patch } : t)))
  const query = (sql: string) =>
    tab?.native ? { kind: 'native' as const, datasource: tab.native, sql, variables: variables.map((n) => ({ name: n, label: n, type: 'text' as const })) } : { kind: 'sql' as const, sql, variables: variables.map((n) => ({ name: n, label: n, type: 'text' as const })) }

  const run = async (statement?: string) => {
    if (!tab) return
    const sql = (statement ?? tab.sql).trim()
    if (!sql) return
    const execution = Math.random().toString(36).slice(2)
    const id = tab.id
    setResults((r) => ({ ...r, [id]: { ...r[id], running: true, execution } }))
    try {
      const result = await api.post<RunResult>('/v1/query', { query: query(sql), parameters: Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '')), execution_id: execution })
      setResults((r) => (r[id]?.execution === execution ? { ...r, [id]: { result } } : r))
      setVizType(autoVisualization(result))
    } catch (err) {
      setResults((r) => (r[id]?.execution === execution ? { ...r, [id]: { error: err instanceof ApiError ? err : new ApiError(500, 'INTERNAL', String(err)) } } : r))
    }
  }
  const cancel = async () => {
    if (!tab || !state.execution) return
    await api.post('/v1/query/cancel', { execution_id: state.execution }).catch(() => undefined)
    setResults((r) => ({ ...r, [tab.id]: {} }))
  }

  const sqlError: SqlError | null = state.error ? { message: state.error.message, ...((state.error.details as { location?: { line: number; column: number } })?.location ?? {}) } : null
  const nativeSources = sources.filter((s) => s.engine !== 'mongodb' && s.engine !== 'trino')

  return (
    <div className="flex h-full">
      <Pane as="aside" id="sql.side" side="left" defaultSize={280} min={200} max={600} className="flex flex-col border-r">
        <TabRow className="gap-4 border-b px-3 text-sm">
          {(
            [
              ['schema', $t('Schéma'), Database],
              ['snippets', $t('Snippets'), FileCode2],
              ['history', $t('Historique'), History],
            ] as const
          ).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setSide(k)} className={cn('relative flex items-center gap-1.5 py-2.5', side === k ? 'font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary' : 'text-muted-foreground')}>
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </TabRow>
        <div className="min-h-0 flex-1">
          {side === 'schema' ? <SchemaBrowser onInsert={(t) => editorApi.current?.insert(t)} /> : side === 'snippets' ? <SnippetsPanel onInsert={(t) => editorApi.current?.insert(t)} current={tab?.sql ?? ''} /> : <HistoryPanel onOpen={(sql) => { const t = newTab(tabs.length + 1, sql); setTabs([...tabs, t]); setActive(t.id) }} />}
        </div>
      </Pane>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Tabs */}
        <TabRow className="h-10 shrink-0 items-end gap-0.5 border-b bg-surface px-2">
          {tabs.map((t) => (
            <div key={t.id} className={cn('group flex h-8 items-center gap-1.5 rounded-t-lg border border-b-0 px-3 text-sm', t.id === active ? 'bg-background font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              {renaming === t.id ? (
                <input
                  // biome-ignore lint/a11y/noAutofocus: the tab is renamed where it is, right after the double click
                  autoFocus
                  defaultValue={t.name}
                  aria-label={$t('Nom de l’onglet')}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => {
                    const name = e.currentTarget.value.trim()
                    if (name) setTabs((ts) => ts.map((x) => (x.id === t.id ? { ...x, name } : x)))
                    setRenaming(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    else if (e.key === 'Escape') {
                      e.currentTarget.value = t.name
                      e.currentTarget.blur()
                    }
                  }}
                  className="w-32 bg-transparent outline-none"
                />
              ) : (
                <button type="button" onClick={() => setActive(t.id)} onDoubleClick={() => setRenaming(t.id)} className="max-w-40 truncate">
                  {t.name}
                </button>
              )}
              {results[t.id]?.running ? <Loader2 className="size-3 animate-spin text-primary" /> : null}
              {tabs.length > 1 ? (
                <button type="button" aria-label={$t('Fermer')} onClick={() => { const rest = tabs.filter((x) => x.id !== t.id); setTabs(rest); if (active === t.id) setActive(rest[rest.length - 1]?.id ?? '') }} className="opacity-0 group-hover:opacity-100">
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          ))}
          <button type="button" onClick={() => { const t = newTab(tabs.length + 1); setTabs([...tabs, t]); setActive(t.id) }} className="mb-1 ml-1 rounded p-1 text-muted-foreground hover:bg-accent" aria-label={$t('Nouvel onglet')}>
            <Plus className="size-4" />
          </button>
        </TabRow>

        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b px-3 py-2">
          {state.running ? (
            <Button size="sm" variant="outline" onClick={cancel}>
              <Square className="fill-current" /> {$t('Annuler')}
            </Button>
          ) : (
            <Button size="sm" onClick={() => run()}>
              <Play /> {$t('Exécuter')}
              <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 font-mono text-[10px]">Ctrl ↵</kbd>
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => editorApi.current?.format()}>
            <Wand2 /> {$t('Formater')}
          </Button>
          <Choice
            value={tab?.native ?? 'trino'}
            onValueChange={(v) => patchTab({ native: v === 'trino' ? null : v })}
            options={[{ value: 'trino', label: $t('Trino SQL (toutes les sources)') }, ...nativeSources.map((s) => ({ value: s.id, label: $t('SQL natif · {name}', { name: s.name }) }))]}
            aria-label={$t('Dialecte')}
            className="w-64"
          />
          <span className="flex-1" />
          {me?.ai_enabled ? (
            <Button size="sm" variant="ghost" onClick={() => openCopilot({ kind: 'sql', sql: tab?.sql ?? '' })}>
              <Sparkles className="text-violet-500" /> {$t('Copilote')}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" disabled={!tab?.sql.trim()} onClick={() => setSaveOpen(true)}>
            <Save /> {$t('Enregistrer comme question')}
          </Button>
        </div>

        {/* Editor */}
        <Pane id="sql.editor" side="top" defaultSize={340} min={140} max={900} className="flex flex-col border-b">
          {tab ? <SqlEditor key={tab.id} value={tab.sql} tree={tree} onChange={(sql) => patchTab({ sql })} onRun={(s) => run(s)} error={sqlError} onReady={(a) => (editorApi.current = a)} /> : null}
        </Pane>
        {variables.length ? (
          <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-3 py-2">
            {variables.map((v) => (
              <label key={v} className="flex items-center gap-1.5 text-xs">
                <span className="font-mono text-muted-foreground">{`{{${v}}}`}</span>
                <Input value={values[v] ?? ''} onChange={(e) => setValues({ ...values, [v]: e.target.value })} className="h-7 w-36" />
              </label>
            ))}
          </div>
        ) : null}

        {/* Results */}
        <TabRow className="items-center gap-1 border-b px-3 py-1.5">
          <button type="button" onClick={() => setView('table')} className={cn('rounded-md px-2.5 py-1 text-sm', view === 'table' ? 'bg-muted font-medium' : 'text-muted-foreground')}>
            {$t('Résultat')}
          </button>
          <button type="button" onClick={() => setView('viz')} className={cn('flex items-center gap-1 rounded-md px-2.5 py-1 text-sm', view === 'viz' ? 'bg-muted font-medium' : 'text-muted-foreground')}>
            <BarChart3 className="size-3.5" /> {$t('Graphique')}
          </button>
          {view === 'viz' ? (
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="rounded-md px-2 py-1 text-xs text-primary hover:underline">
                  {$t('Changer')}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <VizPicker value={vizType} result={state.result ?? null} onChange={setVizType} />
              </PopoverContent>
            </Popover>
          ) : null}
          <span className="flex-1" />
          {state.result ? (
            <>
              <ResultFooter result={state.result} />
              <Button size="sm" variant="ghost" onClick={() => tab && download('/v1/query/export', { query: query(tab.sql), format: 'csv', name: tab.name }).catch((e) => toast.error(String(e)))}>
                <Download /> CSV
              </Button>
              <Button size="sm" variant="ghost" onClick={() => tab && download('/v1/query/export', { query: query(tab.sql), format: 'xlsx', name: tab.name }).catch((e) => toast.error(String(e)))}>
                XLSX
              </Button>
            </>
          ) : null}
        </TabRow>
        <div className="relative min-h-0 flex-1">
          {state.running ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : null}
          {state.error ? (
            <div className="m-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <div className="mb-1 text-sm font-semibold text-destructive">{state.error.code === 'DATA_ACCESS_DENIED' ? $t('Accès aux données refusé') : $t('Erreur')}</div>
              <pre className="font-mono text-xs whitespace-pre-wrap text-destructive/90">{state.error.message}</pre>
              {me?.ai_enabled ? (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => openCopilot({ kind: 'sql', sql: tab?.sql ?? '', error: state.error?.message }, $t('Corrige cette requête.'))}>
                  <Sparkles /> {$t('Corriger avec le copilote')}
                </Button>
              ) : null}
            </div>
          ) : state.result ? (
            view === 'table' ? (
              <DataTable result={state.result} looks={state.result.looks} settings={{ row_numbers: true, density: 'compact' }} />
            ) : (
              <div className="h-full p-4">
                <Visualization result={state.result} viz={{ type: vizType }} />
              </div>
            )
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {$t('Les requêtes passent par Trino : citez les tables comme catalogue.schéma.table, joignez des sources différentes.')}
            </div>
          )}
        </div>
      </div>
      <SaveDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title={$t('Enregistrer comme question')}
        initial={{ name: tab?.name ?? '' }}
        onSubmit={async (v) => {
          if (!tab) return
          const q = await api.post<Question>('/v1/questions', { name: v.name, description: v.description || null, folder: v.folder, query: query(tab.sql), visualization: { type: view === 'viz' ? vizType : 'table' } })
          router.push(`/question/${q.id}`)
        }}
      />
    </div>
  )
}

export default function SqlPage() {
  return (
    <Suspense>
      <SqlWorkspace />
    </Suspense>
  )
}
