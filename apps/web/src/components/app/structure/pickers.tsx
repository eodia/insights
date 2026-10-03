'use client'

import { LOOK_COLORS, type LookColor } from '@eodia/contracts'
import { LookIcon } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { Hint } from '@/components/ui/tooltip'
import { LOOK_HEX } from '@/lib/format'
import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Ban, ImagePlus, Palette, Smile } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export const COLOR_NAMES: Record<LookColor, string> = {
  gray: 'Gris',
  red: 'Rouge',
  orange: 'Orange',
  amber: 'Ambre',
  yellow: 'Jaune',
  lime: 'Citron vert',
  green: 'Vert',
  emerald: 'Émeraude',
  teal: 'Sarcelle',
  cyan: 'Cyan',
  sky: 'Ciel',
  blue: 'Bleu',
  indigo: 'Indigo',
  violet: 'Violet',
  purple: 'Pourpre',
  pink: 'Rose',
  rose: 'Rose vif',
}

/** The palette's colours as dots, and « none ». */
export function ColorSwatches({ value, onChange }: { value: LookColor | null | undefined; onChange: (c: LookColor | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Hint label={$t('Aucune couleur')}>
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn('inline-flex size-6 items-center justify-center rounded-full border text-muted-foreground', !value && 'ring-2 ring-primary ring-offset-1 ring-offset-background')}
          aria-label={$t('Aucune couleur')}
        >
          <Ban className="size-3.5" />
        </button>
      </Hint>
      {LOOK_COLORS.map((c) => (
        <Hint key={c} label={$t(COLOR_NAMES[c])}>
          <button
            type="button"
            onClick={() => onChange(c)}
            className={cn('size-6 rounded-full', value === c && 'ring-2 ring-primary ring-offset-1 ring-offset-background')}
            style={{ background: LOOK_HEX[c] }}
            aria-label={$t(COLOR_NAMES[c])}
          />
        </Hint>
      ))}
    </div>
  )
}

export function ColorPicker({ value, onChange, disabled, size = 'sm' }: { value: LookColor | null | undefined; onChange: (c: LookColor | null) => void; disabled?: boolean; size?: 'sm' | 'xs' }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button type="button" variant="outline" size={size === 'xs' ? 'icon-sm' : 'sm'} className={cn(size === 'xs' && 'size-7')} aria-label={$t('Couleur')}>
          {value ? <span className="size-3.5 rounded-full" style={{ background: LOOK_HEX[value] }} /> : <Palette className="text-muted-foreground" />}
          {size === 'sm' ? <span>{value ? $t(COLOR_NAMES[value]) : $t('Couleur')}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{$t('Couleur')}</div>
        <ColorSwatches
          value={value}
          onChange={(c) => {
            onChange(c)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/** Common pictograms, by their lucide name; any other name can be typed. */
export const COMMON_ICONS = [
  'circle', 'circle-check', 'circle-x', 'circle-alert', 'circle-pause', 'circle-dot', 'clock', 'hourglass',
  'check', 'x', 'ban', 'flag', 'star', 'heart', 'thumbs-up', 'thumbs-down',
  'shopping-cart', 'shopping-bag', 'package', 'package-check', 'truck', 'store', 'credit-card', 'wallet',
  'banknote', 'receipt', 'tag', 'percent', 'gift', 'undo-2', 'refresh-cw', 'archive',
  'user', 'users', 'user-check', 'building-2', 'briefcase', 'mail', 'phone', 'message-square',
  'globe', 'map-pin', 'home', 'calendar', 'bell', 'lock', 'shield', 'key',
  'smartphone', 'monitor', 'laptop', 'tablet', 'zap', 'flame', 'leaf', 'sun',
  'moon', 'cloud', 'bug', 'wrench', 'settings', 'chart-bar', 'trending-up', 'trending-down',
  'arrow-up', 'arrow-down', 'sparkles', 'trophy', 'book-open', 'file-text', 'image', 'ticket',
] as const

export function IconPicker({ value, onChange, disabled, color, size = 'sm' }: { value: string | null | undefined; onChange: (icon: string | null) => void; disabled?: boolean; color?: LookColor | null; size?: 'sm' | 'xs' }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value ?? '')
  const [search, setSearch] = useState('')
  useEffect(() => {
    if (open) {
      setText(value ?? '')
      setSearch('')
    }
  }, [open, value])
  const choose = (icon: string | null) => {
    onChange(icon)
    setOpen(false)
  }
  const shown = COMMON_ICONS.filter((i) => !search || i.includes(search.toLowerCase()))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button type="button" variant="outline" size={size === 'xs' ? 'icon-sm' : 'sm'} className={cn(size === 'xs' && 'size-7')} aria-label={$t('Picto')}>
          {value ? <LookIcon name={value} color={color ?? null} /> : <Smile className="text-muted-foreground" />}
          {size === 'sm' ? <span className="max-w-28 truncate">{value || $t('Picto')}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={$t('Filtrer les pictos…')} className="mb-2 h-8" autoFocus />
        <div className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto">
          {shown.map((icon) => (
            <Hint key={icon} label={icon}>
              <button
                type="button"
                onClick={() => choose(icon)}
                className={cn('inline-flex size-8 items-center justify-center rounded-md hover:bg-muted', value === icon && 'bg-primary/10 text-primary ring-1 ring-primary')}
                aria-label={icon}
              >
                <LookIcon name={icon} color={color ?? null} />
              </button>
            </Hint>
          ))}
        </div>
        <form
          className="mt-3 flex items-center gap-2 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault()
            choose(text.trim() || null)
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={$t('Autre nom lucide : rocket')} className="h-8 flex-1 font-mono text-xs" />
          <Button type="submit" size="sm">
            {$t('OK')}
          </Button>
        </form>
        <div className="mt-2 flex items-center justify-between">
          <a href="https://lucide.dev/icons" target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            lucide.dev/icons
          </a>
          <Button type="button" variant="ghost" size="sm" onClick={() => choose(null)}>
            {$t('Aucun picto')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ImageUrlPicker({ value, onChange, disabled }: { value: string | null | undefined; onChange: (url: string | null) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value ?? '')
  useEffect(() => {
    if (open) setText(value ?? '')
  }, [open, value])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button type="button" variant="outline" size="icon-sm" className="size-7 overflow-hidden p-0" aria-label={$t('Image')}>
          {value ? (
            <img src={value} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            onChange(text.trim() || null)
            setOpen(false)
          }}
        >
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{$t('URL de l’image')}</div>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="https://…/logo.png" className="h-8 font-mono text-xs" autoFocus />
          <div className="flex justify-end gap-2">
            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
              >
                {$t('Retirer')}
              </Button>
            ) : null}
            <Button type="submit" size="sm">
              {$t('OK')}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/** A text saved when it loses focus (or on Entrée), only when it changed. */
export function InlineText({
  value,
  onCommit,
  placeholder,
  disabled,
  className,
  multiline = false,
  'aria-label': ariaLabel,
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  multiline?: boolean
  'aria-label': string
}) {
  const [text, setText] = useState(value)
  const cancelled = useRef(false)
  useEffect(() => setText(value), [value])
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (text !== value) onCommit(text)
  }
  if (multiline) {
    return (
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        rows={3}
        aria-label={ariaLabel}
      />
    )
  }
  return (
    <Input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          cancelled.current = true
          setText(value)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
    />
  )
}
