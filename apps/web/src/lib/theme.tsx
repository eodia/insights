'use client'

import type { ColorScheme, ResolvedTheme, ThemeSettings } from '@eodia/contracts'
import {
  type CSSProperties,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from 'react'

/**
 * Un thème appliqué : des variables CSS sur la zone qu'il habille (titres, cartes, fond,
 * accent), ses polices chargées depuis Google Fonts, et pour les graphiques sa police et sa
 * palette — que prend toute carte qui n'en a pas choisi.
 *
 * En sombre, un thème garde ses polices, son accent, sa palette et son logo, et laisse les
 * couleurs de fond et de texte au mode sombre : ses couleurs claires y seraient illisibles.
 */

export interface ChartTheme {
  /** Charts drawn at once (a printed page). */
  readonly still?: boolean
  readonly font?: string
  readonly scheme?: ColorScheme
  readonly colors?: readonly string[]
}

const ChartThemeContext = createContext<ChartTheme>({})

/** The chart look the surrounding theme asks for (nothing outside a theme). */
export const useChartTheme = (): ChartTheme => useContext(ChartThemeContext)

const loaded = new Set<string>()

/** Loads a Google font once for the page. */
export function loadFont(family: string | undefined): void {
  if (!family || typeof document === 'undefined' || loaded.has(family)) return
  loaded.add(family)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;500;600;700;800&display=swap`
  document.head.appendChild(link)
}

const subscribeDark = (cb: () => void) => {
  const obs = new MutationObserver(cb)
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => obs.disconnect()
}

/** Whether the page is dark. */
export function useIsDark(): boolean {
  return useSyncExternalStore(
    subscribeDark,
    () => document.documentElement.classList.contains('dark'),
    () => false,
  )
}

const SHADOWS = {
  none: 'none',
  soft: '0 1px 2px rgba(0,0,0,.04), 0 4px 16px rgba(0,0,0,.06)',
  strong: '0 2px 4px rgba(0,0,0,.06), 0 12px 32px rgba(0,0,0,.12)',
} as const

/** The CSS variables of a theme (see `[data-themed]` in `globals.css`). */
export function themeVariables(s: ThemeSettings, dark: boolean): CSSProperties {
  const v: Record<string, string> = {}
  if (s.font_heading) v['--theme-font-heading'] = `'${s.font_heading}', var(--font-sans)`
  if (s.font_body) v['--theme-font-body'] = `'${s.font_body}', var(--font-sans)`
  if (s.title_weight) v['--theme-title-weight'] = String(s.title_weight)
  if (s.title_case === 'upper') {
    v['--theme-title-case'] = 'uppercase'
    v['--theme-title-tracking'] = '0.04em'
  }
  if (s.accent) {
    v['--primary'] = s.accent
    v['--ring'] = s.accent
  }
  if (s.card_radius !== undefined) v['--theme-radius'] = `${s.card_radius}px`
  if (s.card_shadow) v['--theme-shadow'] = SHADOWS[s.card_shadow]
  if (!dark) {
    if (s.title_color) v['--theme-title'] = s.title_color
    if (s.text_color) v['--theme-text'] = s.text_color
    if (s.background) v['--theme-bg'] = s.background
    if (s.card_background) v['--theme-card'] = s.card_background
    if (s.card_border) v['--theme-card-border'] = s.card_border
  }
  return v as CSSProperties
}

/** Dresses what it holds in a theme; without one, it is a plain box. */
export function ThemeScope({
  theme,
  className,
  still,
  children,
}: {
  theme: ResolvedTheme | ThemeSettings | null | undefined
  className?: string
  still?: boolean
  children: ReactNode
}) {
  const settings: ThemeSettings | null = theme
    ? 'settings' in theme
      ? (theme as ResolvedTheme).settings
      : (theme as ThemeSettings)
    : null
  const dark = useIsDark()
  useEffect(() => {
    loadFont(settings?.font_heading)
    loadFont(settings?.font_body)
  }, [settings?.font_heading, settings?.font_body])
  const chart: ChartTheme = settings
    ? {
        ...(still ? { still } : {}),
        ...(settings.font_body ? { font: settings.font_body } : {}),
        ...(settings.scheme ? { scheme: settings.scheme } : {}),
        ...(settings.colors?.length ? { colors: settings.colors } : {}),
      }
    : still
      ? { still }
      : {}
  return (
    <ChartThemeContext.Provider value={chart}>
      <div
        className={className}
        {...(settings ? { 'data-themed': '' } : {})}
        style={settings ? themeVariables(settings, dark && !still) : undefined}
      >
        {children}
      </div>
    </ChartThemeContext.Provider>
  )
}

/** A theme's logo, if it has one. */
export function ThemeLogo({
  theme,
  className,
}: { theme: ResolvedTheme | ThemeSettings | null | undefined; className?: string }) {
  const s: ThemeSettings | null = theme
    ? 'settings' in theme
      ? (theme as ResolvedTheme).settings
      : (theme as ThemeSettings)
    : null
  if (!s?.logo) return null
  return <img src={s.logo} alt="" className={className} style={{ height: s.logo_height ?? 32 }} />
}
