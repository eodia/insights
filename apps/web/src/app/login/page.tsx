'use client'

import { Brand } from '@/components/app/brand'
import { LoginStage, STAGE_VIEWS, type StageView } from '@/components/app/login-stage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, KeyRound, Loader2 } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

interface AuthState {
  setup_required: boolean
  password: boolean
  oidc: { label: string } | null
  demo: { email: string; password: string } | null
  signed_in: boolean
}

const STEP_MS = 5200

/**
 * The right half: the site's hero — its headline, and the application drawn moving from one
 * moment to the next on its own (a click on a step goes there).
 */
function Showcase() {
  const steps: Record<StageView, { tab: string; title: string }> = {
    builder: { tab: $t('Sans SQL'), title: $t('Une question, sans une ligne de SQL.') },
    sql: { tab: $t('En SQL'), title: $t('Ou tout le SQL que vous voulez.') },
    assistant: { tab: $t('Assistant IA'), title: $t('Demandez. Il répond, graphique à l’appui.') },
    dashboard: { tab: $t('Tableau de bord'), title: $t('Tout se retrouve sur un tableau de bord.') },
    forecast: { tab: $t('Prévisions'), title: $t('Et ce qui vient ensuite.') },
  }
  const [index, setIndex] = useState(0)
  const view = STAGE_VIEWS[index] as StageView
  // On to the next moment, in turn; a click restarts the count from the one chosen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: each new moment restarts the timer
  useEffect(() => {
    const timer = setTimeout(() => setIndex((i) => (i + 1) % STAGE_VIEWS.length), STEP_MS)
    return () => clearTimeout(timer)
  }, [index])
  return (
    <div className="relative hidden overflow-hidden bg-gradient-to-br from-green-50 via-background to-sky-50 lg:flex dark:from-green-950/30 dark:to-sky-950/20">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_10%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_55%)]" />
      <div className="relative m-auto flex w-full max-w-[1080px] flex-col items-center gap-6 px-10 py-10">
        <div className="space-y-3 text-center">
          <h2 className="text-[clamp(36px,4.2vw,64px)] leading-[1.02] font-extrabold tracking-[-0.045em]">
            <span className="block">{$t('Toutes vos bases.')}</span>
            <span className="block bg-gradient-to-r from-[#1f9d4a] via-[#3fb83a] to-[#8bd14a] bg-clip-text text-transparent">{$t('Une seule vérité.')}</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            {steps[view].title}
          </p>
        </div>
        <LoginStage view={view} className="w-full" />
        <nav aria-label={$t('Les étapes de la démonstration')} className="grid w-full max-w-[640px] grid-cols-5 gap-3">
          {STAGE_VIEWS.map((v, i) => (
            <button key={v} type="button" onClick={() => setIndex(i)} aria-current={i === index ? 'step' : undefined} className="group space-y-2 text-center">
              <span className="block h-[3px] overflow-hidden rounded-full bg-foreground/10">
                <span
                  key={i === index ? `${v}-on` : v}
                  className={cn('block h-full origin-left bg-primary', i < index ? 'scale-x-100' : i === index ? 'animate-[step-fill_linear_forwards]' : 'scale-x-0')}
                  style={i === index ? { animationDuration: `${STEP_MS}ms` } : undefined}
                />
              </span>
              <span className={cn('block text-xs transition-colors', i === index ? 'font-medium text-foreground' : 'text-muted-foreground group-hover:text-foreground')}>{steps[v].tab}</span>
            </button>
          ))}
        </nav>
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
