'use client'

import type { Folder, ItemSummary } from '@eodia/contracts'
import { ItemTile, KIND_LABELS } from '@/components/app/look'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { useTables } from '@/lib/queries'
import { useUi } from '@/lib/store'
import { useQuery } from '@tanstack/react-query'
import { Command } from 'cmdk'
import { Code2, Database, Home, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export const itemHref = (item: Pick<ItemSummary, 'kind' | 'id'>) =>
  item.kind === 'dashboard' ? `/dashboard/${item.id}` : item.kind === 'folder' ? `/browse/${item.id}` : `/question/${item.id}`

/** Ctrl K: everything the person can open, one keystroke away. */
export function Palette() {
  const open = useUi((s) => s.palette)
  const setOpen = useUi((s) => s.setPalette)
  const router = useRouter()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 180)
    return () => clearTimeout(t)
  }, [q])
  const { data } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<{ items: ItemSummary[]; folders: Folder[] }>(`/v1/search?q=${encodeURIComponent(debounced)}`),
    enabled: open,
  })
  const { data: tables = [] } = useTables()
  const go = (href: string) => {
    setOpen(false)
    setQ('')
    router.push(href)
  }
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const matchingTables = debounced ? tables.filter((t) => fold(`${t.label} ${t.name}`).includes(fold(debounced))).slice(0, 6) : []

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[20%] translate-y-0 overflow-hidden p-0 sm:max-w-xl" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{$t('Rechercher')}</DialogTitle>
        <Command shouldFilter={false} className="flex flex-col">
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="size-4 text-muted-foreground" />
            <Command.Input value={q} onValueChange={setQ} placeholder={$t('Questions, tableaux de bord, tables, dossiers…')} className="h-12 flex-1 bg-transparent text-sm outline-none" />
          </div>
          <Command.List className="max-h-[420px] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">{$t('Aucun résultat')}</Command.Empty>
            {!debounced ? (
              <Command.Group heading={$t('Aller à')} className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {[
                  { href: '/', label: $t('Accueil'), icon: Home },
                  { href: '/sql', label: $t('Éditeur SQL'), icon: Code2 },
                  { href: '/data', label: $t('Sources de données'), icon: Database },
                ].map((l) => (
                  <Command.Item key={l.href} value={l.href} onSelect={() => go(l.href)} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground data-[selected=true]:bg-accent">
                    <l.icon className="size-4 text-muted-foreground" /> {l.label}
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
            {(data?.items ?? []).length > 0 ? (
              <Command.Group heading={$t('Éléments')} className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {(data?.items ?? []).map((item) => (
                  <Command.Item key={item.id} value={item.id} onSelect={() => go(itemHref(item))} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm text-foreground data-[selected=true]:bg-accent">
                    <ItemTile kind={item.kind} className="size-7" />
                    <span className="flex-1 truncate">{item.name}</span>
                    <span className="text-xs text-muted-foreground">{$t(KIND_LABELS[item.kind])}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
            {matchingTables.length > 0 ? (
              <Command.Group heading={$t('Tables')} className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {matchingTables.map((t) => (
                  <Command.Item key={t.id} value={t.id} onSelect={() => go(`/question/new?table=${t.id}`)} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm text-foreground data-[selected=true]:bg-accent">
                    <ItemTile kind="table" className="size-7" />
                    <span className="flex-1 truncate">{t.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">{t.schema}.{t.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
            {(data?.folders ?? []).length > 0 && debounced ? (
              <Command.Group heading={$t('Dossiers')} className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {(data?.folders ?? []).map((f) => (
                  <Command.Item key={f.id} value={f.id} onSelect={() => go(`/browse/${f.id}`)} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm text-foreground data-[selected=true]:bg-accent">
                    <ItemTile kind="folder" personal={!!f.personal} className="size-7" />
                    <span className="flex-1 truncate">{f.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
