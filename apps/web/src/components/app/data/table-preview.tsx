'use client'

import { cn } from '@/lib/utils'
import type { TableMeta } from '@eodia/contracts'
import { DataTable, TableRemote, type TableRemoteApi } from '@/components/app/visualization'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { type RunResult, api, download } from '@/lib/api'
import { formatCount } from '@/lib/format'
import { $t } from '@/lib/i18n'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

const LIMITS = [100, 1000, 10_000] as const

/**
 * The first rows of a table, read as any question is: under the reader's identity, their row
 * filters and masks applied — what the table holds, seen by who looks at it. Its search and its
 * export read the whole table again, not only the rows shown.
 */
export function TablePreview({ table, fill = false }: { table: TableMeta; /** Takes the height it is given, as a tab of its own. */ fill?: boolean }) {
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>(100)
  // The rows read, not a LIMIT of the query: beyond them, the result says it is cut (« tronqué »).
  const query = useMemo(() => ({ kind: 'builder' as const, source: { kind: 'table' as const, id: table.id } }), [table.id])
  const run = useQuery({
    queryKey: ['table-preview', table.id, limit],
    queryFn: () => api.post<RunResult>('/v1/query', { query, limit }),
    staleTime: 60_000,
    retry: false,
  })
  const remote = useMemo<TableRemoteApi>(
    () => ({
      search: (search) => api.post<RunResult>('/v1/query', { query, search, limit: Math.max(limit, 1000) }),
      export: (format, search) => download('/v1/query/export', { query, format, name: table.label, ...(search ? { search } : {}) }),
    }),
    [query, limit, table.label],
  )

  return (
    <div className={cn('flex flex-col gap-2', fill ? 'min-h-0 flex-1' : 'h-[min(70vh,720px)] min-h-80')}>
      <div className="flex items-center gap-2 px-1">
        <Segmented
          value={String(limit)}
          onValueChange={(v) => setLimit(Number(v) as (typeof LIMITS)[number])}
          aria-label={$t('Nombre de lignes')}
          inline
          options={LIMITS.map((n) => ({ value: String(n), label: $t('{n} premières', { n: formatCount(n) }) }))}
        />
        {run.isFetching ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => void run.refetch()}>
          <RefreshCw /> {$t('Rafraîchir')}
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/question/new?table=${table.id}`}>
            <ExternalLink /> {$t('Explorer dans une question')}
          </Link>
        </Button>
      </div>
      <div className="min-h-0 flex-1 rounded-xl border p-2">
        {run.error ? (
          <p className="m-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{(run.error as Error).message}</p>
        ) : run.data ? (
          <TableRemote.Provider value={remote}>
            <DataTable result={run.data} looks={run.data.looks} settings={{ row_numbers: true, density: 'compact' }} exportName={table.label} persistKey={`table:${table.id}`} />
          </TableRemote.Provider>
        ) : (
          <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  )
}
