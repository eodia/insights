'use client'

import type { ColumnMeta, ColumnPatch, TableMeta, TablePatch } from '@eodia/contracts'
import { api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { keys } from '@/lib/queries'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { toast } from 'sonner'

type FullTable = TableMeta & { columns: ColumnMeta[] }

/** Saves a table's metadata and puts the answer in the cache. */
export function usePatchTable(tableId: string) {
  const qc = useQueryClient()
  return useCallback(
    async (patch: TablePatch) => {
      try {
        const t = await api.patch<FullTable>(`/v1/tables/${tableId}`, patch)
        qc.setQueryData(keys.table(tableId), t)
        void qc.invalidateQueries({ queryKey: ['tables'] })
        void qc.invalidateQueries({ queryKey: keys.tree })
        return t
      } catch (err) {
        toast.error(err instanceof Error ? err.message : $t('Enregistrement impossible.'))
        throw err
      }
    },
    [qc, tableId],
  )
}

/** Saves a column's metadata and replaces it in its table's cache. */
export function usePatchColumn(tableId: string) {
  const qc = useQueryClient()
  return useCallback(
    async (columnId: string, patch: ColumnPatch) => {
      try {
        const col = await api.patch<ColumnMeta>(`/v1/columns/${columnId}`, patch)
        qc.setQueryData<FullTable>(keys.table(tableId), (t) => (t ? { ...t, columns: t.columns.map((c) => (c.id === col.id ? col : c)) } : t))
        if ('fk' in patch || 'semantic' in patch) void qc.invalidateQueries({ queryKey: ['relations'] })
        if ('label' in patch || 'fk' in patch) void qc.invalidateQueries({ queryKey: ['tables'] })
        void qc.invalidateQueries({ queryKey: keys.tree })
        return col
      } catch (err) {
        toast.error(err instanceof Error ? err.message : $t('Enregistrement impossible.'))
        throw err
      }
    },
    [qc, tableId],
  )
}
