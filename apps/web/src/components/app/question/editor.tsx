'use client'

import type { BuilderQuery, Dashboard, ItemSummary, Question, QuestionQuery, SqlVariable, Visualization as Viz, VisualizationType } from '@eodia/contracts'
import { DASHBOARD_COLUMNS, SQL_VARIABLE_TYPES, cardSize, placedAfter, sqlVariableNames } from '@eodia/contracts'
import { ConfirmDialog, SaveDialog } from '@/components/app/dialogs'
import { MoveDialog } from '@/components/app/move-dialog'
import { ShareDialog } from '@/components/app/share-dialog'
import { type SqlError, SqlEditor } from '@/components/app/sql-editor'
import { DataTable, type PointClick, ResultFooter, Visualization } from '@/components/app/visualization'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Hint } from '@/components/ui/tooltip'
import { ApiError, type RunResult, api, download } from '@/lib/api'
import { columnOptions } from '@/lib/builder'
import { $t } from '@/lib/i18n'
import { keys, useMe, useMetrics, useModels, useSchemaTree, useTables } from '@/lib/queries'
import { useCrumbs, useUi } from '@/lib/store'
import { autoVisualization } from '@/lib/viz'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Code2,
  Copy,
  Download,
  Ellipsis,
  LayoutDashboard,
  Loader2,
  PanelRight,
  Play,
  Save,
  Share2,
  Sparkles,
  Square,
  Trash2,
  Wand2,
  Workflow,
  Box,
  Sigma,
  FolderInput,
  CircleHelp,
} from 'lucide-react'
import { Segmented } from '@/components/ui/segmented'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Notebook } from './notebook'
import { VizPicker, VizSettings } from './viz-settings'
import { Pane } from '@/components/ui/pane'
import { TabRow } from '@/components/ui/tab-row'

export interface Draft {
  readonly id: string | null
  readonly name: string
  readonly description: string | null
  readonly type: Question['type']
  readonly folder: string | null
  /** The dashboard it belongs to — and, for a new one, the tab its card goes to. */
  readonly dashboard: Question['dashboard']
  readonly tab?: string | null
  readonly query: QuestionQuery
  readonly visualization: Viz
  readonly access: Question['access']
}

const newExecution = () => Math.random().toString(36).slice(2)

function VariablesBar({ variables, values, onValues, onVariables }: { variables: readonly SqlVariable[]; values: Record<string, string>; onValues: (v: Record<string, string>) => void; onVariables: (v: SqlVariable[]) => void }) {
  if (variables.length === 0) return null
  return (
    <div className="flex flex-wrap items-end gap-3 border-b bg-muted/30 px-4 py-2.5">
      {variables.map((v, i) => (
        <div key={v.name} className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono">{`{{${v.name}}}`}</span>
            <Choice
              value={v.type}
              onValueChange={(t) => onVariables(variables.map((x, j) => (j === i ? { ...x, type: t as SqlVariable['type'] } : x)))}
              options={SQL_VARIABLE_TYPES.map((t) => ({ value: t, label: { text: $t('Texte'), number: $t('Nombre'), date: $t('Date'), filter: $t('Filtre') }[t] }))}
              aria-label={$t('Type')}
              size="xs"
              className="w-24"
            />
          </div>
          {v.type === 'filter' ? (
            <div className="flex gap-1">
              <Input placeholder={$t('colonne SQL')} value={v.column ?? ''} onChange={(e) => onVariables(variables.map((x, j) => (j === i ? { ...x, column: e.target.value } : x)))} className="h-8 w-32 font-mono text-xs" />
              <Choice value={v.column_kind ?? 'text'} onValueChange={(k) => onVariables(variables.map((x, j) => (j === i ? { ...x, column_kind: k as SqlVariable['column_kind'] } : x)))} options={[{ value: 'text', label: $t('texte') }, { value: 'number', label: $t('nombre') }, { value: 'date', label: $t('date') }, { value: 'datetime', label: $t('horodatage') }]} aria-label={$t('Genre')} size="sm" className="w-28" />
              <Input placeholder={$t('valeur')} value={values[v.name] ?? ''} onChange={(e) => onValues({ ...values, [v.name]: e.target.value })} className="h-8 w-36" />
            </div>
          ) : (
            <Input type={v.type === 'number' ? 'number' : v.type === 'date' ? 'date' : 'text'} placeholder={v.label} value={values[v.name] ?? ''} onChange={(e) => onValues({ ...values, [v.name]: e.target.value })} className="h-8 w-44" />
          )}
        </div>
      ))}
    </div>
  )
}

export function QuestionEditor({ initial }: { initial: Draft }) {
  const router = useRouter()
  const qc = useQueryClient()
  const { data: me } = useMe()
  const { data: tables = [] } = useTables(undefined, true)
  const { data: models = [] } = useModels()
  const { data: metrics = [] } = useMetrics()
  const { data: tree } = useSchemaTree()
  const setCopilotContext = useUi((s) => s.setCopilotContext)
  const openCopilot = useUi((s) => s.openCopilot)

  const [draft, setDraft] = useState<Draft>(initial)
  const [dirty, setDirty] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [running, setRunning] = useState(false)
  const [view, setView] = useState<'viz' | 'table' | 'sql'>('viz')
  const [panel, setPanel] = useState<'viz' | 'details' | null>('viz')
  const [values, setValues] = useState<Record<string, string>>({})
  const [saveOpen, setSaveOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [drill, setDrill] = useState<PointClick | null>(null)
  const execution = useRef<string | null>(null)

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
  }

  useCrumbs([
    draft.dashboard
      ? { label: draft.dashboard.name, href: `/dashboard/${draft.dashboard.id}` }
      : { label: draft.type === 'model' ? $t('Modèles') : draft.type === 'metric' ? $t('Métriques') : $t('Questions'), href: draft.folder ? `/browse/${draft.folder}` : '/browse' },
    { label: draft.name || $t('Nouvelle question') },
  ])
  useEffect(() => setCopilotContext(draft.query.kind === 'builder' ? { kind: 'question', ...(draft.id ? { id: draft.id } : {}), query: draft.query } : { kind: 'sql', sql: draft.query.sql, ...(error ? { error: error.message } : {}) }), [draft.query, draft.id, error, setCopilotContext])

  const tableMap = useMemo(() => new Map(tables.map((t) => [t.id, t])), [tables])
  const builder = draft.query.kind === 'builder' ? draft.query : null
  const sourceTable = builder?.source.kind === 'table' ? tableMap.get(builder.source.id) ?? null : null
  const modelColumns = useQuery({
    queryKey: ['model-columns', builder?.source.kind === 'question' ? builder.source.id : null],
    queryFn: () => api.post<RunResult>('/v1/query', { query: { kind: 'builder', source: builder?.source, limit: 1 } }),
    enabled: builder?.source.kind === 'question',
  })
  const options = useMemo(
    () => columnOptions(sourceTable, tableMap, builder, modelColumns.data?.columns.map((c) => ({ name: c.name, type: c.type === 'number' ? 'double' : c.type === 'date' ? 'date' : c.type === 'datetime' ? 'timestamp' : 'varchar', label: c.label }))),
    [sourceTable, tableMap, builder, modelColumns.data],
  )
  const sourceLabel = sourceTable?.label ?? models.find((m) => m.id === (builder?.source.kind === 'question' ? builder.source.id : ''))?.name ?? $t('Choisir une source')
  const variables = draft.query.kind !== 'builder' ? draft.query.variables ?? [] : []

  // Variables follow the text: a new {{name}} appears, one gone leaves.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the SQL text
  useEffect(() => {
    if (draft.query.kind === 'builder') return
    const names = sqlVariableNames(draft.query.sql)
    const current = draft.query.variables ?? []
    if (names.length === current.length && names.every((n, i) => current[i]?.name === n)) return
    const next = names.map((n) => current.find((v) => v.name === n) ?? { name: n, label: n, type: 'text' as const })
    setDraft((d) => (d.query.kind === 'builder' ? d : { ...d, query: { ...d.query, variables: next } }))
  }, [draft.query.kind === 'builder' ? '' : draft.query.sql])

  const run = useCallback(
    async (override?: QuestionQuery) => {
      const query = override ?? draft.query
      if (query.kind === 'builder' && !query.source.id) return
      if (query.kind !== 'builder' && !query.sql.trim()) return
      const id = newExecution()
      execution.current = id
      setRunning(true)
      setError(null)
      try {
        const parameters = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''))
        const res = await api.post<RunResult>('/v1/query', { query, parameters, execution_id: id, fresh: true, ...(draft.id ? { question: draft.id } : {}) })
        if (execution.current !== id) return
        setResult(res)
        // A new question takes the visualization its first result suggests.
        if (!draft.id && !dirtyViz.current) setDraft((d) => ({ ...d, visualization: { type: autoVisualization(res) } }))
      } catch (err) {
        if (execution.current === id) setError(err instanceof ApiError ? err : new ApiError(500, 'INTERNAL', String(err)))
      } finally {
        if (execution.current === id) setRunning(false)
      }
    },
    [draft.query, draft.id, values],
  )
  const dirtyViz = useRef(!!initial.id)

  // The builder runs as it is edited; SQL waits for Ctrl+Entrée — but an opened question shows
  // its result straight away.
  const queryKey = draft.query.kind === 'builder' ? JSON.stringify(draft.query) : 'sql'
  const lastRunKey = useRef<string | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the serialized builder query
  useEffect(() => {
    if (lastRunKey.current === queryKey) return
    const first = lastRunKey.current === null
    if (!first && draft.query.kind !== 'builder') return
    const t = setTimeout(() => {
      lastRunKey.current = queryKey
      void run()
    }, first ? 0 : 350)
    return () => clearTimeout(t)
  }, [queryKey])

  const cancel = async () => {
    const id = execution.current
    execution.current = null
    setRunning(false)
    if (id) await api.post('/v1/query/cancel', { execution_id: id }).catch(() => undefined)
  }

  const save = async (v?: { name: string; description: string; folder: string | null }) => {
    const body = {
      name: v?.name ?? draft.name,
      description: (v ? v.description : draft.description) || null,
      folder: v?.folder ?? draft.folder,
      type: draft.type,
      query: draft.query,
      visualization: draft.visualization,
    }
    if (draft.id && !v) {
      const q = await api.patch<Question>(`/v1/questions/${draft.id}`, body)
      await qc.invalidateQueries({ queryKey: keys.question(q.id) })
      toast.success($t('Enregistré.'))
    } else if (!draft.id && draft.dashboard) {
      // Created in a dashboard: it belongs to it, and comes back to it with its card.
      await api.post<Question>('/v1/questions', { ...body, folder: null, dashboard: draft.dashboard.id, tab: draft.tab ?? null })
      await qc.invalidateQueries({ queryKey: keys.dashboard(draft.dashboard.id) })
      toast.success($t('Question ajoutée à « {name} ».', { name: draft.dashboard.name }))
      router.push(`/dashboard/${draft.dashboard.id}${draft.tab ? `?tab=${encodeURIComponent(draft.tab)}` : ''}`)
    } else {
      const q = await api.post<Question>('/v1/questions', body)
      toast.success($t('Question enregistrée.'))
      router.replace(`/question/${q.id}`)
    }
    setDirty(false)
    await qc.invalidateQueries({ queryKey: ['folder-items'] })
  }

  const addToDashboard = async (d: ItemSummary) => {
    if (!draft.id) {
      toast.error($t('Enregistrez d’abord la question.'))
      return
    }
    const dash = await api.get<Dashboard>(`/v1/dashboards/${d.id}`)
    const tab = dash.tabs[0]?.id ?? null
    const size = cardSize('question', draft.visualization.type)
    const [card] = placedAfter(dash.cards, tab, [{ id: `c${Date.now().toString(36)}`, tab, kind: 'question' as const, question: draft.id, w: Math.min(size.w, DASHBOARD_COLUMNS), h: size.h }])
    await api.patch(`/v1/dashboards/${d.id}`, { cards: [...dash.cards, card] })
    toast.success($t('Ajoutée à « {name} ».', { name: d.name }), { action: { label: $t('Ouvrir'), onClick: () => router.push(`/dashboard/${d.id}`) } })
  }
  const dashboards = useQuery({ queryKey: ['all-dashboards'], queryFn: () => api.get<{ items: ItemSummary[] }>('/v1/search?q=').then((r) => r.items.filter((i) => i.kind === 'dashboard')) })

  const toSql = () => {
    if (!result?.sql) return
    update({ query: { kind: 'sql', sql: result.sql } })
  }

  const exportAs = async (format: 'csv' | 'xlsx' | 'json') => {
    try {
      const parameters = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''))
      await download('/v1/query/export', { query: draft.query, parameters, format, name: draft.name || $t('resultat||nom du fichier exporté, sans accent') })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const onPoint = (p: PointClick) => {
    if (!builder || !p.column.source) return
    setDrill(p)
  }
  const drillFilter = (op: 'is' | 'is_not') => {
    if (!builder || !drill?.column.source) return
    const ref = { ...(drill.column.source.join ? { join: drill.column.source.join } : {}), field: drill.column.source.field }
    const unit = drill.column.unit
    const filter = unit
      ? { column: ref, op: 'date' as const, values: [String(drill.value).slice(0, unit === 'year' ? 4 : unit === 'month' ? 7 : 10)] }
      : { column: ref, op, values: [String(drill.value)] }
    update({ query: { ...builder, filters: [...(builder.filters ?? []), filter] } })
    setDrill(null)
  }

  const canEdit = !draft.id || draft.access !== 'view'
  // One sentence, cut around the value the bold element shows.
  const drillLabel = drill ? $t('{column} : {value}', { column: drill.column.label }).split('{value}') : []
  const allowSql = !!me?.can.use_sql
  const sqlError: SqlError | null = error && draft.query.kind !== 'builder' ? { message: error.message, ...((error.details as { location?: { line: number; column: number } })?.location ?? {}) } : null

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Input value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder={$t('Question sans titre')} className="h-9 max-w-md border-transparent text-lg font-semibold shadow-none hover:border-input focus-visible:border-input" />
        {draft.type !== 'question' ? <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">{draft.type === 'model' ? $t('Modèle') : $t('Métrique')}</span> : null}
        {dirty ? <span className="text-xs text-muted-foreground">{$t('Modifications non enregistrées')}</span> : null}
        <span className="flex-1" />
        <div className="flex rounded-lg border p-0.5">
          <button type="button" onClick={() => builder || update({ query: { kind: 'builder', source: { kind: 'table', id: tables[0]?.id ?? '' } } })} className={cn('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm', builder ? 'bg-muted font-medium' : 'text-muted-foreground')}>
            <Workflow className="size-3.5" /> {$t('Éditeur visuel')}
          </button>
          {allowSql ? (
            <button type="button" onClick={() => (builder ? toSql() : undefined)} disabled={!!builder && !result?.sql} className={cn('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm', !builder ? 'bg-muted font-medium' : 'text-muted-foreground')}>
              <Code2 className="size-3.5" /> SQL
            </button>
          ) : null}
        </div>
        {running ? (
          <Button size="sm" variant="outline" onClick={cancel}>
            <Square className="fill-current" /> {$t('Annuler')}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => run()}>
            <Play /> {$t('Exécuter')}
          </Button>
        )}
        {canEdit ? (
          <Button size="sm" onClick={() => (draft.id ? save() : setSaveOpen(true))} disabled={draft.id !== null && !dirty}>
            <Save /> {$t('Enregistrer')}
          </Button>
        ) : (
          <Button size="sm" onClick={() => setSaveOpen(true)}>
            <Copy /> {$t('Enregistrer une copie')}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={$t('Plus')}>
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {me?.ai_enabled ? (
              <DropdownMenuItem onSelect={() => openCopilot()}>
                <Sparkles /> {$t('Demander au copilote')}
              </DropdownMenuItem>
            ) : null}
            {draft.id ? (
              <DropdownMenuItem onSelect={() => setShareOpen(true)}>
                <Share2 /> {$t('Partager')}
              </DropdownMenuItem>
            ) : null}
            {draft.id && canEdit ? (
              <DropdownMenuItem onSelect={() => setMoveOpen(true)}>
                <FolderInput /> {$t('Déplacer…')}
              </DropdownMenuItem>
            ) : null}
            {draft.dashboard ? null : (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <LayoutDashboard className="size-4" /> {$t('Ajouter à un tableau de bord')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-80 w-64 overflow-y-auto">
                  {(dashboards.data ?? []).map((d) => (
                    <DropdownMenuItem key={d.id} onSelect={() => addToDashboard(d)}>
                      {d.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Download className="size-4" /> {$t('Exporter')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => exportAs('csv')}>CSV</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportAs('xlsx')}>Excel (XLSX)</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportAs('json')}>JSON</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {builder && allowSql ? (
              <DropdownMenuItem onSelect={toSql} disabled={!result?.sql}>
                <Wand2 /> {$t('Convertir en SQL')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => update({ type: 'question' })} disabled={draft.type === 'question'}>
              {$t('Question')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => update({ type: 'model' })} disabled={draft.type === 'model' || !!draft.dashboard}>
              <Box /> {$t('Transformer en modèle')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => update({ type: 'metric' })} disabled={draft.type === 'metric' || !!draft.dashboard || !builder || (builder.aggregations ?? []).length !== 1}>
              <Sigma /> {$t('Transformer en métrique')}
            </DropdownMenuItem>
            {draft.id ? (
              <>
                <DropdownMenuItem
                  onSelect={async () => {
                    const q = await api.post<Question>(`/v1/questions/${draft.id}/duplicate`, {})
                    router.push(`/question/${q.id}`)
                  }}
                >
                  <Copy /> {$t('Dupliquer')}
                </DropdownMenuItem>
                {canEdit ? (
                  <DropdownMenuItem className="text-destructive" onSelect={() => setDeleteOpen(true)}>
                    <Trash2 /> {$t('Supprimer')}
                  </DropdownMenuItem>
                ) : null}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <Hint label={$t('Réglages')}>
          <Button size="icon-sm" variant={panel ? 'secondary' : 'ghost'} onClick={() => setPanel(panel ? null : 'viz')}>
            <PanelRight />
          </Button>
        </Hint>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: the query */}
        {builder ? (
          <Pane id="question.notebook" side="left" defaultSize={420} min={300} max={760} className="overflow-y-auto border-r bg-surface p-4">
            <Notebook
              query={builder}
              onChange={(q: BuilderQuery) => update({ query: q })}
              options={options}
              tables={tables}
              models={models.filter((m) => m.id !== draft.id)}
              metrics={metrics.filter((m) => m.id !== draft.id && (!builder.source || true))}
              sourceLabel={sourceLabel}
              allowSql={allowSql}
            />
          </Pane>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          {!builder ? (
            <Pane id="question.sql" side="top" defaultSize={320} min={140} max={900} className="flex flex-col border-b">
              {draft.query.kind === 'native' ? (
                <div className="border-b px-4 py-1.5 text-xs text-muted-foreground">{$t('SQL natif : envoyé tel quel à la source via system.query, réservé aux personnes sans restriction.')}</div>
              ) : null}
              <SqlEditor value={(draft.query as Exclude<QuestionQuery, BuilderQuery>).sql} tree={tree} onChange={(sql) => update({ query: { ...(draft.query as Exclude<QuestionQuery, BuilderQuery>), sql } })} onRun={() => run()} error={sqlError} />
            </Pane>
          ) : null}
          {!builder ? <VariablesBar variables={variables} values={values} onValues={setValues} onVariables={(v) => update({ query: { ...(draft.query as Exclude<QuestionQuery, BuilderQuery>), variables: v } })} /> : null}

          <TabRow className="items-center gap-1 border-b px-4 py-1.5">
            {(['viz', 'table', 'sql'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} className={cn('rounded-md px-2.5 py-1 text-sm', view === v ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground')}>
                {v === 'viz' ? $t('Visualisation') : v === 'table' ? $t('Données') : $t('SQL exécuté')}
              </button>
            ))}
            <span className="flex-1" />
            {result ? <ResultFooter result={result} /> : null}
          </TabRow>

          <div className="relative min-h-0 flex-1 p-4">
            {running ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            ) : null}
            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
                <div className="mb-1 font-semibold text-destructive">{error.code === 'DATA_ACCESS_DENIED' ? $t('Accès aux données refusé') : $t('La requête a échoué')}</div>
                <pre className="font-mono text-xs whitespace-pre-wrap text-destructive/90">{error.message}</pre>
                {me?.ai_enabled ? (
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => openCopilot(undefined, $t('Corrige cette requête : {error}', { error: error.message }))}>
                    <Sparkles /> {$t('Corriger avec le copilote')}
                  </Button>
                ) : null}
              </div>
            ) : result ? (
              view === 'viz' ? (
                <div className="h-full">
                  <Visualization result={result} viz={draft.visualization} onPointClick={builder ? onPoint : undefined} />
                </div>
              ) : view === 'table' ? (
                <DataTable result={result} looks={result.looks} />
              ) : (
                <pre className="h-full overflow-auto rounded-xl bg-code p-4 font-mono text-xs text-code-foreground">{result.sql}</pre>
              )
            ) : !running ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{builder ? $t('Choisissez une source de données.') : $t('Écrivez une requête puis Ctrl+Entrée.')}</div>
            ) : null}
            {drill ? (
              <div className="fixed z-50 w-56 rounded-xl border bg-popover p-1 shadow-lg" style={{ left: drill.at.x + 8, top: drill.at.y + 8 }}>
                <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">
                  {drillLabel[0]}
                  <b className="text-foreground">{String(drill.value)}</b>
                  {drillLabel[1]}
                </div>
                <button type="button" className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => drillFilter('is')}>
                  {$t('Filtrer sur cette valeur')}
                </button>
                {!drill.column.unit ? (
                  <button type="button" className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => drillFilter('is_not')}>
                    {$t('Exclure cette valeur')}
                  </button>
                ) : null}
                <button type="button" className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent" onClick={() => setDrill(null)}>
                  {$t('Fermer')}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right: settings */}
        {panel ? (
          <Pane as="aside" id="question.settings" side="right" defaultSize={320} min={260} max={600} className="overflow-y-auto border-l">
            <TabRow className="h-12 items-center gap-6 border-b px-5 text-[15px]">
              {(['viz', 'details'] as const).map((p) => (
                <button key={p} type="button" onClick={() => setPanel(p)} className={cn('relative py-3', panel === p ? 'font-semibold after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary' : 'text-muted-foreground')}>
                  {p === 'viz' ? $t('Visualisation') : $t('Détails')}
                </button>
              ))}
            </TabRow>
            <div className="space-y-6 p-5">
              {panel === 'viz' ? (
                <>
                  <VizPicker
                    value={draft.visualization.type}
                    result={result}
                    onChange={(type: VisualizationType) => {
                      dirtyViz.current = true
                      update({ visualization: { ...draft.visualization, type } })
                      setView('viz')
                    }}
                  />
                  <VizSettings
                    type={draft.visualization.type}
                    settings={draft.visualization.settings ?? {}}
                    result={result}
                    onChange={(settings) => {
                      dirtyViz.current = true
                      update({ visualization: { ...draft.visualization, settings } })
                    }}
                  />
                </>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{$t('Description')}</Label>
                    <Textarea value={draft.description ?? ''} onChange={(e) => update({ description: e.target.value })} rows={4} placeholder={$t('À quoi sert cette question ?')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{$t('Nature')}</Label>
                    <Segmented
                      value={draft.type}
                      onValueChange={(t) => update({ type: t })}
                      options={[
                        { value: 'question', label: $t('Question'), icon: CircleHelp, hint: $t('Une question : un résultat à lire') },
                        { value: 'model', label: $t('Modèle'), icon: Box, hint: $t('Une table virtuelle, réutilisable comme source') },
                        { value: 'metric', label: $t('Métrique'), icon: Sigma, hint: $t('Une agrégation nommée, réutilisable partout') },
                      ]}
                      aria-label={$t('Nature')}
                    />
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex gap-3">
                      <dt className="w-24 text-muted-foreground">{$t('Requête')}</dt>
                      <dd>{builder ? $t('Éditeur visuel') : draft.query.kind === 'sql' ? $t('SQL Trino') : $t('SQL natif')}</dd>
                    </div>
                    <div className="flex gap-3">
                      <dt className="w-24 text-muted-foreground">{$t('Accès')}</dt>
                      <dd>{{ view: $t('Lecture'), edit: $t('Modification'), manage: $t('Gestion') }[draft.access]}</dd>
                    </div>
                  </dl>
                  {draft.type === 'metric' ? <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{$t('Une métrique est réutilisable dans le builder, les cartes de tableau de bord, le copilote et la MCP : « Résumer → Métriques ».')}</p> : null}
                  {draft.type === 'model' ? <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{$t('Un modèle sert de source à d’autres questions, comme une table, et le copilote le voit comme tel.')}</p> : null}
                </div>
              )}
            </div>
          </Pane>
        ) : null}
      </div>

      <SaveDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title={draft.id ? $t('Enregistrer une copie') : $t('Enregistrer la question')}
        description={!draft.id && draft.dashboard ? $t('Elle appartient au tableau de bord « {name} » et n’apparaît dans aucun dossier.', { name: draft.dashboard.name }) : undefined}
        withFolder={!!draft.id || !draft.dashboard}
        initial={{ name: draft.name, description: draft.description, folder: draft.folder }}
        onSubmit={(v) => save(v)}
      />
      {draft.id ? (
        <MoveDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          name={draft.name}
          targets={draft.type === 'question' ? ['folder', 'dashboard'] : ['folder']}
          current={{ folder: draft.folder, dashboard: draft.dashboard?.id ?? null }}
          onMove={async (target) => {
            const q = await api.patch<Question>(
              `/v1/questions/${draft.id}`,
              target.kind === 'folder' ? { folder: target.folder, ...(draft.dashboard ? { dashboard: null } : {}) } : { dashboard: target.dashboard, tab: target.tab },
            )
            setDraft((d) => ({ ...d, folder: q.folder, dashboard: q.dashboard }))
            await Promise.all([
              qc.invalidateQueries({ queryKey: keys.question(q.id) }),
              qc.invalidateQueries({ queryKey: ['folder-items'] }),
              qc.invalidateQueries({ queryKey: ['dashboard'] }),
            ])
            toast.success(q.dashboard ? $t('Question déplacée dans « {name} ».', { name: q.dashboard.name }) : $t('Question déplacée.'))
          }}
        />
      ) : null}
      {draft.id ? <ShareDialog open={shareOpen} onOpenChange={setShareOpen} kind={draft.type === 'question' ? 'question' : draft.type} id={draft.id} name={draft.name} /> : null}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={$t('Supprimer « {name} » ?', { name: draft.name })}
        description={$t('Les tableaux de bord qui l’affichent perdront la carte.')}
        onConfirm={async () => {
          await api.delete(`/v1/questions/${draft.id}`)
          await qc.invalidateQueries({ queryKey: ['folder-items'] })
          router.push(draft.dashboard ? `/dashboard/${draft.dashboard.id}` : draft.folder ? `/browse/${draft.folder}` : '/browse')
        }}
      />
    </div>
  )
}
