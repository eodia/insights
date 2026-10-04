'use client'

import { Brand } from '@/components/app/brand'
import { StatusPage } from '@/components/app/status-page'
import { Button } from '@/components/ui/button'
import { $t } from '@/lib/i18n'
import { ArrowLeft, Home } from 'lucide-react'
import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col bg-background">
      <header className="px-6 py-5">
        <Link href="/" className="inline-flex">
          <Brand />
        </Link>
      </header>
      <StatusPage
        variant="not-found"
        title={$t('Page introuvable')}
        text={$t('Cette adresse ne mène nulle part : la page a peut-être été déplacée ou supprimée, ou le lien est incomplet.')}
        actions={
          <>
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft /> {$t('Retour')}
            </Button>
            <Button asChild>
              <Link href="/">
                <Home /> {$t('Accueil')}
              </Link>
            </Button>
          </>
        }
        className="pb-28"
      />
    </main>
  )
}
