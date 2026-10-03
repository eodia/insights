'use client'

import { Brand } from '@/components/app/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { use, useState } from 'react'

export default function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const { data, error } = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api.get<{ email: string; name: string | null; inviter: string | null }>(`/auth/invitation/${token}`),
  })
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-[400px] space-y-6">
        <Brand />
        {error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : !data ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              setFailure(null)
              try {
                await api.post(`/auth/invitation/${token}`, { name: name || data.name || data.email, password })
                window.location.href = '/'
              } catch (err) {
                setFailure(err instanceof ApiError ? err.message : String(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            <div>
              <h1 className="text-xl font-semibold">{$t('Rejoindre eodia insights')}</h1>
              <p className="text-sm text-muted-foreground">
                {data.inviter ? $t('{name} vous invite.', { name: data.inviter }) : null} {data.email}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n">{$t('Nom')}</Label>
              <Input id="n" defaultValue={data.name ?? ''} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p">{$t('Mot de passe (10 caractères au moins)')}</Label>
              <Input id="p" type="password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {failure ? <p className="text-sm text-destructive">{failure}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {$t('Créer mon compte')}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
