'use client'

import { AdminOnly, Card, CodeBlock, CopyField, Notice, PageHeader, Spinner, adminKeys, dateTime, fail, formatBytes, useGroups } from '@/components/app/admin/common'
import { ConfirmDialog } from '@/components/app/dialogs'
import { Chip } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Hint } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { formatCount } from '@/lib/format'
import { $t, $tp } from '@/lib/i18n'
import { useCrumbs } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Database, HardDrive, KeyRound, Loader2, Plus, RotateCw, Server, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface Status {
  readonly trino: { up: boolean; version: string | null; starting?: boolean; url: string; catalogs: string[] }
  readonly cache: { entries: number; bytes: number | string; ttl: number; adaptive: boolean }
  readonly ai: { provider: string; model: string | null; configured: boolean; quota: number }
  readonly oidc: boolean
  readonly smtp: boolean
}

interface EmbedSecret {
  readonly id: string
  readonly name: string
  readonly group: string
  readonly group_name: string
  readonly created_at: string
}

function duration(seconds: number): string {
  if (seconds === 0) return $t('pas de cache')
  if (seconds < 60) return $tp(seconds, '{count} seconde', '{count} secondes')
  if (seconds < 3600) return $tp(Math.round(seconds / 60), '{count} minute', '{count} minutes')
  if (seconds < 86_400) return $tp(Math.round(seconds / 360) / 10, '{count} heure', '{count} heures')
  return $tp(Math.round(seconds / 8640) / 10, '{count} jour', '{count} jours')
}

function StatusDot({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', on ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300')}>
      <span className={cn('size-1.5 rounded-full', on ? 'bg-green-500' : 'bg-zinc-400')} />
      {label}
    </span>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5 text-sm">
      <dt className="w-36 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  )
}

function CacheCard({ status }: { status: Status }) {
  const qc = useQueryClient()
  const [ttl, setTtl] = useState(String(status.cache.ttl))
  const [adaptive, setAdaptive] = useState(status.cache.adaptive)
  const [busy, setBusy] = useState(false)
  const [clearing, setClearing] = useState(false)
  useEffect(() => {
    setTtl(String(status.cache.ttl))
    setAdaptive(status.cache.adaptive)
  }, [status.cache.ttl, status.cache.adaptive])
  const n = Number(ttl)
  const valid = Number.isInteger(n) && n >= 0 && n <= 31_536_000
  const dirty = n !== status.cache.ttl || adaptive !== status.cache.adaptive
  return (
    <Card
      title={$t('Cache des résultats')}
      icon={<HardDrive className="size-4 text-muted-foreground" />}
      action={
        <Button variant="outline" size="sm" onClick={() => setClearing(true)} disabled={status.cache.entries === 0}>
          <Trash2 /> {$t('Vider le cache')}
        </Button>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-4">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{$t('Résultats en cache')}</div>
          <div className="mt-1 text-2xl font-semibold">{formatCount(status.cache.entries)}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{$t('Taille')}</div>
          <div className="mt-1 text-2xl font-semibold">{formatBytes(Number(status.cache.bytes))}</div>
        </div>
      </div>
      <form
        className="min-w-0 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!valid) return
          setBusy(true)
          try {
            await api.put('/v1/admin/settings/cache', { ttl: n, adaptive })
            await qc.invalidateQueries({ queryKey: adminKeys.status })
            toast.success($t('Réglages du cache enregistrés'))
          } catch (err) {
            fail(err)
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="cache-ttl">{$t('Durée de conservation (secondes)')}</Label>
          <div className="flex items-center gap-3">
            <Input id="cache-ttl" type="number" min={0} max={31_536_000} value={ttl} onChange={(e) => setTtl(e.target.value)} className="w-40" aria-invalid={!valid || undefined} disabled={adaptive} />
            <span className="text-sm text-muted-foreground">{valid ? duration(n) : $t('Valeur invalide')}</span>
          </div>
          <p className="text-xs text-muted-foreground">{$t('La durée par défaut de l’instance. Une source, une question ou un tableau de bord peut fixer la sienne.')}</p>
        </div>
        <label className="flex items-start gap-3 rounded-xl border p-3">
          <Switch checked={adaptive} onCheckedChange={setAdaptive} aria-label={$t('Durée adaptative')} className="mt-0.5" />
          <div>
            <div className="text-sm font-medium">{$t('Durée adaptative')}</div>
            <div className="text-xs text-muted-foreground">{$t('Chaque résultat est gardé en proportion du temps qu’il a coûté : une requête de 10 secondes reste en cache environ 17 minutes (entre 1 minute et 24 heures).')}</div>
          </div>
        </label>
        <Button type="submit" disabled={busy || !dirty || !valid}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {$t('Enregistrer')}
        </Button>
      </form>
      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        title={$t('Vider le cache ?')}
        description={$t('Les prochaines requêtes interrogeront à nouveau les sources.')}
        confirmLabel={$t('Vider')}
        onConfirm={async () => {
          try {
            const res = await api.post<{ removed: number }>('/v1/admin/cache/clear')
            await qc.invalidateQueries({ queryKey: adminKeys.status })
            toast.success($tp(res.removed, '{count} résultat retiré du cache', '{count} résultats retirés du cache'))
          } catch (err) {
            fail(err)
          }
        }}
      />
    </Card>
  )
}

function embedExample(id: string, origin: string): string {
  return `// Côté serveur de votre application — jamais dans le navigateur.
import jwt from 'jsonwebtoken'

const token = jwt.sign(
  {
    resource: { dashboard: '<id du tableau de bord>' },
    params: { region: 'Bretagne' },          // filtres verrouillés
    user: { id: 'client-42', attributes: { region: 'Bretagne' } }, // pour les règles de lignes
    exp: Math.floor(Date.now() / 1000) + 10 * 60, // 10 minutes
  },
  process.env.EODIA_EMBED_SECRET,
  { algorithm: 'HS256', keyid: '${id}' },  // en-tête kid = identifiant du secret
)

const url = \`${origin}/embed?token=\${token}\`
// <iframe src={url} width="100%" height="720" frameborder="0"></iframe>`
}

function EmbedCard() {
  const qc = useQueryClient()
  const { data: groups = [] } = useGroups()
  const secrets = useQuery({ queryKey: adminKeys.embedSecrets, queryFn: () => api.get<EmbedSecret[]>('/v1/admin/embed-secrets') })
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [group, setGroup] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ id: string; secret: string } | null>(null)
  const [revoking, setRevoking] = useState<EmbedSecret | null>(null)
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const choosable = groups.filter((g) => g.kind !== 'admin')
  const list = secrets.data ?? []

  return (
    <Card
      className="lg:col-span-2"
      title={$t('Intégration signée')}
      icon={<KeyRound className="size-4 text-muted-foreground" />}
      action={
        <Button
          size="sm"
          onClick={() => {
            setName('')
            setGroup(choosable.find((g) => g.kind === 'custom')?.id ?? null)
            setCreated(null)
            setCreating(true)
          }}
        >
          <Plus /> {$t('Nouveau secret')}
        </Button>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        {$t('Votre application signe un jeton (JWT HS256) avec un secret ; eodia insights affiche le tableau de bord ou la question demandés, filtres verrouillés, avec les droits du groupe choisi. Les attributs du visiteur alimentent les règles de lignes.')}
      </p>
      {secrets.isLoading ? <Spinner className="my-4" /> : null}
      {list.length > 0 ? (
        <div className="mb-5 divide-y rounded-xl border">
          {list.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-pink-50 text-pink-600 dark:bg-pink-950 dark:text-pink-300">
                <KeyRound className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{s.name}</div>
                <div className="truncate font-mono text-xs text-muted-foreground">kid : {s.id}</div>
              </div>
              <Chip color="indigo">{s.group_name}</Chip>
              <span className="hidden text-xs text-muted-foreground md:inline">{dateTime(s.created_at)}</span>
              <Hint label={$t('Révoquer')}>
                <Button variant="ghost" size="icon-sm" onClick={() => setRevoking(s)} aria-label={$t('Révoquer')}>
                  <Trash2 />
                </Button>
              </Hint>
            </div>
          ))}
        </div>
      ) : !secrets.isLoading ? (
        <p className="mb-5 rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{$t('Aucun secret d’intégration.')}</p>
      ) : null}
      <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{$t('Exemple (Node.js)')}</div>
      <CodeBlock className="mt-2" code={embedExample(list[0]?.id ?? '<id du secret>', origin)} />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-2xl">
          {created ? (
            <div className="min-w-0 space-y-4">
              <DialogHeader>
                <DialogTitle>{$t('Secret créé')}</DialogTitle>
                <DialogDescription>{$t('Copiez-le maintenant : il ne sera plus jamais affiché. Rangez-le dans la configuration serveur de votre application.')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label>{$t('Identifiant (kid)')}</Label>
                <CopyField value={created.id} />
              </div>
              <div className="space-y-1.5">
                <Label>{$t('Secret')}</Label>
                <CopyField value={created.secret} secret />
              </div>
              <CodeBlock code={embedExample(created.id, origin)} />
              <DialogFooter>
                <Button onClick={() => setCreating(false)}>{$t('J’ai copié le secret')}</Button>
              </DialogFooter>
            </div>
          ) : (
            <form
              className="min-w-0 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!group || !name.trim()) return
                setBusy(true)
                try {
                  const res = await api.post<{ id: string; secret: string }>('/v1/admin/embed-secrets', { name: name.trim(), group })
                  await qc.invalidateQueries({ queryKey: adminKeys.embedSecrets })
                  setCreated(res)
                } catch (err) {
                  fail(err)
                } finally {
                  setBusy(false)
                }
              }}
            >
              <DialogHeader>
                <DialogTitle>{$t('Nouveau secret d’intégration')}</DialogTitle>
                <DialogDescription>{$t('Les visiteurs intégrés lisent les données avec les droits de ce groupe, et ses règles de lignes s’appliquent à leurs attributs.')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="embed-name">{$t('Nom')}</Label>
                <Input id="embed-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={$t('Portail clients')} required autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="embed-group">{$t('Groupe')}</Label>
                <Choice id="embed-group" value={group} onValueChange={setGroup} options={choosable.map((g) => ({ value: g.id, label: g.name }))} aria-label={$t('Groupe')} size="default" className="w-full" />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                  {$t('Annuler')}
                </Button>
                <Button type="submit" disabled={busy || !name.trim() || !group}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {$t('Créer le secret')}
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
        description={$t('Les intégrations signées avec ce secret cesseront de s’afficher immédiatement.')}
        confirmLabel={$t('Révoquer')}
        onConfirm={async () => {
          if (!revoking) return
          try {
            await api.delete(`/v1/admin/embed-secrets/${revoking.id}`)
            await qc.invalidateQueries({ queryKey: adminKeys.embedSecrets })
            toast.success($t('Secret révoqué'))
          } catch (err) {
            fail(err)
          }
        }}
      />
    </Card>
  )
}

function Settings() {
  const status = useQuery({ queryKey: adminKeys.status, queryFn: () => api.get<Status>('/v1/admin/status') })
  const s = status.data
  return (
    <div className="mx-auto max-w-6xl px-8 py-6">
      <PageHeader
        title={$t('Réglages')}
        description={$t('L’état du moteur de requêtes, le cache des résultats, le copilot et l’intégration signée.')}
        actions={
          <Hint label={$t('Actualiser')}>
            <Button variant="outline" size="icon" onClick={() => status.refetch()} aria-label={$t('Actualiser')}>
              <RotateCw className={cn(status.isFetching && 'animate-spin')} />
            </Button>
          </Hint>
        }
      />
      {status.isLoading ? <Spinner /> : null}
      {status.error ? <Notice tone="warn">{(status.error as Error).message}</Notice> : null}
      {s ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title={$t('Moteur Trino')} icon={<Server className="size-4 text-muted-foreground" />} action={<StatusDot on={s.trino.up} label={s.trino.up ? $t('En ligne') : s.trino.starting ? $t('Démarrage…') : $t('Injoignable')} />}>
            <dl>
              <Row label={$t('Version')}>{s.trino.version ?? '—'}</Row>
              <Row label={$t('Adresse')}>
                <code className="font-mono text-[13px]">{s.trino.url}</code>
              </Row>
              <Row label={$t('Catalogues')}>
                <span className="flex flex-wrap gap-1">
                  {s.trino.catalogs.length ? (
                    s.trino.catalogs.map((c) => (
                      <Chip key={c} color={c === 'system' ? 'gray' : 'violet'}>
                        <Database className="size-3" /> {c}
                      </Chip>
                    ))
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </span>
              </Row>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">{$t('Toute requête passe par Trino, qui consulte l’endpoint OPA de l’API pour appliquer les permissions.')}</p>
          </Card>
          <Card title={$t('Copilot IA')} icon={<Bot className="size-4 text-muted-foreground" />} action={<StatusDot on={s.ai.configured && s.ai.provider !== 'none'} label={s.ai.configured && s.ai.provider !== 'none' ? $t('Configuré') : $t('Désactivé')} />}>
            <dl>
              <Row label={$t('Fournisseur')}>{s.ai.provider === 'none' ? $t('Aucun') : s.ai.provider}</Row>
              <Row label={$t('Modèle')}>{s.ai.model ? <code className="font-mono text-[13px]">{s.ai.model}</code> : '—'}</Row>
              <Row label={$t('Quota')}>{$tp(s.ai.quota, '{count} message par heure et par personne', '{count} messages par heure et par personne')}</Row>
            </dl>
            {s.ai.provider === 'none' || !s.ai.configured ? <p className="mt-3 text-xs text-muted-foreground">{$t('Le copilot se configure par les variables d’environnement de l’API (fournisseur, modèle, clé).')}</p> : null}
          </Card>
          <CacheCard status={s} />
          <Card title={$t('Authentification et e-mails')} icon={<ShieldCheck className="size-4 text-muted-foreground" />}>
            <dl>
              <Row label={$t('Mot de passe')}>
                <StatusDot on label={$t('Activé')} />
              </Row>
              <Row label={$t('OIDC (SSO)')}>
                <StatusDot on={s.oidc} label={s.oidc ? $t('Activé') : $t('Non configuré')} />
              </Row>
              <Row label={$t('SMTP')}>
                <StatusDot on={s.smtp} label={s.smtp ? $t('Activé') : $t('Non configuré')} />
              </Row>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              {s.smtp ? $t('Les invitations partent par e-mail.') : $t('Sans SMTP, les invitations se transmettent par lien.')}{' '}
              {s.oidc ? $t('Les attributs des personnes peuvent venir des claims OIDC.') : $t('Avec OIDC, les attributs des personnes peuvent venir des claims du fournisseur d’identité.')}
            </p>
          </Card>
          <EmbedCard />
        </div>
      ) : null}
    </div>
  )
}

export default function SettingsPage() {
  useCrumbs([{ label: $t('Administration') }, { label: $t('Réglages') }])
  return (
    <AdminOnly>
      <Settings />
    </AdminOnly>
  )
}
