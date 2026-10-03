'use client'

import type { ColumnPatch } from '@eodia/contracts'
import { CatalogName, EngineBadge, syncSummary } from '@/components/app/data/source-look'
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

type Tab = 'table' | 'relations'

function Structure({ segments }: { segments: string[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { data: me } = useMe()
  const readOnly = !me?.can.manage_metadata
  const { data: sources = [], isLoading: loadingSources } = useDatasources()
  const { data: allTables = [], isLoading: loadingTables } = useTables()
  const [dsParam, tableId = null] = segments
  const datasourceId = dsParam ?? sources[0]?.id ?? null
  const source = sources.find((s) => s.id === datasourceId)
  const { data: table, error: tableError } = useTable(tableId)
  const { data: sourceTables = [] } = useTables(datasourceId ?? undefined, true)
  const tab: Tab = params.get('tab') === 'relations' ? 'relations' : 'table'
  const [column, setColumn] = useState<string | null>(null)
  const patchTable = usePatchTable(tableId ?? '')
  const patchColumnRaw = usePatchColumn(tableId ?? '')
  const patchColumn = useCallback((id: string, patch: ColumnPatch) => patchColumnRaw(id, patch).catch(() => undefined), [patchColumnRaw])

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new table closes the column panel
  useEffect(() => setColumn(null), [tableId])
  useCrumbs([
    { label: $t('Structure'), href: '/structure' },
    ...(source ? [{ label: source.name, href: `/structure/${source.id}` }] : []),
    ...(table && tableId ? [{ label: table.label }] : []),
  ])

  const setTab = (t: Tab) => router.replace(t === 'relations' ? `${pathname}?tab=relations` : pathname)
  const selected = table?.columns.find((c) => c.id === column) ?? null
  const ownTables = allTables.filter((t) => t.datasource === datasourceId)

  return (
    <div className="flex h-full">
      <StructureTree sources={sources} tables={allTables} loading={loadingSources || loadingTables} datasource={datasourceId} table={tableId} />

      <section className="flex min-w-0 flex-1 flex-col">
        <TabRow className="h-12 shrink-0 items-center gap-6 border-b px-6 text-[15px]">
          {(['table', 'relations'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn('relative py-3', tab === t ? 'font-semibold after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary' : 'text-muted-foreground hover:text-foreground')}
            >
              {t === 'table' ? $t('Table et colonnes') : $t('Relations')}
            </button>
          ))}
          <span className="flex-1" />
          {readOnly ? (
            <Chip color="amber" className="gap-1">
              <Lock className="size-3" /> {$t('Lecture seule')}
            </Chip>
          ) : null}
          {source ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/data/${source.id}`}>
                <Database /> {$t('Source')}
              </Link>
            </Button>
          ) : null}
        </TabRow>

        {tab === 'relations' ? (
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
                      <span>· {syncSummary(source)}</span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setTab('relations')}>
                    {$t('Voir les relations')}
                  </Button>
                </div>
                <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {$t('Tables')} <span className="ml-1 font-normal">{ownTables.length}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {ownTables.map((t) => (
                    <Link key={t.id} href={`/structure/${source.id}/${t.id}`} className="group flex items-start gap-3 rounded-xl border p-4 transition-colors hover:border-primary/40 hover:bg-muted/40">
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
                <Button asChild size="sm">
                  <Link href="/data?new=1">{$t('Ajouter une source')}</Link>
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {tab === 'table' && selected && table ? (
        <ColumnPanel column={selected} tables={sourceTables} readOnly={readOnly} onClose={() => setColumn(null)} onPatch={patchColumn} />
      ) : null}
    </div>
  )
}

export default function StructurePage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = use(params)
  return (
    <Suspense fallback={<Loader2 className="m-10 size-5 animate-spin text-muted-foreground" />}>
      <Structure segments={path ?? []} />
    </Suspense>
  )
}
