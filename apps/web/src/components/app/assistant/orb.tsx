'use client'

import { cn } from '@/lib/utils'
import type { CSSProperties } from 'react'

/**
 * L'orbe de l'IA : une petite sphère de verre où les couleurs d'eodia — le vert de la marque, un
 * cyan, un violet — tournent lentement, deux lueurs flottent, un reflet en haut à gauche et un halo
 * qui respire. Quand l'IA travaille, tout s'accélère et la sphère bat doucement. Dessinée en CSS
 * (`globals.css`, `.ai-orb`) : nette à toutes les tailles, de 16 à 96 px, et immobile quand la
 * personne a demandé moins de mouvement.
 */
export function Orb({ size, busy = false, className }: { size: number; busy?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('ai-orb', busy && 'ai-orb-busy', size < 26 && 'ai-orb-small', className)}
      style={{ width: size, height: size, '--orb': `${size}px` } as CSSProperties}
    >
      <span className="ai-orb-glow" />
      <span className="ai-orb-ball">
        <span className="ai-orb-swirl" />
        <span className="ai-orb-blob ai-orb-blob-a" />
        <span className="ai-orb-blob ai-orb-blob-b" />
        <span className="ai-orb-shine" />
      </span>
    </span>
  )
}
