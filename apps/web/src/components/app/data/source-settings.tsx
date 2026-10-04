'use client'

import type { Datasource } from '@eodia/contracts'
import { SourceForm } from '@/components/app/data/source-form'
import { CatalogName } from '@/components/app/data/source-look'
import { SyncPanel } from '@/components/app/data/sync-panel'
import { ConfirmDialog } from '@/components/app/dialogs'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { formatCount } from '@/lib/format'
import { $t } from '@/lib/i18n'
import { keys, useEngines, useMe } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Pencil, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

function ConnectionView({ source, canEdit }: { source: Datasource; canEdit: boolean }) {
  const qc = useQueryClient()
  const { data: engines } = useEngines()
  const spec = engines?.find((e) => e.engine === source.engine)
  const [editing, setEditing] = useState(false)
  if (!spec) return <Loader2 className="mx-auto mt-6 size-5 animate-spin text-muted-foreground" />

  if (editing) {
    return (
      <div className="rounded-xl border p-5">
        <SourceForm
          spec={spec}
          source={source}
          onCancel={() => setEditing(false)}
          onSaved={async (ds) => {
            qc.setQueryData(['datasource', source.id], ds)
            await qc.invalidateQueries({ queryKey: keys.datasources })
            await qc.invalidateQueries({ queryKey: keys.tree })
            toast.success($t('Connexion enregistrée.'))
            setEditing(false)
          }}
        />
      </div>
    )
  }

  const rows: [string, React.ReactNode][] = spec.fields.map((f) => {
    const v = source.config[f.key]
    const value = f.secret
      ? source.secrets.includes(f.key)
        ? '•••••'
        : '—'
      : typeof v === 'boolean'
        ? v
          ? $t('Oui')
          : $t('Non')
        : v === undefined || v === ''
          ? '—'
          : String(v)
    return [$t(f.label), <span key={f.key} className={cn(typeof v !== 'boolean' && 'font-mono text-[13px]')}>{value}</span>]
  })
  const trino = Object.entries(source.options.trino_properties ?? {})
  return (
    <div className="space-y-4">
      <div className="rounded-xl border">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <div className="flex-1 text-sm font-semibold">{$t('Paramètres de connexion')}</div>
          {canEdit ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> {$t('Modifier')}
            </Button>
          ) : null}
        </div>
        <dl className="divide-y text-sm">
          {[
            [$t('Moteur'), $t(spec.label)],
            [$t('Catalogue Trino'), <CatalogName key="c" catalog={source.catalog} />],
            ...rows,
            [$t('SQL natif'), source.options.native_sql ? $t('Autorisé') : $t('Interdit')],
            [$t('Cache des résultats'), source.options.cache_ttl != null ? $t('{n} s', { n: source.options.cache_ttl }) : $t('Réglage de l’instance')],
          ].map(([k, v]) => (
            <div key={k as string} className="flex gap-4 px-4 py-2.5">
              <dt className="w-48 shrink-0 text-muted-foreground">{k}</dt>
              <dd className="min-w-0 flex-1 truncate">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      {trino.length ? (
        <div className="rounded-xl border">
          <div className="border-b px-4 py-3 text-sm font-semibold">{$t('Propriétés du catalogue Trino')}</div>
          <div className="divide-y font-mono text-xs">
            {trino.map(([k, v]) => (
              <div key={k} className="flex gap-2 px-4 py-2">
                <span className="text-muted-foreground">{k}</span>=<span>{v}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * A source's « Connexion » tab: its size, its connection, its synchronisation and — for who
 * manages the sources — its removal. Read again every two seconds while a sync runs.
 */
export function SourceSettings({ id }: { id: string }) {
  const router = useRouter()
  const qc = useQueryClient()
  const { data: me } = useMe()
  const { data: source, error } = useQuery({
    queryKey: ['datasource', id],
    queryFn: () => api.get<Datasource>(`/v1/datasources/${id}`),
    refetchInterval: (q) => (q.state.data && (q.state.data.sync.status === 'running' || q.state.data.sync.status === 'queued') ? 2000 : false),
  })
  const [confirm, setConfirm] = useState(false)
  if (error) return <p className="m-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{(error as Error).message}</p>
  if (!source) return <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />
  const canSources = !!me?.can.manage_sources

  return (
    <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        {source.description ? <p className="text-sm">{source.description}</p> : null}
        <ConnectionView source={source} canEdit={canSources} />
      </div>
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-2">
          {[
            [$t('Schémas'), source.stats.schemas],
            [$t('Tables'), source.stats.tables],
            [$t('Colonnes'), source.stats.columns],
          ].map(([l, v]) => (
            <div key={l as string} className="rounded-xl border px-3 py-2.5">
              <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{l}</div>
              <div className="mt-0.5 text-xl font-semibold">{formatCount(v as number)}</div>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{$t('Synchronisation')}</div>
          <SyncPanel source={source} canSync={!!me?.can.manage_metadata} />
        </div>
        {canSources ? (
          <div className="space-y-2 border-t pt-5">
            <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{$t('Zone sensible')}</div>
            <p className="text-xs text-muted-foreground">{$t('Supprimer la source retire son catalogue de Trino, ses métadonnées et ses permissions. Les questions qui l’utilisent ne fonctionneront plus.')}</p>
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirm(true)}>
              <Trash2 /> {$t('Supprimer la source')}
            </Button>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={$t('Supprimer « {name} » ?', { name: source.name })}
        description={$t('Le catalogue « {catalog} » sera retiré de Trino. Cette action est définitive.', { catalog: source.catalog })}
        onConfirm={async () => {
          try {
            await api.delete(`/v1/datasources/${source.id}`)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : String(err))
            return
          }
          await qc.invalidateQueries({ queryKey: keys.datasources })
          await qc.invalidateQueries({ queryKey: keys.tree })
          toast.success($t('Source supprimée.'))
          router.push('/data')
        }}
      />
    </div>
  )
}
