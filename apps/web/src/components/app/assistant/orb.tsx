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
// changing shape —: point by point, one melts into the other.
const STAR = 'M12 1.5C12.7 7.1 16.9 11.3 22.5 12C16.9 12.7 12.7 16.9 12 22.5C11.3 16.9 7.1 12.7 1.5 12C7.1 11.3 11.3 7.1 12 1.5Z'
const points = (d: string) => (d.match(/\d*\.?\d+/g) ?? []).map(Number)
const STAR_POINTS = points(STAR)
const smooth = (t: number) => t * t * (3 - 2 * t)
const mix = (a: readonly number[], b: readonly number[], t: number) => a.map((v, i) => v + ((b[i] ?? v) - v) * t)
const draw = (n: readonly number[]) => {
  const f = n.map((v) => v.toFixed(2))
  return `M${f[0]} ${f[1]}${[0, 1, 2, 3].map((c) => `C${f.slice(2 + c * 6, 8 + c * 6).join(' ')}`).join('')}Z`
}
/**
 * The drop at a given moment: four points around a circle, each swelling, shrinking and sliding
 * at its own pace — never twice the same shape. In seconds, at rest; faster while working.
 */
const WAVES = [
  [1.7, 0],
  [2.3, 1.9],
  [1.9, 3.7],
  [2.6, 5.1],
] as const
const drop = (time: number) => {
  const around = WAVES.map(([f, phase], i) => {
    const r = 10.5 * (1 + 0.15 * Math.sin(time * f + phase))
    const a = ((i - 1) * Math.PI) / 2 + 0.16 * Math.sin(time * f * 0.8 + phase * 1.3)
    // How round the curve leaves this point: fuller, or nearly a corner.
    const h = r * 0.5523 * (1 + 0.28 * Math.sin(time * f * 1.2 + phase * 0.7))
    return { x: 12 + r * Math.cos(a), y: 12 + r * Math.sin(a), tx: -Math.sin(a) * h, ty: Math.cos(a) * h }
  })
  const n: number[] = [around[0]!.x, around[0]!.y]
  around.forEach((p, i) => {
    const q = around[(i + 1) % 4]!
    n.push(p.x + p.tx, p.y + p.ty, q.x - q.tx, q.y - q.ty, q.x, q.y)
  })
  return n
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
      wobble += dt * (working ? 2.4 : 1.3)
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
      // A shadow for the large one only: on a small one it blurs it.
      style={size >= 40 ? { filter: `drop-shadow(0 ${size * 0.04}px ${size * 0.12}px rgb(45 163 30 / 0.35))` } : undefined}
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
