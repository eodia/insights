'use client'

import { type ReactNode, useSyncExternalStore } from 'react'

const never = () => () => undefined

/**
 * Draws the application in the browser only. The server does not know the reader's messages
 * — they reach the page in a script, and a table of labels reads them when its module loads —,
 * so what it drew would be French and would not match what the browser draws in English.
 * Nothing is lost: every screen starts by asking the API who is there.
 */
export function I18nRoot({ children }: { readonly children: ReactNode }) {
  // `false` on the server and while hydrating, `true` right after.
  const inBrowser = useSyncExternalStore(
    never,
    () => true,
    () => false,
  )
  return inBrowser ? children : null
}
