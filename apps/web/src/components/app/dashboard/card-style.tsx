'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { LOOK_HEX } from '@/lib/format'
import { $t, intlLocale, msg } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { DashboardCard } from '@eodia/contracts'
import { Check } from 'lucide-react'
import { type CSSProperties, useState } from 'react'

type Style = Pick<DashboardCard, 'look' | 'background'>

/** Whether a colour (`#rrggbb`) is dark: the card's words, and its charts, are then drawn light. */
function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return false
  const [r, g, b] = m.slice(1).map((c) => {
    const v = parseInt(c, 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.22
}

/** A light colour chosen for a card: its words stay dark, whatever the page's theme. */
const LIGHT_INK = {
  '--foreground': 'oklch(0.18 0 0)',
  '--card-foreground': 'oklch(0.18 0 0)',
  '--muted-foreground': 'oklch(0.42 0 0)',
  '--border': 'color-mix(in oklab, oklch(0.18 0 0) 12%, transparent)',
  '--muted': 'color-mix(in oklab, oklch(0.18 0 0) 6%, transparent)',
  color: 'oklch(0.18 0 0)',
} as CSSProperties

/**
 * How a card shows: its classes, its inline style, and whether it is dark (its contents drawn for
 * a dark surface — `true`), light whatever the page (`false`), or as the page is (`null`).
 */
export function cardSurface(card: Style): { className: string | false; style: CSSProperties | undefined; dark: boolean | null } {
  if (card.background === 'transparent') {
    return { className: 'card-clear', style: undefined, dark: null }
  }
  if (card.background) {
    const dark = isDark(card.background)
    const c = card.background
    // The chosen colour, with a breath of light from the top left: subtle, never flat.
    const background = `radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, ${c} 82%, white), transparent 70%), linear-gradient(160deg, ${c}, color-mix(in oklab, ${c} 90%, ${dark ? 'black' : 'oklch(0.5 0 0)'}))`
    return { className: dark ? 'card-colored dark' : 'card-colored', style: { background, ...(dark ? {} : LIGHT_INK) }, dark }
  }
  if (card.look === 'accent') return { className: 'card-accent', style: undefined, dark: null }
  if (card.look === 'dark') return { className: 'card-dark dark', style: undefined, dark: true }
  return { className: false, style: undefined, dark: null }
}

const PRESETS = [
  { look: undefined, label: msg('Normale'), hint: msg('Une carte blanche, sobre'), swatch: 'bg-card ring-1 ring-border' },
  { look: 'accent', label: msg('Mise en valeur'), hint: msg('Un dégradé discret de la couleur du thème'), swatch: 'card-accent' },
  { look: 'dark', label: msg('Sombre'), hint: msg('Une carte noire, pour un chiffre clé'), swatch: 'card-dark' },
] as const

/** The colours offered before the free picker: soft tints, then deep ones. */
const SWATCHES = ['#f4f4f5', '#ecfccb', '#e0f2fe', '#ede9fe', '#ffedd5', '#fee2e2', LOOK_HEX.green, LOOK_HEX.blue, LOOK_HEX.violet, '#1e293b'] as const

/** A card's style, in a dialog: a look to choose, or a colour of one's own — transparent too. */
export function CardStyleDialog({ card, onSave, onClose }: { card: Style; onSave: (style: Style) => void; onClose: () => void }) {
  const [look, setLook] = useState<DashboardCard['look']>(card.background ? undefined : card.look)
  const [background, setBackground] = useState<string | undefined>(card.background)
  const pickLook = (l: DashboardCard['look']) => {
    setLook(l)
    setBackground(undefined)
  }
  const pickColor = (c: string) => {
    setBackground(c)
    setLook(undefined)
  }
  const preview = cardSurface({ look, background })
  const custom = background && background !== 'transparent' && !(SWATCHES as readonly string[]).includes(background)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{$t('Style de la carte')}</DialogTitle>
          <DialogDescription>{$t('Un style prêt à l’emploi, ou une couleur de votre choix.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2.5">
            {PRESETS.map((p) => {
              const active = !background && look === p.look
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => pickLook(p.look)}
                  className={cn('group flex flex-col gap-2 rounded-xl p-1.5 text-left transition-colors', active ? 'bg-primary/10 ring-2 ring-primary' : 'ring-1 ring-border hover:bg-muted/60')}
                >
                  <span className={cn('relative flex h-16 flex-col justify-end gap-1 overflow-hidden rounded-lg border border-transparent p-2', p.swatch, p.look === 'dark' && 'dark text-white')}>
                    <span className="h-1.5 w-8 rounded-full bg-current opacity-25" />
                    <span className="h-2.5 w-12 rounded-full bg-current opacity-70" />
                    {active ? <Check className="absolute top-1.5 right-1.5 size-3.5 text-primary" /> : null}
                  </span>
                  <span className="px-1 text-[13px] leading-tight font-medium">{$t(p.label)}</span>
                  <span className="px-1 pb-1 text-[11.5px] leading-snug text-muted-foreground">{$t(p.hint)}</span>
                </button>
              )
            })}
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{$t('Couleur personnalisée')}</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => pickColor('transparent')}
                aria-label={$t('Transparente')}
                title={$t('Transparente')}
                className={cn(
                  'size-7 rounded-full border-2 bg-[conic-gradient(#d4d4d8_25%,#fff_0_50%,#d4d4d8_0_75%,#fff_0)] bg-[length:10px_10px]',
                  background === 'transparent' ? 'border-primary' : 'border-border',
                )}
              />
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pickColor(c)}
                  aria-label={c}
                  className={cn('size-7 rounded-full border-2', background === c ? 'border-primary' : 'border-border')}
                  style={{ background: c }}
                />
              ))}
              <span
                className={cn('relative size-7 overflow-hidden rounded-full border-2', custom ? 'border-primary' : 'border-dashed border-border bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]')}
                style={custom ? { background } : undefined}
              >
                <input
                  type="color"
                  value={background && background !== 'transparent' ? background : '#2da31e'}
                  onChange={(e) => pickColor(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label={$t('Autre couleur')}
                />
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{$t('Aperçu')}</Label>
            <div className="rounded-2xl bg-surface p-4">
              <div
                className={cn('theme-card flex h-24 flex-col justify-between rounded-[18px] border border-transparent bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03),0_10px_30px_-20px_rgba(16,24,40,0.18)]', preview.className)}
                style={preview.style}
              >
                <span className="text-[13px] font-medium text-muted-foreground">{$t('Chiffre d’affaires')}</span>
                <span className="text-[26px] leading-none font-bold tracking-[-0.03em] text-foreground tabular-nums">{new Intl.NumberFormat(intlLocale()).format(1284500)}</span>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {$t('Annuler')}
          </Button>
          <Button
            onClick={() => {
              onSave({ look, background })
              onClose()
            }}
          >
            {$t('Appliquer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
