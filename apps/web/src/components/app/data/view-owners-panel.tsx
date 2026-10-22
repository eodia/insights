'use client'

import type { Datasource } from '@eodia/contracts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { formatAgo } from '@/lib/format'
import { $t } from '@/lib/i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Loader2, ShieldAlert, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface ViewOwners {
  readonly owners: string[]
  readonly refused: { user: string; at: string }[]
}

/**
 * The owners of views allowed to read this source's catalog. A view made in another Trino runs
 * with its owner's rights (SECURITY DEFINER): its reads are checked under that name, unknown here.
 * A name listed only reads, only the catalogs listing it, and never runs a query by itself.
 */
export function ViewOwnersPanel({ source }: { source: Datasource }) {
  const qc = useQueryClient()
  const key = ['view-owners', source.id]
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<ViewOwners>(`/v1/datasources/${source.id}/view-owners`), refetchInterval: 15_000 })
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const owners = data?.owners ?? []

  const save = async (next: string[], done: string) => {
    setBusy(true)
    try {
      await api.put(`/v1/datasources/${source.id}/view-owners`, { owners: next })
      await qc.invalidateQueries({ queryKey: key })
      toast.success(done)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  const add = (user: string) => {
    const u = user.trim()
    if (!u || owners.includes(u)) return
    void save([...owners, u], $t('« {name} » peut lire ce catalogue pour ses vues.', { name: u }))
    setName('')
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Eye className="size-4 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium">{$t('Propriétaires de vues')}</span>
        {isLoading || busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {$t('Une vue créée dans un autre Trino lit ses tables avec les droits de son propriétaire. Autorisez ici les propriétaires dont les vues lisent ce catalogue : ils ne peuvent que lire, seulement les catalogues qui les autorisent, et jamais lancer de requête eux-mêmes.')}
      </p>
      {owners.length ? (
        <div className="flex flex-wrap gap-1.5">
          {owners.map((o) => (
            <span key={o} className="inline-flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pr-1 pl-2 font-mono text-xs">
              {o}
              <button
                type="button"
                onClick={() => void save(owners.filter((x) => x !== o), $t('« {name} » ne lit plus ce catalogue.', { name: o }))}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={$t('Retirer « {name} »', { name: o })}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add(name)
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={$t('Nom de l’utilisateur Trino')} className="h-8 font-mono text-xs" />
        <Button type="submit" size="sm" variant="outline" disabled={!name.trim() || busy}>
          {$t('Autoriser')}
        </Button>
      </form>
      {data?.refused.length ? (
        <div className="space-y-1.5 rounded-lg bg-amber-50/70 p-2.5 dark:bg-amber-950/40">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-200">
            <ShieldAlert className="size-3.5" /> {$t('Identités refusées récemment sur ce catalogue')}
          </div>
          {data.refused.map((r) => (
            <div key={r.user} className="flex items-center gap-2 text-xs">
              <span className="font-mono">{r.user}</span>
              <span className="flex-1 text-muted-foreground">{formatAgo(r.at)}</span>
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={busy} onClick={() => add(r.user)}>
                {$t('Autoriser')}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
