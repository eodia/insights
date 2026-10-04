'use client'

import { ErrorScreen } from '@/components/app/error-screen'

/** Inside the application: the sidebar stays, only the screen is replaced. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} />
}
