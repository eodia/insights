'use client'

import { StatusPage } from '@/components/app/status-page'
import { Button } from '@/components/ui/button'
import { $t } from '@/lib/i18n'
import { Home, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useEffect } from 'react'

/**
 * What an error boundary shows: the screen broke, it may be tried again. The reference is the
 * one the server logged, for an administrator to find it there.
 */
export function ErrorScreen({ error, retry, className }: { error: Error & { digest?: string }; retry: () => void; className?: string }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <StatusPage
      variant="error"
      title={$t('Cet écran a rencontré un problème')}
      text={
        error.digest
          ? $t('Une erreur imprévue l’a interrompu. Réessayez : si elle revient, la référence ci-dessous aidera votre administrateur à la retrouver.')
          : $t('Une erreur imprévue l’a interrompu. Réessayez, ou revenez à l’accueil.')
      }
      detail={error.digest}
      actions={
        <>
          <Button variant="outline" asChild>
            <Link href="/">
              <Home /> {$t('Accueil')}
            </Link>
          </Button>
          <Button onClick={() => retry()}>
            <RotateCcw /> {$t('Réessayer')}
          </Button>
        </>
      }
      {...(className ? { className } : {})}
    />
  )
}
