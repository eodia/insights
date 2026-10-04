'use client'

import type { Workspace } from '@eodia/contracts'
import { Empty, PageHeader, Spinner, fail } from '@/components/app/admin/common'
import { NewWorkspaceDialog, WorkspaceLogo } from '@/components/app/workspace-menu'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { $t, $tp } from '@/lib/i18n'
import { keys, useMe } from '@/lib/queries'
import { useCrumbs } from '@/lib/store'
import { enterWorkspace } from '@/lib/workspace'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, ArrowRight, Plus, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

/** Every space of the instance, for its administrators: create, enter, archive. */
function Spaces({ current }: { current: string }) {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const spaces = useQuery({ queryKey: ['workspaces'], queryFn: () => api.get<Workspace[]>('/v1/workspaces') })
  const archive = async (w: Workspace, archived: boolean) => {
    try {
      await api.patch(`/v1/workspaces/${w.id}`, { archived })
      await Promise.all([qc.invalidateQueries({ queryKey: ['workspaces'] }), qc.invalidateQueries({ queryKey: keys.me })])
      toast.success(archived ? $t('« {name} » est archivé', { name: w.name }) : $t('« {name} » est rouvert', { name: w.name }))
    } catch (err) {
      fail(err)
    }
  }
  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <PageHeader
        title={$t('Espaces')}
        description={$t('Chaque espace a ses sources, ses dossiers, ses groupes et ses droits ; une personne peut appartenir à plusieurs. Les administrateurs de l’instance les voient tous.')}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> {$t('Nouvel espace')}
          </Button>
        }
      />
      {spaces.isLoading ? (
        <Spinner />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {(spaces.data ?? []).map((w) => (
            <li key={w.id} className={`flex flex-col gap-3 rounded-xl border bg-card p-4 ${w.archived ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-3">
                <WorkspaceLogo workspace={w} className="size-11 text-sm" iconClassName="size-5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{w.name}</span>
                    {w.id === current ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{$t('Ici')}</span> : null}
                    {w.archived ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{$t('Archivé')}</span> : null}
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{w.description || $t('Sans description')}</p>
                </div>
              </div>
              <div className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex-1">
                  {$tp(w.members, '{count} membre', '{count} membres')}
                  {w.role ? ` · ${w.role === 'admin' ? $t('vous l’administrez') : $t('vous en êtes membre')}` : ''}
                </span>
                {w.archived ? (
                  <Button size="sm" variant="ghost" onClick={() => void archive(w, false)}>
                    <ArchiveRestore /> {$t('Rouvrir')}
                  </Button>
                ) : (
                  <>
                    {w.id !== current ? (
                      <Button size="sm" variant="ghost" onClick={() => void archive(w, true)}>
                        <Archive /> {$t('Archiver')}
                      </Button>
                    ) : null}
                    {w.id !== current ? (
                      <Button size="sm" variant="outline" onClick={() => void enterWorkspace(w.id)}>
                        {$t('Entrer')} <ArrowRight />
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <NewWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}

export default function WorkspacesPage() {
  const { data: me } = useMe()
  useCrumbs([{ label: $t('Administration') }, { label: $t('Espaces') }])
  if (!me) return <Spinner />
  if (!me.can.create_workspaces) {
    return (
      <Empty icon={<ShieldAlert className="size-5" />} title={$t('Accès réservé')}>
        {$t('Cet écran est réservé aux administrateurs de l’instance.')}
      </Empty>
    )
  }
  return <Spaces current={me.workspace.id} />
}
