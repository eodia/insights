'use client'

import type { Dashboard, ResolvedTheme, Visualization as Viz } from '@eodia/contracts'
import { Brand } from '@/components/app/brand'
import { DashboardView, type Runner } from '@/components/app/dashboard/view'
import { ResultFooter, Visualization } from '@/components/app/visualization'
import { type RunResult, api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { ThemeLogo, ThemeScope } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'

export interface SharedContent {
  readonly link?: { can_embed: boolean; kind: 'question' | 'dashboard' }
  readonly dashboard?: Dashboard
  readonly question?: { id: string; name: string; description: string | null; visualization: Viz; resolved_theme?: ResolvedTheme | null }
}

/** A shared dashboard or question, outside the application: no sidebar, no editing. */
export function PublicView({ content, runner, runQuestion, embed }: { content: SharedContent; runner: Runner; runQuestion: () => Promise<RunResult>; embed: boolean }) {
  const q = content.question
  const result = useQuery({ queryKey: ['public-question', q?.id], queryFn: runQuestion, enabled: !!q, retry: false })
  // The product's name keeps its weight wherever the language puts it.
  const poweredBy = $t('Propulsé par {product}').split('{product}')
  const theme = content.dashboard?.resolved_theme ?? q?.resolved_theme ?? null
  return (
    <ThemeScope theme={theme} className={cn('flex h-screen flex-col bg-background', embed && 'bg-transparent')}>
      {!embed ? (
        <header className="flex h-14 shrink-0 items-center gap-4 border-b px-6">
          {theme?.settings.logo ? <ThemeLogo theme={theme} className="max-h-9 object-contain" /> : <Brand />}
          <span className="text-muted-foreground/50">/</span>
          <span className="theme-title truncate font-medium">{content.dashboard?.name ?? q?.name}</span>
        </header>
      ) : null}
      {content.dashboard ? (
        <>
          {!embed && content.dashboard.description ? <p className="px-6 pt-4 text-sm text-muted-foreground">{content.dashboard.description}</p> : null}
          <div className="min-h-0 flex-1">
            <DashboardView dashboard={content.dashboard} runner={runner} editable={false} publicMode autoRefresh={content.dashboard.auto_refresh} />
          </div>
        </>
      ) : q ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
          {embed ? <h1 className="theme-title text-lg font-semibold">{q.name}</h1> : null}
          {q.description ? <p className="text-sm text-muted-foreground">{q.description}</p> : null}
          <div className="theme-card min-h-0 flex-1 rounded-xl border p-4">
            {result.data ? (
              <Visualization result={result.data} viz={q.visualization} />
            ) : result.error ? (
              <p className="text-sm text-destructive">{(result.error as Error).message}</p>
            ) : (
              <Loader2 className="m-auto mt-20 size-5 animate-spin text-muted-foreground" />
            )}
          </div>
          {result.data ? <ResultFooter result={result.data} /> : null}
        </div>
      ) : null}
      {!embed ? (
        <footer className="border-t px-6 py-2 text-center text-xs text-muted-foreground">
          {poweredBy[0]}<span className="font-medium text-foreground">eodia insights</span>{poweredBy[1]}
        </footer>
      ) : null}
    </ThemeScope>
  )
}

export function usePublicLink(token: string) {
  return useQuery({ queryKey: ['public-link', token], queryFn: () => api.get<SharedContent>(`/public/links/${token}`), retry: false })
}
