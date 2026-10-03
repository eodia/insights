'use client'

import type { Group, UserRow } from '@eodia/contracts'
import { type AttributeRow, AttributesEditor, fromRows, toRows } from '@/components/app/admin/attributes-editor'
import {
  AdminOnly,
  CopyField,
  Empty,
  GroupChip,
  GroupsPicker,
  Notice,
  SectionTitle,
  Spinner,
  adminKeys,
  ago,
  dateTime,
  fail,
  useGroups,
  usePermissions,
  useUsers,
} from '@/components/app/admin/common'
import { ConfirmDialog } from '@/components/app/dialogs'
import { Avatar, Chip } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Hint } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { $t, $tp } from '@/lib/i18n'
import { useMe } from '@/lib/queries'
import { useCrumbs } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Mail, MailCheck, Search, Send, Trash2, UserPlus, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Pane } from '@/components/ui/pane'
import { TabRow } from '@/components/ui/tab-row'

interface Invitation {
  readonly id: string
  readonly email: string
  readonly name: string | null
  readonly created_at: string
  readonly expires_at: string
  readonly emailed_at: string | null
  readonly invited_by: string | null
}

type Tab = 'people' | 'invitations'

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

function authLabel(method: string): string {
  if (method === 'password') return $t('Mot de passe')
  if (method === 'oidc') return 'OIDC'
  return method
}

function PersonRow({ user, groups, active, onSelect, onToggle, self }: { user: UserRow; groups: Map<string, Group>; active: boolean; onSelect: () => void; onToggle: (on: boolean) => void; self: boolean }) {
  return (
    <div className={cn('relative flex items-start gap-3 rounded-xl px-3 py-3 transition-colors', active ? 'bg-muted' : 'hover:bg-muted/60', !user.active && 'opacity-60')}>
      {active ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" /> : null}
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-start gap-3 text-left">
        <Avatar name={user.name} color={user.color} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate font-semibold">{user.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{user.last_login_at ? ago(user.last_login_at) : $t('Jamais connecté')}</span>
          </div>
          <div className="truncate text-sm text-muted-foreground">{user.email}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {user.groups.map((id) => {
              const g = groups.get(id)
              return g ? <GroupChip key={id} group={g} /> : null
            })}
            {!user.active ? <Chip color="red">{$t('Désactivé')}</Chip> : null}
            {user.auth.map((m) => (
              <Chip key={m}>{authLabel(m)}</Chip>
            ))}
          </div>
        </div>
      </button>
      <Hint label={self ? $t('Vous ne pouvez pas vous désactiver vous-même.') : user.active ? $t('Désactiver') : $t('Réactiver')}>
        <span className="pt-1">
          <Switch checked={user.active} disabled={self} onCheckedChange={onToggle} aria-label={$t('Compte actif')} />
        </span>
      </Hint>
    </div>
  )
}

function PersonDetail({ user, groups, known, self }: { user: UserRow; groups: readonly Group[]; known: readonly string[]; self: boolean }) {
  const qc = useQueryClient()
  const [name, setName] = useState(user.name)
  const [memberOf, setMemberOf] = useState<string[]>([...user.groups])
  const [attrs, setAttrs] = useState<AttributeRow[]>(toRows(user.attributes))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const parsed = fromRows(attrs)
  const dirty =
    name.trim() !== user.name ||
    JSON.stringify([...memberOf].sort()) !== JSON.stringify([...user.groups].sort()) ||
    (parsed.ok && JSON.stringify(Object.entries(parsed.value).sort()) !== JSON.stringify(Object.entries(user.attributes).sort()))

  const save = async () => {
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.patch(`/v1/admin/users/${user.id}`, { name: name.trim(), groups: memberOf, attributes: parsed.value })
      await Promise.all([qc.invalidateQueries({ queryKey: adminKeys.users }), qc.invalidateQueries({ queryKey: adminKeys.groups }), qc.invalidateQueries({ queryKey: adminKeys.permissions })])
      toast.success($t('Modifications enregistrées'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b px-6 py-5">
        <Avatar name={user.name} color={user.color} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{user.name}</h2>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className={cn(user.active ? 'text-foreground' : 'text-muted-foreground')}>{user.active ? $t('Actif') : $t('Désactivé')}</span>
          <Switch
            checked={user.active}
            disabled={self}
            onCheckedChange={async (on) => {
              try {
                await api.patch(`/v1/admin/users/${user.id}`, { active: on })
                await qc.invalidateQueries({ queryKey: adminKeys.users })
                toast.success(on ? $t('Compte réactivé') : $t('Compte désactivé : ses sessions sont fermées.'))
              } catch (err) {
                fail(err)
              }
            }}
            aria-label={$t('Compte actif')}
          />
        </label>
      </div>
      <div className="flex h-11 items-center gap-6 border-b px-6 text-[15px]">
        <span className="relative py-3 font-semibold after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary">{$t('Détails')}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <form
          className="mx-auto max-w-2xl space-y-7 px-6 py-6"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="person-name">{$t('Nom')}</Label>
            <Input id="person-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-groups">{$t('Groupes')}</Label>
            <GroupsPicker id="person-groups" value={memberOf} onChange={setMemberOf} groups={groups} />
            <p className="text-xs text-muted-foreground">{$t('Chaque personne fait aussi partie de « Tous les utilisateurs ». Les droits des groupes s’additionnent.')}</p>
          </div>
          <div>
            <SectionTitle>{$t('Attributs')}</SectionTitle>
            <p className="mb-3 text-sm text-muted-foreground">
              {$t('Les attributs décrivent la personne pour les règles de ligne : une règle « region = ')}
              <code className="rounded bg-muted px-1 font-mono text-[12px]">{'{{user.region}}'}</code>
              {$t(' » ne lui laisse voir que les lignes de sa région. Un attribut absent ne donne accès à aucune ligne.')}
            </p>
            <AttributesEditor rows={attrs} onChange={setAttrs} known={known} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={busy || !dirty || !name.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {$t('Enregistrer')}
            </Button>
            {dirty ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setName(user.name)
                  setMemberOf([...user.groups])
                  setAttrs(toRows(user.attributes))
                  setError(null)
                }}
              >
                {$t('Annuler')}
              </Button>
            ) : null}
          </div>
          <div>
            <SectionTitle>{$t('Compte')}</SectionTitle>
            <dl className="space-y-3 rounded-xl border p-4 text-sm">
              {[
                [$t('Connexion'), user.auth.length ? user.auth.map(authLabel).join(', ') : $t('Aucune méthode')],
                [$t('Créé le'), dateTime(user.created_at)],
                [$t('Dernière connexion'), user.last_login_at ? dateTime(user.last_login_at) : $t('Jamais')],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <dt className="w-40 shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 flex-1">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </form>
      </div>
    </div>
  )
}

function InvitationDetail({ invitation, onRevoke }: { invitation: Invitation; onRevoke: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b px-6 py-5">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300">
          <Mail className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{invitation.name || invitation.email}</h2>
          <p className="truncate text-sm text-muted-foreground">{invitation.email}</p>
        </div>
        <Button variant="outline" onClick={onRevoke}>
          <Trash2 /> {$t('Annuler l’invitation')}
        </Button>
      </div>
      <div className="mx-auto w-full max-w-2xl space-y-5 px-6 py-6">
        <dl className="space-y-3 rounded-xl border p-4 text-sm">
          {[
            [$t('Invitée par'), invitation.invited_by ?? '—'],
            [$t('Envoyée le'), dateTime(invitation.created_at)],
            [$t('Expire le'), dateTime(invitation.expires_at)],
            [$t('E-mail'), invitation.emailed_at ? $t('Envoyé le {date}', { date: dateTime(invitation.emailed_at) }) : $t('Non envoyé : le lien a été transmis à la main')],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <dt className="w-32 shrink-0 text-muted-foreground">{k}</dt>
              <dd className="min-w-0 flex-1">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">{$t('Le lien d’une invitation n’est montré qu’à sa création. S’il est perdu, annulez l’invitation et invitez la personne à nouveau.')}</p>
      </div>
    </div>
  )
}

function CreateDialog({ open, onOpenChange, groups, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; groups: readonly Group[]; onCreated: (id: string) => void }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [memberOf, setMemberOf] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    setEmail('')
    setName('')
    setPassword('')
    setMemberOf([])
    setError(null)
  }, [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="min-w-0 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (password && password.length < 10) {
              setError($t('Le mot de passe compte au moins 10 caractères.'))
              return
            }
            setBusy(true)
            setError(null)
            try {
              const res = await api.post<{ id: string }>('/v1/admin/users', { email: email.trim(), name: name.trim(), ...(password ? { password } : {}), groups: memberOf })
              await Promise.all([qc.invalidateQueries({ queryKey: adminKeys.users }), qc.invalidateQueries({ queryKey: adminKeys.groups })])
              toast.success($t('{name} a été ajouté·e', { name: name.trim() }))
              onCreated(res.id)
              onOpenChange(false)
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            } finally {
              setBusy(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{$t('Créer une personne')}</DialogTitle>
            <DialogDescription>{$t('Sans mot de passe, la personne se connectera par l’authentification unique (OIDC) de votre organisation.')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-email">{$t('E-mail')}</Label>
            <Input id="new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-name">{$t('Nom')}</Label>
            <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">{$t('Mot de passe')}</Label>
            <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={$t('Facultatif, 10 caractères au moins')} autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-groups">{$t('Groupes')}</Label>
            <GroupsPicker id="new-groups" value={memberOf} onChange={setMemberOf} groups={groups} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {$t('Annuler')}
            </Button>
            <Button type="submit" disabled={busy || !email.trim() || !name.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {$t('Créer')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function InviteDialog({ open, onOpenChange, groups, mail }: { open: boolean; onOpenChange: (o: boolean) => void; groups: readonly Group[]; mail: boolean }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [memberOf, setMemberOf] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ url: string; emailed: boolean } | null>(null)
  useEffect(() => {
    if (!open) return
    setEmail('')
    setName('')
    setMemberOf([])
    setError(null)
    setResult(null)
  }, [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {result ? (
          <div className="min-w-0 space-y-4">
            <DialogHeader>
              <DialogTitle>{$t('Invitation créée')}</DialogTitle>
              <DialogDescription>
                {result.emailed ? $t('Un e-mail est parti vers {email}. Vous pouvez aussi lui transmettre ce lien :', { email }) : $t('Transmettez ce lien à {email} : il n’est montré qu’une fois et reste valable 7 jours.', { email })}
              </DialogDescription>
            </DialogHeader>
            <CopyField value={result.url} />
            {result.emailed ? (
              <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                <MailCheck className="size-4" /> {$t('E-mail envoyé')}
              </p>
            ) : null}
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>{$t('Terminé')}</Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="min-w-0 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              setError(null)
              try {
                const res = await api.post<{ id: string; url: string; emailed: boolean }>('/v1/admin/invitations', { email: email.trim(), ...(name.trim() ? { name: name.trim() } : {}), groups: memberOf })
                await qc.invalidateQueries({ queryKey: adminKeys.invitations })
                setResult(res)
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{$t('Inviter une personne')}</DialogTitle>
              <DialogDescription>
                {mail ? $t('Elle recevra un e-mail avec un lien pour choisir son mot de passe.') : $t('L’envoi d’e-mails n’est pas configuré : vous obtiendrez un lien à lui transmettre.')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">{$t('E-mail')}</Label>
              <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">{$t('Nom')}</Label>
              <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={$t('Facultatif')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-groups">{$t('Groupes')}</Label>
              <GroupsPicker id="inv-groups" value={memberOf} onChange={setMemberOf} groups={groups} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {$t('Annuler')}
              </Button>
              <Button type="submit" disabled={busy || !email.trim()}>
                {busy ? <Loader2 className="animate-spin" /> : <Send />}
                {$t('Inviter')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function People() {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const { data: users = [], isLoading } = useUsers()
  const { data: groupList = [] } = useGroups()
  const { data: perms } = usePermissions()
  const invitations = useQuery({ queryKey: adminKeys.invitations, queryFn: () => api.get<{ invitations: Invitation[]; mail: boolean }>('/v1/admin/invitations') })
  const [tab, setTab] = useState<Tab>('people')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [revoking, setRevoking] = useState<Invitation | null>(null)
  const groups = useMemo(() => new Map(groupList.map((g) => [g.id, g])), [groupList])
  const invites = invitations.data?.invitations ?? []

  const needle = fold(search.trim())
  const visibleUsers = users.filter((u) => !needle || fold(`${u.name} ${u.email} ${Object.values(u.attributes).join(' ')}`).includes(needle))
  const visibleInvites = invites.filter((i) => !needle || fold(`${i.name ?? ''} ${i.email}`).includes(needle))
  const currentUser = tab === 'people' ? (visibleUsers.find((u) => u.id === selected) ?? visibleUsers[0]) : undefined
  const currentInvite = tab === 'invitations' ? (visibleInvites.find((i) => i.id === selected) ?? visibleInvites[0]) : undefined

  const toggle = async (user: UserRow, on: boolean) => {
    try {
      await api.patch(`/v1/admin/users/${user.id}`, { active: on })
      await qc.invalidateQueries({ queryKey: adminKeys.users })
      toast.success(on ? $t('{name} est réactivé·e', { name: user.name }) : $t('{name} est désactivé·e', { name: user.name }))
    } catch (err) {
      fail(err)
    }
  }

  return (
    <div className="flex h-full">
      <Pane as="section" id="admin.people.list" side="left" defaultSize={420} min={300} max={680} className="flex flex-col border-r">
        <div className="flex items-center gap-2 p-3">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={$t('Rechercher une personne…')} className="h-10 rounded-lg pl-9" />
          </div>
          <Hint label={$t('Inviter par e-mail')}>
            <Button variant="outline" size="icon" className="size-10" onClick={() => setInviting(true)} aria-label={$t('Inviter')}>
              <Send />
            </Button>
          </Hint>
          <Hint label={$t('Créer une personne')}>
            <Button size="icon" className="size-10" onClick={() => setCreating(true)} aria-label={$t('Créer une personne')}>
              <UserPlus />
            </Button>
          </Hint>
        </div>
        <TabRow className="gap-5 border-b px-4 text-sm">
          {(['people', 'invitations'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t)
                setSelected(null)
              }}
              className={cn('relative py-2.5 whitespace-nowrap', tab === t ? 'font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary' : 'text-muted-foreground hover:text-foreground')}
            >
              {t === 'people' ? $t('Personnes') : $t('Invitations en attente')} <span className="text-xs text-muted-foreground">{t === 'people' ? users.length : invites.length}</span>
            </button>
          ))}
        </TabRow>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {tab === 'people' ? (
            <>
              {isLoading ? <Spinner /> : null}
              {visibleUsers.length > 0 ? (
                <div className="pt-4">
                  <div className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {$t('Membres')} <span className="ml-1 font-normal">{visibleUsers.length}</span>
                  </div>
                  {visibleUsers.map((u) => (
                    <PersonRow key={u.id} user={u} groups={groups} active={currentUser?.id === u.id} onSelect={() => setSelected(u.id)} onToggle={(on) => toggle(u, on)} self={u.id === me?.id} />
                  ))}
                </div>
              ) : !isLoading ? (
                <Empty icon={<Users className="size-5" />} title={$t('Personne ne correspond.')} />
              ) : null}
            </>
          ) : (
            <>
              {invitations.isLoading ? <Spinner /> : null}
              {visibleInvites.length > 0 ? (
                <div className="pt-4">
                  {visibleInvites.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => setSelected(i.id)}
                      className={cn('relative flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors', currentInvite?.id === i.id ? 'bg-muted' : 'hover:bg-muted/60')}
                    >
                      {currentInvite?.id === i.id ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" /> : null}
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300">
                        <Mail className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="flex-1 truncate font-semibold">{i.name || i.email}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{ago(i.created_at)}</span>
                        </div>
                        <div className="truncate text-sm text-muted-foreground">{i.email}</div>
                        <div className="flex items-center gap-1.5">
                          <Chip color="amber">{$t('En attente')}</Chip>
                          {i.emailed_at ? <Chip color="green">{$t('E-mail envoyé')}</Chip> : <Chip>{$t('Lien')}</Chip>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : !invitations.isLoading ? (
                <Empty icon={<Mail className="size-5" />} title={$t('Aucune invitation en attente.')}>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => setInviting(true)}>
                    <Send /> {$t('Inviter une personne')}
                  </Button>
                </Empty>
              ) : null}
            </>
          )}
        </div>
        {invitations.data && !invitations.data.mail ? (
          <div className="border-t p-3">
            <Notice tone="warn" className="text-xs">
              {$t('SMTP n’est pas configuré : les invitations se transmettent par lien.')}
            </Notice>
          </div>
        ) : null}
      </Pane>

      <section className="min-w-0 flex-1">
        {currentUser ? (
          <PersonDetail key={`${currentUser.id}:${JSON.stringify(currentUser)}`} user={currentUser} groups={groupList} known={perms?.attributes ?? []} self={currentUser.id === me?.id} />
        ) : currentInvite ? (
          <InvitationDetail invitation={currentInvite} onRevoke={() => setRevoking(currentInvite)} />
        ) : (
          <Empty icon={<Users className="size-5" />} title={$t('Personnes et invitations')}>
            {$tp(users.length, '{count} personne sur l’instance.', '{count} personnes sur l’instance.')}
          </Empty>
        )}
      </section>

      <CreateDialog open={creating} onOpenChange={setCreating} groups={groupList} onCreated={(id) => {
        setTab('people')
        setSelected(id)
      }} />
      <InviteDialog open={inviting} onOpenChange={setInviting} groups={groupList} mail={invitations.data?.mail ?? false} />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={$t('Annuler l’invitation ?')}
        description={revoking ? $t('Le lien envoyé à {email} ne fonctionnera plus.', { email: revoking.email }) : ''}
        confirmLabel={$t('Annuler l’invitation')}
        onConfirm={async () => {
          if (!revoking) return
          try {
            await api.delete(`/v1/admin/invitations/${revoking.id}`)
            await qc.invalidateQueries({ queryKey: adminKeys.invitations })
            toast.success($t('Invitation annulée'))
            setSelected(null)
          } catch (err) {
            fail(err)
          }
        }}
      />
    </div>
  )
}

export default function PeoplePage() {
  useCrumbs([{ label: $t('Administration') }, { label: $t('Personnes') }])
  return (
    <AdminOnly>
      <People />
    </AdminOnly>
  )
}
