'use client'

import { cn } from '@/lib/utils'
import type { CSSProperties } from 'react'

/**
 * L'orbe de l'IA : une goutte du vert d'eodia insights qui change lentement de forme, en
 * tournant sur elle-même. Plus vive et plus rapide quand l'IA travaille ; immobile quand la
 * personne a demandé moins de mouvement. Dessinée en CSS (`globals.css`, `.ai-orb`).
 */
export function Orb({ size, busy = false, className }: { size: number; busy?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('ai-orb', busy && 'ai-orb-busy', className)}
      style={{ width: size, height: size, '--orb': `${size}px` } as CSSProperties}
    >
      <span className="ai-orb-blob" />
    </span>
  )
}
