/**
 * Les palettes des graphiques. Chaque palette catégorielle est un ORDRE de teintes : l'ordre
 * fait partie de la lisibilité (deux voisines doivent se distinguer, y compris pour un
 * daltonien). Toutes ont été validées, en clair contre #ffffff et en sombre contre #18181b :
 * bande de luminance, chroma, séparation daltonisme (protan / deutan, ΔE OKLab ≥ 8 entre
 * voisines) et vision normale (ΔE ≥ 15). Ne les réordonnez pas sans revalider.
 *
 * Une palette personnalisée est vérifiée ici même (`checkPalette`), avec les mêmes seuils.
 */
import type { ColorScheme } from '@eodia/contracts'
import { msg } from './i18n'

export interface Palette {
  readonly label: string
  readonly light: readonly string[]
  readonly dark: readonly string[]
  /** Teintes d'une seule couleur, pour des catégories ordonnées : au plus ce nombre de séries. */
  readonly ordinal?: number
}

export const PALETTES: Record<Exclude<ColorScheme, 'custom'>, Palette> = {
  eodia: {
    label: 'eodia',
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  },
  vif: {
    label: msg('Vive'),
    light: ['#2563eb', '#f43f5e', '#8b5cf6', '#f97316', '#10b981', '#f59e0b', '#6366f1', '#ef4444'],
    dark: ['#2563eb', '#f43f5e', '#8b5cf6', '#d75f00', '#17ac78', '#c7800e', '#6366f1', '#ef4444'],
  },
  ocean: {
    label: msg('Océan'),
    light: ['#0369a1', '#059669', '#4f46e5', '#14b8a6', '#818cf8', '#7c3aed', '#38bdf8', '#1d4ed8'],
    dark: ['#2b81bb', '#059669', '#544dec', '#149c8d', '#7b86f1', '#7c3aed', '#0b9fd6', '#3369f4'],
  },
  terre: {
    label: msg('Terre'),
    light: ['#b45309', '#65a30d', '#a16207', '#a855f7', '#be123c', '#ca8a04', '#e11d48', '#d97706'],
    dark: ['#b45309', '#65a30d', '#a16207', '#a855f7', '#c41c40', '#c28407', '#e11d48', '#d77500'],
  },
  doux: {
    label: msg('Douce'),
    light: ['#5b8def', '#e07a5f', '#b07cc6', '#7a9a3c', '#8c7ae6', '#c96f8a', '#d4a017', '#3d9970'],
    dark: ['#5b8def', '#d67157', '#ae7ac4', '#7a9a3c', '#8c7ae6', '#c96f8a', '#b6890f', '#3d9970'],
  },
  degrade: {
    label: msg('Dégradé'),
    // A blue ramp, light to dark (dark to light on a dark surface), picked evenly for the series.
    light: [
      '#86b6ef',
      '#6da7ec',
      '#5598e7',
      '#3987e5',
      '#2a78d6',
      '#256abf',
      '#1c5cab',
      '#184f95',
      '#104281',
      '#0d366b',
    ],
    dark: [
      '#184f95',
      '#1c5cab',
      '#256abf',
      '#2a78d6',
      '#3987e5',
      '#5598e7',
      '#6da7ec',
      '#86b6ef',
      '#9ec5f4',
      '#b7d3f6',
    ],
    ordinal: 5,
  },
}

export const DEFAULT_SCHEME = 'eodia' as const

/** The colours of `count` series: the palette's order, or the ramp's evenly spaced steps. */
export function schemeColors(
  scheme: ColorScheme | undefined,
  custom: readonly string[] | undefined,
  dark: boolean,
  count: number,
): readonly string[] {
  if (scheme === 'custom' && custom?.length) return dark ? custom.map(forDark) : custom
  const p = PALETTES[scheme && scheme !== 'custom' ? scheme : DEFAULT_SCHEME] ?? PALETTES.eodia
  const steps = dark ? p.dark : p.light
  if (p.ordinal) {
    // Past its count a ramp is no longer readable: the default palette takes over.
    if (count > p.ordinal) return dark ? PALETTES.eodia.dark : PALETTES.eodia.light
    const n = Math.max(count, 1)
    return Array.from(
      { length: n },
      (_, i) => steps[Math.round((i * (steps.length - 1)) / Math.max(n - 1, 1))] as string,
    )
  }
  return steps
}

// ── Couleur : OKLab / OKLCH ──────────────────────────────────────────────────

const s2lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lin2s = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
export const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v)
const rgb = (h: string) =>
  [0, 2, 4].map((i) => Number.parseInt(h.slice(1 + i, 3 + i), 16) / 255).map(s2lin) as [
    number,
    number,
    number,
  ]

function oklab([r, g, b]: readonly number[]): [number, number, number] {
  const l = Math.cbrt(
    0.4122214708 * (r as number) + 0.5363325363 * (g as number) + 0.0514459929 * (b as number),
  )
  const m = Math.cbrt(
    0.2119034982 * (r as number) + 0.6806995451 * (g as number) + 0.1073969566 * (b as number),
  )
  const s = Math.cbrt(
    0.0883024619 * (r as number) + 0.2817188376 * (g as number) + 0.6299787005 * (b as number),
  )
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function fromOklch(L: number, C: number, H: number): string {
  for (let c = C; c >= 0; c -= 0.005) {
    const A = c * Math.cos(H)
    const B = c * Math.sin(H)
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
    const out = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ]
    if (out.every((x) => x >= -0.0005 && x <= 1.0005)) {
      return `#${out
        .map((x) =>
          Math.round(Math.min(1, Math.max(0, lin2s(Math.max(0, x)))) * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`
    }
  }
  return '#808080'
}

const lch = (h: string) => {
  const [L, a, b] = oklab(rgb(h))
  return [L, Math.hypot(a, b), Math.atan2(b, a)] as const
}

/** A colour chosen for a light surface, brought into the band that reads on a dark one. */
export function forDark(h: string): string {
  if (!isHex(h)) return h
  const [L, C, H] = lch(h)
  return fromOklch(
    Math.min(0.66, Math.max(0.53, L > 0.7 ? L - 0.08 : L < 0.5 ? L + 0.08 : L)),
    C,
    H,
  )
}

// ── Vérification d'une palette (mêmes seuils que le validateur de référence) ──

// Machado, Oliveira & Fernandes (2009), severity 1.0, on linear RGB.
const CVD = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
} as const

function simulate(h: string, kind: keyof typeof CVD): number[] {
  const v = rgb(h)
  return CVD[kind].map((row) =>
    Math.max(0, Math.min(1, row[0] * v[0] + row[1] * v[1] + row[2] * v[2])),
  )
}

function deltaE(a: string, b: string, kind?: keyof typeof CVD): number {
  const p = oklab(kind ? simulate(a, kind) : rgb(a))
  const q = oklab(kind ? simulate(b, kind) : rgb(b))
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

export interface PaletteCheck {
  /** Neighbours a colour-blind reader may confuse (ΔE < 8), by slot. */
  readonly cvd: readonly [number, number][]
  /** Neighbours too close for anyone (ΔE < 15). */
  readonly close: readonly [number, number][]
  /** Colours too pale or too dark for the surface's band, or too grey. */
  readonly offBand: readonly number[]
}

/** What makes a palette hard to read: its weak neighbouring pairs, its colours out of band. */
export function checkPalette(colors: readonly string[], dark = false): PaletteCheck {
  const valid = colors.filter(isHex)
  const cvd: [number, number][] = []
  const close: [number, number][] = []
  for (let i = 0; i + 1 < valid.length; i++) {
    const a = valid[i] as string
    const b = valid[i + 1] as string
    if (Math.min(deltaE(a, b, 'protan'), deltaE(a, b, 'deutan')) < 8) cvd.push([i, i + 1])
    if (deltaE(a, b) < 15) close.push([i, i + 1])
  }
  const [lo, hi] = dark ? [0.48, 0.67] : [0.43, 0.77]
  const offBand = valid.flatMap((c, i) => {
    const [L, C] = lch(c)
    return L < lo || L > hi || C < 0.1 ? [i] : []
  })
  return { cvd, close, offBand }
}
