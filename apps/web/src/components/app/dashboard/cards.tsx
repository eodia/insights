'use client'

import {
  type CardLink,
  type CardSummary,
  type DashboardCard,
  type DashboardParameter,
  type HeadingStyle,
  type ItemSummary,
  type ParameterValue,
  SUMMARY_LIMITS,
  THEME_FONTS,
  parameterHasValue,
} from '@eodia/contracts'
import { Prose } from '@/components/app/assistant/parts'
import { LookIcon } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Choice } from '@/components/ui/choice'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { LOOK_HEX, formatAgo, formatCount } from '@/lib/format'
import { $t, $tp } from '@/lib/i18n'
import { useMe } from '@/lib/queries'
import { loadFont } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { AlignCenter, AlignLeft, AlignRight, ArrowRight, ImageOff, ImagePlus, Loader2, Palette, RefreshCw, Sparkles, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { shrinkImage } from '@/components/app/structure/pickers'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { type Values, filterName } from './parameters'

/** The colours offered, before the free picker: the page's ink, then the looks'. */
const SWATCHES = ['#18181b', '#52525b', '#a1a1aa', LOOK_HEX.green, LOOK_HEX.blue, LOOK_HEX.violet, LOOK_HEX.orange, LOOK_HEX.red] as const

function ColorRow({ value, onChange, auto }: { value: string | undefined; onChange: (c: string | undefined) => void; auto: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => onChange(undefined)} className={cn('h-6 rounded-full border-2 px-2 text-[11px]', !value ? 'border-foreground' : 'border-border text-muted-foreground')}>
        {auto}
      </button>
      {SWATCHES.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} className={cn('size-6 rounded-full border-2', value === c ? 'border-primary' : 'border-border')} style={{ background: c }} aria-label={c} />
      ))}
      <span className="relative size-6 overflow-hidden rounded-full border-2 border-dashed border-border" style={value && !(SWATCHES as readonly string[]).includes(value) ? { background: value, borderStyle: 'solid' } : undefined}>
        <input type="color" value={value ?? '#18181b'} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={$t('Autre couleur')} />
      </span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

// ── Headings ────────────────────────────────────────────────────────────────

const HEADING_SIZES: Record<NonNullable<HeadingStyle['size']>, string> = { sm: 'text-base', md: 'text-xl', lg: 'text-2xl', xl: 'text-3xl', '2xl': 'text-4xl' }
const HEADING_WEIGHTS: Record<NonNullable<HeadingStyle['weight']>, string> = { medium: 'font-medium', semibold: 'font-semibold', bold: 'font-bold' }

/** A section title, as its style says: size, weight, alignment, colour, font, decoration. */
export function HeadingView({ text, icon, style, children }: { text: string; icon?: string | undefined; style: HeadingStyle | undefined; children?: React.ReactNode }) {
  const s = style ?? {}
  useEffect(() => loadFont(s.font), [s.font])
  const accent = s.accent ?? 'var(--primary)'
  const align = s.align ?? 'left'
  return (
    <div
      className={cn('flex h-full w-full min-w-0 flex-col justify-center', s.decoration === 'band' && 'rounded-xl px-4', s.decoration === 'bar' && 'border-l-4 pl-3', align === 'center' ? 'items-center text-center' : align === 'right' ? 'items-end text-right' : 'items-start')}
      style={{
        ...(s.decoration === 'band' ? { background: `color-mix(in oklab, ${accent} 12%, transparent)` } : {}),
        ...(s.decoration === 'bar' ? { borderColor: accent } : {}),
      }}
    >
      <div className={cn('flex max-w-full items-center gap-2', align === 'center' && 'justify-center', align === 'right' && 'justify-end')}>
        {icon ? <LookIcon name={icon} className="size-5 shrink-0" /> : null}
        {children ?? (
          <h2
            className={cn('theme-title truncate tracking-tight', HEADING_SIZES[s.size ?? 'md'], HEADING_WEIGHTS[s.weight ?? 'semibold'], s.uppercase && 'tracking-wide uppercase')}
            style={{ ...(s.color ? { color: s.color } : {}), ...(s.font ? { fontFamily: `'${s.font}', var(--font-sans)` } : {}) }}
          >
            {text}
          </h2>
        )}
      </div>
      {s.subtitle ? <p className="mt-0.5 max-w-full truncate text-sm text-muted-foreground">{s.subtitle}</p> : null}
      {s.decoration === 'underline' ? <span className="mt-1.5 block h-0.5 w-12 rounded-full" style={{ background: accent }} /> : null}
    </div>
  )
}

/** Everything a heading may change, in a popover beside it. */
export function HeadingStyleButton({ style, onChange }: { style: HeadingStyle | undefined; onChange: (s: HeadingStyle) => void }) {
  const s = style ?? {}
  const set = (patch: Partial<HeadingStyle>) => onChange({ ...s, ...patch })
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="card-still mb-2 ml-1 rounded-md p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground data-[state=open]:opacity-100" aria-label={$t('Style du titre')}>
          <Palette className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <Field label={$t('Taille')}>
          <Segmented value={s.size ?? 'md'} onValueChange={(v) => set({ size: v as HeadingStyle['size'] })} aria-label={$t('Taille')} options={(['sm', 'md', 'lg', 'xl', '2xl'] as const).map((k) => ({ value: k, label: { sm: 'S', md: 'M', lg: 'L', xl: 'XL', '2xl': 'XXL' }[k] }))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={$t('Graisse')}>
            <Choice value={s.weight ?? 'semibold'} onValueChange={(v) => set({ weight: v as HeadingStyle['weight'] })} options={[{ value: 'medium', label: $t('Normale') }, { value: 'semibold', label: $t('Demi-grasse') }, { value: 'bold', label: $t('Grasse') }]} aria-label={$t('Graisse')} className="w-full" searchable={false} />
          </Field>
          <Field label={$t('Alignement')}>
            <Segmented
              value={s.align ?? 'left'}
              onValueChange={(v) => set({ align: v as HeadingStyle['align'] })}
              aria-label={$t('Alignement')}
              options={[
                { value: 'left', label: '', icon: AlignLeft, hint: $t('À gauche') },
                { value: 'center', label: '', icon: AlignCenter, hint: $t('Centré') },
                { value: 'right', label: '', icon: AlignRight, hint: $t('À droite') },
              ]}
            />
          </Field>
        </div>
        <Field label={$t('Police')}>
          <Choice
            value={s.font ?? ''}
            onValueChange={(v) => {
              if (v) loadFont(v)
              set({ font: v || undefined })
            }}
            options={[{ value: '', label: $t('Celle du thème') }, ...THEME_FONTS.map((f) => ({ value: f, label: f }))]}
            aria-label={$t('Police')}
            searchable
            className="w-full"
          />
        </Field>
        <Field label={$t('Couleur du texte')}>
          <ColorRow value={s.color} onChange={(color) => set({ color })} auto={$t('Thème')} />
        </Field>
        <label className="flex items-center justify-between gap-3 text-sm">
          {$t('Majuscules')}
          <Switch checked={!!s.uppercase} onCheckedChange={(uppercase) => set({ uppercase })} />
        </label>
        <Field label={$t('Sous-titre')}>
          <Input value={s.subtitle ?? ''} onChange={(e) => set({ subtitle: e.target.value || undefined })} placeholder={$t('Une ligne sous le titre')} className="h-8" />
        </Field>
        <Field label={$t('Mise en valeur')}>
          <Choice
            value={s.decoration ?? 'none'}
            onValueChange={(v) => set({ decoration: v as HeadingStyle['decoration'] })}
            options={[
              { value: 'none', label: $t('Aucune') },
              { value: 'underline', label: $t('Trait dessous') },
              { value: 'bar', label: $t('Barre à gauche') },
              { value: 'band', label: $t('Bandeau de couleur') },
            ]}
            aria-label={$t('Mise en valeur')}
            className="w-full"
            searchable={false}
          />
        </Field>
        {s.decoration && s.decoration !== 'none' ? (
          <Field label={$t('Couleur de la mise en valeur')}>
            <ColorRow value={s.accent} onChange={(accent) => set({ accent })} auto={$t('Marque')} />
          </Field>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

// ── Separators ──────────────────────────────────────────────────────────────

/** A line, or only room, between two rows of cards. */
export function SeparatorView({ card }: { card: DashboardCard }) {
  const s = card.separator ?? {}
  if (s.style === 'space') return <div className="h-full" />
  return (
    <div className="flex h-full items-center">
      <hr className="w-full border-0 border-t" style={{ borderTopStyle: s.style === 'dashed' ? 'dashed' : s.style === 'dotted' ? 'dotted' : 'solid', borderTopWidth: s.thickness ?? 1, borderTopColor: s.color ?? 'var(--border)' }} />
    </div>
  )
}

export function SeparatorStyleButton({ card, onChange }: { card: DashboardCard; onChange: (patch: Partial<DashboardCard>) => void }) {
  const s = card.separator ?? {}
  const set = (patch: Partial<NonNullable<DashboardCard['separator']>>) => onChange({ separator: { ...s, ...patch } })
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="card-still rounded-md bg-background p-1 text-muted-foreground opacity-0 shadow-xs group-hover:opacity-100 hover:text-foreground data-[state=open]:opacity-100" aria-label={$t('Style du séparateur')}>
          <Palette className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <Field label={$t('Style')}>
          <Choice
            value={s.style ?? 'line'}
            onValueChange={(v) => set({ style: v as NonNullable<DashboardCard['separator']>['style'] })}
            options={[
              { value: 'line', label: $t('Trait plein') },
              { value: 'dashed', label: $t('Tirets') },
              { value: 'dotted', label: $t('Pointillés') },
              { value: 'space', label: $t('Espace seul') },
            ]}
            aria-label={$t('Style')}
            className="w-full"
            searchable={false}
          />
        </Field>
        {s.style !== 'space' ? (
          <>
            <Field label={$t('Épaisseur')}>
              <Segmented value={String(s.thickness ?? 1)} onValueChange={(v) => set({ thickness: Number(v) })} aria-label={$t('Épaisseur')} options={['1', '2', '4'].map((v) => ({ value: v, label: `${v} px` }))} />
            </Field>
            <Field label={$t('Couleur')}>
              <ColorRow value={s.color} onChange={(color) => set({ color })} auto={$t('Discrète')} />
            </Field>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

// ── Selection buttons ───────────────────────────────────────────────────────

interface ScopedValue {
  readonly value: string
  readonly label?: string
  readonly count: number
  readonly scoped: number
}

/** A row of buttons, one per value of a category filter: a click chooses — Qlik's « boutons ». */
export function ButtonsView({ card, parameter, value, columnId, linked, onChange }: { card: DashboardCard; parameter: DashboardParameter | undefined; value: ParameterValue | null | undefined; columnId: string | undefined; linked: { column: string; values: string[] }[]; onChange: (v: ParameterValue | null) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['scoped-values', columnId, linked, ''],
    queryFn: () => api.post<{ values: ScopedValue[]; complete: boolean }>(`/v1/columns/${columnId}/values/scope`, { filters: linked, search: '' }),
    enabled: !!columnId && parameter?.type === 'category',
    staleTime: 30_000,
  })
  if (!parameter) return <p className="m-auto text-xs text-muted-foreground">{$t('Choisissez le filtre que ces boutons règlent.')}</p>
  if (parameter.type !== 'category') return <p className="m-auto text-xs text-muted-foreground">{$t('Les boutons règlent un filtre de catégorie.')}</p>
  if (!columnId) return <p className="m-auto text-xs text-muted-foreground">{$t('Reliez ce filtre à une carte : ses valeurs viennent de la colonne qu’il restreint.')}</p>
  if (isLoading) return <Loader2 className="m-auto size-4 animate-spin text-muted-foreground" />
  const chosen = new Set(Array.isArray(value) ? value.map(String) : value ? [String(value)] : [])
  const multiple = parameter.multiple !== false
  const segmented = card.buttons?.style === 'segmented'
  const toggle = (v: string) => {
    if (!multiple) return onChange(chosen.has(v) && chosen.size === 1 ? null : [v])
    const next = new Set(chosen)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    onChange(next.size ? [...next] : null)
  }
  const values = (data?.values ?? []).slice(0, 40)
  return (
    <div className="flex min-h-0 flex-1 items-center overflow-y-auto">
    <div className={cn('flex flex-wrap items-center gap-1.5', segmented && 'gap-0 rounded-lg border bg-muted/40 p-0.5')}>
      {card.buttons?.all !== false ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(segmented ? 'rounded-md px-3 py-1.5 text-sm' : 'rounded-full border px-3 py-1 text-sm', chosen.size === 0 ? (segmented ? 'bg-background font-medium shadow-xs' : 'border-primary bg-primary text-primary-foreground') : 'text-muted-foreground hover:bg-accent hover:text-foreground')}
        >
          {$t('Tout')}
        </button>
      ) : null}
      {values.map((v) => {
        const on = chosen.has(v.value)
        const out = v.scoped === 0 && !on
        return (
          <button
            key={v.value}
            type="button"
            onClick={() => toggle(v.value)}
            title={`${formatCount(v.scoped)} / ${formatCount(v.count)}`}
            className={cn(
              segmented ? 'rounded-md px-3 py-1.5 text-sm' : 'rounded-full border px-3 py-1 text-sm transition-colors',
              on ? (segmented ? 'bg-background font-medium text-primary shadow-xs' : 'border-primary bg-primary text-primary-foreground') : 'hover:bg-accent',
              out && 'opacity-40',
            )}
          >
            {v.label ?? v.value}
          </button>
        )
      })}
    </div>
    </div>
  )
}

// ── Navigation ──────────────────────────────────────────────────────────────

/**
 * The values to carry to another dashboard, by filter name: there, each goes to the filter of the
 * same name — the ids differ from one dashboard to the next, the names say the same thing.
 */
export function carriedFilters(parameters: readonly DashboardParameter[], values: Values): Record<string, ParameterValue> {
  const out: Record<string, ParameterValue> = {}
  for (const p of parameters) {
    const v = values[p.id]
    if (parameterHasValue(v)) out[filterName(p)] = v
  }
  return out
}

/** A button — or a tile — to another dashboard, the filters chosen here carried there. */
export function LinkView({ card, parameters, values, publicMode }: { card: DashboardCard; parameters: readonly DashboardParameter[]; values: Values; publicMode: boolean }) {
  const router = useRouter()
  const link: CardLink | undefined = card.link
  if (!link?.dashboard) return <p className="m-auto text-xs text-muted-foreground">{$t('Choisissez le tableau de bord où mène ce lien.')}</p>
  const go = () => {
    const q = new URLSearchParams()
    if (link.tab) q.set('tab', link.tab)
    const carried = link.carry !== false ? carriedFilters(parameters, values) : {}
    if (Object.keys(carried).length) q.set('filters', JSON.stringify(carried))
    router.push(`/dashboard/${link.dashboard}${q.size ? `?${q}` : ''}`)
  }
  const label = card.title || $t('Ouvrir')
  if (link.style === 'tile') {
    return (
      <button type="button" onClick={go} disabled={publicMode} className="group/link flex h-full w-full items-center gap-3 rounded-lg px-1 text-left disabled:opacity-60">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold group-hover/link:text-primary">{label}</span>
          {link.description ? <span className="block truncate text-sm text-muted-foreground">{link.description}</span> : null}
        </span>
        <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover/link:translate-x-0.5 group-hover/link:text-primary" />
      </button>
    )
  }
  return (
    <div className="flex h-full items-center justify-center">
      <Button onClick={go} disabled={publicMode}>
        {label} <ArrowRight />
      </Button>
    </div>
  )
}

// ── Variables ───────────────────────────────────────────────────────────────

/** A number to set — an objective, a rate —: the value of a number filter that queries cite. */
export function VariableView({ card, parameter, value, onChange }: { card: DashboardCard; parameter: DashboardParameter | undefined; value: ParameterValue | null | undefined; onChange: (v: ParameterValue | null) => void }) {
  const v = card.variable ?? {}
  const current = Array.isArray(value) && typeof value[0] === 'number' ? (value[0] as number) : undefined
  const [draft, setDraft] = useState<string>(current === undefined ? '' : String(current))
  useEffect(() => setDraft(current === undefined ? '' : String(current)), [current])
  if (!parameter) return <p className="m-auto text-xs text-muted-foreground">{$t('Choisissez le filtre de nombre que règle cette variable.')}</p>
  if (parameter.type !== 'number') return <p className="m-auto text-xs text-muted-foreground">{$t('Une variable règle un filtre de nombre.')}</p>
  const min = v.min ?? 0
  const max = v.max ?? 100
  const step = v.step ?? 1
  const commit = (n: number | null) => onChange(n === null || Number.isNaN(n) ? null : [n])
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm text-muted-foreground">{filterName(parameter)}</span>
        <span className="text-2xl font-semibold tabular-nums">
          {v.prefix ?? ''}
          {current === undefined ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(current)}
          {v.suffix ?? ''}
        </span>
      </div>
      {v.control === 'input' ? (
        <Input
          type="number"
          value={draft}
          step={step}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft === '' ? null : Number(draft))}
          onKeyDown={(e) => e.key === 'Enter' && commit(draft === '' ? null : Number(draft))}
          className="h-9"
        />
      ) : (
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={draft === '' ? min : Number(draft)}
          onChange={(e) => setDraft(e.target.value)}
          onPointerUp={() => commit(Number(draft))}
          onKeyUp={() => commit(Number(draft))}
          className="w-full accent-[var(--primary)]"
          aria-label={filterName(parameter)}
        />
      )}
    </div>
  )
}

// ── Images ──────────────────────────────────────────────────────────────────

const safeUrl = (u: string | undefined) => (u && /^(https?:\/\/|data:image\/)/i.test(u.trim()) ? u.trim() : null)

export function ImageView({ card }: { card: DashboardCard }) {
  const img = card.image
  const src = safeUrl(img?.url)
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])
  if (!src || broken) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ImageOff className="size-5" />
        {src ? $t('Image introuvable à cette adresse.') : $t('Donnez l’adresse d’une image (https://…).')}
      </div>
    )
  }
  const picture = <img src={src} alt={img?.alt ?? ''} onError={() => setBroken(true)} className={cn('size-full rounded-md', img?.fit === 'cover' ? 'object-cover' : 'object-contain')} />
  const href = safeUrl(img?.href)
  return href ? (
    <a href={href} target="_blank" rel="noreferrer noopener" className="block size-full">
      {picture}
    </a>
  ) : (
    picture
  )
}

// ── Summary ─────────────────────────────────────────────────────────────────

export interface SummaryText {
  readonly text: string
  readonly at: string
}

export type Summarizer = (card: DashboardCard, values: Values, opts: { fresh: boolean; draft: boolean }) => Promise<SummaryText>

/** What the assistant writes of the cards it is given, the filters applied — written again when they change. */
export function SummaryView({ card, cards, values, summarizer, dashboardId, tick, draft }: { card: DashboardCard; cards: readonly DashboardCard[]; values: Values; summarizer: Summarizer | undefined; dashboardId: string; tick: number; draft: boolean }) {
  const { data: me } = useMe()
  const summary: CardSummary | undefined = card.summary
  // The filters that matter: those tied to the cards it reads.
  const ids = new Set(cards.filter((c) => summary?.cards.includes(c.id)).flatMap((c) => (c.mappings ?? []).map((m) => m.parameter)))
  const relevant = Object.fromEntries(Object.entries(values).filter(([k]) => ids.has(k)))
  const [fresh, setFresh] = useState(0)
  const run = useQuery({
    queryKey: ['summary', dashboardId, card.id, JSON.stringify(summary), JSON.stringify(relevant), tick, fresh, draft],
    queryFn: () => (summarizer as Summarizer)(card, values, { fresh: fresh > 0, draft }),
    enabled: !!summarizer && !!summary && (summary.prompt.trim() !== '' || summary.cards.length > 0),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
  if (!summarizer || me?.ai_enabled === false) return <p className="m-auto text-xs text-muted-foreground">{$t('Le résumé demande l’assistant IA, absent ici.')}</p>
  if (!summary || (!summary.prompt.trim() && !summary.cards.length)) return <p className="m-auto max-w-64 text-center text-xs text-muted-foreground">{$t('Réglages du résumé : une consigne, et les cartes qu’il lit.')}</p>
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-y-auto text-sm">
        {run.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {$t('L’assistant lit les cartes…')}
          </div>
        ) : run.error ? (
          <p className="rounded-md bg-destructive/10 p-2 text-destructive">{(run.error as Error).message}</p>
        ) : run.data ? (
          <Prose text={run.data.text} />
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
        <Sparkles className="size-3 text-violet-500" />
        {run.data ? $tp(summary.cards.length, 'Écrit par l’IA {when}, d’après {count} carte', 'Écrit par l’IA {when}, d’après {count} cartes', { when: formatAgo(run.data.at) }) : $t('Écrit par l’IA')}
        <span className="flex-1" />
        <button type="button" onClick={() => setFresh((n) => n + 1)} disabled={run.isFetching} className="card-still inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground disabled:opacity-50">
          <RefreshCw className={cn('size-3', run.isFetching && 'animate-spin')} /> {$t('Réécrire')}
        </button>
      </div>
    </div>
  )
}

// ── Settings of the new cards ───────────────────────────────────────────────

/** An image kept in the card: under this weight, a dashboard stays quick to load and to save. */
const IMAGE_MAX_BYTES = 600_000

/**
 * Where an image comes from: a file sent from the computer — dropped, or chosen —, made
 * lighter and kept in the card; or an address (https) it is read from.
 */
function ImageSource({ url, onChange }: { url: string; onChange: (url: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const kept = url.startsWith('data:')
  const take = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error($t('Ce fichier n’est pas une image.'))
    setBusy(true)
    try {
      // Smaller and smaller until it is light enough to live in the dashboard.
      let side = 1600
      let data = await shrinkImage(file, side, 0.85)
      while (data.length > IMAGE_MAX_BYTES * 1.37 && side > 400) {
        side = Math.round(side * 0.7)
        data = await shrinkImage(file, side, 0.8)
      }
      onChange(data)
    } catch {
      toast.error($t('Cette image n’a pas pu être lue.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2">
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void take(e.dataTransfer.files?.[0])
        }}
        className={cn('flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 transition-colors', over ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')}
      >
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
          {busy ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : safeUrl(url) ? <img src={url} alt="" className="size-full object-contain" /> : <ImagePlus className="size-5 text-muted-foreground" />}
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <Upload className="size-4" /> {kept ? $t('Remplacer l’image…') : $t('Envoyer une image…')}
          </span>
          <span className="block text-xs text-muted-foreground">{$t('Glissez-la ici, ou choisissez-la : PNG, JPEG, WebP, GIF ou SVG. Elle est allégée et gardée dans le tableau.')}</span>
        </span>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="sr-only" onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          void take(file)
        }} />
      </label>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {$t('ou par son adresse')}
        <span className="h-px flex-1 bg-border" />
      </div>
      <Input value={kept ? '' : url} onChange={(e) => onChange(e.target.value)} placeholder={kept ? $t('Image envoyée — une adresse la remplace') : 'https://…/logo.png'} className="h-8" />
    </div>
  )
}

/** The settings of a card of the new kinds: its filter, its target, its image, its prompt. */
export function CardSettingsDialog({
  card,
  open,
  onOpenChange,
  parameters,
  cards,
  titleOf,
  onApply,
}: {
  card: DashboardCard
  open: boolean
  onOpenChange: (o: boolean) => void
  parameters: readonly DashboardParameter[]
  /** The dashboard's question cards, for a summary to read. */
  cards: readonly DashboardCard[]
  titleOf: (c: DashboardCard) => string
  onApply: (patch: Partial<DashboardCard>) => void
}) {
  const [patch, setPatch] = useState<Partial<DashboardCard>>({})
  useEffect(() => {
    if (open) setPatch({})
  }, [open])
  const c = { ...card, ...patch } as DashboardCard
  const set = (p: Partial<DashboardCard>) => setPatch((x) => ({ ...x, ...p }))
  const [q, setQ] = useState('')
  const dashboards = useQuery({
    queryKey: ['search', q, 'dashboards'],
    queryFn: () => api.get<{ items: ItemSummary[] }>(`/v1/search?q=${encodeURIComponent(q)}`),
    enabled: open && card.kind === 'link',
  })
  const filtersOf = (type: DashboardParameter['type']) => parameters.filter((p) => p.type === type).map((p) => ({ value: p.id, label: filterName(p) }))
  const title = {
    buttons: $t('Boutons de sélection'),
    link: $t('Lien vers un tableau de bord'),
    variable: $t('Variable'),
    image: $t('Image'),
    summary: $t('Résumé par l’IA'),
  }[card.kind as 'buttons' | 'link' | 'variable' | 'image' | 'summary']
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {card.kind === 'buttons'
              ? $t('Une rangée de boutons, une par valeur d’un filtre de catégorie : un clic la choisit.')
              : card.kind === 'link'
                ? $t('Mène à un autre tableau de bord ; les filtres choisis ici y vont aux filtres du même nom.')
                : card.kind === 'variable'
                  ? $t('Un nombre que le lecteur règle — un objectif, un taux. Reliez le filtre à une variable {{nom}} d’une question SQL pour qu’elle le cite.')
                  : card.kind === 'image'
                    ? $t('Un logo, un schéma, une photo — et, au besoin, la page qu’elle ouvre.')
                    : $t('L’assistant lit les cartes choisies, avec les filtres appliqués, et écrit ce que vous lui demandez. Il ne lit que quelques dizaines de lignes par carte.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {card.kind === 'buttons' || card.kind === 'variable' ? (
            <Field label={$t('Filtre')}>
              <Choice value={c.parameter ?? ''} onValueChange={(v) => set({ parameter: v })} options={filtersOf(card.kind === 'buttons' ? 'category' : 'number')} placeholder={card.kind === 'buttons' ? $t('Un filtre de catégorie') : $t('Un filtre de nombre')} aria-label={$t('Filtre')} className="w-full" />
            </Field>
          ) : null}
          {card.kind === 'buttons' ? (
            <>
              <Field label={$t('Présentation')}>
                <Segmented value={c.buttons?.style ?? 'pills'} onValueChange={(v) => set({ buttons: { ...c.buttons, style: v as 'pills' | 'segmented' } })} aria-label={$t('Présentation')} options={[{ value: 'pills', label: $t('Pastilles') }, { value: 'segmented', label: $t('Segments') }]} />
              </Field>
              <label className="flex items-center justify-between gap-3 text-sm">
                {$t('Bouton « Tout »')}
                <Switch checked={c.buttons?.all !== false} onCheckedChange={(all) => set({ buttons: { ...c.buttons, all } })} />
              </label>
            </>
          ) : null}
          {card.kind === 'variable' ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {(['min', 'max', 'step'] as const).map((k) => (
                  <Field key={k} label={{ min: $t('Minimum'), max: $t('Maximum'), step: $t('Pas') }[k]}>
                    <Input type="number" value={c.variable?.[k] ?? ''} onChange={(e) => set({ variable: { ...c.variable, [k]: e.target.value === '' ? undefined : Number(e.target.value) } })} className="h-8" />
                  </Field>
                ))}
              </div>
              <Field label={$t('Réglage')}>
                <Segmented value={c.variable?.control ?? 'slider'} onValueChange={(v) => set({ variable: { ...c.variable, control: v as 'slider' | 'input' } })} aria-label={$t('Réglage')} options={[{ value: 'slider', label: $t('Curseur') }, { value: 'input', label: $t('Champ') }]} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={$t('Avant le nombre')}>
                  <Input value={c.variable?.prefix ?? ''} onChange={(e) => set({ variable: { ...c.variable, prefix: e.target.value || undefined } })} placeholder="€ " className="h-8" />
                </Field>
                <Field label={$t('Après le nombre')}>
                  <Input value={c.variable?.suffix ?? ''} onChange={(e) => set({ variable: { ...c.variable, suffix: e.target.value || undefined } })} placeholder=" %" className="h-8" />
                </Field>
              </div>
            </>
          ) : null}
          {card.kind === 'link' ? (
            <>
              <Field label={$t('Texte du lien')}>
                <Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder={$t('Voir le détail par région')} className="h-8" />
              </Field>
              <Field label={$t('Tableau de bord')}>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={$t('Chercher un tableau de bord…')} className="h-8" />
                <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-md border p-1">
                  {(dashboards.data?.items ?? [])
                    .filter((i) => i.kind === 'dashboard')
                    .map((i) => (
                      <button key={i.id} type="button" onClick={() => set({ link: { ...c.link, dashboard: i.id } })} className={cn('block w-full truncate rounded px-2 py-1 text-left text-sm', c.link?.dashboard === i.id ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-accent')}>
                        {i.name}
                      </button>
                    ))}
                </div>
              </Field>
              <Field label={$t('Présentation')}>
                <Segmented value={c.link?.style ?? 'button'} onValueChange={(v) => set({ link: { ...(c.link as CardLink), style: v as 'button' | 'tile' } })} aria-label={$t('Présentation')} options={[{ value: 'button', label: $t('Bouton') }, { value: 'tile', label: $t('Tuile') }]} />
              </Field>
              {c.link?.style === 'tile' ? (
                <Field label={$t('Description')}>
                  <Input value={c.link?.description ?? ''} onChange={(e) => set({ link: { ...(c.link as CardLink), description: e.target.value || undefined } })} className="h-8" />
                </Field>
              ) : null}
              <label className="flex items-center justify-between gap-3 text-sm">
                {$t('Emporter les filtres choisis')}
                <Switch checked={c.link?.carry !== false} onCheckedChange={(carry) => set({ link: { ...(c.link as CardLink), carry } })} />
              </label>
            </>
          ) : null}
          {card.kind === 'image' ? (
            <>
              <ImageSource url={c.image?.url ?? ''} onChange={(url) => set({ image: { ...(c.image ?? {}), url } })} />
              <Field label={$t('Cadrage')}>
                <Segmented value={c.image?.fit ?? 'contain'} onValueChange={(v) => set({ image: { ...(c.image ?? { url: '' }), fit: v as 'contain' | 'cover' } })} aria-label={$t('Cadrage')} options={[{ value: 'contain', label: $t('Entière') }, { value: 'cover', label: $t('Remplit la carte') }]} />
              </Field>
              <Field label={$t('Ouvre au clic')}>
                <Input value={c.image?.href ?? ''} onChange={(e) => set({ image: { ...(c.image ?? { url: '' }), href: e.target.value || undefined } })} placeholder="https://…" className="h-8" />
              </Field>
              <Field label={$t('Texte alternatif')}>
                <Input value={c.image?.alt ?? ''} onChange={(e) => set({ image: { ...(c.image ?? { url: '' }), alt: e.target.value || undefined } })} placeholder={$t('Ce que montre l’image')} className="h-8" />
              </Field>
            </>
          ) : null}
          {card.kind === 'summary' ? (
            <>
              <Field label={$t('Consigne')}>
                <Textarea
                  value={c.summary?.prompt ?? ''}
                  onChange={(e) => set({ summary: { cards: c.summary?.cards ?? [], prompt: e.target.value.slice(0, SUMMARY_LIMITS.prompt) } })}
                  placeholder={$t('Résume les ventes en trois points, chiffres clés en gras ; signale un canal en recul.')}
                  className="min-h-24 text-sm"
                />
              </Field>
              <Field label={$t('Cartes lues ({n} au plus)', { n: SUMMARY_LIMITS.cards })}>
                <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-md border p-1">
                  {cards.length === 0 ? <p className="p-2 text-xs text-muted-foreground">{$t('Aucune carte de question dans ce tableau.')}</p> : null}
                  {cards.map((qc) => {
                    const on = c.summary?.cards.includes(qc.id) ?? false
                    const count = c.summary?.cards.length ?? 0
                    return (
                      <label key={qc.id} className={cn('flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm', !on && count >= SUMMARY_LIMITS.cards ? 'opacity-50' : 'cursor-pointer hover:bg-accent')}>
                        <Checkbox
                          checked={on}
                          disabled={!on && count >= SUMMARY_LIMITS.cards}
                          onCheckedChange={(checked) => {
                            const list = c.summary?.cards ?? []
                            set({ summary: { prompt: c.summary?.prompt ?? '', cards: checked === true ? [...list, qc.id] : list.filter((x) => x !== qc.id) } })
                          }}
                        />
                        <span className="truncate">{titleOf(qc)}</span>
                      </label>
                    )
                  })}
                </div>
              </Field>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {$t('Annuler')}
          </Button>
          <Button
            onClick={() => {
              onApply(patch)
              onOpenChange(false)
            }}
          >
            {$t('Appliquer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── A click on a chart ──────────────────────────────────────────────────────

/** What a click on a point of a card's chart does: filter this dashboard, or open another. */
export function ClickDialog({ card, open, onOpenChange, onApply }: { card: DashboardCard; open: boolean; onOpenChange: (o: boolean) => void; onApply: (patch: Partial<DashboardCard>) => void }) {
  const [click, setClick] = useState<NonNullable<DashboardCard['click']>>(card.click ?? { action: 'filter' })
  const [q, setQ] = useState('')
  useEffect(() => {
    if (open) setClick(card.click ?? { action: 'filter' })
  }, [open, card.click])
  const dashboards = useQuery({
    queryKey: ['search', q, 'dashboards'],
    queryFn: () => api.get<{ items: ItemSummary[] }>(`/v1/search?q=${encodeURIComponent(q)}`),
    enabled: open && click.action === 'dashboard',
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{$t('Au clic sur un point')}</DialogTitle>
          <DialogDescription>{$t('Ce que fait un clic sur une barre, une part ou un point de ce graphique.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Segmented
            value={click.action}
            onValueChange={(v) => setClick((c) => ({ ...c, action: v as 'filter' | 'dashboard' }))}
            aria-label={$t('Action')}
            options={[
              { value: 'filter', label: $t('Filtrer ce tableau') },
              { value: 'dashboard', label: $t('Ouvrir un autre tableau') },
            ]}
          />
          {click.action === 'dashboard' ? (
            <>
              <p className="text-xs text-muted-foreground">{$t('Le tableau choisi s’ouvre filtré sur la valeur cliquée — par le filtre du même nom que celui de la colonne, ou que la colonne elle-même.')}</p>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={$t('Chercher un tableau de bord…')} className="h-8" />
              <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border p-1">
                {(dashboards.data?.items ?? [])
                  .filter((i) => i.kind === 'dashboard')
                  .map((i) => (
                    <button key={i.id} type="button" onClick={() => setClick((c) => ({ ...c, dashboard: i.id }))} className={cn('block w-full truncate rounded px-2 py-1 text-left text-sm', click.dashboard === i.id ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-accent')}>
                      {i.name}
                    </button>
                  ))}
              </div>
              <label className="flex items-center justify-between gap-3 text-sm">
                {$t('Emporter aussi les autres filtres choisis')}
                <Switch checked={click.carry !== false} onCheckedChange={(carry) => setClick((c) => ({ ...c, carry }))} />
              </label>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{$t('Le clic choisit la valeur dans le filtre relié à cette colonne ; Maj + clic en ajoute d’autres.')}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {$t('Annuler')}
          </Button>
          <Button
            disabled={click.action === 'dashboard' && !click.dashboard}
            onClick={() => {
              onApply({ click: click.action === 'filter' ? undefined : click })
              onOpenChange(false)
            }}
          >
            {$t('Appliquer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
