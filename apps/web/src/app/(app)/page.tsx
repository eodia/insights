'use client'

import { HomeBoard } from '@/components/app/home/board'
import { $t } from '@/lib/i18n'
import { useCrumbs } from '@/lib/store'

export default function HomePage() {
  useCrumbs([{ label: $t('Accueil') }])
  // The canvas, lit at the top: a green glow on the left, a violet one on the right.
  return (
    <div className="min-h-full bg-surface bg-[radial-gradient(55%_45%_at_12%_0%,rgba(45,163,30,0.11),transparent_70%),radial-gradient(45%_40%_at_92%_4%,rgba(124,58,237,0.09),transparent_70%)] dark:bg-[radial-gradient(55%_45%_at_12%_0%,rgba(45,163,30,0.14),transparent_70%),radial-gradient(45%_40%_at_92%_4%,rgba(124,58,237,0.14),transparent_70%)]">
      <div className="mx-auto w-full max-w-[1360px] px-4 pt-7 pb-16 sm:px-6 lg:px-10">
        <HomeBoard />
      </div>
    </div>
  )
}
