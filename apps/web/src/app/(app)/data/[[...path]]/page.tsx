'use client'

import type { ColumnPatch } from '@eodia/contracts'
import { NewSourceDialog } from '@/components/app/data/new-source-dialog'
import { SourceSettings } from '@/components/app/data/source-settings'
import { SourcesOverview } from '@/components/app/data/sources-overview'
import { CatalogName, ENGINE_NAMES, EngineBadge, SyncDot, syncSummary } from '@/components/app/data/source-look'
import { Chip } from '@/components/app/look'
import { ColumnList } from '@/components/app/structure/column-list'
import { ColumnPanel } from '@/components/app/structure/column-panel'
import { RelationsDiagram } from '@/components/app/structure/relations'
import { TableEditor } from '@/components/app/structure/table-editor'
import { StructureTree, TableGlyph } from '@/components/app/structure/tree'
import { usePatchColumn, usePatchTable } from '@/components/app/structure/use-metadata'
import { Button } from '@/components/ui/button'
import { formatCount } from '@/lib/format'
import { $t, $tp } from '@/lib/i18n'
import { useDatasources, useMe, useTable, useTables } from '@/lib/queries'
import { useCrumbs } from '@/lib/store'
import { cn } from '@/lib/utils'
import { ArrowUpRight, Database, Loader2, Lock, TableProperties } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, use, useCallback, useEffect, useState } from 'react'
import { TabRow } from '@/components/ui/tab-row'

type Tab = 'tables' | 'relations' | 'connection'

/**
 * A data source, all in one place: its tables — each one with its columns, described for the
 * builder and the assistant —, the relations between them, and its connection.
 */
function SourceWorkspace({ segments }: { segments: string[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { data: me } = useMe()
  const readOnly = !me?.can.manage_metadata
  const canManage = !!me?.can.manage_sources
  const [adding, setAdding] = useState(false)
  // « Nouveau › Source de données » arrives with `?new=1`.
  const add = adding || (params.get('new') === '1' && canManage)
  const setAdd = (v: boolean) => {
    setAdding(v)
    if (!v && params.get('new') === '1') router.replace(pathname)
  }
  const { data: sources = [], isLoading: loadingSources } = useDatasources()
  const { data: allTables = [], isLoading: loadingTables } = useTables()
  const [dsParam, tableId = null] = segments
  // Arriving on `/data`, no source is chosen: they are all shown, as folders.
  const datasourceId = dsParam ?? null
  const source = sources.find((s) => s.id === datasourceId)
  const { data: table, error: tableError } = useTable(tableId)
  const { data: sourceTables = [] } = useTables(datasourceId ?? undefined, true)
  const asked = params.get('tab')
  const tab: Tab = asked === 'relations' || asked === 'connection' ? asked : 'tables'
  const [column, setColumn] = useState<string | null>(null)
  const patchTable = usePatchTable(tableId ?? '')
  const patchColumnRaw = usePatchColumn(tableId ?? '')
  const patchColumn = useCallback((id: string, patch: ColumnPatch) => patchColumnRaw(id, patch).catch(() => undefined), [patchColumnRaw])

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new table closes the column panel
  useEffect(() => setColumn(null), [tableId])
  useCrumbs([
    { label: $t('Sources de données'), href: '/data' },
    ...(source ? [{ label: source.name, href: `/data/${source.id}` }] : []),
    ...(table && tableId ? [{ label: table.label }] : []),
  ])

  const setTab = (t: Tab) => router.replace(t === 'tables' ? pathname : `${pathname}?tab=${t}`)
  const selected = table?.columns.find((c) => c.id === column) ?? null
  const ownTables = allTables.filter((t) => t.datasource === datasourceId)

  return (
    <div className="flex h-full">
      <StructureTree sources={sources} tables={allTables} loading={loadingSources || loadingTables} datasource={datasourceId} table={tableId} onAdd={canManage ? () => setAdd(true) : undefined} />

      {!datasourceId ? (
        <section className="min-w-0 flex-1 overflow-y-auto">
          <SourcesOverview sources={sources} tables={allTables} loading={loadingSources} onAdd={canManage ? () => setAdd(true) : undefined} />
        </section>
      ) : (
      <section className="flex min-w-0 flex-1 flex-col">
        <TabRow className="h-12 shrink-0 items-center gap-6 border-b px-6 text-[15px]">
          {(['tables', 'relations', 'connection'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn('relative py-3', tab === t ? 'font-semibold after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary' : 'text-muted-foreground hover:text-foreground')}
            >
              {t === 'tables' ? (tableId ? $t('Table et colonnes') : $t('Tables')) : t === 'relations' ? $t('Relations') : $t('Connexion')}
            </button>
          ))}
          <span className="flex-1" />
          {readOnly ? (
            <Chip color="amber" className="gap-1">
              <Lock className="size-3" /> {$t('Lecture seule')}
            </Chip>
          ) : null}
        </TabRow>

        {tab === 'connection' ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {datasourceId ? <SourceSettings id={datasourceId} /> : <p className="m-10 text-center text-sm text-muted-foreground">{$t('Aucune source.')}</p>}
          </div>
        ) : tab === 'relations' ? (
          <div className="min-h-0 flex-1">
            {datasourceId ? (
              <RelationsDiagram datasource={datasourceId} current={tableId} readOnly={readOnly} />
            ) : (
              <p className="m-10 text-center text-sm text-muted-foreground">{$t('Aucune source.')}</p>
            )}
          </div>
        ) : tableId ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tableError ? (
              <p className="m-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{(tableError as Error).message}</p>
            ) : !table ? (
              <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />
            ) : (
              <div className="space-y-6 px-6 py-6">
                <TableEditor table={table} source={source} readOnly={readOnly} aiEnabled={!!me?.ai_enabled} onPatch={patchTable} />
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {$t('Colonnes')} <span className="ml-1 font-normal">{table.columns.filter((c) => c.status === 'active').length}</span>
                    </div>
                    <span className="flex-1" />
                    <span className="text-xs text-muted-foreground">{$t('Cliquez une colonne pour sa description, son format et ses valeurs.')}</span>
                  </div>
                  <ColumnList columns={table.columns} tables={sourceTables} selected={column} readOnly={readOnly} onSelect={setColumn} onPatch={(id, p) => void patchColumn(id, p)} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {source ? (
              <div className="space-y-6 px-6 py-6">
                <div className="flex items-start gap-4">
                  <EngineBadge engine={source.engine} size="lg" />
                  <div className="min-w-0 flex-1">
                    <h1 className="text-2xl font-semibold tracking-tight">{source.name}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <CatalogName catalog={source.catalog} suffix={`.${$t('schéma.table')}`} />
                      <span>·</span>
                      <span>{ENGINE_NAMES[source.engine]}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1.5">
                        <SyncDot status={source.sync.status} /> {syncSummary(source)}
                      </span>
                    </div>
                    {source.description ? <p className="mt-2 text-sm">{source.description}</p> : null}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setTab('connection')}>
                    <Database /> {$t('Connexion')}
                  </Button>
                </div>
                <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {$t('Tables')} <span className="ml-1 font-normal">{ownTables.length}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {ownTables.map((t) => (
                    <Link key={t.id} href={`/data/${source.id}/${t.id}`} className="group flex items-start gap-3 rounded-xl border p-4 transition-colors hover:border-primary/40 hover:bg-muted/40">
                      <TableGlyph table={t} className="size-9 rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 font-semibold">
                          <span className="truncate">{t.label}</span>
                          <ArrowUpRight className="ml-auto size-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                        </div>
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          {t.schema}.{t.name}
                        </div>
                        <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.description || t.native_comment || $t('Sans description')}</div>
                        {t.row_count != null ? <div className="mt-2 font-mono text-[11px] text-muted-foreground">{$tp(t.row_count, '≈ {n} ligne', '≈ {n} lignes', { n: formatCount(t.row_count) })}</div> : null}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : loadingSources ? (
              <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />
            ) : (
              <div className="m-auto mt-24 max-w-sm space-y-3 text-center">
                <TableProperties className="mx-auto size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{$t('Aucune source connectée : ajoutez-en une pour décrire ses tables.')}</p>
                {canManage ? (
                  <Button size="sm" onClick={() => setAdd(true)}>
                    {$t('Ajouter une source')}
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        )}
      </section>
      )}

      {canManage ? <NewSourceDialog open={add} onOpenChange={setAdd} onCreated={(ds) => router.push(`/data/${ds.id}?tab=connection`)} /> : null}

      {tab === 'tables' && selected && table ? (
        <ColumnPanel column={selected} tables={sourceTables} readOnly={readOnly} onClose={() => setColumn(null)} onPatch={patchColumn} />
      ) : null}
    </div>
  )
}

export default function SourcePage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = use(params)
  return (
    <Suspense fallback={<Loader2 className="m-10 size-5 animate-spin text-muted-foreground" />}>
      <SourceWorkspace segments={path ?? []} />
    </Suspense>
  )
}
