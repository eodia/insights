'use client'

import type { Folder } from '@eodia/contracts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { $t, $tp } from '@/lib/i18n'
import { keys, useMe } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CornerLeftUp, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface Contents {
  folders: number
  dashboards: number
  questions: number
}

/** What a folder holds, said in words: « 2 tableaux de bord, 5 questions et 1 sous-dossier ». */
function described(c: Contents): string {
  const parts = [
    c.dashboards ? $tp(c.dashboards, '{count} tableau de bord', '{count} tableaux de bord') : null,
    c.questions ? $tp(c.questions, '{count} question', '{count} questions') : null,
    c.folders ? $tp(c.folders, '{count} sous-dossier', '{count} sous-dossiers') : null,
  ].filter((p): p is string => p !== null)
  if (parts.length === 0) return $t('Le dossier est vide.')
  const last = parts.pop() as string
  return parts.length
    ? $t('Il contient {list} et {last}.', { list: parts.join(', '), last })
    : $t('Il contient {last}.', { last })
}

/**
 * Deleting a folder: what it holds goes up to its parent, or goes with it. Models and metrics
 * count as questions; a question created in a dashboard goes with its dashboard.
 */
export function DeleteFolderDialog({
  folder,
  parent,
  open,
  onOpenChange,
  onDeleted,
}: {
  folder: Folder
  /** Its parent's name, or null at the root. */
  parent: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: (mode: 'move' | 'delete') => void
}) {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const contents = useQuery({
    queryKey: ['folder-contents', folder.id],
    queryFn: () => api.get<Contents>(`/v1/folders/${folder.id}/contents`),
    enabled: open,
  })
  // At the root, only an administrator files things there.
  const canMove = folder.parent !== null || !!me?.is_admin
  const empty = contents.data
    ? contents.data.folders + contents.data.dashboards + contents.data.questions === 0
    : false
  const [mode, setMode] = useState<'move' | 'delete'>('move')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setMode(canMove ? 'move' : 'delete')
  }, [open, canMove])

  const run = async () => {
    setBusy(true)
    try {
      await api.delete(`/v1/folders/${folder.id}?mode=${empty ? 'move' : mode}`)
      // Away from it first; what was read of it is forgotten, not read again.
      onOpenChange(false)
      onDeleted(empty ? 'move' : mode)
      qc.removeQueries({ queryKey: keys.items(folder.id) })
      qc.removeQueries({ queryKey: ['folder', folder.id] })
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.folders }),
        qc.invalidateQueries({ queryKey: ['folder-items'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      toast.success($t('Dossier « {name} » supprimé.', { name: folder.name }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const choice = (
    value: 'move' | 'delete',
    Icon: typeof Trash2,
    title: string,
    text: string,
    disabled = false,
  ) => (
    <button
      type="button"
      // biome-ignore lint/a11y/useSemanticElements: a card to click, with a title and a sentence — not a bare radio
      role="radio"
      aria-checked={mode === value}
      disabled={disabled}
      onClick={() => setMode(value)}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        mode === value
          ? value === 'delete'
            ? 'border-destructive bg-destructive/5'
            : 'border-primary bg-primary/5'
          : 'hover:bg-muted/60',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          mode === value && value === 'delete' ? 'text-destructive' : 'text-muted-foreground',
        )}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {$t('Supprimer le dossier « {name} » ?', { name: folder.name })}
          </DialogTitle>
          <DialogDescription>
            {contents.isLoading ? (
              <Loader2 className="inline size-4 animate-spin" />
            ) : contents.data ? (
              described(contents.data)
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {contents.data && !empty ? (
          <div
            role="radiogroup"
            aria-label={$t('Que faire de son contenu ?')}
            className="space-y-2"
          >
            {choice(
              'move',
              CornerLeftUp,
              parent
                ? $t('Reporter le contenu dans « {parent} »', { parent })
                : $t('Reporter le contenu à la racine'),
              canMove
                ? $t(
                    'Tableaux de bord, questions et sous-dossiers remontent d’un niveau ; seul le dossier disparaît.',
                  )
                : $t('Seul un administrateur range des éléments à la racine.'),
              !canMove,
            )}
            {choice(
              'delete',
              Trash2,
              $t('Tout supprimer'),
              $t(
                'Le dossier part avec tout ce qu’il contient, sous-dossiers compris. Les tableaux de bord ailleurs perdent les cartes de ses questions.',
              ),
            )}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {$t('Annuler')}
          </Button>
          <Button variant="destructive" disabled={busy || !contents.data} onClick={run}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {!empty && mode === 'delete' ? $t('Tout supprimer') : $t('Supprimer le dossier')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
