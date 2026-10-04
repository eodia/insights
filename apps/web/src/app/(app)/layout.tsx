'use client'

import { CopilotPanel } from '@/components/app/copilot'
import { DemoBanner } from '@/components/app/demo-banner'
import { SaveDialog } from '@/components/app/dialogs'
import { Palette } from '@/components/app/palette'
import { Sidebar } from '@/components/app/sidebar'
import { Topbar } from '@/components/app/topbar'
import { api, rememberWorkspace, storedWorkspace } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { keys, useMe } from '@/lib/queries'
import { useUi } from '@/lib/store'
import type { Dashboard, Folder } from '@eodia/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading, error } = useMe()
  const sidebar = useUi((s) => s.sidebar)
  const copilot = useUi((s) => s.copilot)
  const router = useRouter()
  const path = usePathname()
  const qc = useQueryClient()
  const [newFolder, setNewFolder] = useState(false)
  const [newDashboard, setNewDashboard] = useState(false)
  const currentFolder = path.startsWith('/browse/') ? path.split('/')[2] : undefined
  // The space the server settled on (the one asked for, or the one the person works in) is the
  // one this browser asks for from now on.
  useEffect(() => {
    if (me?.workspace && storedWorkspace() !== me.workspace.id) rememberWorkspace(me.workspace.id)
  }, [me?.workspace])

  if (isLoading || (!me && !error)) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }
  if (!me) return null

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebar ? <Sidebar /> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <DemoBanner />
        <Topbar onNewFolder={() => setNewFolder(true)} onNewDashboard={() => setNewDashboard(true)} />
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-auto">{children}</main>
          {copilot ? <CopilotPanel /> : null}
        </div>
      </div>
      <Palette />
      <SaveDialog
        open={newFolder}
        onOpenChange={setNewFolder}
        title={$t('Nouveau dossier')}
        description={$t('Rangez questions et tableaux de bord ; les droits du dossier s’appliquent à son contenu.')}
        initial={{ folder: currentFolder ?? null }}
        submitLabel={$t('Créer')}
        onSubmit={async (v) => {
          const f = await api.post<Folder>('/v1/folders', { name: v.name, description: v.description || null, parent: v.folder })
          await qc.invalidateQueries({ queryKey: keys.folders })
          await qc.invalidateQueries({ queryKey: ['folder-items'] })
          router.push(`/browse/${f.id}`)
        }}
      />
      <SaveDialog
        open={newDashboard}
        onOpenChange={setNewDashboard}
        title={$t('Nouveau tableau de bord')}
        initial={{ folder: currentFolder ?? null }}
        submitLabel={$t('Créer')}
        onSubmit={async (v) => {
          const d = await api.post<Dashboard>('/v1/dashboards', { name: v.name, description: v.description || null, folder: v.folder })
          router.push(`/dashboard/${d.id}?edit=1`)
        }}
      />
    </div>
  )
}
