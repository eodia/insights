'use client'

import { useEffect } from 'react'
import { create } from 'zustand'

export interface Crumb {
  readonly label: string
  readonly href?: string
}

/** What the copilot sees of the screen: the SQL being written, the question, the dashboard… */
export type CopilotContext =
  | { kind: 'general' }
  | { kind: 'sql'; sql?: string; error?: string }
  | { kind: 'question'; id?: string; query?: unknown }
  | { kind: 'dashboard'; id: string }
  | { kind: 'structure'; table: string }

interface UiState {
  sidebar: boolean
  crumbs: readonly Crumb[]
  palette: boolean
  copilot: boolean
  copilotContext: CopilotContext
  /** A message the copilot sends as soon as it opens — « Décrire avec le copilot ». */
  copilotPrompt: string | null
  toggleSidebar(): void
  setCrumbs(crumbs: readonly Crumb[]): void
  setPalette(open: boolean): void
  openCopilot(context?: CopilotContext, prompt?: string): void
  closeCopilot(): void
  setCopilotContext(context: CopilotContext): void
  takeCopilotPrompt(): string | null
}

export const useUi = create<UiState>((set, get) => ({
  sidebar: true,
  crumbs: [],
  palette: false,
  copilot: false,
  copilotContext: { kind: 'general' },
  copilotPrompt: null,
  toggleSidebar: () => set((s) => ({ sidebar: !s.sidebar })),
  setCrumbs: (crumbs) => set({ crumbs }),
  setPalette: (palette) => set({ palette }),
  openCopilot: (context, prompt) => set((s) => ({ copilot: true, copilotContext: context ?? s.copilotContext, copilotPrompt: prompt ?? null })),
  closeCopilot: () => set({ copilot: false }),
  setCopilotContext: (copilotContext) => set({ copilotContext }),
  takeCopilotPrompt: () => {
    const p = get().copilotPrompt
    if (p) set({ copilotPrompt: null })
    return p
  },
}))

/** Sets the breadcrumb of the page for as long as it is shown. */
export function useCrumbs(crumbs: readonly Crumb[]): void {
  const key = JSON.stringify(crumbs)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the serialized crumbs are the dependency
  useEffect(() => {
    useUi.getState().setCrumbs(JSON.parse(key))
  }, [key])
}
