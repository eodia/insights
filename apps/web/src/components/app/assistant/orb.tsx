'use client'

import { cn } from '@/lib/utils'
import { useEffect, useId, useState } from 'react'

const TONES = {
  green: ['#bef264', '#2da31e', '#0d9488', '45 163 30'],
  violet: ['#f0abfc', '#8b5cf6', '#6d28d9', '124 58 237'],
}

/**
 * Le pictogramme de l'IA : une étoile à quatre branches et sa petite sœur, en dégradé du vert
 * d'eodia insights (du citron au sarcelle) ou du violet du copilote. Elles scintillent quand
 * l'IA travaille.
 */
export function Orb({ size, busy = false, tone = 'green', className }: { size: number; busy?: boolean; tone?: keyof typeof TONES; className?: string }) {
  const id = useId()
  const [from, mid, to, shadow] = TONES[tone]
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('shrink-0 overflow-visible', busy && 'ai-star-busy', className)}
      style={size >= 40 ? { filter: `drop-shadow(0 4px 10px rgb(${shadow} / 0.3))` } : undefined}
    >
      <defs>
        <linearGradient id={id} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={from} />
          <stop offset="0.5" stopColor={mid} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <path fill={`url(#${id})`} d="M12 1.5c.7 5.6 4.9 9.8 10.5 10.5-5.6.7-9.8 4.9-10.5 10.5-.7-5.6-4.9-9.8-10.5-10.5C7.1 11.3 11.3 7.1 12 1.5z" />
      <path fill={`url(#${id})`} d="M19.5 2c.25 1.6 1.4 2.75 3 3-1.6.25-2.75 1.4-3 3-.25-1.6-1.4-2.75-3-3 1.6-.25 2.75-1.4 3-3z" />
    </svg>
  )
}

// The same four anchors (top, right, bottom, left) drawn inward — the star — or outward — a drop
// slowly changing shape —, so that one melts into the other.
const STAR = 'M12 1.5C12.7 7.1 16.9 11.3 22.5 12C16.9 12.7 12.7 16.9 12 22.5C11.3 16.9 7.1 12.7 1.5 12C7.1 11.3 11.3 7.1 12 1.5Z'
const DROPS = [
  'M12 1.2C18.4 1.4 22.8 6.6 22.4 12.4C22 18.2 17.2 22.6 11.6 22.4C5.8 22.2 1.4 17.4 1.6 11.6C1.8 5.8 6 1 12 1.2Z',
  'M12.6 1.8C18 1.4 22.6 5.8 22.2 11.6C21.8 17.6 17.8 22.8 11.8 22.6C6 22.4 1.2 18.2 1.6 12.4C2 6.6 6.8 2.2 12.6 1.8Z',
  'M12 1.5C17.8 1.5 22.5 6.2 22.5 12C22.5 17.8 17.8 22.5 12 22.5C6.2 22.5 1.5 17.8 1.5 12C1.5 6.2 6.2 1.5 12 1.5Z',
]
const SHAPES = [STAR, STAR, ...DROPS, STAR, STAR].join(';')
const TIMES = '0;0.28;0.42;0.58;0.74;0.88;1'
const SPLINES = Array(6).fill('0.45 0 0.2 1').join(';')

/**
 * L'IA en grand, sur l'accueil de l'assistant : l'étoile qui se fond en une goutte du vert
 * d'eodia insights, change de forme, puis redevient étoile. Plus vite quand l'IA travaille ;
 * l'étoile seule quand la personne a demandé moins de mouvement.
 */
export function Morph({ size, busy = false, className }: { size: number; busy?: boolean; className?: string }) {
  const id = useId()
  const [still, setStill] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setStill(query.matches)
    const change = () => setStill(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  if (still) return <Orb size={size} className={className} />
  const dur = busy ? '3s' : '9s'
  const along = { dur, repeatCount: 'indefinite', keyTimes: TIMES, calcMode: 'spline', keySplines: SPLINES } as const
  return (
    <svg
      key={dur}
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('shrink-0 overflow-visible', className)}
      style={{ filter: 'drop-shadow(0 6px 14px rgb(45 163 30 / 0.3))' }}
    >
      <defs>
        <linearGradient id={`${id}f`} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#bef264" />
          <stop offset="0.5" stopColor="#2da31e" />
          <stop offset="1" stopColor="#0d9488" />
        </linearGradient>
        <radialGradient id={`${id}l`} cx="0.32" cy="0.26" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#052e16" stopOpacity="0.25" />
        </radialGradient>
      </defs>
      <path fill={`url(#${id}f)`} d={STAR}>
        <animate attributeName="d" values={SHAPES} {...along} />
      </path>
      {/* The drop's glassy light, only while it is a drop. */}
      <path fill={`url(#${id}l)`} d={STAR} opacity="0">
        <animate attributeName="d" values={SHAPES} {...along} />
        <animate attributeName="opacity" values="0;0;1;1;1;0;0" {...along} />
      </path>
      <path fill={`url(#${id}f)`} d="M19.5 2c.25 1.6 1.4 2.75 3 3-1.6.25-2.75 1.4-3 3-.25-1.6-1.4-2.75-3-3 1.6-.25 2.75-1.4 3-3z">
        <animate attributeName="opacity" values="1;1;0;0;0;1;1" {...along} />
      </path>
    </svg>
  )
}
