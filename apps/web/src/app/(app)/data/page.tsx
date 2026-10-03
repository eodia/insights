'use client'

import { type Datasource, ENGINE_SPECS } from '@eodia/contracts'
import { NewSourceDialog } from '@/components/app/data/new-source-dialog'
import { CatalogName, ENGINE_NAMES, EngineBadge, SCHEDULE_LABELS, SyncDot, syncSummary } from '@/components/app/data/source-look'
import { Chip } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { formatCount } from '@/lib/format'
import { $t, $tp } from '@/lib/i18n'
import { keys, useMe } from '@/lib/queries'
import { useCrumbs } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Database, Loader2, Plus, Search, TableProperties } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

const busy = (d: Datasource) => d.sync.status === 'running' || d.sync.status === 'queued'

function SourceRow({ ds }: { ds: Datasource }) {
  return (
    <div className="group relative flex items-center gap-4 rounded-xl border bg-card px-4 py-4 transition-colors hover:border-primary/40 hover:bg-muted/40">
      <EngineBadge engine={ds.engine} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Link href={`/data/${ds.id}`} className="truncate font-semibold after:absolute after:inset-0 after:content-['']">
            {ds.name}
          </Link>
          <CatalogName catalog={ds.catalog} suffix={`.${$t('schéma.table')}`} />
        </div>
        <div className="truncate text-sm text-muted-foreground">{ds.description || $t('Aucune description')}</div>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <Chip color="indigo">{ENGINE_NAMES[ds.engine]}</Chip>
          <Chip>{$t(SCHEDULE_LABELS[ds.sync.schedule])}</Chip>
          {ds.options.native_sql && ENGINE_SPECS[ds.engine].nativeQuery ? <Chip color="teal">{$t('SQL natif')}</Chip> : null}
        </div>
      </div>
      <div className="hidden w-64 shrink-0 space-y-1.5 text-sm md:block">
        <div className="flex items-center gap-2">
          <SyncDot status={ds.sync.status} />
          <span className={cn('truncate', ds.sync.status === 'failed' && 'text-destructive')}>{syncSummary(ds)}</span>
        </div>
        <div className="text-xs whitespace-nowrap text-muted-foreground">
          {[$tp(ds.stats.schemas, '{count} schéma', '{count} schémas'), $tp(ds.stats.tables, '{count} table', '{count} tables'), $tp(ds.stats.columns, '{count} colonne', '{count} colonnes')].join(' · ')}
        </div>
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-1">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/structure/${ds.id}`}>
            <TableProperties /> {$t('Structure')}
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/data/${ds.id}`}>
            {$t('Ouvrir')} <ArrowUpRight />
          </Link>
        </Button>
      </div>
    </div>
  )
}

function DataSources() {
  useCrumbs([{ label: $t('Sources de données'), href: '/data' }])
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { data: me } = useMe()
  const canManage = !!me?.can.manage_sources
  const { data: sources = [], isLoading } = useQuery({
    queryKey: keys.datasources,
    queryFn: () => api.get<Datasource[]>('/v1/datasources'),
    refetchInterval: (q) => ((q.state.data ?? []).some(busy) ? 2000 : false),
  })
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState(false)
  const open = dialog || (params.get('new') === '1' && canManage)
  const setOpen = (v: boolean) => {
    setDialog(v)
    if (!v && params.get('new') === '1') router.replace(pathname)
  }
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const visible = sources.filter((d) => !search || fold(`${d.name} ${d.catalog} ${d.engine} ${d.description ?? ''}`).includes(fold(search)))
  const totals = sources.reduce((a, d) => ({ tables: a.tables + d.stats.tables, columns: a.columns + d.stats.columns }), { tables: 0, columns: 0 })

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{$t('Sources de données')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {$t('Chaque source devient un catalogue Trino : le SQL cite ses tables en {path}.', { path: $t('catalogue.schéma.table') })}
            </p>
          </div>
          {canManage ? (
            <Button onClick={() => setDialog(true)}>
              <Plus /> {$t('Ajouter une source')}
            </Button>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            [$t('Sources'), sources.length],
            [$t('Tables'), totals.tables],
            [$t('Colonnes'), totals.columns],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl border p-4">
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
              <div className="mt-1 text-2xl font-semibold">{formatCount(value as number)}</div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {$t('Sources connectées')} <span className="ml-1 font-normal">{sources.length}</span>
            </div>
            <span className="flex-1" />
            <div className="relative w-64">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={$t('Rechercher une source…')} className="h-9 rounded-lg pl-9" />
            </div>
          </div>
          {isLoading ? <Loader2 className="mx-auto mt-10 size-5 animate-spin text-muted-foreground" /> : null}
          {visible.map((ds) => (
            <SourceRow key={ds.id} ds={ds} />
          ))}
          {!isLoading && visible.length === 0 ? (
            <div className="rounded-xl border border-dashed px-6 py-14 text-center">
              <Database className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                {sources.length === 0 ? $t('Aucune source connectée pour l’instant.') : $t('Aucune source ne correspond à la recherche.')}
              </p>
              {canManage && sources.length === 0 ? (
                <Button className="mt-4" size="sm" onClick={() => setDialog(true)}>
                  <Plus /> {$t('Ajouter une source')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {canManage ? <NewSourceDialog open={open} onOpenChange={setOpen} onCreated={(ds) => router.push(`/data/${ds.id}`)} /> : null}
    </div>
  )
}

export default function DataPage() {
  return (
    <Suspense fallback={<Loader2 className="m-10 size-5 animate-spin text-muted-foreground" />}>
      <DataSources />
    </Suspense>
  )
}
