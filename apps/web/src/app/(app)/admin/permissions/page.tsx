'use client'

import type { Group } from '@eodia/contracts'
import { AdminOnly, Empty, GroupTile, Notice, Spinner, useGroups, usePermissions } from '@/components/app/admin/common'
import { DataMatrix, FolderMatrix, groupSummary } from '@/components/app/admin/permission-matrix'
import { Button } from '@/components/ui/button'
import { $t, $tp, groupName } from '@/lib/i18n'
import { useDatasources, useFolders } from '@/lib/queries'
import { useCrumbs } from '@/lib/store'
import { cn } from '@/lib/utils'
import { ChevronDown, Info, Lock, Shield, Users } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useState } from 'react'
import { Pane } from '@/components/ui/pane'
import { TabRow } from '@/components/ui/tab-row'

type Tab = 'data' | 'folders'

function HowItWorks() {
  const [open, setOpen] = useState(false)
  return (
    <Notice className="mb-5">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left font-medium">
        <Info className="size-4 shrink-0" />
        <span className="flex-1">{$t('Les permissions s’additionnent d’un groupe à l’autre, et Trino les applique partout.')}</span>
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <ul className="mt-3 ml-6 list-disc space-y-1.5">
          <li>{$t('Une personne reçoit l’union des droits de tous ses groupes, « Tous les utilisateurs » compris.')}</li>
          <li>{$t('« Lecture » l’emporte sur « Restreint » : si un autre groupe de la personne lit la table en entier, les règles de colonnes et de lignes de ce groupe ne s’appliquent pas.')}</li>
          <li>{$t('L’accès se règle sur la source entière, puis s’affine par schéma ou par table. « Hérité » reprend le niveau du dessus.')}</li>
          <li>{$t('« Restreint » applique les colonnes masquées ou cachées et les règles de lignes du groupe, et interdit le SQL natif.')}</li>
          <li>{$t('Les règles sont appliquées par Trino lui-même, qui interroge l’endpoint OPA de l’API : SQL, éditeur visuel, copilot, API et MCP passent tous par là.')}</li>
        </ul>
      ) : null}
    </Notice>
  )
}

function Permissions({ initialGroup }: { initialGroup: string | undefined }) {
  const router = useRouter()
  const { data: groups = [], isLoading } = useGroups()
  const { data: perms, isLoading: loadingPerms, error } = usePermissions()
  const { data: datasources = [] } = useDatasources()
  const { data: folders = [] } = useFolders()
  const [selected, setSelected] = useState<string | undefined>(initialGroup)
  const [tab, setTab] = useState<Tab>('data')
  const order = { admin: 0, all: 1, custom: 2 } as const
  const sorted = [...groups].sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name))
  const current: Group | undefined = sorted.find((g) => g.id === selected) ?? sorted.find((g) => g.kind === 'custom') ?? sorted[0]

  const choose = (id: string) => {
    setSelected(id)
    router.replace(`/admin/permissions?group=${id}`, { scroll: false })
  }

  return (
    <div className="flex h-full">
      <Pane as="section" id="admin.permissions.groups" side="left" defaultSize={320} min={240} max={560} className="flex flex-col border-r">
        <div className="border-b px-4 py-3">
          <div className="font-semibold">{$t('Permissions')}</div>
          <div className="text-xs text-muted-foreground">{$t('Choisissez un groupe pour régler ses droits.')}</div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {isLoading ? <Spinner /> : null}
          <div className="pt-4">
            <div className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {$t('Groupes')} <span className="ml-1 font-normal">{groups.length}</span>
            </div>
            {sorted.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => choose(g.id)}
                className={cn('relative flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors', current?.id === g.id ? 'bg-muted' : 'hover:bg-muted/60')}
              >
                {current?.id === g.id ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" /> : null}
                <GroupTile kind={g.kind} />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate font-semibold">{groupName(g.name)}</span>
                    {g.kind === 'admin' ? <Lock className="size-3.5 text-muted-foreground" /> : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{perms ? groupSummary(perms, g) : '…'}</div>
                  <div className="text-xs text-muted-foreground">{$tp(g.members, '{count} membre', '{count} membres')}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="border-t p-3">
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href="/admin/groups">
              <Users /> {$t('Gérer les groupes et leurs membres')}
            </Link>
          </Button>
        </div>
      </Pane>

      <section className="flex min-w-0 flex-1 flex-col">
        {current ? (
          <>
            <div className="flex items-center gap-4 border-b px-8 pt-5">
              <GroupTile kind={current.kind} className="size-11" />
              <div className="min-w-0 flex-1 pb-1">
                <h1 className="truncate text-lg font-semibold">{current.name}</h1>
                <p className="truncate text-sm text-muted-foreground">{current.description || $tp(current.members, '{count} membre', '{count} membres')}</p>
              </div>
            </div>
            <TabRow className="h-11 items-center gap-6 border-b px-8 text-[15px]">
              {(['data', 'folders'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn('relative py-3', tab === t ? 'font-semibold after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary' : 'text-muted-foreground hover:text-foreground')}
                >
                  {t === 'data' ? $t('Données') : $t('Dossiers')}
                </button>
              ))}
            </TabRow>
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-6xl px-8 py-6">
                {error ? <Notice tone="warn">{(error as Error).message}</Notice> : null}
                {loadingPerms ? <Spinner /> : null}
                {perms ? (
                  tab === 'data' ? (
                    <>
                      <HowItWorks />
                      {current.kind === 'admin' ? (
                        <Notice className="mb-4 flex items-center gap-2">
                          <Shield className="size-4 shrink-0" />
                          {$t('Les administrateurs lisent tout : leurs droits ne se règlent pas.')}
                        </Notice>
                      ) : null}
                      {current.kind === 'all' ? (
                        <p className="mb-4 text-sm text-muted-foreground">{$t('Ce que vous accordez ici, tout le monde l’a. Accordez plutôt les accès larges à des groupes dédiés.')}</p>
                      ) : null}
                      <DataMatrix group={current} perms={perms} datasources={datasources} />
                      {current.kind !== 'admin' ? (
                        <p className="mt-4 text-xs text-muted-foreground">
                          {$t('Dépliez une source pour régler ses schémas et ses tables. Une table en accès « Restreint » se règle colonne par colonne, et peut porter une règle de lignes qui cite les attributs de la personne, comme {{user.region}}.')}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <p className="mb-4 text-sm text-muted-foreground">
                        {$t('Les droits d’un dossier valent pour son contenu et ses sous-dossiers, sauf réglage plus fin. « Gestion » permet de régler les droits du dossier. Les dossiers personnels restent privés.')}
                      </p>
                      <FolderMatrix group={current} perms={perms} folders={folders} />
                    </>
                  )
                ) : null}
              </div>
            </div>
          </>
        ) : !isLoading ? (
          <Empty icon={<Users className="size-5" />} title={$t('Aucun groupe')} />
        ) : null}
      </section>
    </div>
  )
}

export default function PermissionsPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const { group } = use(searchParams)
  useCrumbs([{ label: $t('Administration') }, { label: $t('Permissions') }])
  return (
    <AdminOnly right="manage_permissions">
      <Permissions initialGroup={group} />
    </AdminOnly>
  )
}
