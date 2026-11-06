'use client'

import { $t } from '@/lib/i18n'
import { NAVIGATING } from '@/lib/router'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

/** Whether `href` leads elsewhere than the page shown: a link to itself starts no wait. */
function elsewhere(href: string): boolean {
  try {
    const url = new URL(href, window.location.href)
    return url.origin === window.location.origin && (url.pathname !== window.location.pathname || url.search !== window.location.search)
  } catch {
    return false
  }
}

function Progress() {
  const path = usePathname()
  const search = useSearchParams()
  const [busy, setBusy] = useState(false)

  // Arrived: the new page is there.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the address is what ends the wait
  useEffect(() => setBusy(false), [path, search])

  useEffect(() => {
    // A link clicked — read before Next's own handler, which keeps the browser from following it.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
      if (elsewhere(a.href)) setBusy(true)
    }
    document.addEventListener('click', onClick, true)
    // A page opened from code (a menu, the palette): `useRouter` of `lib/router` says so.
    const onNavigate = (e: Event) => {
      if (elsewhere((e as CustomEvent<string>).detail)) setBusy(true)
    }
    window.addEventListener(NAVIGATING, onNavigate)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener(NAVIGATING, onNavigate)
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('navigating', busy)
    if (!busy) return
    // Never left on: a page that does not come back stops the bar after a while.
    const stop = setTimeout(() => setBusy(false), 15_000)
    return () => clearTimeout(stop)
  }, [busy])

  return busy ? <div className="nav-progress" role="progressbar" aria-label={$t('Chargement de la page…')} /> : null
}

/**
 * A thin bar across the top while the next page comes, from the click on: the page shown stays
 * until the next is ready, and without it nothing would say that something is on its way.
 */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <Progress />
    </Suspense>
  )
}
