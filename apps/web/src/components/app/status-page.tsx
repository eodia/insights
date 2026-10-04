'use client'

import { EmptyScene, type EmptySceneVariant } from '@/components/app/empty-scene'
import { cn } from '@/lib/utils'

/** A page that has nothing to show but what happened: its scene, a title, a word, a way out. */
export function StatusPage({
  variant,
  title,
  text,
  detail,
  actions,
  className,
}: {
  variant: EmptySceneVariant
  title: string
  text: string
  /** A reference to quote, in small monospace type. */
  detail?: string | undefined
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-1 flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <EmptyScene variant={variant} className="mb-6 w-72" />
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{text}</p>
      {detail ? <code className="mt-3 rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{detail}</code> : null}
      {actions ? <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  )
}
