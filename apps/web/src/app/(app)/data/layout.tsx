'use client'

import { NewSourceDialog } from '@/components/app/data/new-source-dialog'
import { StructureTree } from '@/components/app/structure/tree'
import { useDatasources, useMe, useTables } from '@/lib/queries'
import { useParams, usePathname, useSearchParams } from 'next/navigation'
import { useRouter } from '@/lib/router'
import { type ReactNode, Suspense } from 'react'

/**
 * The tree of « Sources de données » lives here, not in the page: a page is made anew for each
 * table opened, and the tree would come back folded, at the top of its list.
 */
export default function DataLayout({ children }: { children: ReactNode }) {
  const { path = [] } = useParams<{ path?: string[] }>()
  const [datasource = null, table = null] = path
  const { data: me } = useMe()
  const canManage = !!me?.can.manage_sources
  const { data: sources = [], isLoading: loadingSources } = useDatasources()
  const { data: tables = [], isLoading: loadingTables } = useTables()
  const router = useRouter()
  const pathname = usePathname()

  return (
    <div className="flex h-full">
      <StructureTree
        sources={sources}
        tables={tables}
        loading={loadingSources || loadingTables}
        datasource={datasource}
        table={table}
        onAdd={canManage ? () => router.replace(`${pathname}?new=1`, { scroll: false }) : undefined}
      />
      <div className="flex min-w-0 flex-1">{children}</div>
      {canManage ? (
        <Suspense fallback={null}>
          <AddSource />
        </Suspense>
      ) : null}
    </div>
  )
}

/** « Ajouter une source », opened by `?new=1` — from the tree, a page, or « Nouveau ». */
function AddSource() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  return (
    <NewSourceDialog
      open={params.get('new') === '1'}
      onOpenChange={(open) => {
        if (!open) router.replace(pathname, { scroll: false })
      }}
      onCreated={(ds) => router.push(`/data/${ds.id}?tab=connection`)}
    />
  )
}
