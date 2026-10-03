'use client'

import type { Datasource, JobState, SyncReport } from '@eodia/contracts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { api } from '@/lib/api'
import { $t, $tp, intlLocale, msg } from '@/lib/i18n'
import { keys } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SCHEDULE_LABELS, SYNC_LABELS, SyncDot, syncSummary } from './source-look'

type Pass = 'schema' | 'fingerprint' | 'values'

const PASSES: { key: Pass; label: string; help: string }[] = [
  { key: 'schema', label: msg('Schéma'), help: msg('Schémas, tables, colonnes, clés et commentaires.') },
  { key: 'fingerprint', label: msg('Empreinte'), help: msg('Cardinalité, nulls, min et max sur un échantillon.') },
  { key: 'values', label: msg('Valeurs'), help: msg('Valeurs distinctes des colonnes catégorielles.') },
]

/**
 * Follows a job: server-sent events first; when the stream cannot be opened or breaks,
 * polling `GET /v1/jobs/:id` until the job ends.
 */
export function useJob(id: string | null): JobState | null {
  const [state, setState] = useState<JobState | null>(null)
  useEffect(() => {
    setState(null)
    if (!id) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const ended = (s: JobState) => s.status === 'done' || s.status === 'failed'
    const poll = async () => {
      if (stopped) return
      try {
        const s = await api.get<JobState>(`/v1/jobs/${id}`)
        if (stopped) return
        setState(s)
        if (ended(s)) return
      } catch {}
      timer = setTimeout(poll, 1000)
    }
    const source = new EventSource(`/api/v1/jobs/${id}/events`)
    let last: JobState | null = null
    source.addEventListener('progress', (e) => {
      try {
        last = JSON.parse((e as MessageEvent<string>).data) as JobState
        setState(last)
        if (ended(last)) source.close()
      } catch {}
    })
    source.onerror = () => {
      source.close()
      if (!last || !ended(last)) void poll()
    }
    return () => {
      stopped = true
      source.close()
      if (timer) clearTimeout(timer)
    }
  }, [id])
  return state
}

function ReportGrid({ report }: { report: SyncReport }) {
  const cells: [string, string, string?][] = [
    [$t('Schémas'), `+${report.schemas.added} / −${report.schemas.removed}`],
    [$t('Tables'), `+${report.tables.added} / −${report.tables.removed}`],
    [$t('Colonnes'), `+${report.columns.added} / −${report.columns.removed}`, report.columns.retyped ? $tp(report.columns.retyped, '{count} type changé', '{count} types changés') : undefined],
    [$t('Empreintes'), String(report.fingerprinted)],
    [$t('Valeurs'), String(report.values)],
  ]
  return (
    <div className="grid grid-cols-2 gap-2">
      {cells.map(([label, value, note]) => (
        <div key={label} className="rounded-lg border px-3 py-2">
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
          <div className="font-mono text-sm font-semibold">{value}</div>
          {note ? <div className="text-xs text-amber-600 dark:text-amber-400">{note}</div> : null}
        </div>
      ))}
    </div>
  )
}

function isReport(v: unknown): v is SyncReport {
  return !!v && typeof v === 'object' && 'tables' in v && 'columns' in v
}

/** « Synchroniser le schéma de la base de données », its live progress and its report. */
export function SyncPanel({ source, canSync }: { source: Datasource; canSync: boolean }) {
  const qc = useQueryClient()
  const [passes, setPasses] = useState<Set<Pass>>(new Set(['schema', 'fingerprint', 'values']))
  const [job, setJob] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = useJob(job)
  const running = starting || (job !== null && (!state || state.status === 'queued' || state.status === 'running'))

  const status = state?.status
  useEffect(() => {
    if (status === 'done' || status === 'failed') {
      void qc.invalidateQueries({ queryKey: keys.datasources })
      void qc.invalidateQueries({ queryKey: ['datasource', source.id] })
      void qc.invalidateQueries({ queryKey: ['tables'] })
      void qc.invalidateQueries({ queryKey: ['table'] })
      void qc.invalidateQueries({ queryKey: keys.tree })
      void qc.invalidateQueries({ queryKey: ['relations', source.id] })
    }
  }, [status, qc, source.id])

  const start = async () => {
    setStarting(true)
    setError(null)
    try {
      const { job: id } = await api.post<{ job: string }>(`/v1/datasources/${source.id}/sync`, { passes: PASSES.map((p) => p.key).filter((k) => passes.has(k)) })
      setJob(id)
      void qc.invalidateQueries({ queryKey: keys.datasources })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  const pct = state && state.progress.total > 0 ? Math.round((state.progress.done / state.progress.total) * 100) : null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <SyncDot status={running ? 'running' : source.sync.status} />
        <span className="font-medium">{running ? $t(SYNC_LABELS.running) : syncSummary(source)}</span>
      </div>
      <dl className="space-y-2 text-sm">
        <div className="flex gap-3">
          <dt className="w-32 shrink-0 text-muted-foreground">{$t('Planning')}</dt>
          <dd>{$t(SCHEDULE_LABELS[source.sync.schedule])}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-32 shrink-0 text-muted-foreground">{$t('Dernière synchro')}</dt>
          <dd>{source.sync.last_at ? new Date(source.sync.last_at).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</dd>
        </div>
      </dl>
      {source.sync.status === 'failed' && source.sync.error && !running ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs break-words text-destructive">{source.sync.error}</p>
      ) : null}

      {canSync ? (
        <>
          <div className="space-y-1.5">
            {PASSES.map((p) => (
              <label key={p.key} htmlFor={`sync-pass-${p.key}`} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1 hover:bg-muted/50">
                <Checkbox
                  id={`sync-pass-${p.key}`}
                  className="mt-0.5"
                  checked={passes.has(p.key)}
                  disabled={running}
                  onCheckedChange={(on) =>
                    setPasses((s) => {
                      const next = new Set(s)
                      if (on === true) next.add(p.key)
                      else next.delete(p.key)
                      return next
                    })
                  }
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{$t(p.label)}</span>
                  <span className="block text-xs text-muted-foreground">{$t(p.help)}</span>
                </span>
              </label>
            ))}
          </div>
          <Button className="h-auto min-h-9 w-full py-2 leading-snug whitespace-normal" onClick={start} disabled={running || passes.size === 0}>
            {running ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {$t('Synchroniser le schéma de la base de données')}
          </Button>
        </>
      ) : null}
      {error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}

      {job ? (
        <div className="space-y-3 rounded-xl border p-3">
          {state?.status === 'done' ? (
            <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
              <CheckCircle2 className="size-4" /> {$t('Synchronisation terminée')}
            </div>
          ) : state?.status === 'failed' ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <XCircle className="size-4" /> {$t('La synchronisation a échoué')}
              </div>
              {state.error ? <p className="text-xs break-words text-destructive">{state.error}</p> : null}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{state?.progress.step || (state?.status === 'queued' || !state ? $t('En file d’attente…') : $t('Démarrage…'))}</span>
                {state && state.progress.total > 0 ? (
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {state.progress.done}/{state.progress.total}
                  </span>
                ) : null}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full bg-primary transition-all duration-500', pct === null && 'w-1/3 animate-pulse')}
                  style={pct === null ? undefined : { width: `${Math.max(pct, 4)}%` }}
                />
              </div>
            </div>
          )}
          {state?.status === 'done' && isReport(state.result) ? <ReportGrid report={state.result} /> : null}
        </div>
      ) : null}
    </div>
  )
}
