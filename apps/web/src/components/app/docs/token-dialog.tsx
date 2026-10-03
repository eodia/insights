'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { $t, intlLocale, msg } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Loader2, ShieldAlert, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CopyButton } from './code'

type Surface = 'rest' | 'mcp'

interface TokenRow {
  readonly id: string
  readonly name: string
  readonly prefix: string
  readonly surfaces: readonly Surface[]
  readonly created_at: string
  readonly last_used_at: string | null
  readonly expires_at: string | null
}

const EXPIRIES = [
  { days: 30, label: msg('30 jours') },
  { days: 90, label: msg('90 jours') },
  { days: 365, label: msg('1 an') },
  { days: null, label: msg('Jamais') },
] as const

const SURFACES: readonly { id: Surface; label: string; hint: string }[] = [
  { id: 'rest', label: msg('API REST'), hint: msg('Scripts, intégrations, SDK') },
  { id: 'mcp', label: 'MCP', hint: msg('Claude, assistants et agents') },
]

const TOKENS_KEY = ['me-tokens'] as const

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

function Existing() {
  const qc = useQueryClient()
  const { data: tokens = [], isLoading } = useQuery({ queryKey: TOKENS_KEY, queryFn: () => api.get<TokenRow[]>('/v1/me/tokens') })
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/v1/me/tokens/${id}`),
    onSuccess: async () => {
      toast.success($t('Jeton révoqué.'))
      await qc.invalidateQueries({ queryKey: TOKENS_KEY })
    },
    onError: (e: Error) => toast.error(e.message),
  })
  if (isLoading) return <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
  if (!tokens.length) return <p className="text-sm text-muted-foreground">{$t('Aucun jeton pour le moment.')}</p>
  return (
    <ul className="max-h-48 divide-y overflow-y-auto rounded-xl border">
      {tokens.map((t) => (
        <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
          <KeyRound className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{t.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              <code className="font-mono">{t.prefix}…</code> · {t.surfaces.map((s) => (s === 'rest' ? 'REST' : 'MCP')).join(' + ')} ·{' '}
              {t.last_used_at ? $t('utilisé le {date}', { date: day(t.last_used_at) }) : $t('jamais utilisé')}
              {t.expires_at ? ` · ${$t('expire le {date}', { date: day(t.expires_at) })}` : ''}
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={$t('Révoquer')} disabled={revoke.isPending} onClick={() => revoke.mutate(t.id)}>
            <Trash2 className="text-muted-foreground" />
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** Creates an integration token and shows it once; lists and revokes the existing ones. */
export function TokenDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [surfaces, setSurfaces] = useState<Surface[]>(['rest', 'mcp'])
  const [expires, setExpires] = useState<number | null>(90)
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null)

  const create = useMutation({
    mutationFn: () => api.post<{ id: string; token: string }>('/v1/me/tokens', { name: name.trim(), surfaces, expires_days: expires }),
    onSuccess: async (r) => {
      setCreated({ token: r.token, name: name.trim() })
      await qc.invalidateQueries({ queryKey: TOKENS_KEY })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const close = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      // The secret leaves memory with the dialog: it is shown once, by design.
      setCreated(null)
      setName('')
      setSurfaces(['rest', 'mcp'])
      setExpires(90)
    }
  }

  const toggle = (s: Surface, on: boolean) => setSurfaces((cur) => (on ? [...new Set([...cur, s])] : cur.filter((x) => x !== s)))

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{created ? $t('Jeton créé') : $t("Créer un jeton d'intégration")}</DialogTitle>
          <DialogDescription>
            {created
              ? $t('Copiez-le maintenant : il ne sera plus jamais affiché.')
              : $t('Un jeton agit avec vos droits, ni plus ni moins : vos permissions de données, de colonnes et de lignes s’appliquent à tout ce qu’il lit.')}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-code-border bg-code p-3 text-code-foreground">
              <code className="min-w-0 flex-1 font-mono text-sm break-all">{created.token}</code>
              <CopyButton text={created.token} label={$t('Copier')} className="shrink-0 bg-white/10 text-code-foreground hover:bg-white/20" />
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <span>{$t('Rangez-le comme un mot de passe (gestionnaire de secrets, variable d’environnement). En cas de fuite, révoquez-le ici.')}</span>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{$t('Dans un terminal')}</div>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                <code className="min-w-0 flex-1 truncate font-mono text-xs">export EODIA_TOKEN={created.token}</code>
                <CopyButton text={`export EODIA_TOKEN=${created.token}`} className="text-muted-foreground hover:bg-muted hover:text-foreground" />
              </div>
            </div>
          </div>
        ) : (
          <form
            id="token-form"
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim() && surfaces.length) create.mutate()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="token-name">{$t('Nom')}</Label>
              <Input id="token-name" autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={$t('Claude Desktop, script de reporting…')} />
            </div>
            <div className="space-y-1.5">
              <Label>{$t('Surfaces autorisées')}</Label>
              <div className="grid grid-cols-2 gap-2">
                {SURFACES.map((s) => (
                  <label
                    key={s.id}
                    htmlFor={`surface-${s.id}`}
                    className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors', surfaces.includes(s.id) ? 'border-primary bg-primary/5' : 'hover:bg-muted/60')}
                  >
                    <Checkbox id={`surface-${s.id}`} className="mt-0.5" checked={surfaces.includes(s.id)} onCheckedChange={(v) => toggle(s.id, v === true)} />
                    <span>
                      <span className="block text-sm font-medium">{$t(s.label)}</span>
                      <span className="block text-xs text-muted-foreground">{$t(s.hint)}</span>
                    </span>
                  </label>
                ))}
              </div>
              {!surfaces.length ? <p className="text-xs text-destructive">{$t('Choisissez au moins une surface.')}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label>{$t('Expiration')}</Label>
              <div className="inline-flex rounded-lg border p-0.5">
                {EXPIRIES.map((x) => (
                  <button
                    key={x.label}
                    type="button"
                    onClick={() => setExpires(x.days)}
                    className={cn('rounded-md px-3 py-1 text-sm transition-colors', expires === x.days ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {$t(x.label)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{$t('Vos jetons')}</div>
              <Existing />
            </div>
          </form>
        )}

        <DialogFooter>
          {created ? (
            <Button onClick={() => close(false)}>{$t('Terminé')}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)}>
                {$t('Annuler')}
              </Button>
              <Button type="submit" form="token-form" disabled={!name.trim() || !surfaces.length || create.isPending}>
                {create.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
                {$t('Créer le jeton')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
