'use client'

import { type Draft, QuestionEditor } from '@/components/app/question/editor'
import { useMe, useTables } from '@/lib/queries'
import { Loader2 } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useMemo } from 'react'

function NewQuestion() {
  const params = useSearchParams()
  const { data: me } = useMe()
  const { data: tables } = useTables()
  const initial = useMemo<Draft | null>(() => {
    if (!me || !tables) return null
    const base: Draft = {
      id: null,
      name: '',
      description: null,
      type: 'question',
      folder: me.personal_folder,
      query: { kind: 'builder', source: { kind: 'table', id: params.get('table') ?? tables.find((t) => t.visibility === 'normal')?.id ?? '' } },
      visualization: { type: 'table' },
      access: 'manage',
    }
    if (params.get('draft')) {
      try {
        const stash = JSON.parse(sessionStorage.getItem('eodia-draft') ?? 'null')
        if (stash) return { ...base, name: stash.name ?? '', description: stash.description ?? null, query: stash.query, visualization: stash.visualization ?? base.visualization }
      } catch {}
    }
    const sql = params.get('sql')
    if (sql !== null) return { ...base, query: { kind: 'sql', sql } }
    return base
  }, [me, tables, params])
  if (!initial) return <Loader2 className="m-auto mt-20 size-5 animate-spin text-muted-foreground" />
  return <QuestionEditor initial={initial} />
}

export default function NewQuestionPage() {
  return (
    <Suspense>
      <NewQuestion />
    </Suspense>
  )
}
