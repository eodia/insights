'use client'

import { useRouter as useNextRouter } from 'next/navigation'
import { useMemo } from 'react'

/** The event that says another page is on its way: the bar across the top listens to it. */
export const NAVIGATING = 'eodia:navigating'

export function signalNavigation(href: string): void {
  window.dispatchEvent(new CustomEvent<string>(NAVIGATING, { detail: href }))
}

const samePage = (href: string) => {
  try {
    return new URL(href, window.location.href).pathname === window.location.pathname
  } catch {
    return true
  }
}

/**
 * Next's router, whose `push` says a page is coming — and `replace` too, when it leads to
 * another page (not when it only rewrites the address of this one: a filter, a tab).
 */
export function useRouter(): ReturnType<typeof useNextRouter> {
  const router = useNextRouter()
  return useMemo(
    () => ({
      ...router,
      back: () => router.back(),
      forward: () => router.forward(),
      refresh: () => router.refresh(),
      prefetch: (...args: Parameters<typeof router.prefetch>) => router.prefetch(...args),
      push: (href: string, options?: Parameters<typeof router.push>[1]) => {
        signalNavigation(href)
        router.push(href, options)
      },
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) => {
        if (!samePage(href)) signalNavigation(href)
        router.replace(href, options)
      },
    }),
    [router],
  )
}
