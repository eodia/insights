'use client'

/**
 * Filing by drag and drop: a question, a dashboard or a folder is dragged onto a folder — in
 * the list of a folder or in the sidebar — and moves there. The server checks the rights.
 */
import type { ItemKind } from '@eodia/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from './api'
import { $t } from './i18n'
import { keys } from './queries'

const MIME = 'application/x-eodia-item'

export interface Dragged {
  readonly kind: ItemKind
  readonly id: string
  readonly name: string
  /** Where it is now: a drop there does nothing. */
  readonly folder: string | null
}

/** Props that make an element draggable as `item`. */
export function draggable(item: Dragged) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(MIME, JSON.stringify(item))
      e.dataTransfer.effectAllowed = 'move'
    },
  }
}

async function move(item: Dragged, folder: string | null): Promise<void> {
  if (item.kind === 'folder') await api.patch(`/v1/folders/${item.id}`, { parent: folder })
  else if (item.kind === 'dashboard') await api.patch(`/v1/dashboards/${item.id}`, { folder })
  else await api.patch(`/v1/questions/${item.id}`, { folder })
}

/** Props and state of a folder an item can be dropped on; `null` is the root. */
export function useDropFolder(folder: string | null, name: string) {
  const qc = useQueryClient()
  const [over, setOver] = useState(false)
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(MIME)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (!over) setOver(true)
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      },
      onDrop: async (e: React.DragEvent) => {
        setOver(false)
        const raw = e.dataTransfer.getData(MIME)
        if (!raw) return
        e.preventDefault()
        const item = JSON.parse(raw) as Dragged
        if (item.folder === folder || (item.kind === 'folder' && item.id === folder)) return
        try {
          await move(item, folder)
          await Promise.all([
            qc.invalidateQueries({ queryKey: keys.folders }),
            qc.invalidateQueries({ queryKey: ['folder-items'] }),
          ])
          toast.success(
            $t('« {item} » rangé dans « {folder} ».', { item: item.name, folder: name }),
          )
        } catch (err) {
          toast.error(err instanceof Error ? err.message : String(err))
        }
      },
    },
  }
}
