import { z } from 'zod'
import { BAR_FILLS, type BarFill, COLOR_SCHEMES, type ColorScheme } from './analytics'

/**
 * Un thème : l'habillage d'un tableau de bord, d'une question et de leur impression en PDF —
 * polices, couleurs, palette des graphiques, logo. Posé sur un dossier, il vaut pour tout ce
 * que le dossier contient, sous-dossiers compris, sauf là où un autre thème est posé ; posé
 * sur un tableau de bord, il l'emporte sur celui de son dossier.
 */

/** The fonts a theme may use: Google Fonts, loaded when a themed page needs them. */
export const THEME_FONTS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'DM Sans',
  'Work Sans',
  'Nunito',
  'Raleway',
  'IBM Plex Sans',
  'Space Grotesk',
  'Outfit',
  'Manrope',
  'Playfair Display',
  'Merriweather',
  'Lora',
  'Source Serif 4',
  'Fraunces',
  'DM Serif Display',
  'JetBrains Mono',
] as const
export type ThemeFont = (typeof THEME_FONTS)[number]

export interface ThemeSettings {
  /** Titles: the dashboard's, its cards', its sections'. */
  readonly font_heading?: ThemeFont
  /** Everything else, charts included. */
  readonly font_body?: ThemeFont
  readonly title_color?: string
  readonly title_weight?: 400 | 500 | 600 | 700 | 800
  readonly title_case?: 'normal' | 'upper'
  readonly text_color?: string
  /** Links, the selected tab, the active filters. */
  readonly accent?: string
  /** The page behind the cards. */
  readonly background?: string
  readonly card_background?: string
  readonly card_border?: string
  /** Corner radius of the cards, in pixels (0 to 24). */
  readonly card_radius?: number
  readonly card_shadow?: 'none' | 'soft' | 'strong'
  /** The palette the charts take when they choose none. */
  readonly scheme?: ColorScheme
  readonly colors?: readonly string[]
  /** How the bars of every chart are filled, unless a chart says otherwise. */
  readonly bar_fill?: BarFill
  /** Corner radius of bars, in pixels (0 to 12). */
  readonly bar_radius?: number
  /** An image: an `https://` address or a `data:image/…` one (300 kB at most). */
  readonly logo?: string
  readonly logo_height?: number
  readonly logo_position?: 'left' | 'right'
  /** Printed at the bottom of each PDF page. */
  readonly pdf_footer?: string
  /** A first page with the logo, the title, the description and the date. */
  readonly pdf_cover?: boolean
  readonly pdf_orientation?: 'portrait' | 'landscape'
}

export interface Theme {
  readonly id: string
  readonly name: string
  readonly settings: ThemeSettings
  readonly updated_at: string
}

/** The theme a folder, a dashboard or a question wears, and where it comes from. */
export interface ResolvedTheme extends Theme {
  readonly from: {
    readonly kind: 'folder' | 'dashboard'
    readonly id: string
    readonly name: string
  }
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const ThemeSettingsSchema = z
  .object({
    font_heading: z.enum(THEME_FONTS).optional(),
    font_body: z.enum(THEME_FONTS).optional(),
    title_color: hex.optional(),
    title_weight: z
      .union([z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800)])
      .optional(),
    title_case: z.enum(['normal', 'upper']).optional(),
    text_color: hex.optional(),
    accent: hex.optional(),
    background: hex.optional(),
    card_background: hex.optional(),
    card_border: hex.optional(),
    card_radius: z.number().int().min(0).max(24).optional(),
    card_shadow: z.enum(['none', 'soft', 'strong']).optional(),
    scheme: z.enum(COLOR_SCHEMES).optional(),
    colors: z.array(hex).max(12).optional(),
    bar_fill: z.enum(BAR_FILLS).optional(),
    bar_radius: z.number().int().min(0).max(12).optional(),
    logo: z
      .string()
      .max(400_000)
      .regex(/^(https:\/\/|data:image\/(png|jpeg|svg\+xml|webp|gif);base64,)/)
      .optional(),
    logo_height: z.number().int().min(16).max(96).optional(),
    logo_position: z.enum(['left', 'right']).optional(),
    pdf_footer: z.string().max(300).optional(),
    pdf_cover: z.boolean().optional(),
    pdf_orientation: z.enum(['portrait', 'landscape']).optional(),
  })
  .strict()

export const ThemeInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  settings: ThemeSettingsSchema,
})
export type ThemeInput = z.infer<typeof ThemeInputSchema>
