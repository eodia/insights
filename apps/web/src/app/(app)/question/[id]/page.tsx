'use client'

import { QuestionEditor } from '@/components/app/question/editor'
import { useQuestion } from '@/lib/queries'
import { Loader2 } from 'lucide-react'
import { use } from 'react'

export default function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: q, error } = useQuestion(id)
  if (error) return <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>
  if (!q) return <Loader2 className="m-auto mt-20 size-5 animate-spin text-muted-foreground" />
  return (
    <QuestionEditor
      key={q.id}
      initial={{ id: q.id, name: q.name, description: q.description, type: q.type, folder: q.folder, query: q.query, visualization: q.visualization, access: q.access }}
    />
  )
}
