'use client'

import type { Datasource, Engine, SourceView, ViewImpact } from '@eodia/contracts'
import { ConfirmDialog } from '@/components/app/dialogs'
import { ItemTile } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { Switch } from '@/components/ui/switch'
import { formatAgo } from '@/lib/format'
import { $t, $tp, msg } from '@/lib/i18n'
import { keys, useDatasources, useMe, useSchemaTree } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Code2, Eye, Layers, Loader2, Pencil, RefreshCw, ShieldAlert, Table2, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

/** The engines whose catalogs keep views: a database branched through JDBC keeps none. */
export const VIEW_ENGINES: ReadonlySet<Engine> = new Set<Engine>(['iceberg', 'trino'])

/** Where a view is, in the SQL editor's link: `/sql?view=source/schema/name`. */
export interface ViewTarget {
  readonly datasource: string
  readonly schema: string
  readonly name: string
}

export const viewKey = (t: ViewTarget) => `${t.datasource}/${t.schema}/${t.name}`
export function parseViewKey(key: string | null): ViewTarget | null {
  const [datasource, schema, name] = (key ?? '').split('/')
  return datasource && schema && name ? { datasource, schema, name } : null
}

const viewsKey = (datasource: string) => ['source-views', datasource]

/** How often a materialized view computes its result again: by hand, or every so many hours. */
const SCHEDULES = [
  { value: '', label: msg('À la main') },
  { value: '1', label: msg('Toutes les heures') },
  { value: '6', label: msg('Toutes les 6 heures') },
  { value: '12', label: msg('Toutes les 12 heures') },
  { value: '24', label: msg('Chaque jour') },
  { value: '168', label: msg('Chaque semaine') },
] as const
const scheduleOptions = () => SCHEDULES.map((o) => ({ value: o.value, label: $t(o.label) }))
const impactPath = (t: ViewTarget) => `/v1/datasources/${t.datasource}/views/${encodeURIComponent(t.schema)}/${encodeURIComponent(t.name)}`

/** What reads a view — the questions and dashboards an edit or a removal would touch. */
export function ImpactList({ target, verb }: { target: ViewTarget; verb: 'replace' | 'drop' }) {
  const { data, isLoading } = useQuery({ queryKey: ['view-impact', viewKey(target)], queryFn: () => api.get<ViewImpact>(`${impactPath(target)}/impact`) })
  if (isLoading) return <Loader2 className="size-4 animate-spin text-muted-foreground" />
  if (!data) return null
  const total = data.questions.length + data.dashboards.length + data.elsewhere
  if (!total) return <p className="text-xs text-muted-foreground">{$t('Aucune question ni aucun tableau de bord ne lit cette vue.')}</p>
  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/40">
      <div className="flex items-center gap-1.5 font-medium text-amber-900 dark:text-amber-200">
        <AlertTriangle className="size-3.5" />
        {verb === 'drop'
          ? $tp(total, '{count} élément lit cette vue : il ne fonctionnera plus.', '{count} éléments lisent cette vue : ils ne fonctionneront plus.')
          : $tp(total, '{count} élément lit cette vue : vérifiez qu’il y trouve encore ses colonnes.', '{count} éléments lisent cette vue : vérifiez qu’ils y trouvent encore leurs colonnes.')}
      </div>
      <ul className="max-h-40 space-y-1 overflow-y-auto">
        {data.questions.map((q) => (
          <li key={q.id}>
            <Link href={`/question/${q.id}`} target="_blank" className="inline-flex items-center gap-1.5 hover:text-primary hover:underline">
              <ItemTile kind={q.type === 'model' ? 'model' : q.type === 'metric' ? 'metric' : 'question'} className="size-4" />
              {q.name}
            </Link>
          </li>
        ))}
        {data.dashboards.map((d) => (
          <li key={d.id}>
            <Link href={`/dashboard/${d.id}`} target="_blank" className="inline-flex items-center gap-1.5 hover:text-primary hover:underline">
              <ItemTile kind="dashboard" className="size-4" />
              {d.name}
            </Link>
          </li>
        ))}
      </ul>
      {data.elsewhere ? <p className="text-muted-foreground">{$tp(data.elsewhere, '… et {count} dans d’autres espaces.', '… et {count} dans d’autres espaces.')}</p> : null}
    </div>
  )
}

/**
 * « Enregistrer comme vue » : the SQL kept in a catalog, where every tool reading Trino finds it.
 * Checked under the person's name, made `SECURITY INVOKER`: readers keep their own rights.
 */
export function SaveViewDialog({ open, onOpenChange, sql, initial }: { open: boolean; onOpenChange: (o: boolean) => void; sql: string; initial?: ViewTarget | null }) {
  const qc = useQueryClient()
  const { data: sources = [] } = useDatasources()
  const { data: tree } = useSchemaTree()
  const usable = sources.filter((s) => !s.shared && VIEW_ENGINES.has(s.engine))
  const [datasource, setDatasource] = useState(initial?.datasource ?? '')
  const [schema, setSchema] = useState(initial?.schema ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [materialized, setMaterialized] = useState(false)
  const [schedule, setSchedule] = useState('24')
  const [busy, setBusy] = useState(false)
  const { data: me } = useMe()
  // biome-ignore lint/correctness/useExhaustiveDependencies: a dialog opened afresh starts from its target
  useEffect(() => {
    if (!open) return
    setDatasource(initial?.datasource ?? usable[0]?.id ?? '')
    setSchema(initial?.schema ?? '')
    setName(initial?.name ?? '')
    setMaterialized(false)
  }, [open])
  const schemas = [...new Set((tree?.datasources.find((d) => d.id === datasource)?.tables ?? []).map((t) => t.schema))].sort()
  // biome-ignore lint/correctness/useExhaustiveDependencies: the first schema of a source newly chosen
  useEffect(() => {
    if (datasource && !schema && schemas[0]) setSchema(schemas[0])
  }, [datasource, schemas.length])
  const views = useQuery({ queryKey: viewsKey(datasource), queryFn: () => api.get<SourceView[]>(`/v1/datasources/${datasource}/views`), enabled: open && !!datasource })
  const current = (views.data ?? []).find((v) => v.schema.toLowerCase() === schema.toLowerCase() && v.name.toLowerCase() === name.toLowerCase())
  const exists = !!current
  // A view reopened keeps what it was: materialized, refreshed as before.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once the existing view is known
  useEffect(() => {
    if (!current) return
    setMaterialized(current.materialized)
    if (current.materialized) setSchedule(current.refresh_hours ? String(current.refresh_hours) : '')
  }, [current?.schema, current?.name, current?.materialized])
  const validName = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name)
  const source = sources.find((s) => s.id === datasource)

  const save = async () => {
    setBusy(true)
    try {
      await api.post(`/v1/datasources/${datasource}/views`, { schema, name, sql, replace: exists, ...(materialized ? { materialized: true, refresh_hours: schedule ? Number(schedule) : null } : {}) })
      await Promise.all([qc.invalidateQueries({ queryKey: viewsKey(datasource) }), qc.invalidateQueries({ queryKey: keys.datasources })])
      toast.success(exists ? $t('Vue « {name} » remplacée : la source se synchronise.', { name }) : $t('Vue « {name} » créée : la source se synchronise.', { name }), {
        action: { label: $t('Voir'), onClick: () => window.open(`/data/${datasource}?tab=views`, '_self') },
      })
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? $t('Enregistrer la vue') : $t('Enregistrer comme vue Trino')}</DialogTitle>
          <DialogDescription>{$t('La requête est gardée dans le catalogue : toute question, et tout outil branché sur Trino, la lit comme une table. Chacun la lit avec ses propres droits.')}</DialogDescription>
        </DialogHeader>
        {usable.length ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{$t('Source')}</Label>
              <Choice
                value={datasource}
                onValueChange={(v) => {
                  setDatasource(v)
                  setSchema('')
                }}
                options={usable.map((s) => ({ value: s.id, label: `${s.name} · ${s.catalog}` }))}
                aria-label={$t('Source')}
                className="w-full"
                disabled={!!initial}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{$t('Schéma')}</Label>
                {schemas.length ? (
                  <Choice value={schema} onValueChange={setSchema} options={schemas.map((s) => ({ value: s, label: s }))} aria-label={$t('Schéma')} className="w-full font-mono" disabled={!!initial} />
                ) : (
                  <Input value={schema} onChange={(e) => setSchema(e.target.value)} placeholder="analytics" className="font-mono" disabled={!!initial} />
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{$t('Nom de la vue')}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ventes_par_canal" className={cn('font-mono', name && !validName && 'border-destructive')} disabled={!!initial} />
              </div>
            </div>
            {source && schema && validName ? (
              <p className="truncate rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                {source.catalog}.{schema}.{name}
              </p>
            ) : null}
            {name && !validName ? <p className="text-xs text-destructive">{$t('Lettres, chiffres et « _ », sans commencer par un chiffre.')}</p> : null}
            {me?.is_admin && source && VIEW_ENGINES.has(source.engine) ? (
              <div className="space-y-2 rounded-lg border p-3">
                <label className="flex items-start gap-2.5 text-sm">
                  <Switch checked={materialized} onCheckedChange={setMaterialized} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Layers className="size-3.5 text-violet-600" /> {$t('Vue matérialisée')}
                    </span>
                    <span className="block text-xs text-muted-foreground">{$t('Le résultat est calculé une fois et gardé : un calcul lourd, lu vite. Il se rafraîchit à la main ou à intervalle.')}</span>
                  </span>
                </label>
                {materialized ? (
                  <>
                    <div className="flex items-center gap-2 pl-11 text-xs">
                      <span className="text-muted-foreground">{$t('Rafraîchir')}</span>
                      <Choice value={schedule} onValueChange={setSchedule} options={scheduleOptions()} aria-label={$t('Fréquence de rafraîchissement')} className="w-48" searchable={false} />
                    </div>
                    <p className="flex gap-1.5 rounded-md bg-amber-50/80 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      <ShieldAlert className="mt-px size-3.5 shrink-0" />
                      {$t('Son résultat est calculé avec tous les droits : ses lecteurs le voient en entier, quels que soient leurs filtres sur les tables d’origine. Réglez ses accès sur la vue elle-même (Droits), comme pour une table.')}
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}
            {exists && datasource && schema ? (
              <div className="space-y-2">
                <p className="text-xs font-medium">{$t('Cette vue existe : elle sera remplacée.')}</p>
                <ImpactList target={{ datasource, schema, name }} verb="replace" />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">{$t('Aucune de vos sources ne garde de vues : il faut un catalogue Iceberg (ou un connecteur Trino qui les accepte, Hive ou Delta).')}</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {$t('Annuler')}
          </Button>
          <Button onClick={save} disabled={busy || !datasource || !schema || !validName || !sql.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : materialized ? <Layers /> : <Eye />}
            {exists ? $t('Remplacer la vue') : $t('Créer la vue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The views of a source: their SELECT, what reads them, to edit in the SQL editor or remove. */
export function SourceViews({ source }: { source: Datasource }) {
  const qc = useQueryClient()
  const router = useRouter()
  const { data, isLoading, error } = useQuery({ queryKey: viewsKey(source.id), queryFn: () => api.get<SourceView[]>(`/v1/datasources/${source.id}/views`) })
  const [removing, setRemoving] = useState<SourceView | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const refresh = async (v: SourceView) => {
    try {
      await api.post(`${impactPath({ datasource: source.id, schema: v.schema, name: v.name })}/refresh`, {})
      toast.success($t('« {name} » se rafraîchit en arrière-plan.', { name: v.name }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }
  const reschedule = async (v: SourceView, value: string) => {
    try {
      await api.put(`${impactPath({ datasource: source.id, schema: v.schema, name: v.name })}/schedule`, { hours: value ? Number(value) : null })
      await qc.invalidateQueries({ queryKey: viewsKey(source.id) })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  if (isLoading) return <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />
  if (error) return <p className="m-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{(error as Error).message}</p>
  const views = data ?? []
  return (
    <div className="space-y-4 px-6 py-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{$t('Vues Trino')}</h2>
          <p className="text-sm text-muted-foreground">{$t('Les vues du catalogue « {catalog} ». Créez-en depuis l’éditeur SQL : « Enregistrer comme vue ».', { catalog: source.catalog })}</p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link href="/sql">
            <Code2 /> {$t('Éditeur SQL')}
          </Link>
        </Button>
      </div>
      {views.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{$t('Aucune vue dans les schémas de cette source.')}</p>
      ) : (
        <div className="divide-y rounded-xl border">
          {views.map((v) => {
            const key = `${v.schema}.${v.name}`
            const target = { datasource: source.id, schema: v.schema, name: v.name }
            return (
              <div key={key} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {v.materialized ? <Layers className="size-4 shrink-0 text-violet-600" /> : <Eye className="size-4 shrink-0 text-violet-500" />}
                  <button type="button" onClick={() => setOpen(open === key ? null : key)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-mono text-sm font-medium">{v.name}</span>
                      {v.materialized ? (
                        <span className="shrink-0 rounded-full bg-violet-50 px-1.5 py-px text-[10px] font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">{$t('Matérialisée')}</span>
                      ) : null}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {source.catalog}.{v.schema}
                      {v.materialized ? (
                        <span className={cn('ml-2 font-sans', v.freshness === 'STALE' && 'text-amber-600 dark:text-amber-400')}>
                          {v.fresh_at ? $t('calculée {when}', { when: formatAgo(v.fresh_at) }) : $t('pas encore calculée')}
                          {v.freshness === 'STALE' ? ` · ${$t('périmée')}` : ''}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  {v.materialized ? (
                    <>
                      <Choice value={v.refresh_hours ? String(v.refresh_hours) : ''} onValueChange={(value) => void reschedule(v, value)} options={scheduleOptions()} aria-label={$t('Fréquence de rafraîchissement')} className="w-44" searchable={false} />
                      <Button size="sm" variant="ghost" onClick={() => void refresh(v)}>
                        <RefreshCw /> {$t('Rafraîchir')}
                      </Button>
                    </>
                  ) : null}
                  {v.table ? (
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/data/${source.id}/${v.table}`}>
                        <Table2 /> {$t('Table')}
                      </Link>
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => router.push(`/sql?view=${encodeURIComponent(viewKey(target))}&sql=${encodeURIComponent(v.definition)}`)}>
                    <Pencil /> {$t('Modifier')}
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setRemoving(v)} aria-label={$t('Supprimer « {name} »', { name: v.name })}>
                    <Trash2 />
                  </Button>
                </div>
                {open === key ? (
                  <div className="mt-3 space-y-3">
                    <pre className="max-h-72 overflow-auto rounded-lg bg-code p-3 font-mono text-xs whitespace-pre-wrap text-code-foreground">{v.definition}</pre>
                    <ImpactList target={target} verb="replace" />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={$t('Supprimer la vue « {name} » ?', { name: removing?.name ?? '' })}
        description={$t('Elle disparaît du catalogue Trino, et sa table d’insights à la synchronisation qui suit.')}
        confirmLabel={$t('Supprimer la vue')}
        onConfirm={async () => {
          if (!removing) return
          try {
            await api.delete(impactPath({ datasource: source.id, schema: removing.schema, name: removing.name }))
            await Promise.all([qc.invalidateQueries({ queryKey: viewsKey(source.id) }), qc.invalidateQueries({ queryKey: keys.datasources })])
            toast.success($t('Vue « {name} » supprimée.', { name: removing.name }))
          } catch (err) {
            toast.error(err instanceof Error ? err.message : String(err))
          }
          setRemoving(null)
        }}
      >
        {removing ? <ImpactList target={{ datasource: source.id, schema: removing.schema, name: removing.name }} verb="drop" /> : null}
      </ConfirmDialog>
    </div>
  )
}
