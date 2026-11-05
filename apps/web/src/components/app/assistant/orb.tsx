'use client'

import { cn } from '@/lib/utils'
import { useEffect, useId, useRef, useState } from 'react'

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
// slowly changing shape —: point by point, one melts into the other.
const STAR = 'M12 1.5C12.7 7.1 16.9 11.3 22.5 12C16.9 12.7 12.7 16.9 12 22.5C11.3 16.9 7.1 12.7 1.5 12C7.1 11.3 11.3 7.1 12 1.5Z'
const DROPS = [
  'M12 1.2C18.4 1.4 22.8 6.6 22.4 12.4C22 18.2 17.2 22.6 11.6 22.4C5.8 22.2 1.4 17.4 1.6 11.6C1.8 5.8 6 1 12 1.2Z',
  'M12.6 1.8C18 1.4 22.6 5.8 22.2 11.6C21.8 17.6 17.8 22.8 11.8 22.6C6 22.4 1.2 18.2 1.6 12.4C2 6.6 6.8 2.2 12.6 1.8Z',
  'M12 1.5C17.8 1.5 22.5 6.2 22.5 12C22.5 17.8 17.8 22.5 12 22.5C6.2 22.5 1.5 17.8 1.5 12C1.5 6.2 6.2 1.5 12 1.5Z',
]
const points = (d: string) => (d.match(/\d*\.?\d+/g) ?? []).map(Number)
const STAR_POINTS = points(STAR)
const DROP_POINTS = DROPS.map(points)
const smooth = (t: number) => t * t * (3 - 2 * t)
const mix = (a: readonly number[], b: readonly number[], t: number) => a.map((v, i) => v + ((b[i] ?? v) - v) * t)
const draw = (n: readonly number[]) => {
  const f = n.map((v) => v.toFixed(2))
  return `M${f[0]} ${f[1]}${[0, 1, 2, 3].map((c) => `C${f.slice(2 + c * 6, 8 + c * 6).join(' ')}`).join('')}Z`
}
/** The drop at a given moment: from one of its shapes to the next. */
const drop = (time: number) => {
  const at = time % DROP_POINTS.length
  const from = Math.floor(at)
  return mix(DROP_POINTS[from]!, DROP_POINTS[(from + 1) % DROP_POINTS.length]!, smooth(at - from))
}
// At rest, a cycle of 12 s: the star, a little; the drop, long; the star again.
const CYCLE = 12
const restingDrop = (t: number) => (t < 1.5 ? 0 : t < 2.7 ? smooth((t - 1.5) / 1.2) : t < 10.3 ? 1 : t < 11.5 ? 1 - smooth((t - 10.3) / 1.2) : 0)

/**
 * L'IA qui se fond en goutte : l'étoile devient une orbe du vert d'eodia insights, qui change de
 * forme. Au repos, elle va et vient de l'une à l'autre (`cycling`) ou reste étoile ; quand l'IA
 * travaille, elle devient orbe et le reste jusqu'à la fin, puis redevient étoile. L'étoile seule
 * quand la personne a demandé moins de mouvement.
 */
export function Morph({ size, busy = false, cycling = false, className }: { size: number; busy?: boolean; cycling?: boolean; className?: string }) {
  const id = useId()
  const shape = useRef<SVGPathElement>(null)
  const light = useRef<SVGPathElement>(null)
  const sister = useRef<SVGPathElement>(null)
  const wanted = useRef({ busy, cycling })
  const restart = useRef(false)
  const [still, setStill] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setStill(query.matches)
    const change = () => setStill(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    // Back from work: the cycle resumes on the star.
    if (wanted.current.busy && !busy) restart.current = true
    wanted.current = { busy, cycling }
  }, [busy, cycling])
  useEffect(() => {
    if (still) return
    let frame = 0
    let last = performance.now()
    let clock = 0
    let wobble = 0
    let amount = 0
    const tick = (now: number) => {
      // A frame may be stamped before the effect ran: never back in time.
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000))
      last = now
      const { busy: working, cycling: cycles } = wanted.current
      if (restart.current) {
        restart.current = false
        clock = 11.5
      }
      clock = (clock + dt) % CYCLE
      // The drop moves faster while the AI works.
      wobble += dt / (working ? 0.9 : 2.6)
      const target = working ? 1 : cycles ? restingDrop(clock) : 0
      amount += (target - amount) * (1 - Math.exp(-dt * 5))
      shape.current?.setAttribute('d', draw(mix(STAR_POINTS, drop(wobble), amount)))
      light.current?.setAttribute('d', shape.current?.getAttribute('d') ?? STAR)
      light.current?.setAttribute('opacity', amount.toFixed(3))
      sister.current?.setAttribute('opacity', Math.max(0, 1 - amount * 2).toFixed(3))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [still])
  if (still) return <Orb size={size} className={className} />
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('shrink-0 overflow-visible', className)}
      style={{ filter: `drop-shadow(0 ${size * 0.04}px ${size * 0.12}px rgb(45 163 30 / 0.35))` }}
    >
      <defs>
        <linearGradient id={`${id}f`} x1="4" y1="1" x2="20" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a3e635" />
          <stop offset="0.3" stopColor="#4ade80" />
          <stop offset="0.62" stopColor="#2da31e" />
          <stop offset="1" stopColor="#15803d" />
        </linearGradient>
        {/* The drop's light: bright at its top left, deep at its foot. */}
        <radialGradient id={`${id}l`} cx="0.32" cy="0.26" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="0.7" stopColor="#052e16" stopOpacity="0" />
          <stop offset="1" stopColor="#052e16" stopOpacity="0.4" />
        </radialGradient>
      </defs>
      <path ref={shape} fill={`url(#${id}f)`} d={STAR} />
      <path ref={light} fill={`url(#${id}l)`} d={STAR} opacity="0" />
      <path ref={sister} fill={`url(#${id}f)`} d="M19.5 2c.25 1.6 1.4 2.75 3 3-1.6.25-2.75 1.4-3 3-.25-1.6-1.4-2.75-3-3 1.6-.25 2.75-1.4 3-3z" />
    </svg>
  )
}
