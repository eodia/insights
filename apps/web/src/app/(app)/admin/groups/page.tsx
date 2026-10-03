'use client'

import type { AdminRight, Group } from '@eodia/contracts'
import {
  AdminOnly,
  Empty,
  GROUP_KIND_LABELS,
  GroupTile,
  type Member,
  Notice,
  SectionTitle,
  Spinner,
  adminKeys,
  fail,
  useGroups,
  usePermissions,
  useUsers,
} from '@/components/app/admin/common'
import { ConfirmDialog, SaveDialog } from '@/components/app/dialogs'
import { Avatar, Chip } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Hint } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { $t, $tp } from '@/lib/i18n'
import { keys, useMe } from '@/lib/queries'
import { useCrumbs } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, FolderCog, Loader2, Pencil, Plus, Search, Shield, Trash2, UserMinus, UsersRound } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const RIGHTS: readonly { right: AdminRight; label: string; help: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { right: 'manage_sources', label: 'Gérer les sources', help: 'Connecter des bases, modifier leurs réglages, lancer une synchronisation.', icon: Database },
  { right: 'manage_metadata', label: 'Gérer les métadonnées', help: 'Libellés, descriptions, types sémantiques, relations et valeurs dans « Structure ».', icon: FolderCog },
  { right: 'manage_permissions', label: 'Gérer les permissions', help: 'Groupes, membres, droits sur les données et les dossiers.', icon: Shield },
]

function Members({ group }: { group: Group }) {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const { data: users = [] } = useUsers(!!me?.is_admin)
  const members = useQuery({ queryKey: adminKeys.members(group.id), queryFn: () => api.get<Member[]>(`/v1/admin/groups/${group.id}/members`) })
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const list = members.data ?? []
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const visible = list.filter((m) => !search || fold(`${m.name} ${m.email}`).includes(fold(search)))
  const readOnly = group.kind === 'all'

  const save = async (next: string[]) => {
    setBusy(true)
    try {
      await api.put(`/v1/admin/groups/${group.id}/members`, { users: next })
      await Promise.all([
        qc.invalidateQueries({ queryKey: adminKeys.members(group.id) }),
        qc.invalidateQueries({ queryKey: adminKeys.groups }),
        qc.invalidateQueries({ queryKey: adminKeys.users }),
        qc.invalidateQueries({ queryKey: keys.directory }),
      ])
      toast.success($t('Membres enregistrés'))
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }
  const ids = list.map((m) => m.id)
  const candidates = users.filter((u) => u.active && !ids.includes(u.id))

  return (
    <div className="space-y-4">
      {readOnly ? (
        <Notice>{$t('Chaque personne de l’instance fait partie de ce groupe : ses droits sont ceux de tout le monde. Sa liste ne se modifie pas.')}</Notice>
      ) : (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Combobox
              value={null}
              onValueChange={(v) => {
                if (v) void save([...ids, v])
              }}
              options={candidates.map((u) => ({ value: u.id, label: `${u.name} · ${u.email}` }))}
              aria-label={$t('Ajouter une personne')}
              searchPlaceholder={$t('Rechercher une personne…')}
              emptyLabel={$t('Tout le monde est déjà membre')}
              disabled={busy || !me?.is_admin}
            >
              <span className="flex items-center gap-2 text-muted-foreground">
                <Plus className="size-4" /> {$t('Ajouter une personne…')}
              </span>
            </Combobox>
          </div>
          {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        </div>
      )}
      {list.length > 6 ? (
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={$t('Filtrer les membres…')} className="pl-9" />
        </div>
      ) : null}
      {members.isLoading ? <Spinner className="mt-4" /> : null}
      <div className="divide-y rounded-xl border">
        {visible.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar name={m.name} color={m.color} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {m.name} {m.id === me?.id ? <span className="text-muted-foreground">({$t('vous')})</span> : null}
              </div>
              <div className="truncate text-xs text-muted-foreground">{m.email}</div>
            </div>
            {readOnly ? null : (
              <Hint label={$t('Retirer du groupe')}>
                <Button size="icon-sm" variant="ghost" disabled={busy} onClick={() => save(ids.filter((x) => x !== m.id))} aria-label={$t('Retirer du groupe')}>
                  <UserMinus />
                </Button>
              </Hint>
            )}
          </div>
        ))}
        {!members.isLoading && visible.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{$t('Aucun membre.')}</p> : null}
      </div>
    </div>
  )
}

function Rights({ group }: { group: Group }) {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const { data: perms } = usePermissions()
  const [pending, setPending] = useState<string | null>(null)
  const isAdminGroup = group.kind === 'admin'
  return (
    <div className="space-y-3">
      {isAdminGroup ? <Notice>{$t('Les administrateurs ont tous les droits, sur toutes les sources et tous les dossiers.')}</Notice> : null}
      <div className="divide-y rounded-xl border">
        {RIGHTS.map(({ right, label, help, icon: Icon }) => {
          const on = isAdminGroup || !!perms?.rights.some((r) => r.group === group.id && r.right === right)
          return (
            <label key={right} className="flex cursor-pointer items-center gap-4 px-4 py-3.5">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{$t(label)}</div>
                <div className="text-xs text-muted-foreground">{$t(help)}</div>
              </div>
              {pending === right ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
              <Switch
                checked={on}
                disabled={isAdminGroup || !me?.is_admin || pending !== null}
                onCheckedChange={async (next) => {
                  setPending(right)
                  try {
                    await api.put('/v1/permissions/admin', { group: group.id, right, on: next })
                    await qc.invalidateQueries({ queryKey: adminKeys.permissions })
                    await qc.invalidateQueries({ queryKey: keys.me })
                    toast.success(next ? $t('Droit accordé à {group}', { group: group.name }) : $t('Droit retiré à {group}', { group: group.name }))
                  } catch (err) {
                    fail(err)
                  } finally {
                    setPending(null)
                  }
                }}
                aria-label={$t(label)}
              />
            </label>
          )
        })}
      </div>
      {!me?.is_admin ? <p className="text-xs text-muted-foreground">{$t('Seuls les administrateurs accordent ces droits.')}</p> : null}
    </div>
  )
}

function GroupDetail({ group, onRename, onDelete }: { group: Group; onRename: () => void; onDelete: () => void }) {
  const [tab, setTab] = useState<'members' | 'rights'>('members')
  useEffect(() => setTab('members'), [group.id])
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b px-6 py-5">
        <GroupTile kind={group.kind} className="size-14" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{group.name}</h2>
            <Chip color={group.kind === 'custom' ? 'indigo' : 'gray'}>{$t(GROUP_KIND_LABELS[group.kind])}</Chip>
          </div>
          <p className="truncate text-sm text-muted-foreground">{group.description || $tp(group.members, '{count} membre', '{count} membres')}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/admin/permissions?group=${group.id}`}>
            <Shield /> {$t('Permissions')}
          </Link>
        </Button>
        {group.kind === 'custom' ? (
          <>
            <Hint label={$t('Renommer')}>
              <Button variant="outline" size="icon-sm" onClick={onRename} aria-label={$t('Renommer')}>
                <Pencil />
              </Button>
            </Hint>
            <Hint label={$t('Supprimer le groupe')}>
              <Button variant="outline" size="icon-sm" onClick={onDelete} aria-label={$t('Supprimer le groupe')}>
                <Trash2 />
              </Button>
            </Hint>
          </>
        ) : null}
      </div>
      <div className="flex h-11 items-center gap-6 border-b px-6 text-[15px]">
        {(['members', 'rights'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn('relative py-3', tab === t ? 'font-semibold after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            {t === 'members' ? (
              <>
                {$t('Membres')} <span className="text-xs text-muted-foreground">{group.members}</span>
              </>
            ) : (
              $t('Droits d’administration')
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-6">
          {tab === 'members' ? <Members group={group} /> : <Rights group={group} />}
        </div>
      </div>
    </div>
  )
}

function Groups() {
  const qc = useQueryClient()
  const { data: groups = [], isLoading } = useGroups()
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<'new' | Group | null>(null)
  const [deleting, setDeleting] = useState<Group | null>(null)
  const order = { admin: 0, all: 1, custom: 2 } as const
  const sorted = [...groups].sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name))
  const current = sorted.find((g) => g.id === selected) ?? sorted[0]
  const system = sorted.filter((g) => g.kind !== 'custom')
  const custom = sorted.filter((g) => g.kind === 'custom')
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: adminKeys.groups }), qc.invalidateQueries({ queryKey: keys.directory })])

  const row = (g: Group) => (
    <button
      key={g.id}
      type="button"
      onClick={() => setSelected(g.id)}
      className={cn('relative flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors', current?.id === g.id ? 'bg-muted' : 'hover:bg-muted/60')}
    >
      {current?.id === g.id ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" /> : null}
      <GroupTile kind={g.kind} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate font-semibold">{g.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{$tp(g.members, '{count} membre', '{count} membres')}</span>
        </div>
        {g.description ? <div className="line-clamp-2 text-sm text-muted-foreground">{g.description}</div> : null}
      </div>
    </button>
  )

  return (
    <div className="flex h-full">
      <section className="flex w-[380px] shrink-0 flex-col border-r">
        <div className="flex items-center gap-2 border-b p-3">
          <div className="flex-1 px-1">
            <div className="font-semibold">{$t('Groupes')}</div>
            <div className="text-xs text-muted-foreground">{$t('Les droits s’accordent aux groupes, jamais aux personnes.')}</div>
          </div>
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus /> {$t('Nouveau groupe')}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {isLoading ? <Spinner /> : null}
          {system.length ? (
            <div className="pt-4">
              <div className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{$t('Groupes système')}</div>
              {system.map(row)}
            </div>
          ) : null}
          <div className="pt-4">
            <div className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {$t('Vos groupes')} <span className="ml-1 font-normal">{custom.length}</span>
            </div>
            {custom.map(row)}
            {!isLoading && custom.length === 0 ? <p className="px-3 py-4 text-sm text-muted-foreground">{$t('Aucun groupe pour l’instant.')}</p> : null}
          </div>
        </div>
      </section>
      <section className="min-w-0 flex-1">
        {current ? (
          <GroupDetail key={current.id} group={current} onRename={() => setEditing(current)} onDelete={() => setDeleting(current)} />
        ) : (
          <Empty icon={<UsersRound className="size-5" />} title={$t('Aucun groupe')} />
        )}
      </section>

      <SaveDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === 'new' ? $t('Nouveau groupe') : $t('Renommer le groupe')}
        description={editing === 'new' ? $t('Ajoutez-y des personnes, puis donnez-lui des droits dans « Permissions ».') : undefined}
        initial={editing && editing !== 'new' ? { name: editing.name, description: editing.description } : { name: '', description: '' }}
        withFolder={false}
        submitLabel={editing === 'new' ? $t('Créer') : $t('Enregistrer')}
        onSubmit={async (v) => {
          const body = { name: v.name, description: v.description || null }
          if (editing === 'new') {
            const res = await api.post<{ id: string }>('/v1/admin/groups', body)
            await refresh()
            setSelected(res.id)
            toast.success($t('Groupe créé'))
          } else if (editing) {
            await api.put(`/v1/admin/groups/${editing.id}`, body)
            await refresh()
            toast.success($t('Groupe renommé'))
          }
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={$t('Supprimer « {name} » ?', { name: deleting?.name ?? '' })}
        description={$t('Ses membres perdent les droits que ce groupe leur donnait. Les personnes, elles, restent.')}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await api.delete(`/v1/admin/groups/${deleting.id}`)
            await refresh()
            await qc.invalidateQueries({ queryKey: adminKeys.permissions })
            setSelected(null)
            toast.success($t('Groupe supprimé'))
          } catch (err) {
            fail(err)
          }
        }}
      />
    </div>
  )
}

export default function GroupsPage() {
  useCrumbs([{ label: $t('Administration') }, { label: $t('Groupes') }])
  return (
    <AdminOnly right="manage_permissions">
      <Groups />
    </AdminOnly>
  )
}

