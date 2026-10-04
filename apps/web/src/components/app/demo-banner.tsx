'use client'

import { api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, FlaskConical } from 'lucide-react'

/** On a public demo, a line above everything: the data is made up, and reset every night. */
export function DemoBanner() {
  const { data } = useQuery({
    queryKey: ['auth-state'],
    queryFn: () => api.get<{ demo: { public: boolean } | null }>('/auth/state'),
    staleTime: Number.POSITIVE_INFINITY,
  })
  if (!data?.demo?.public) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border-b bg-primary/8 px-4 py-1.5 text-center text-xs">
      <FlaskConical className="size-3.5 text-primary" />
      <span>{$t('Démo publique : Maison Arvor est une boutique fictive, remise à zéro chaque nuit.')}</span>
      <a href="https://eodia.github.io/insights/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
        {$t('Installer eodia insights')} <ArrowUpRight className="size-3" />
      </a>
    </div>
  )
}
