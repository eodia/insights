'use client'

import { ErrorScreen } from '@/components/app/error-screen'

export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex min-h-svh flex-col bg-background">
      <ErrorScreen error={error} retry={retry} className="pb-28" />
    </main>
  )
}
