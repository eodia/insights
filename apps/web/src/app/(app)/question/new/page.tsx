'use client'

import { type Draft, QuestionEditor } from '@/components/app/question/editor'
import { useDashboard, useMe, useTables } from '@/lib/queries'
import { Loader2 } from 'lucide-react'
import { DRAFT_KEY } from '@/components/app/point-menu'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo } from 'react'

function NewQuestion() {
  const params = useSearchParams()
  const { data: me } = useMe()
  const { data: tables } = useTables()
  // Created from a dashboard: the question belongs to it.
  const dashboardId = params.get('dashboard')
  const { data: dashboard, error } = useDashboard(dashboardId)
  const initial = useMemo<Draft | null>(() => {
    if (!me || !tables || (dashboardId && !dashboard)) return null
    const base: Draft = {
      id: null,
      name: '',
      description: null,
      type: 'question',
      folder: dashboard ? null : me.personal_folder,
      dashboard: dashboard ? { id: dashboard.id, name: dashboard.name } : null,
      tab: params.get('tab'),
      query: { kind: 'builder', source: { kind: 'table', id: params.get('table') ?? tables.find((t) => t.visibility === 'normal')?.id ?? '' } },
      visualization: { type: 'table' },
      access: 'manage',
    }
    const draftId = params.get('draft')
    if (draftId) {
      try {
        // `1`: from this tab (the assistant); an id: from another tab (the rows behind a point).
        const stash = JSON.parse((draftId === '1' ? sessionStorage.getItem('eodia-draft') : localStorage.getItem(DRAFT_KEY(draftId))) ?? 'null')
        if (stash) return { ...base, name: stash.name ?? '', description: stash.description ?? null, query: stash.query, visualization: stash.visualization ?? base.visualization }
      } catch {}
    }
    const sql = params.get('sql')
    if (sql !== null) return { ...base, query: { kind: 'sql', sql } }
    return base
  }, [me, tables, params, dashboard, dashboardId])
  // Read once opened: the draft of another tab is not left behind.
  const draftId = params.get('draft')
  useEffect(() => {
    if (initial && draftId && draftId !== '1') {
      try {
        localStorage.removeItem(DRAFT_KEY(draftId))
      } catch {}
    }
  }, [initial, draftId])
  if (error) return <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>
  if (!initial) return <Loader2 className="m-auto mt-20 size-5 animate-spin text-muted-foreground" />
  // Another draft opened in the same tab starts another question.
  return <QuestionEditor key={draftId ?? 'new'} initial={initial} />
}

export default function NewQuestionPage() {
  return (
    <Suspense>
      <NewQuestion />
    </Suspense>
  )
}
