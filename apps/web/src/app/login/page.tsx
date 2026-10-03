'use client'

import { Brand } from '@/components/app/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api } from '@/lib/api'
import { $t, $tp, intlLocale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, KeyRound, Loader2, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

interface AuthState {
  setup_required: boolean
  password: boolean
  oidc: { label: string } | null
  demo: { email: string; password: string } | null
  signed_in: boolean
}

/** The right half: what the product does, drawn rather than told. */
function Showcase() {
  const bars = [38, 52, 44, 61, 58, 72, 66, 81, 77, 90, 86, 97]
  const euros = new Intl.NumberFormat(intlLocale(), { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 2 })
  const change = new Intl.NumberFormat(intlLocale(), { style: 'percent', signDisplay: 'always', minimumFractionDigits: 1 })
  return (
    <div className="relative hidden overflow-hidden bg-gradient-to-br from-green-50 via-background to-sky-50 lg:flex dark:from-green-950/30 dark:to-sky-950/20">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_55%)]" />
      <div className="relative m-auto w-full max-w-[560px] space-y-4 p-10">
        <div className="grid grid-cols-3 gap-3">
          {[
            [$t('Chiffre d’affaires'), euros.format(7_290_000), change.format(0.124)],
            [$t('Commandes'), new Intl.NumberFormat(intlLocale()).format(12_944), change.format(0.031)],
            [$t('Panier moyen'), new Intl.NumberFormat(intlLocale(), { style: 'currency', currency: 'EUR' }).format(704.5), change.format(0.089)],
          ].map(([l, v, d]) => (
            <div key={l} className="rounded-xl border bg-card/90 p-4 shadow-sm backdrop-blur">
              <div className="text-xs text-muted-foreground">{l}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{v}</div>
              <div className="mt-0.5 text-xs font-medium text-green-600">{d}</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border bg-card/90 p-5 shadow-sm backdrop-blur">
          <div className="mb-4 flex items-center justify-between text-sm">
            <span className="font-medium">{$t('Chiffre d’affaires par mois')}</span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{$tp(12, '{count} mois', '{count} mois')}</span>
          </div>
          <div className="flex h-36 items-end gap-2">
            {bars.map((h, i) => (
              <div key={i} className="flex-1 rounded-t-[4px] bg-[#2a78d6]" style={{ height: `${h}%`, opacity: 0.55 + i * 0.035 }} />
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-card/90 p-4 shadow-sm backdrop-blur">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-950">
              <Sparkles className="size-4" />
            </span>
            <div className="space-y-1 text-sm">
              <div className="font-medium">{$t('Copilote')}</div>
              <p className="text-muted-foreground">{$t('« La région Bretagne progresse de 18 % sur le trimestre, portée par le canal Web. Je vous propose un tableau de bord pour la suivre. »')}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2 text-xs text-muted-foreground">
          {[
            [Zap, $t('7 moteurs via Trino, requêtes inter-bases')],
            [ShieldCheck, $t('Droits par ligne et par colonne, partout')],
          ].map(([Icon, text]) => {
            const I = Icon as typeof Zap
            return (
              <span key={text as string} className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1">
                <I className="size-3.5 text-primary" /> {text as string}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function LoginForm() {
  const params = useSearchParams()
  const back = params.get('return') ?? '/'
  const { data: state, isLoading } = useQuery({ queryKey: ['auth-state'], queryFn: () => api.get<AuthState>('/auth/state') })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(params.get('error'))
  const [shake, setShake] = useState(0)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (state?.setup_required) await api.post('/auth/setup', { email, name, password })
      else await api.post('/auth/login', { email, password })
      window.location.href = back.startsWith('/') && !back.startsWith('//') ? back : '/'
    } catch (err) {
      setError(err instanceof ApiError ? err.message : $t('Connexion impossible.'))
      setShake((s) => s + 1)
    } finally {
      setBusy(false)
    }
  }

  if (isLoading || !state) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  const setup = state.setup_required
  return (
    <div className="mx-auto flex h-full w-full max-w-[380px] flex-col justify-center gap-8 py-10">
      <Brand />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{setup ? $t('Bienvenue') : $t('Connexion')}</h1>
        <p className="text-sm text-muted-foreground">
          {setup ? $t('Créez le compte administrateur de cette instance.') : $t('Retrouvez vos tableaux de bord et vos questions.')}
        </p>
      </div>
      {state.oidc && !setup ? (
        <>
          <Button asChild variant="outline" size="lg" className="w-full">
            <a href={`/api/auth/oidc/start?return=${encodeURIComponent(back)}`}>
              <KeyRound /> {state.oidc.label === 'Se connecter avec SSO' ? $t('Se connecter avec SSO') : state.oidc.label}
            </a>
          </Button>
          {state.password ? (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> {$t('ou')} <span className="h-px flex-1 bg-border" />
            </div>
          ) : null}
        </>
      ) : null}
      {state.password || setup ? (
        <form onSubmit={submit} key={shake} className={cn('space-y-4', shake > 0 && 'animate-shake')}>
          {setup ? (
            <div className="space-y-1.5">
              <Label htmlFor="name">{$t('Nom')}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="email">{$t('Adresse e-mail')}</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{$t('Mot de passe')}</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={setup ? 10 : 1} autoComplete={setup ? 'new-password' : 'current-password'} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
            {setup ? $t('Créer mon compte') : $t('Se connecter')}
          </Button>
        </form>
      ) : null}
      {state.demo && !setup ? (
        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          <div className="mb-1.5 font-medium text-foreground">{$t('Instance de démonstration')}</div>
          {[
            [state.demo.email, $t('administrateur')],
            ['analyste@eodia.local', $t('équipe régionale — lignes filtrées, e-mails masqués')],
          ].map(([mail, role]) => (
            <button
              key={mail}
              type="button"
              className="block w-full rounded px-1.5 py-1 text-left hover:bg-muted"
              onClick={() => {
                setEmail(mail as string)
                setPassword(state.demo?.password ?? '')
              }}
            >
              <span className="font-mono text-foreground">{mail}</span> · {role}
            </button>
          ))}
          <div className="px-1.5 pt-1">
            {$t('Mot de passe :')} <span className="font-mono">{state.demo.password}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="grid h-screen lg:grid-cols-[5fr_7fr]">
      <div className="overflow-y-auto px-6">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
      <Showcase />
    </div>
  )
}
