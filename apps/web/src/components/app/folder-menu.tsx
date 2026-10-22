'use client'

import type { Folder } from '@eodia/contracts'
import { DeleteFolderDialog } from '@/components/app/folder-delete'
import { type MenuParts, ThemeEntries } from '@/components/app/theme-picker'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { folderLabel } from '@/lib/folders'
import { $t } from '@/lib/i18n'
import { keys, useFolders, useMe } from '@/lib/queries'
import { FolderOpen, FolderPlus, Palette, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { type ReactElement, useState } from 'react'

const CONTEXT = {
  Root: ContextMenu,
  Trigger: ContextMenuTrigger,
  Content: ContextMenuContent,
  Item: ContextMenuItem,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
}
const DROPDOWN = {
  Root: DropdownMenu,
  Trigger: DropdownMenuTrigger,
  Content: DropdownMenuContent,
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
}

/** Whether the person may dress the folder in a theme, and delete it. */
/** A folder inside `parent`, named here; it opens once made. */
function NewSubfolderDialog({ parent, onClose, onCreated }: { parent: Folder; onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try {
      const f = await api.post<Folder>('/v1/folders', { name: name.trim(), parent: parent.id })
      await Promise.all([qc.invalidateQueries({ queryKey: keys.folders }), qc.invalidateQueries({ queryKey: ['folder-items'] })])
      onCreated(f.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{$t('Nouveau sous-dossier dans « {name} »', { name: parent.name })}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) void create()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="subfolder-name">{$t('Nom')}</Label>
            <Input id="subfolder-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {$t('Annuler')}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {$t('Créer')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** A folder's name and description, changed in place. */
function RenameFolderDialog({ folder, onClose }: { folder: Folder; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(folder.name)
  const [description, setDescription] = useState(folder.description ?? '')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await api.patch(`/v1/folders/${folder.id}`, { name: name.trim(), description: description.trim() || null })
      await Promise.all([qc.invalidateQueries({ queryKey: keys.folders }), qc.invalidateQueries({ queryKey: ['folder-items'] })])
      toast.success($t('Dossier renommé.'))
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{$t('Renommer le dossier')}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) void save()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="folder-name">{$t('Nom')}</Label>
            <Input id="folder-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="folder-description">{$t('Description')}</Label>
            <Textarea id="folder-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={$t('Facultative')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {$t('Annuler')}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {$t('Enregistrer')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function folderRights(folder: Folder) {
  return {
    theme: folder.access === 'edit' || folder.access === 'manage',
    // A personal folder keeps its name: it is « Mon dossier » for its owner.
    rename: (folder.access === 'edit' || folder.access === 'manage') && !folder.personal,
    create: folder.access === 'edit' || folder.access === 'manage',
    remove: folder.access === 'manage' && !folder.personal,
  }
}

/**
 * A folder's menu — on a right click (`context`), or under a button (`dropdown`): open it, its
 * theme, delete it. The same wherever a folder shows: the sidebar, the folder tiles, its title.
 */
export function FolderMenu({ folder, as, children }: { folder: Folder; as: 'context' | 'dropdown'; children: ReactElement }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: folders = [] } = useFolders()
  const { data: me } = useMe()
  const [deleting, setDeleting] = useState(false)
  const rights = folderRights(folder)
  const [renaming, setRenaming] = useState(false)
  const [creating, setCreating] = useState(false)
  if (!rights.theme && !rights.remove && !rights.rename && !rights.create && as === 'dropdown') return null
  const M = as === 'context' ? CONTEXT : DROPDOWN
  const up = folder.parent ? folders.find((f) => f.id === folder.parent) : undefined
  const href = `/browse/${folder.id}`

  return (
    <>
      <M.Root>
        <M.Trigger asChild>{children}</M.Trigger>
        <M.Content {...(as === 'dropdown' ? { align: 'end' as const } : {})}>
          {as === 'context' ? (
            <M.Item asChild>
              <Link href={href}>
                <FolderOpen /> {$t('Ouvrir')}
              </Link>
            </M.Item>
          ) : null}
          {as === 'context' && (rights.rename || rights.create || rights.theme) ? <M.Separator /> : null}
          {rights.rename ? (
            <M.Item onSelect={() => setRenaming(true)}>
              <Pencil /> {$t('Renommer…')}
            </M.Item>
          ) : null}
          {rights.create ? (
            <M.Item onSelect={() => setCreating(true)}>
              <FolderPlus /> {$t('Nouveau sous-dossier…')}
            </M.Item>
          ) : null}
          {rights.theme && (rights.rename || rights.create) ? <M.Separator /> : null}
          {rights.theme ? (
            <M.Sub>
              <M.SubTrigger>
                <Palette /> {$t('Thème')}
              </M.SubTrigger>
              <M.SubContent className="p-1.5">
                <ThemeEntries folderId={folder.id} M={M as unknown as MenuParts} />
              </M.SubContent>
            </M.Sub>
          ) : null}
          {rights.remove ? (
            <>
              <M.Separator />
              <M.Item variant="destructive" onSelect={() => setDeleting(true)}>
                <Trash2 /> {$t('Supprimer le dossier…')}
              </M.Item>
            </>
          ) : null}
        </M.Content>
      </M.Root>
      {renaming ? <RenameFolderDialog folder={folder} onClose={() => setRenaming(false)} /> : null}
      {creating ? (
        <NewSubfolderDialog
          parent={folder}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            router.push(`/browse/${id}`)
          }}
        />
      ) : null}
      {deleting ? (
        <DeleteFolderDialog
          folder={folder}
          parent={up ? folderLabel(up, me?.id) : null}
          open
          onOpenChange={setDeleting}
          onDeleted={(mode) => {
            // The folder shown is gone — or, with all it held, the one shown inside it.
            const current = pathname.match(/^\/browse\/([^/]+)/)?.[1]
            const inside = current === folder.id || (mode === 'delete' && !!folders.find((f) => f.id === current)?.path.some((p) => p.id === folder.id))
            if (inside) router.push(folder.parent ? `/browse/${folder.parent}` : '/browse')
          }}
        />
      ) : null}
    </>
  )
}
