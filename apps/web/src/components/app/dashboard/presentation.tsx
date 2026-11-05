'use client'

import type { Dashboard } from '@eodia/contracts'
import { $t, intlLocale } from '@/lib/i18n'
import { ThemeLogo, ThemeScope } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DashboardView, type Runner } from './view'

/** How long each tab stays on screen, to choose from. */
const PACES = [15, 30, 60, 120] as const

/**
 * A dashboard for a meeting room or a wall screen: full screen, its tabs following one another,
 * its figures refreshed by themselves, the time in a corner. Its controls show when the mouse
 * moves, and go; the arrows, the space bar and Escape work too.
 */
export function Presentation({ dashboard, runner, onClose }: { dashboard: Dashboard; runner: Runner; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const tabs = dashboard.tabs
  const [tab, setTab] = useState<string | null>(tabs[0]?.id ?? null)
  const [pace, setPace] = useState<number>(30)
  const [paused, setPaused] = useState(false)
  const [awake, setAwake] = useState(true)
  const [now, setNow] = useState(() => new Date())
  // Each turn of the tab: the progress bar starts again.
  const [turn, setTurn] = useState(0)

  const step = useCallback(
    (by: number) => {
      if (tabs.length < 2) return
      setTab((cur) => {
        const i = tabs.findIndex((t) => t.id === cur)
        return tabs[(i + by + tabs.length) % tabs.length]?.id ?? cur
      })
      setTurn((n) => n + 1)
    },
    [tabs],
  )

  // Full screen while it lasts; leaving it (Escape) ends the presentation.
  useEffect(() => {
    const el = root.current
    void el?.requestFullscreen?.().catch(() => undefined)
    const left = () => {
      if (!document.fullscreenElement) onClose()
    }
    document.addEventListener('fullscreenchange', left)
    return () => {
      document.removeEventListener('fullscreenchange', left)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
  }, [onClose])

  // The next tab, when its time is up.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new turn restarts the count
  useEffect(() => {
    if (paused || tabs.length < 2) return
    const t = setTimeout(() => step(1), pace * 1000)
    return () => clearTimeout(t)
  }, [paused, pace, turn, step, tabs.length])

  // The clock.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])

  // The controls show with the mouse, and hide after a moment of stillness.
  useEffect(() => {
    if (!awake) return
    const t = setTimeout(() => setAwake(false), 2500)
    return () => clearTimeout(t)
  }, [awake])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === ' ') {
        e.preventDefault()
        setPaused((p) => !p)
      } else if (e.key === 'Escape') onClose()
      else return
      setAwake(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, onClose])

  const current = tabs.find((t) => t.id === tab)
  return (
    <div
      ref={root}
      onMouseMove={() => setAwake(true)}
      className={cn('fixed inset-0 z-[100] flex flex-col bg-surface', !awake && 'cursor-none')}
    >
      <ThemeScope theme={dashboard.resolved_theme} className="theme-surface flex min-h-0 flex-1 flex-col bg-surface">
        <header className="flex shrink-0 items-center gap-4 px-8 pt-6 pb-2">
          <ThemeLogo theme={dashboard.resolved_theme} className="shrink-0 object-contain" />
          <div className="min-w-0 flex-1">
            <h1 className="theme-title truncate text-[30px] leading-tight font-semibold tracking-[-0.02em]">{dashboard.name}</h1>
            {current ? <p className="truncate text-base text-muted-foreground">{current.label}</p> : null}
          </div>
          <div className="text-right tabular-nums">
            <div className="text-[30px] leading-none font-semibold tracking-tight">
              {new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit' }).format(now)}
            </div>
            <div className="mt-1 text-sm text-muted-foreground first-letter:uppercase">
              {new Intl.DateTimeFormat(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}
            </div>
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <DashboardView
            dashboard={dashboard}
            runner={runner}
            editable={false}
            autoRefresh={dashboard.auto_refresh ?? 60}
            tab={tab}
            onTabChange={(next) => {
              setTab(next)
              setTurn((n) => n + 1)
            }}
          />
        </div>
      </ThemeScope>

      {/* How long until the next tab. */}
      {tabs.length > 1 ? (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-primary/10">
          <div
            key={`${turn}-${pace}`}
            className="h-full origin-left bg-primary"
            style={{ animation: `tv-progress ${pace}s linear forwards`, animationPlayState: paused ? 'paused' : 'running' }}
          />
        </div>
      ) : null}

      {/* The controls, while the mouse moves. */}
      <div className={cn('pointer-events-none absolute inset-x-0 bottom-6 flex justify-center transition-opacity duration-300', awake ? 'opacity-100' : 'opacity-0')}>
        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-foreground/90 p-1.5 text-background shadow-xl backdrop-blur">
          {tabs.length > 1 ? (
            <>
              <Control label={`${$t('Onglet précédent')} (←)`} onClick={() => step(-1)}>
                <ChevronLeft className="size-4" />
              </Control>
              <Control label={`${paused ? $t('Reprendre') : $t('Pause')} (${$t('Espace')})`} onClick={() => setPaused((p) => !p)}>
                {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              </Control>
              <Control label={`${$t('Onglet suivant')} (→)`} onClick={() => step(1)}>
                <ChevronRight className="size-4" />
              </Control>
              <span className="mx-1 h-5 w-px bg-background/25" />
              {PACES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setPace(p)
                    setTurn((n) => n + 1)
                  }}
                  className={cn('h-8 rounded-full px-2.5 text-xs font-medium tabular-nums transition-colors', pace === p ? 'bg-background text-foreground' : 'hover:bg-background/15')}
                >
                  {p < 60 ? `${p} s` : `${p / 60} min`}
                </button>
              ))}
              <span className="mx-1 h-5 w-px bg-background/25" />
            </>
          ) : null}
          <Control label={`${$t('Quitter la présentation')} (Échap)`} onClick={onClose}>
            <X className="size-4" />
          </Control>
        </div>
      </div>
    </div>
  )
}

/** A control of the bar — its name as a native tooltip: in full screen, only what is inside shows. */
function Control({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="inline-flex size-8 items-center justify-center rounded-full transition-colors hover:bg-background/15">
      {children}
    </button>
  )
}
