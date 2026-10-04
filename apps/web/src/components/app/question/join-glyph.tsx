'use client'

import type { Join } from '@eodia/contracts'
import { cn } from '@/lib/utils'
import { useId } from 'react'

/**
 * How two tables meet, drawn as two overlapping circles — the source on the left, the joined
 * table on the right — with the rows kept filled in.
 */
export function JoinGlyph({ kind, className }: { kind: Join['kind']; className?: string }) {
  const clip = `join-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <svg viewBox="0 0 34 22" className={cn('h-4 w-[26px] shrink-0', className)} aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <circle cx="12" cy="11" r="9" />
        </clipPath>
      </defs>
      <g className="fill-current" opacity="0.32">
        {kind === 'left' || kind === 'full' ? <circle cx="12" cy="11" r="9" /> : null}
        {kind === 'right' || kind === 'full' ? <circle cx="22" cy="11" r="9" /> : null}
        {kind === 'inner' ? <circle cx="22" cy="11" r="9" clipPath={`url(#${clip})`} /> : null}
      </g>
      <g fill="none" className="stroke-current" strokeWidth="1.6">
        <circle cx="12" cy="11" r="9" />
        <circle cx="22" cy="11" r="9" />
      </g>
    </svg>
  )
}
