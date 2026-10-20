'use client'

import type { Datasource, SourceSchema } from '@eodia/contracts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { $t, $tp } from '@/lib/i18n'
import { keys } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderTree, Loader2, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

/** The name a schema shows: its label, or its own name. */
export function schemaLabel(source: Pick<Datasource, 'options'> | undefined, schema: string): string {
  return source?.options.schema_labels?.[schema] || schema
}

/**
 * Which schemas of a source are shown — a database full of the engine's own, say — and the names
 * they show under. Saving synchronises the structure again.
 */
export function SchemasPanel({ source, canEdit }: { source: Datasource; canEdit: boolean }) {
  const [open, setOpen] = useState(false)
  const chosen = source.options.schemas ?? []
  const labels = Object.keys(source.options.schema_labels ?? {}).length
  return (
    <div className="space-y-2 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <FolderTree className="size-4 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium">{$t('Schémas')}</span>
        {canEdit ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {$t('Choisir et renommer')}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {chosen.length ? $tp(chosen.length, '{count} schéma affiché, les autres sont laissés de côté.', '{count} schémas affichés, les autres sont laissés de côté.') : $t('Tous les schémas sont affichés, hors schémas système.')}
        {labels ? ` ${$tp(labels, '{count} renommé.', '{count} renommés.')}` : ''}
      </p>
      {open ? <SchemasDialog source={source} onClose={() => setOpen(false)} /> : null}
    </div>
  )
}

function SchemasDialog({ source, onClose }: { source: Datasource; onClose: () => void }) {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['source-schemas', source.id], queryFn: () => api.get<SourceSchema[]>(`/v1/datasources/${source.id}/schemas`) })
  const [shown, setShown] = useState<Set<string>>(new Set())
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [q, setQ] = useState('')
  const [showSystem, setShowSystem] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!list.data) return
    setShown(new Set(list.data.filter((s) => s.shown).map((s) => s.name)))
    setLabels(Object.fromEntries(list.data.filter((s) => s.label).map((s) => [s.name, s.label as string])))
  }, [list.data])
  const open = useMemo(() => (list.data ?? []).filter((s) => !s.system), [list.data])
  const visible = (list.data ?? []).filter((s) => (showSystem || !s.system) && (!q || `${s.name} ${labels[s.name] ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())))
  const system = (list.data ?? []).length - open.length

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`/v1/datasources/${source.id}/schemas`, { schemas: [...shown], labels })
      await Promise.all([qc.invalidateQueries({ queryKey: ['datasource', source.id] }), qc.invalidateQueries({ queryKey: keys.datasources }), qc.invalidateQueries({ queryKey: keys.tree })])
      toast.success($t('Schémas enregistrés : la structure se synchronise.'))
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{$t('Schémas de « {name} »', { name: source.name })}</DialogTitle>
          <DialogDescription>{$t('Cochez les schémas à garder ; un nom à afficher les rend plus lisibles. La structure est synchronisée de nouveau à l’enregistrement.')}</DialogDescription>
        </DialogHeader>
        {list.isLoading ? (
          <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" />
        ) : list.error ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{(list.error as Error).message}</p>
        ) : (
          <div className="min-h-0 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={$t('Rechercher un schéma…')} className="h-9 pl-8" />
              </div>
              <Button size="sm" variant="ghost" onClick={() => setShown(new Set(open.map((s) => s.name)))}>
                {$t('Tout cocher')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShown(new Set())}>
                {$t('Tout décocher')}
              </Button>
            </div>
            <div className="max-h-[48vh] space-y-0.5 overflow-y-auto rounded-lg border p-1">
              {visible.map((s) => (
                <div key={s.name} className={cn('flex items-center gap-2.5 rounded-md px-2 py-1.5', s.system ? 'opacity-55' : 'hover:bg-muted/60')}>
                  <Checkbox
                    checked={!s.system && shown.has(s.name)}
                    disabled={s.system}
                    onCheckedChange={(on) =>
                      setShown((x) => {
                        const next = new Set(x)
                        if (on === true) next.add(s.name)
                        else next.delete(s.name)
                        return next
                      })
                    }
                    aria-label={s.name}
                  />
                  <span className="w-44 shrink-0 truncate font-mono text-[13px]" title={s.name}>
                    {s.name}
                  </span>
                  {s.system ? (
                    <span className="flex-1 text-xs text-muted-foreground">{$t('Schéma système')}</span>
                  ) : (
                    <Input
                      value={labels[s.name] ?? ''}
                      onChange={(e) => setLabels((l) => ({ ...l, [s.name]: e.target.value }))}
                      placeholder={$t('Nom affiché')}
                      className="h-8 flex-1 text-sm"
                    />
                  )}
                  <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{s.tables ? $tp(s.tables, '{count} table', '{count} tables') : ''}</span>
                </div>
              ))}
              {visible.length === 0 ? <p className="px-2 py-3 text-center text-xs text-muted-foreground">{$t('Aucun schéma')}</p> : null}
            </div>
            {system ? (
              <button type="button" onClick={() => setShowSystem((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">
                {showSystem ? $t('Masquer les schémas système') : $tp(system, 'Voir le schéma système, toujours masqué', 'Voir les {count} schémas système, toujours masqués')}
              </button>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <span className="mr-auto self-center text-xs text-muted-foreground">{$t('{kept} sur {all}', { kept: shown.size, all: open.length })}</span>
          <Button variant="ghost" onClick={onClose}>
            {$t('Annuler')}
          </Button>
          <Button onClick={save} disabled={saving || shown.size === 0 || !list.data}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {$t('Enregistrer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
