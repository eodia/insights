'use client'

import { cn } from '@/lib/utils'
import { useEffect, useRef } from 'react'

/**
 * L'anneau de l'assistant : un trait de lumière fin, aux bords qui ondulent doucement, un
 * reflet qui tourne. Plusieurs contours légèrement décalés, tracés à chaque image sur un canvas
 * — plus vite et plus amples quand l'assistant travaille. Sans mouvement si la personne l'a
 * demandé à son système.
 */
export function Orb({
  size,
  busy = false,
  className,
}: { size: number; busy?: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const state = useRef({ busy })
  state.current.busy = busy

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    // Room around the ring for its glow.
    const box = size * 1.5
    el.width = Math.round(box * dpr)
    el.height = Math.round(box * dpr)
    ctx.scale(dpr, dpr)
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const small = size < 40
    const layers = small ? 2 : 3
    let frame = 0
    let t = Math.random() * 10
    let speed = 1
    let last = performance.now()

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      // Eases between calm and busy instead of jumping.
      speed += ((state.current.busy ? 2.6 : 1) - speed) * Math.min(dt * 3, 1)
      if (!still) t += dt * speed
      const dark = document.documentElement.classList.contains('dark')
      const cx = box / 2
      const cy = box / 2
      const R = size / 2 - Math.max(1.5, size * 0.04)
      ctx.clearRect(0, 0, box, box)
      for (let k = 0; k < layers; k++) {
        const amp = (state.current.busy ? 0.055 : 0.032) * (1 - k * 0.2)
        ctx.beginPath()
        const steps = small ? 48 : 120
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * Math.PI * 2
          const wobble =
            Math.sin(3 * a + t * 1.3 + k * 1.7) * 0.5 +
            Math.sin(5 * a - t * 0.9 + k * 2.3) * 0.3 +
            Math.sin(2 * a + t * 0.6 + k) * 0.2
          const r = R * (1 + amp * wobble) - k * R * 0.012
          const x = cx + r * Math.cos(a)
          const y = cy + r * Math.sin(a)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        const g = ctx.createConicGradient(t * 0.55 + k * 0.9, cx, cy)
        const cyan = 'rgba(34, 211, 238, 1)'
        const teal = 'rgba(20, 184, 166, 1)'
        const shine = dark ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.7)'
        g.addColorStop(0, cyan)
        g.addColorStop(0.28, teal)
        g.addColorStop(0.5, shine)
        g.addColorStop(0.62, 'rgba(34, 211, 238, 0.15)')
        g.addColorStop(0.8, 'rgba(139, 92, 246, 0.55)')
        g.addColorStop(1, cyan)
        ctx.strokeStyle = g
        ctx.lineWidth = Math.max(1.1, size * (small ? 0.075 : 0.032)) * (1 - k * 0.3)
        ctx.globalAlpha = 0.95 - k * 0.3
        ctx.shadowColor = dark ? 'rgba(34, 211, 238, 0.65)' : 'rgba(6, 182, 212, 0.45)'
        ctx.shadowBlur = size * (small ? 0.25 : 0.18)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      if (!still) frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [size])

  return (
    <span
      className={cn('relative inline-block shrink-0', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <canvas
        ref={canvas}
        className="pointer-events-none absolute"
        style={{ width: size * 1.5, height: size * 1.5, left: -size * 0.25, top: -size * 0.25 }}
      />
    </span>
  )
}
