'use client'

import { PublicView, type SharedContent } from '@/components/app/public-view'
import { type RunResult, api } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

/** Signed embedding: `/embed?token=<JWT HS256 signed by the host application>`. */
function Embedded() {
  const token = useSearchParams().get('token') ?? ''
  const { data, error } = useQuery({ queryKey: ['embed', token], queryFn: () => api.get<SharedContent>(`/public/embed?token=${encodeURIComponent(token)}`), retry: false })
  if (error) return <p className="p-10 text-center text-sm text-muted-foreground">{(error as Error).message}</p>
  if (!data) return <Loader2 className="m-auto mt-24 size-5 animate-spin text-muted-foreground" />
  return (
    <PublicView
      content={data}
      embed
      runner={(card, values) => api.post<RunResult>('/public/embed/run', { token, card: card.id, values })}
      runQuestion={() => api.post<RunResult>('/public/embed/run', { token })}
    />
  )
}

export default function EmbedPage() {
  return (
    <Suspense>
      <Embedded />
    </Suspense>
  )
}
