'use client'

import { Assistant } from '@/components/app/assistant/assistant'
import { Suspense } from 'react'

export default function AssistantPage() {
  return (
    <Suspense>
      <Assistant />
    </Suspense>
  )
}
