'use client'

import type { Datasource, Engine, SourceDependency } from '@eodia/contracts'
import { SourceForm } from '@/components/app/data/source-form'
import { ConfirmDialog } from '@/components/app/dialogs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Segmented } from '@/components/ui/segmented'
import { api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { keys, useDatasources, useEngines } from '@/lib/queries'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Cable, Link2, Loader2, Pencil, Plus, Unlink } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { EngineBadge } from './source-look'

interface Dependencies {
  readonly dependencies: SourceDependency[]
  readonly available: SourceDependency[]
}

/**
 * The technical catalogs a source's views read — raw tables in another catalog, say: created in
 * Trino, never shown as sources nor synchronised, read by no one directly, only by the views of
 * the source, under their owners' names (« Propriétaires de vues »).
 */
export function DependenciesPanel({ source }: { source: Datasource }) {
  const qc = useQueryClient()
  const key = ['dependencies', source.id]
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<Dependencies>(`/v1/datasources/${source.id}/dependencies`) })
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<SourceDependency | null>(null)
  const [removing, setRemoving] = useState<SourceDependency | null>(null)
  const [busy, setBusy] = useState(false)
  const deps = data?.dependencies ?? []

  const link = async (ids: string[], done: string) => {
    setBusy(true)
    try {
      await api.put(`/v1/datasources/${source.id}/dependencies`, { ids })
      await Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ['view-owners', source.id] })])
      toast.success(done)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Cable className="size-4 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium">{$t('Catalogues techniques')}</span>
        {isLoading || busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus /> {$t('Ajouter')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {$t('Les catalogues que lisent les vues de cette source, sans être exposés : créés dans Trino, jamais synchronisés ni montrés, lus seulement par ces vues sous le nom de leurs propriétaires.')}
      </p>
      {deps.length ? (
        <div className="divide-y rounded-lg border">
          {deps.map((d) => (
            <div key={d.id} className="flex items-center gap-2.5 px-3 py-2">
              <EngineBadge engine={d.engine} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-sm">{d.catalog}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {d.name}
                  {d.shared_with.length ? ` · ${$t('aussi cité par {sources}', { sources: d.shared_with.join(', ') })}` : ''}
                </div>
              </div>
              <Button size="icon-sm" variant="ghost" onClick={() => setEditing(d)} aria-label={$t('Modifier « {name} »', { name: d.catalog })}>
                <Pencil />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => setRemoving(d)} aria-label={$t('Retirer « {name} »', { name: d.catalog })}>
                <Unlink />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      {data?.available.length ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">{$t('Rattacher un catalogue de l’espace :')}</span>
          {data.available.map((d) => (
            <Button
              key={d.id}
              size="sm"
              variant="outline"
              className="h-7 px-2 font-mono text-xs"
              disabled={busy}
              onClick={() => void link([...deps.map((x) => x.id), d.id], $t('« {name} » rattaché.', { name: d.catalog }))}
            >
              <Link2 /> {d.catalog}
            </Button>
          ))}
        </div>
      ) : null}

      {adding ? (
        <DependencyDialog
          title={$t('Nouveau catalogue technique')}
          createPath={`/v1/datasources/${source.id}/dependencies`}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false)
            await Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ['view-owners', source.id] })])
            toast.success($t('Catalogue technique créé dans Trino.'))
          }}
        />
      ) : null}
      {editing ? (
        <DependencyDialog
          title={$t('Catalogue technique « {name} »', { name: editing.catalog })}
          id={editing.id}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await qc.invalidateQueries({ queryKey: key })
            toast.success($t('Connexion enregistrée.'))
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={$t('Retirer « {name} » ?', { name: removing?.catalog ?? '' })}
        description={
          removing?.shared_with.length
            ? $t('Les vues de cette source ne le liront plus ; il reste en place pour les autres sources qui le citent.')
            : $t('Les vues de cette source ne le liront plus, et aucune autre source ne le cite : il est supprimé de Trino.')
        }
        confirmLabel={$t('Retirer')}
        onConfirm={async () => {
          if (!removing) return
          await link(
            deps.filter((d) => d.id !== removing.id).map((d) => d.id),
            $t('« {name} » retiré.', { name: removing.catalog }),
          )
          setRemoving(null)
        }}
      />
    </div>
  )
}

/** A technical catalog's connection: a new one (Iceberg or any Trino connector), or one to change. */
function DependencyDialog({ title, id, createPath, onClose, onSaved }: { title: string; id?: string; createPath?: string; onClose: () => void; onSaved: () => void }) {
  const { data: engines } = useEngines()
  const existing = useQuery({ queryKey: ['datasource', id], queryFn: () => api.get<Datasource>(`/v1/datasources/${id}`), enabled: !!id })
  const [engine, setEngine] = useState<Engine>('iceberg')
  const spec = engines?.find((e) => e.engine === (existing.data?.engine ?? engine))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{$t('Sa connexion, comme une source ; il ne sera ni montré ni synchronisé.')}</DialogDescription>
        </DialogHeader>
        {!id ? (
          <Segmented
            value={engine}
            onValueChange={(v) => setEngine(v as Engine)}
            aria-label={$t('Moteur')}
            inline
            options={[
              { value: 'iceberg', label: 'Apache Iceberg' },
              { value: 'trino', label: $t('Connecteur Trino (avancé)') },
            ]}
          />
        ) : null}
        {spec && (!id || existing.data) ? (
          <SourceForm key={spec.engine} spec={spec} {...(existing.data ? { source: existing.data } : {})} {...(createPath ? { createPath } : {})} technical onCancel={onClose} onSaved={onSaved} />
        ) : (
          <Loader2 className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * A source that only serves the views of another — raw tables added to make them work — made a
 * technical catalog of it: it leaves the lists, no one reads it directly any more.
 */
export function MakeTechnicalPanel({ source }: { source: Datasource }) {
  const router = useRouter()
  const qc = useQueryClient()
  const { data: sources = [] } = useDatasources()
  const [open, setOpen] = useState(false)
  const [main, setMain] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const mains = sources.filter((s) => s.id !== source.id && !s.shared)
  if (!mains.length) return null
  const save = async () => {
    setBusy(true)
    try {
      await api.post(`/v1/datasources/${source.id}/internal`, { main })
      await Promise.all([qc.invalidateQueries({ queryKey: keys.datasources }), qc.invalidateQueries({ queryKey: keys.tree })])
      toast.success($t('« {name} » est désormais un catalogue technique.', { name: source.catalog }))
      router.push(`/data/${main}?tab=connection`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2 border-t pt-5">
      <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{$t('Catalogue technique')}</div>
      <p className="text-xs text-muted-foreground">{$t('Cette source ne sert qu’aux vues d’une autre ? Faites-en un catalogue technique de celle-ci : elle disparaît des listes, et plus personne ne la lit directement.')}</p>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Cable /> {$t('Rattacher à une autre source…')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{$t('Faire de « {name} » un catalogue technique', { name: source.catalog })}</DialogTitle>
            <DialogDescription>{$t('Choisissez la source dont les vues lisent ce catalogue. Ses tables quittent l’explorateur ; ses propriétaires de vues s’ajoutent à ceux de la source choisie.')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {mains.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setMain(s.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm ${main === s.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/60'}`}
              >
                <EngineBadge engine={s.engine} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{s.catalog}</span>
                </span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {$t('Annuler')}
            </Button>
            <Button onClick={save} disabled={!main || busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {$t('Rattacher')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
