'use client'

import { HomeHero } from '@/components/app/home/hero'
import { Favorite, Latest, Recent, Shortcuts, Sources, Tables } from '@/components/app/home/sections'
import type { ItemSummary } from '@eodia/contracts'
import { api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { useDatasources, useMe, useTables } from '@/lib/queries'
import { useCrumbs } from '@/lib/store'
import { useQuery } from '@tanstack/react-query'

export default function HomePage() {
  useCrumbs([{ label: $t('Accueil') }])
  const { data: me } = useMe()
  const { data: home } = useQuery({
    queryKey: ['home'],
    queryFn: () => api.get<{ recent: ItemSummary[]; bookmarks: ItemSummary[]; latest: ItemSummary[] }>('/v1/home'),
  })
  const { data: tables = [] } = useTables()
  const { data: sources = [] } = useDatasources()
  const starters = tables
    .filter((t) => t.visibility === 'normal')
    .sort((a, b) => (b.row_count ?? 0) - (a.row_count ?? 0))
    .slice(0, 6)
  const favorite = home?.bookmarks[0]

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-9 px-4 pt-7 pb-16 sm:px-6 lg:px-10">
      <HomeHero firstName={me?.name.split(' ')[0] ?? ''} ai={!!me?.ai_enabled} />
      <Shortcuts sql={!!me?.can.use_sql} table={starters[0]?.qualified ?? null} />
      <section className="flex flex-wrap items-start gap-7">
        <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-7">
          {favorite ? <Favorite item={favorite} /> : null}
          {home?.recent.length ? <Recent items={home.recent} /> : null}
          {home?.latest.length ? <Latest items={home.latest.slice(0, 4)} /> : null}
        </div>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-7">
          <Tables tables={starters} />
          <Sources sources={sources} />
        </div>
      </section>
    </div>
  )
}
