'use client'

import type { DashboardCard } from '@eodia/contracts'
import { useEffect } from 'react'
import { create } from 'zustand'

/** A dashboard open for editing: what is added to it goes to its draft, saved with the rest. */
export interface DashboardDraftSink {
  readonly id: string
  add(cards: readonly Omit<DashboardCard, 'x' | 'y' | 'tab'>[]): void
}

/**
 * The dashboard on screen, as the copilot may filter it: « seulement la Bretagne le trimestre
 * dernier » sets its filters at once — Back undoes it.
 */
export interface DashboardFiltersSink {
  readonly id: string
  apply(values: Readonly<Record<string, unknown>>): void
}

/** A filter of the dashboard on screen, as the copilot is told it. */
export interface DashboardFilterInfo {
  readonly id: string
  readonly label: string
  readonly type: string
  readonly multiple?: boolean
  readonly operator?: string
  readonly units?: readonly string[]
  readonly value: unknown
  readonly column: string | null
}

export interface Crumb {
  readonly label: string
  readonly href?: string
}

/** What the copilot sees of the screen: the SQL being written, the question, the dashboard… */
export type CopilotContext =
  | { kind: 'general' }
  | { kind: 'sql'; sql?: string; error?: string }
  | { kind: 'question'; id?: string; query?: unknown }
  | { kind: 'dashboard'; id: string; filters?: readonly DashboardFilterInfo[] }
  | { kind: 'structure'; table: string }

interface UiState {
  sidebar: boolean
  crumbs: readonly Crumb[]
  palette: boolean
  copilot: boolean
  copilotContext: CopilotContext
  /** A message the copilot sends as soon as it opens — « Décrire avec le copilot ». */
  copilotPrompt: string | null
  dashboardDraft: DashboardDraftSink | null
  dashboardFilters: DashboardFiltersSink | null
  toggleSidebar(): void
  setCrumbs(crumbs: readonly Crumb[]): void
  setPalette(open: boolean): void
  openCopilot(context?: CopilotContext, prompt?: string): void
  closeCopilot(): void
  setCopilotContext(context: CopilotContext): void
  takeCopilotPrompt(): string | null
  setDashboardDraft(sink: DashboardDraftSink | null): void
  setDashboardFilters(sink: DashboardFiltersSink | null): void
}

export const useUi = create<UiState>((set, get) => ({
  sidebar: true,
  crumbs: [],
  palette: false,
  copilot: false,
  copilotContext: { kind: 'general' },
  copilotPrompt: null,
  dashboardDraft: null,
  dashboardFilters: null,
  setDashboardDraft: (dashboardDraft) => set({ dashboardDraft }),
  setDashboardFilters: (dashboardFilters) => set({ dashboardFilters }),
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
