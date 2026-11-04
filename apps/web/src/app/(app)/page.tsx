'use client'

import { HomeBoard } from '@/components/app/home/board'
import { $t } from '@/lib/i18n'
import { useCrumbs } from '@/lib/store'

export default function HomePage() {
  useCrumbs([{ label: $t('Accueil') }])
  return <HomeBoard />
}
