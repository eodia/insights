'use client'

import { PublicView, usePublicLink } from '@/components/app/public-view'
import { type RunResult, api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { Loader2 } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense, use } from 'react'

function Shared({ token }: { token: string }) {
  const embed = useSearchParams().get('embed') === '1'
  const { data, error } = usePublicLink(token)
  if (error) return <p className="p-10 text-center text-sm text-muted-foreground">{(error as Error).message}</p>
  if (!data) return <Loader2 className="m-auto mt-24 size-5 animate-spin text-muted-foreground" />
  if (embed && !data.link?.can_embed) return <p className="p-10 text-center text-sm text-muted-foreground">{$t('Ce contenu ne peut pas être intégré.')}</p>
  return (
    <PublicView
      content={data}
      embed={embed}
      runner={(card, values) => api.post<RunResult>(`/public/links/${token}/cards/${card.id}/run`, { values })}
      runQuestion={() => api.post<RunResult>(`/public/links/${token}/run`, {})}
    />
  )
}

export default function SharedDashboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  return (
    <Suspense>
      <Shared token={token} />
    </Suspense>
  )
}
