'use client'

import { cn } from '@/lib/utils'
import { useId } from 'react'

/**
 * Le pictogramme de l'IA : une étoile à quatre branches et sa petite sœur, en dégradé du vert
 * d'eodia insights (du citron au sarcelle). Elles scintillent quand l'IA travaille.
 */
export function Orb({ size, busy = false, className }: { size: number; busy?: boolean; className?: string }) {
  const id = useId()
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('shrink-0 overflow-visible', busy && 'ai-star-busy', className)}
      style={size >= 40 ? { filter: 'drop-shadow(0 4px 10px rgb(45 163 30 / 0.3))' } : undefined}
    >
      <defs>
        <linearGradient id={id} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#bef264" />
          <stop offset="0.5" stopColor="#2da31e" />
          <stop offset="1" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id})`} d="M12 1.5c.7 5.6 4.9 9.8 10.5 10.5-5.6.7-9.8 4.9-10.5 10.5-.7-5.6-4.9-9.8-10.5-10.5C7.1 11.3 11.3 7.1 12 1.5z" />
      <path fill={`url(#${id})`} d="M19.5 2c.25 1.6 1.4 2.75 3 3-1.6.25-2.75 1.4-3 3-.25-1.6-1.4-2.75-3-3 1.6-.25 2.75-1.4 3-3z" />
    </svg>
  )
}
