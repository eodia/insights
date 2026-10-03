'use client'

import type { Datasource, TableMeta } from '@eodia/contracts'
import { EngineBadge, SyncDot } from '@/components/app/data/source-look'
import { LookIcon } from '@/components/app/look'
import { Input } from '@/components/ui/input'
import { LOOK_CLASSES } from '@/lib/format'
import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ChevronRight, EyeOff, FolderTree, Loader2, Search, Table2, Wrench } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Pane } from '@/components/ui/pane'

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export function TableGlyph({ table, className }: { table: Pick<TableMeta, 'icon' | 'color'>; className?: string }) {
  return (
    <span className={cn('inline-flex size-7 shrink-0 items-center justify-center rounded-lg', LOOK_CLASSES[table.color ?? 'gray'], className)}>
      {table.icon ? <LookIcon name={table.icon} className="size-3.5" /> : <Table2 className="size-3.5" />}
    </span>
  )
}

/** Source → schéma → table, the left pane of « Structure ». */
export function StructureTree({
  sources,
  tables,
  loading,
  datasource,
  table,
}: {
  sources: readonly Datasource[]
  tables: readonly TableMeta[]
  loading: boolean
  datasource: string | null
  table: string | null
}) {
  const [search, setSearch] = useState('')
  const [closed, setClosed] = useState<Set<string>>(new Set())
  // A source opened through the URL is unfolded.
  useEffect(() => {
    if (datasource) setClosed((s) => (s.has(datasource) ? new Set([...s].filter((x) => x !== datasource)) : s))
  }, [datasource])
  const toggle = (key: string) =>
    setClosed((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const q = fold(search)
  const match = (t: TableMeta) => !q || fold(`${t.label} ${t.name} ${t.schema} ${t.entity ?? ''}`).includes(q)

  return (
    <Pane as="section" id="structure.tree" side="left" defaultSize={300} min={220} max={560} className="flex flex-col border-r">
      <div className="p-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={$t('Rechercher une table…')} className="h-10 rounded-lg pl-9" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <div className="mb-1 px-3 pt-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {$t('Sources')} <span className="ml-1 font-normal">{sources.length}</span>
        </div>
        {loading ? <Loader2 className="mx-auto mt-6 size-5 animate-spin text-muted-foreground" /> : null}
        {sources.map((ds) => {
          const own = tables.filter((t) => t.datasource === ds.id && match(t))
          if (q && own.length === 0) return null
          const open = !closed.has(ds.id) || !!q
          const schemas = new Map<string, TableMeta[]>()
          for (const t of own) schemas.set(t.schema, [...(schemas.get(t.schema) ?? []), t])
          return (
            <div key={ds.id} className="mb-1">
              <div className={cn('group flex items-center gap-1 rounded-lg pr-2', datasource === ds.id && !table ? 'bg-muted' : 'hover:bg-muted/60')}>
                <button type="button" onClick={() => toggle(ds.id)} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground" aria-label={open ? $t('Replier') : $t('Déplier')}>
                  <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
                </button>
                <Link href={`/structure/${ds.id}`} className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
                  <EngineBadge engine={ds.engine} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{ds.name}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{ds.catalog}</span>
                  </span>
                  <SyncDot status={ds.sync.status} />
                </Link>
              </div>
              {open ? (
                <div className="mt-0.5 space-y-0.5">
                  {[...schemas.entries()].map(([schema, list]) => {
                    const key = `${ds.id}/${schema}`
                    const schemaOpen = !closed.has(key) || !!q
                    return (
                      <div key={schema}>
                        <button
                          type="button"
                          onClick={() => toggle(key)}
                          className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 pl-6 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                          <ChevronRight className={cn('size-3.5 transition-transform', schemaOpen && 'rotate-90')} />
                          <FolderTree className="size-3.5" />
                          <span className="flex-1 truncate font-mono">{schema}</span>
                          <span className="font-normal">{list.length}</span>
                        </button>
                        {schemaOpen
                          ? list.map((t) => {
                              const active = t.id === table
                              return (
                                <Link
                                  key={t.id}
                                  href={`/structure/${ds.id}/${t.id}`}
                                  className={cn('relative ml-4 flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors', active ? 'bg-muted' : 'hover:bg-muted/60')}
                                >
                                  {active ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" /> : null}
                                  <TableGlyph table={t} />
                                  <span className="min-w-0 flex-1">
                                    <span className={cn('block truncate text-sm', active && 'font-semibold', t.visibility !== 'normal' && 'text-muted-foreground')}>{t.label}</span>
                                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{t.name}</span>
                                  </span>
                                  {t.visibility === 'hidden' ? <EyeOff className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                                  {t.visibility === 'technical' ? <Wrench className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                                </Link>
                              )
                            })
                          : null}
                      </div>
                    )
                  })}
                  {own.length === 0 && !loading ? <p className="py-2 pl-10 text-xs text-muted-foreground">{$t('Aucune table synchronisée.')}</p> : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </Pane>
  )
}
