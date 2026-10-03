'use client'

import { LOOK_COLORS, type LookColor } from '@eodia/contracts'
import { LookIcon } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { Hint } from '@/components/ui/tooltip'
import { LOOK_HEX } from '@/lib/format'
import { $t, intlLocale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Ban, ImagePlus, Palette, Shapes, Smile } from 'lucide-react'
import { iconNames } from 'lucide-react/dynamic'
import { Segmented } from '@/components/ui/segmented'
import { EMOJI_GROUPS, ICON_GROUPS } from '@/lib/icon-library'
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

/** Common pictograms, by their lucide name — the first of the library's themes. */
export const COMMON_ICONS = ICON_GROUPS.flatMap((g) => g.icons)

const KNOWN = new Set<string>(iconNames)
const fold = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const kindOf = (v: string | null | undefined) => (v?.startsWith('emoji:') ? 'emoji' : v?.startsWith('img:') ? 'image' : 'icon')

/**
 * A pictogram to choose: one of lucide's (by theme, or searched among all of them), an emoji,
 * or an image by its address. Stored as the lucide name, `emoji:…` or `img:…`.
 */
export function IconPicker({ value, onChange, disabled, color, size = 'sm' }: { value: string | null | undefined; onChange: (icon: string | null) => void; disabled?: boolean; color?: LookColor | null; size?: 'sm' | 'xs' }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'icon' | 'emoji' | 'image'>(kindOf(value))
  const [search, setSearch] = useState('')
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (open) {
      setSearch('')
      setTab(kindOf(value))
      setUrl(value?.startsWith('img:') ? value.slice(4) : '')
    }
  }, [open, value])
  const choose = (icon: string | null) => {
    onChange(icon)
    setOpen(false)
  }
  const q = fold(search.trim())
  // Searched: every lucide name that contains the words, themed ones first.
  const found = q ? [...new Set([...COMMON_ICONS.filter((i) => i.includes(q)), ...iconNames.filter((i) => i.includes(q.replace(/\s+/g, '-')))])].slice(0, 160) : []
  const label = value?.startsWith('emoji:') ? value.slice(6) : value?.startsWith('img:') ? $t('Image') : value
  const iconButton = (icon: string) => (
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
  )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button type="button" variant="outline" size={size === 'xs' ? 'icon-sm' : 'sm'} className={cn(size === 'xs' && 'size-7')} aria-label={$t('Picto')}>
          {value ? <LookIcon name={value} color={color ?? null} /> : <Smile className="text-muted-foreground" />}
          {size === 'sm' ? <span className="max-w-28 truncate">{label || $t('Picto')}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] p-3">
        <Segmented
          value={tab}
          onValueChange={setTab}
          options={[
            { value: 'icon', label: $t('Pictos'), icon: Shapes },
            { value: 'emoji', label: $t('Emoji'), icon: Smile },
            { value: 'image', label: $t('Image'), icon: ImagePlus },
          ]}
          aria-label={$t('Genre de picto')}
          className="mb-3"
        />
        {tab === 'icon' ? (
          <>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={$t('Chercher parmi {n} pictos…', { n: new Intl.NumberFormat(intlLocale()).format(iconNames.length) })} className="mb-2 h-8" autoFocus />
            <p className="-mt-1 mb-2 text-[11px] text-muted-foreground">{$t('Les noms sont en anglais : truck, star, euro, user…')}</p>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {q ? (
                found.length ? (
                  <div className="grid grid-cols-9 gap-0.5">{found.map(iconButton)}</div>
                ) : (
                  <p className="py-6 text-center text-xs text-muted-foreground">{$t('Aucun picto pour « {q} ».', { q: search })}</p>
                )
              ) : (
                ICON_GROUPS.map((g) => (
                  <div key={g.label}>
                    <div className="sticky top-0 z-10 bg-popover py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{$t(g.label)}</div>
                    <div className="grid grid-cols-9 gap-0.5">{g.icons.filter((i) => KNOWN.has(i)).map(iconButton)}</div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : tab === 'emoji' ? (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {EMOJI_GROUPS.map((g) => (
              <div key={g.label}>
                <div className="sticky top-0 z-10 bg-popover py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{$t(g.label)}</div>
                <div className="grid grid-cols-9 gap-0.5">
                  {g.emojis.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => choose(`emoji:${e}`)}
                      className={cn('inline-flex size-8 items-center justify-center rounded-md text-lg hover:bg-muted', value === `emoji:${e}` && 'bg-primary/10 ring-1 ring-primary')}
                      aria-label={e}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <form
              className="flex items-center gap-2 border-t pt-2"
              onSubmit={(e) => {
                e.preventDefault()
                const v = new FormData(e.currentTarget).get('emoji')?.toString().trim()
                if (v) choose(`emoji:${[...v].slice(0, 8).join('')}`)
              }}
            >
              <Input name="emoji" placeholder={$t('Ou collez un emoji')} className="h-8 flex-1" />
              <Button type="submit" size="sm">
                {$t('OK')}
              </Button>
            </form>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (/^https?:\/\//i.test(url.trim())) choose(`img:${url.trim()}`)
            }}
          >
            <div className="flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                {/^https?:\/\//i.test(url.trim()) ? <img src={url.trim()} alt="" className="size-full object-contain" /> : <ImagePlus className="size-5 text-muted-foreground" />}
              </span>
              <p className="text-xs text-muted-foreground">{$t('Un logo, une photo, un drapeau… par son adresse (https). Il s’affiche petit et carré, partout où le picto apparaît.')}</p>
            </div>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/logo.png" className="h-8 font-mono text-xs" autoFocus />
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={!/^https?:\/\//i.test(url.trim())}>
                {$t('Utiliser cette image')}
              </Button>
            </div>
          </form>
        )}
        <div className="mt-3 flex items-center justify-between border-t pt-2">
          <span className="text-[11px] text-muted-foreground">{value ? $t('Actuel : {v}', { v: label ?? '' }) : $t('Aucun picto')}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => choose(null)} disabled={!value}>
            {$t('Retirer')}
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
