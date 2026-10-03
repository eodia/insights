'use client'

import { Card, CodeBlock, CopyField, Spinner, adminKeys, ago, dateTime, fail } from '@/components/app/admin/common'
import { ConfirmDialog } from '@/components/app/dialogs'
import { Avatar, Chip } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Hint } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { $t, msg } from '@/lib/i18n'
import { keys, useMe } from '@/lib/queries'
import { useCrumbs } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { Me } from '@eodia/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, CalendarDays, CalendarRange, Infinity as InfinityIcon, KeyRound, Loader2, Lock, Plus, Trash2, UserRound } from 'lucide-react'
import { Segmented } from '@/components/ui/segmented'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { TabRow } from '@/components/ui/tab-row'

type Tab = 'profile' | 'tokens'
type Surface = 'rest' | 'mcp'

interface ApiToken {
  readonly id: string
  readonly name: string
  readonly prefix: string
  readonly surfaces: readonly Surface[]
  readonly created_at: string
  readonly last_used_at: string | null
  readonly expires_at: string | null
}

const SURFACE_LABELS: Record<Surface, string> = { rest: msg('API REST'), mcp: msg('Serveur MCP') }

function Profile({ me }: { me: Me }) {
  const qc = useQueryClient()
  const [name, setName] = useState(me.name)
  const [saving, setSaving] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [changing, setChanging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setName(me.name), [me.name])
  const role = me.is_admin ? $t('Administrateur') : me.can.manage_metadata ? $t('Curateur') : $t('Analyste')

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center gap-4">
          <Avatar name={me.name} color={me.color} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold">{me.name}</div>
            <div className="truncate text-sm text-muted-foreground">{me.email}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip color={me.is_admin ? 'rose' : 'green'}>{role}</Chip>
              {me.groups.map((g) => (
                <Chip key={g.id} color="indigo">
                  {g.name}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card title={$t('Profil')} icon={<UserRound className="size-4 text-muted-foreground" />}>
        <form
          className="min-w-0 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setSaving(true)
            try {
              const updated = await api.patch<Me>('/v1/me', { name: name.trim() })
              qc.setQueryData(keys.me, updated)
              toast.success($t('Profil enregistré'))
            } catch (err) {
              fail(err)
            } finally {
              setSaving(false)
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="me-name">{$t('Nom')}</Label>
            <Input id="me-name" value={name} onChange={(e) => setName(e.target.value)} required className="max-w-md" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="me-email">{$t('E-mail')}</Label>
            <Input id="me-email" value={me.email} disabled className="max-w-md" />
            <p className="text-xs text-muted-foreground">{$t('Seul un administrateur peut changer une adresse e-mail.')}</p>
          </div>
          <Button type="submit" disabled={saving || !name.trim() || name.trim() === me.name}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {$t('Enregistrer')}
          </Button>
        </form>
      </Card>

      <Card title={$t('Mot de passe')} icon={<Lock className="size-4 text-muted-foreground" />}>
        <form
          className="min-w-0 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            if (next.length < 10) return setError($t('Le nouveau mot de passe compte au moins 10 caractères.'))
            if (next !== confirm) return setError($t('Les deux saisies du nouveau mot de passe diffèrent.'))
            setChanging(true)
            try {
              await api.patch('/v1/me', { password: { current, next } })
              setCurrent('')
              setNext('')
              setConfirm('')
              toast.success($t('Mot de passe changé'))
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            } finally {
              setChanging(false)
            }
          }}
        >
          <div className="grid max-w-md gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pw-current">{$t('Mot de passe actuel')}</Label>
              <Input id="pw-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-next">{$t('Nouveau mot de passe')}</Label>
              <Input id="pw-next" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" placeholder={$t('10 caractères au moins')} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-confirm">{$t('Confirmer le nouveau mot de passe')}</Label>
              <Input id="pw-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={changing || !current || !next}>
            {changing ? <Loader2 className="animate-spin" /> : null}
            {$t('Changer le mot de passe')}
          </Button>
        </form>
      </Card>
    </div>
  )
}

function Tokens() {
  const qc = useQueryClient()
  const tokens = useQuery({ queryKey: adminKeys.tokens, queryFn: () => api.get<ApiToken[]>('/v1/me/tokens') })
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [surfaces, setSurfaces] = useState<Surface[]>(['rest', 'mcp'])
  const [expires, setExpires] = useState('90')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<ApiToken | null>(null)
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const list = tokens.data ?? []
  const toggle = (s: Surface, on: boolean) => setSurfaces(on ? [...new Set([...surfaces, s])] : surfaces.filter((x) => x !== s))

  return (
    <div className="space-y-5">
      <Card
        title={$t("Jetons d'intégration")}
        icon={<KeyRound className="size-4 text-muted-foreground" />}
        action={
          <Button
            size="sm"
            onClick={() => {
              setName('')
              setSurfaces(['rest', 'mcp'])
              setExpires('90')
              setCreated(null)
              setOpen(true)
            }}
          >
            <Plus /> {$t('Nouveau jeton')}
          </Button>
        }
      >
        <p className="mb-4 text-sm text-muted-foreground">{$t('Un jeton agit en votre nom, avec vos droits : pour un script qui appelle l’API REST, ou pour brancher un assistant IA sur le serveur MCP.')}</p>
        {tokens.isLoading ? <Spinner className="my-4" /> : null}
        {list.length > 0 ? (
          <div className="divide-y rounded-xl border">
            {list.map((t) => {
              const expired = t.expires_at !== null && new Date(t.expires_at).getTime() < Date.now()
              return (
                <div key={t.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', expired && 'opacity-60')}>
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300">
                    <KeyRound className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      <code className="font-mono">{t.prefix}…</code> · {$t('créé {when}', { when: ago(t.created_at) })} · {t.last_used_at ? $t('utilisé {when}', { when: ago(t.last_used_at) }) : $t('jamais utilisé')}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {t.surfaces.map((s) => (
                      <Chip key={s} color={s === 'mcp' ? 'violet' : 'sky'}>
                        {$t(SURFACE_LABELS[s])}
                      </Chip>
                    ))}
                  </div>
                  <Hint label={t.expires_at ? dateTime(t.expires_at) : undefined}>
                    <span className={cn('w-32 text-right text-xs', expired ? 'text-destructive' : 'text-muted-foreground')}>
                      {t.expires_at ? (expired ? $t('Expiré') : $t('Expire {when}', { when: ago(t.expires_at) })) : $t('Sans expiration')}
                    </span>
                  </Hint>
                  <Hint label={$t('Révoquer')}>
                    <Button variant="ghost" size="icon-sm" onClick={() => setRevoking(t)} aria-label={$t('Révoquer')}>
                      <Trash2 />
                    </Button>
                  </Hint>
                </div>
              )
            })}
          </div>
        ) : !tokens.isLoading ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{$t('Aucun jeton pour l’instant.')}</p>
        ) : null}
      </Card>

      <Card title={$t('Utilisation')}>
        <div className="space-y-4 text-sm">
          <div>
            <div className="mb-1.5 font-medium">{$t('API REST')}</div>
            <CodeBlock code={`curl ${origin}/api/v1/me \\\n  -H "Authorization: Bearer <votre jeton>"`} />
          </div>
          <div>
            <div className="mb-1.5 font-medium">{$t('Serveur MCP')}</div>
            <p className="mb-2 text-muted-foreground">{$t('Le détail des outils et la configuration des clients MCP sont dans « API et MCP ».')}</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/docs">{$t('Ouvrir « API et MCP »')}</Link>
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          {created ? (
            <div className="min-w-0 space-y-4">
              <DialogHeader>
                <DialogTitle>{$t('Jeton créé')}</DialogTitle>
                <DialogDescription>{$t('Copiez-le maintenant : il ne sera plus jamais affiché.')}</DialogDescription>
              </DialogHeader>
              <CopyField value={created} secret />
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>{$t('J’ai copié le jeton')}</Button>
              </DialogFooter>
            </div>
          ) : (
            <form
              className="min-w-0 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!name.trim() || surfaces.length === 0) return
                setBusy(true)
                try {
                  const res = await api.post<{ id: string; token: string }>('/v1/me/tokens', { name: name.trim(), surfaces, expires_days: expires === 'never' ? null : Number(expires) })
                  await qc.invalidateQueries({ queryKey: adminKeys.tokens })
                  setCreated(res.token)
                } catch (err) {
                  fail(err)
                } finally {
                  setBusy(false)
                }
              }}
            >
              <DialogHeader>
                <DialogTitle>{$t('Nouveau jeton')}</DialogTitle>
                <DialogDescription>{$t('Donnez-lui un nom qui dit où il sert : vous saurez lequel révoquer.')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="token-name">{$t('Nom')}</Label>
                <Input id="token-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={$t('Script de reporting, Claude Desktop…')} required autoFocus />
              </div>
              <div className="space-y-2">
                <Label>{$t('Accès')}</Label>
                {(['rest', 'mcp'] as const).map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={surfaces.includes(s)} onCheckedChange={(v) => toggle(s, v === true)} />
                    {$t(SURFACE_LABELS[s])}
                  </label>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label>{$t('Expiration')}</Label>
                <Segmented
                  value={expires as '30' | '90' | '365' | 'never'}
                  onValueChange={setExpires}
                  options={[
                    { value: '30', label: $t('30 jours'), icon: CalendarDays },
                    { value: '90', label: $t('90 jours'), icon: CalendarRange },
                    { value: '365', label: $t('1 an'), icon: Calendar },
                    { value: 'never', label: $t('Jamais'), icon: InfinityIcon, hint: $t('Un jeton sans expiration : à révoquer s’il n’est plus utile') },
                  ]}
                  aria-label={$t('Expiration')}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  {$t('Annuler')}
                </Button>
                <Button type="submit" disabled={busy || !name.trim() || surfaces.length === 0}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {$t('Créer le jeton')}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={$t('Révoquer « {name} » ?', { name: revoking?.name ?? '' })}
        description={$t('Ce qui l’utilise cessera aussitôt de fonctionner.')}
        confirmLabel={$t('Révoquer')}
        onConfirm={async () => {
          if (!revoking) return
          try {
            await api.delete(`/v1/me/tokens/${revoking.id}`)
            await qc.invalidateQueries({ queryKey: adminKeys.tokens })
            toast.success($t('Jeton révoqué'))
          } catch (err) {
            fail(err)
          }
        }}
      />
    </div>
  )
}

export default function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = use(searchParams)
  const router = useRouter()
  const { data: me } = useMe()
  const [tab, setTab] = useState<Tab>(params.tab === 'tokens' ? 'tokens' : 'profile')
  useEffect(() => setTab(params.tab === 'tokens' ? 'tokens' : 'profile'), [params.tab])
  useCrumbs([{ label: $t('Mon compte'), href: '/account' }, { label: tab === 'tokens' ? $t("Jetons d'intégration") : $t('Profil') }])

  return (
    <div className="mx-auto max-w-4xl px-8 py-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{$t('Mon compte')}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{$t('Votre profil, votre mot de passe et vos jetons d’accès à l’API et au serveur MCP.')}</p>
      <TabRow className="mb-6 h-11 items-center gap-6 border-b text-[15px]">
        {(['profile', 'tokens'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t)
              router.replace(t === 'tokens' ? '/account?tab=tokens' : '/account', { scroll: false })
            }}
            className={cn('relative py-3', tab === t ? 'font-semibold after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            {t === 'profile' ? $t('Profil') : $t("Jetons d'intégration")}
          </button>
        ))}
      </TabRow>
      {!me ? <Spinner /> : tab === 'profile' ? <Profile me={me} /> : <Tokens />}
    </div>
  )
}
