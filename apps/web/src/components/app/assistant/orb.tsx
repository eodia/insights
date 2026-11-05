'use client'

import { cn } from '@/lib/utils'
import { Sparkles } from 'lucide-react'

/**
 * Le pictogramme de l'IA : des étincelles, dans le vert d'eodia insights. En grand (l'accueil de
 * l'assistant, du copilote), posées sur une pastille vert pâle ; elles battent doucement quand
 * l'IA travaille.
 */
export function Orb({ size, busy = false, className }: { size: number; busy?: boolean; className?: string }) {
  const tile = size >= 40
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 items-center justify-center text-primary', tile && 'rounded-[28%] bg-primary/10', busy && 'animate-pulse', className)}
      style={{ width: size, height: size }}
    >
      <Sparkles style={{ width: tile ? size * 0.5 : size, height: tile ? size * 0.5 : size }} strokeWidth={tile ? 1.75 : 2} />
    </span>
  )
}
