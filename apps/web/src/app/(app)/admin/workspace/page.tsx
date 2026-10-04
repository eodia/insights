'use client'

import type { LookColor, Workspace, WorkspaceMember, WorkspaceRole } from '@eodia/contracts'
import { Card, Empty, Notice, PageHeader, Spinner, fail } from '@/components/app/admin/common'
import { Avatar } from '@/components/app/look'
import { IconPicker } from '@/components/app/structure/pickers'
import { WorkspaceLogo } from '@/components/app/workspace-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { $t, $tp, msg } from '@/lib/i18n'
import { keys, useMe } from '@/lib/queries'
import { useCrumbs } from '@/lib/store'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, ShieldAlert, UserMinus, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface Person {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly color: LookColor | null
  readonly role: WorkspaceRole | null
}

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  admin: msg('Administrateur'),
  member: msg('Membre'),
}

/** Its name, its look, what it is for. */
function Identity({ workspace }: { workspace: Workspace }) {
  const qc = useQueryClient()
  const [name, setName] = useState(workspace.name)
  const [description, setDescription] = useState(workspace.description ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setName(workspace.name)
    setDescription(workspace.description ?? '')
  }, [workspace])
  const save = async (patch: Partial<Pick<Workspace, 'name' | 'description' | 'color' | 'icon'>>) => {
    setBusy(true)
    try {
      await api.patch(`/v1/workspaces/${workspace.id}`, patch)
      await qc.invalidateQueries({ queryKey: keys.me })
      toast.success($t('Espace enregistré'))
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }
  const changed = name.trim() !== workspace.name || description !== (workspace.description ?? '')
  return (
    <Card title={$t('Identité')}>
      <div className="flex items-start gap-5">
        <IconPicker
          value={workspace.icon}
          color={workspace.color}
          onChange={(icon) => void save({ icon })}
          onColorChange={(color) => void save({ color })}
          trigger={
            <button type="button" className="rounded-xl ring-offset-2 transition hover:ring-2 hover:ring-ring" aria-label={$t('Changer le pictogramme et la couleur')}>
              <WorkspaceLogo workspace={workspace} className="size-16 rounded-xl text-xl" iconClassName="size-8" />
            </button>
          }
        />
        <form
          className="min-w-0 flex-1 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save({ name: name.trim(), description: description.trim() || null })
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">{$t('Nom')}</Label>
            <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-description">{$t('Description')}</Label>
            <Textarea id="ws-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} />
          </div>
          <Button type="submit" size="sm" disabled={!changed || busy || !name.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : null} {$t('Enregistrer')}
          </Button>
        </form>
      </div>
    </Card>
  )
}

/** Who belongs to the space, and who administers it; the people of the instance one may add. */
function Members({ workspace, me }: { workspace: Workspace; me: string }) {
  const qc = useQueryClient()
  const members = useQuery({ queryKey: ['workspace-members', workspace.id], queryFn: () => api.get<WorkspaceMember[]>('/v1/workspace/members') })
  const people = useQuery({ queryKey: ['workspace-people', workspace.id], queryFn: () => api.get<Person[]>('/v1/workspace/people') })
  const [adding, setAdding] = useState('')
  const [role, setRole] = useState<WorkspaceRole>('member')
  const outside = (people.data ?? []).filter((p) => p.role === null)

  const set = async (user: string, next: WorkspaceRole | null) => {
    try {
      await api.put(`/v1/workspace/members/${user}`, { role: next })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['workspace-members', workspace.id] }),
        qc.invalidateQueries({ queryKey: ['workspace-people', workspace.id] }),
        qc.invalidateQueries({ queryKey: keys.me }),
      ])
      return true
    } catch (err) {
      fail(err)
      return false
    }
  }

  return (
    <Card title={$t('Membres')} action={<span className="text-sm text-muted-foreground">{$tp(members.data?.length ?? 0, '{count} membre', '{count} membres')}</span>}>
      <div className="space-y-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (adding && (await set(adding, role))) {
              toast.success($t('Membre ajouté'))
              setAdding('')
            }
          }}
        >
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label>{$t('Ajouter une personne de l’instance')}</Label>
            <Select value={adding} onValueChange={setAdding}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={outside.length ? $t('Choisir une personne…') : $t('Tout le monde est déjà membre')} />
              </SelectTrigger>
              <SelectContent>
                {outside.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} <span className="text-muted-foreground">· {p.email}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Select value={role} onValueChange={(v) => setRole(v as WorkspaceRole)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABELS) as WorkspaceRole[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {$t(ROLE_LABELS[r])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={!adding}>
            <UserPlus /> {$t('Ajouter')}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          {$t('Quelqu’un qui n’a pas encore de compte ?')}{' '}
          <Link href="/admin/people" className="text-primary hover:underline">
            {$t('Invitez-le depuis « Personnes »')}
          </Link>{' '}
          {$t(': l’invitation le fait entrer dans cet espace.')}
        </p>
        {members.isLoading ? (
          <Spinner />
        ) : (
          <ul className="divide-y rounded-lg border">
            {(members.data ?? []).map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={m.name} color={m.color} size="sm" />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-sm font-medium">
                    {m.name} {m.id === me ? <span className="text-xs font-normal text-muted-foreground">({$t('vous')})</span> : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                </div>
                <Select value={m.role} onValueChange={(v) => void set(m.id, v as WorkspaceRole)}>
                  <SelectTrigger className="h-8 w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROLE_LABELS) as WorkspaceRole[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {$t(ROLE_LABELS[r])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={$t('Retirer de l’espace')}
                  title={$t('Retirer de l’espace')}
                  onClick={async () => {
                    if (await set(m.id, null)) toast.success($t('{name} ne fait plus partie de l’espace', { name: m.name }))
                  }}
                >
                  <UserMinus />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

export default function WorkspacePage() {
  const { data: me } = useMe()
  useCrumbs([{ label: $t('Administration') }, { label: $t('Espace') }])
  if (!me) return <Spinner />
  if (!me.can.manage_workspace) {
    return (
      <Empty icon={<ShieldAlert className="size-5" />} title={$t('Accès réservé')}>
        {$t('Cet écran est réservé aux administrateurs de l’espace.')}
      </Empty>
    )
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
      <PageHeader
        title={me.workspace.name}
        description={$t('Les sources, les dossiers, les groupes et les droits de cet espace ne regardent que ses membres. Une source peut être partagée avec d’autres espaces, depuis ses réglages.')}
      />
      <Identity workspace={me.workspace} />
      <Members workspace={me.workspace} me={me.id} />
      <Notice>
        {$t('Les groupes et les permissions de l’espace se règlent dans')}{' '}
        <Link href="/admin/groups" className="font-medium underline-offset-2 hover:underline">
          {$t('Groupes')}
        </Link>{' '}
        {$t('et')}{' '}
        <Link href="/admin/permissions" className="font-medium underline-offset-2 hover:underline">
          {$t('Permissions')}
        </Link>
        .
      </Notice>
    </div>
  )
}
