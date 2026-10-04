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
import { useFolders, useMe } from '@/lib/queries'
import { FolderOpen, Palette, Trash2 } from 'lucide-react'
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
export function folderRights(folder: Folder) {
  return {
    theme: folder.access === 'edit' || folder.access === 'manage',
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
  if (!rights.theme && !rights.remove && as === 'dropdown') return null
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
