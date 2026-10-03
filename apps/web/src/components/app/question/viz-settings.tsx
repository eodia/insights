'use client'

import type { ColorScheme, ResultColumn, VisualizationSettings, VisualizationType } from '@eodia/contracts'
import { VISUALIZATIONS } from '@eodia/contracts'
import { Choice } from '@/components/ui/choice'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { $t, $tp, msg } from '@/lib/i18n'
import { LOOK_HEX } from '@/lib/format'
import { DEFAULT_SCHEME, PALETTES, checkPalette, schemeColors } from '@/lib/palettes'
import { VIZ_LABELS, type Result, autoVisualization, chartOption, roles, vizFits } from '@/lib/viz'
import { Hint } from '@/components/ui/tooltip'
import { Segmented } from '@/components/ui/segmented'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  AreaChart,
  BarChart3,
  BarChartHorizontal,
  ChartColumnBig,
  ChartBarDecreasing,
  ChartSpline,
  Play,
  Rabbit,
  Snail,
  Sigma,
  ChartScatter,
  Filter,
  Gauge,
  Grid3x3,
  Hash,
  LineChart,
  type LucideIcon,
  MapPin,
  PieChart,
  Table2,
  TrendingUp,
  Loader,
  AlertTriangle,
  Check,
  Palette,
  Plus,
  X,
  Radar,
  Sparkles,
  TrendingUpDown,
  ArrowDownToLine,
  ArrowDownWideNarrow,
  ArrowRightToLine,
  ArrowUpToLine,
  ArrowUpWideNarrow,
  Ban,
  ChartColumnStacked,
  CircleDot,
  CircleOff,
  ListOrdered,
  MoveDiagonal,
  MoveHorizontal,
  MoveVertical,
  Percent,
  Wand2,
  Waves,
} from 'lucide-react'

export const VIZ_ICONS: Record<VisualizationType, LucideIcon> = {
  table: Table2,
  scalar: Hash,
  trend: TrendingUp,
  progress: Loader,
  gauge: Gauge,
  bar: BarChart3,
  row: BarChartHorizontal,
  line: LineChart,
  area: AreaChart,
  combo: ChartColumnBig,
  pie: PieChart,
  scatter: ChartScatter,
  funnel: Filter,
  radar: Radar,
  bar_race: ChartBarDecreasing,
  line_race: ChartSpline,
  pivot: Grid3x3,
  map: MapPin,
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

function ColumnsPick({ columns, value, onChange, label }: { columns: readonly ResultColumn[]; value: readonly string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-1">
        {columns.map((c) => {
          const on = value.includes(c.name)
          return (
            <button
              key={c.name}
              type="button"
              onClick={() => onChange(on ? value.filter((v) => v !== c.name) : [...value, c.name])}
              className={cn('rounded-md border px-2 py-1 text-xs', on ? 'border-primary bg-primary/10 font-medium text-foreground' : 'text-muted-foreground hover:bg-accent')}
            >
              {c.label}
            </button>
          )
        })}
      </div>
    </Field>
  )
}

// ── Pictogrammes des choix ───────────────────────────────────────────────────

function Glyph({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  )
}
const IconStraight = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <path d="M3 18 9 11l5 4 7-9" />
  </Glyph>
)
const IconSmooth = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <path d="M3 18c3 0 4-7 7-7s3.5 4 6 4 3.5-9 5-9" />
  </Glyph>
)
const IconSteps = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <path d="M3 18h5v-6h5v4h4V7h4" />
  </Glyph>
)
const IconLog = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <path d="M3 20c2-9 5-14 18-15" />
    <path d="M3 4v16h18" strokeWidth={1.4} opacity={0.5} />
  </Glyph>
)
const bars = (w: number) => ({ className }: { className?: string }) => (
  <Glyph className={className}>
    {[5, 12, 19].map((x, i) => (
      <rect key={x} x={x - w / 2} y={[11, 6, 14][i]} width={w} height={[9, 14, 6][i]} rx={0.8} fill="currentColor" stroke="none" />
    ))}
  </Glyph>
)
const IconBarsThin = bars(2)
const IconBarsNormal = bars(4)
const IconBarsWide = bars(6)
const IconGrouped = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <path d="M4 20V10M8 20V6M14 20v-8M18 20V8" strokeWidth={3} />
  </Glyph>
)
const rows = (n: number) => ({ className }: { className?: string }) => (
  <Glyph className={className}>
    {Array.from({ length: n }, (_, i) => {
      const y = 4 + ((i + 0.5) * 16) / n
      return <path key={y} d={`M4 ${y}h16`} />
    })}
  </Glyph>
)
const IconRows3 = rows(5)
const IconRows2 = rows(4)
const IconRows1 = rows(3)

/** The forms by what they are for, each family with its tint. */
const FAMILIES: { label: string; tone: string; types: VisualizationType[] }[] = [
  { label: msg('Chiffres clés'), tone: 'bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300', types: ['scalar', 'trend', 'progress', 'gauge'] },
  { label: msg('Comparer'), tone: 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300', types: ['bar', 'row', 'radar'] },
  { label: msg('Évolution'), tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300', types: ['line', 'area', 'combo', 'bar_race', 'line_race'] },
  { label: msg('Répartition'), tone: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300', types: ['pie', 'funnel'] },
  { label: msg('Relation'), tone: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300', types: ['scatter'] },
  { label: msg('Détail'), tone: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300', types: ['table', 'pivot', 'map'] },
]

/** Why a form does not suit the result, said briefly. */
const UNFIT: Partial<Record<VisualizationType, string>> = {
  trend: msg('Il faut une date et une mesure.'),
  pivot: msg('Il faut deux dimensions et une mesure.'),
  map: msg('Il faut une latitude et une longitude.'),
  radar: msg('Il faut de 3 à 30 catégories et une mesure.'),
  scatter: msg('Il faut deux mesures, ou une dimension et une mesure.'),
  bar_race: msg('Il faut une date, une mesure, et une seconde dimension ou plusieurs mesures.'),
  line_race: msg('Il faut une date et une mesure.'),
}

export function VizPicker({ value, result, onChange }: { value: VisualizationType; result: Result | null; onChange: (v: VisualizationType) => void }) {
  const suggested = result ? autoVisualization(result) : null
  return (
    <div className="space-y-3">
      {FAMILIES.map((f) => (
        <div key={f.label} className="space-y-1.5">
          <div className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{$t(f.label)}</div>
          <div className="grid grid-cols-3 gap-1.5">
            {f.types.map((v) => {
              const Icon = VIZ_ICONS[v]
              const fits = !result || vizFits(v, result)
              const on = value === v
              const tile = (
                <button
                  key={v}
                  type="button"
                  onClick={() => onChange(v)}
                  aria-pressed={on}
                  className={cn(
                    'group relative flex w-full flex-col items-center gap-1.5 rounded-xl border px-1 pt-2.5 pb-2 text-center text-[11px] leading-tight transition-all',
                    on ? 'border-primary bg-primary/5 font-semibold text-foreground shadow-sm ring-1 ring-primary/30' : 'border-transparent bg-muted/40 text-muted-foreground hover:-translate-y-px hover:border-border hover:bg-background hover:text-foreground hover:shadow-sm',
                    !fits && !on && 'opacity-45',
                  )}
                >
                  <span className={cn('flex size-8 items-center justify-center rounded-lg transition-transform group-hover:scale-105', on ? 'bg-primary text-primary-foreground' : f.tone)}>
                    <Icon className="size-4" />
                  </span>
                  <span className="line-clamp-2">{$t(VIZ_LABELS[v])}</span>
                  {on ? (
                    <span className="absolute top-1 right-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-2.5" />
                    </span>
                  ) : suggested === v ? (
                    <span className="absolute top-1 right-1 text-primary" aria-label={$t('Conseillé')}>
                      <Sparkles className="size-3" />
                    </span>
                  ) : null}
                </button>
              )
              const unfit = UNFIT[v]
              const hint = !fits ? (unfit ? $t(unfit) : $t('Il faut au moins une dimension et une mesure.')) : suggested === v && !on ? $t('Conseillé pour ce résultat') : undefined
              return hint ? (
                <Hint key={v} label={hint}>
                  {tile}
                </Hint>
              ) : (
                tile
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/** A titled group of settings. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
      <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h4>
      {children}
    </section>
  )
}

function Swatches({ colors, className }: { colors: readonly string[]; className?: string }) {
  return (
    <span className={cn('flex h-3 overflow-hidden rounded-sm', className)}>
      {colors.map((c, i) => (
        <span key={`${c}${i}`} className="flex-1" style={{ background: c }} />
      ))}
    </span>
  )
}

/** The palettes, each shown by its colours; the custom one opens its editor. */
function PalettePicker({ settings, set }: { settings: VisualizationSettings; set: (p: Partial<VisualizationSettings>) => void }) {
  const current = settings.scheme ?? DEFAULT_SCHEME
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {(Object.entries(PALETTES) as [Exclude<ColorScheme, 'custom'>, (typeof PALETTES)[keyof typeof PALETTES]][]).map(([id, p]) => (
        <button
          key={id}
          type="button"
          onClick={() => set({ scheme: id })}
          className={cn('space-y-1.5 rounded-lg border p-2 text-left text-xs transition-colors', current === id ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-accent')}
        >
          <span className="flex items-center justify-between">
            {$t(p.label)}
            {current === id ? <Check className="size-3 text-primary" /> : null}
          </span>
          <Swatches colors={p.ordinal ? schemeColors(id, undefined, false, p.ordinal) : p.light} />
        </button>
      ))}
      <button
        type="button"
        onClick={() => set({ scheme: 'custom', colors: settings.colors?.length ? settings.colors : [...schemeColors(current === 'custom' ? DEFAULT_SCHEME : current, undefined, false, 8)].slice(0, 6) })}
        className={cn('space-y-1.5 rounded-lg border p-2 text-left text-xs transition-colors', current === 'custom' ? 'border-primary bg-primary/5 font-medium' : 'border-dashed hover:bg-accent')}
      >
        <span className="flex items-center justify-between">
          {$t('Personnalisée')}
          {current === 'custom' ? <Check className="size-3 text-primary" /> : <Palette className="size-3 text-muted-foreground" />}
        </span>
        {settings.colors?.length ? <Swatches colors={settings.colors} /> : <span className="block h-3 rounded-sm bg-gradient-to-r from-rose-400 via-amber-300 to-sky-400 opacity-60" />}
      </button>
    </div>
  )
}

/** One's own palette: up to eight colours in order, checked as they change. */
function CustomPalette({ colors, onChange }: { colors: readonly string[]; onChange: (c: string[]) => void }) {
  const check = checkPalette(colors)
  const n = (i: number) => i + 1
  const issues = [
    ...check.cvd.map(([a, b]) => $t('Les couleurs {a} et {b} se confondent pour un daltonien.', { a: n(a), b: n(b) })),
    ...check.close.filter(([a, b]) => !check.cvd.some(([x, y]) => x === a && y === b)).map(([a, b]) => $t('Les couleurs {a} et {b} sont trop proches.', { a: n(a), b: n(b) })),
    ...check.offBand.map((i) => $t('La couleur {i} est trop pâle, trop sombre ou trop grise pour un graphique.', { i: n(i) })),
  ]
  return (
    <div className="space-y-2 rounded-lg border p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {colors.map((c, i) => (
          <span key={`${i}-${c}`} className="group relative">
            <label className="relative block size-8 cursor-pointer overflow-hidden rounded-md border shadow-xs" style={{ background: c }}>
              <span className="absolute right-0.5 bottom-0 text-[9px] font-semibold text-white/90 mix-blend-difference">{i + 1}</span>
              <input type="color" value={c} onChange={(e) => onChange(colors.map((x, j) => (j === i ? e.target.value : x)))} className="absolute inset-0 cursor-pointer opacity-0" aria-label={$t('Couleur {i}', { i: i + 1 })} />
            </label>
            {colors.length > 2 ? (
              <button type="button" onClick={() => onChange(colors.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 hidden rounded-full border bg-background p-0.5 group-hover:block" aria-label={$t('Retirer')}>
                <X className="size-2.5" />
              </button>
            ) : null}
          </span>
        ))}
        {colors.length < 8 ? (
          <label className="relative flex size-8 cursor-pointer items-center justify-center rounded-md border border-dashed text-muted-foreground hover:text-foreground">
            <Plus className="size-4" />
            <input type="color" onChange={(e) => onChange([...colors, e.target.value])} className="absolute inset-0 cursor-pointer opacity-0" aria-label={$t('Ajouter une couleur')} />
          </label>
        ) : null}
      </div>
      {issues.length ? (
        <ul className="space-y-0.5 text-[11px] text-amber-700 dark:text-amber-400">
          {issues.slice(0, 4).map((t) => (
            <li key={t} className="flex gap-1">
              <AlertTriangle className="mt-px size-3 shrink-0" /> {t}
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
          <Check className="size-3" /> {$t('Lisible, y compris pour les daltoniens.')}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">{$t('L’ordre compte : deux couleurs voisines doivent bien se distinguer. En thème sombre, chaque couleur est ajustée pour rester lisible.')}</p>
    </div>
  )
}

/** A colour picked from the palette, the app's named colours, or anywhere. */
function ColorPick({ value, overridden, palette, onChange }: { value: string; overridden: boolean; palette: readonly string[]; onChange: (c: string | undefined) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn('size-5 shrink-0 rounded-full border-2 shadow-xs', overridden ? 'border-foreground/60' : 'border-background')} style={{ background: value }} aria-label={$t('Changer la couleur')} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 space-y-2 p-2">
        <div className="grid grid-cols-8 gap-1">
          {[...new Set([...palette, ...Object.values(LOOK_HEX)])].map((c) => (
            <button key={c} type="button" onClick={() => onChange(c)} className={cn('size-5 rounded-full border', c === value && 'ring-2 ring-primary ring-offset-1')} style={{ background: c }} aria-label={c} />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <label className="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-md border" style={{ background: value }}>
            <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={$t('Autre couleur')} />
          </label>
          <Input
            defaultValue={value}
            key={value}
            onBlur={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && onChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && /^#[0-9a-f]{6}$/i.test(e.currentTarget.value) && onChange(e.currentTarget.value)}
            className="h-7 font-mono text-xs"
          />
        </div>
        {overridden ? (
          <button type="button" onClick={() => onChange(undefined)} className="w-full rounded-md py-1 text-xs text-muted-foreground hover:bg-accent">
            {$t('Revenir à la couleur de la palette')}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/** Each series, slice or bar with its colour, to change one by one. */
function SeriesColors({ type, settings, result, set }: { type: VisualizationType; settings: VisualizationSettings; result: Result; set: (p: Partial<VisualizationSettings>) => void }) {
  const targets = useMemo(() => chartOption(type, result, settings, { dark: false })?.targets ?? [], [type, result, settings])
  const [all, setAll] = useState(false)
  if (targets.length < 2) return null
  const palette = schemeColors(settings.scheme, settings.colors, false, targets.length)
  const shown = all ? targets : targets.slice(0, 10)
  const overridden = Object.entries(settings.series ?? {}).filter(([, v]) => v.color).length
  const setColor = (key: string, color: string | undefined) => {
    const series = { ...(settings.series ?? {}) }
    const { color: _old, ...rest } = series[key] ?? {}
    series[key] = color ? { ...rest, color } : rest
    set({ series })
  }
  return (
    <Field label={$t('Couleur de chaque élément')}>
      <div className="space-y-0.5">
        {shown.map((t) => (
          <div key={t.key} className="flex items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-accent/60">
            <ColorPick value={t.color} overridden={!!settings.series?.[t.key]?.color} palette={palette} onChange={(c) => setColor(t.key, c)} />
            <span className="truncate">{t.name}</span>
          </div>
        ))}
        {targets.length > shown.length ? (
          <button type="button" onClick={() => setAll(true)} className="px-1 text-xs text-primary hover:underline">
            {$tp(targets.length - shown.length, 'Voir l’autre', 'Voir les {count} autres')}
          </button>
        ) : null}
        {overridden ? (
          <button
            type="button"
            onClick={() => set({ series: Object.fromEntries(Object.entries(settings.series ?? {}).map(([k, v]) => [k, { ...v, color: undefined }])) })}
            className="px-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {$t('Rendre toutes les couleurs à la palette')}
          </button>
        ) : null}
      </div>
    </Field>
  )
}

export function VizSettings({ type, settings, result, onChange }: { type: VisualizationType; settings: VisualizationSettings; result: Result | null; onChange: (s: VisualizationSettings) => void }) {
  const set = (patch: Partial<VisualizationSettings>) => onChange({ ...settings, ...patch })
  const columns = result?.columns.filter((c) => !c.hidden) ?? []
  const detected = result ? roles(result, settings) : { dims: [], metrics: [] }
  const numeric = columns.filter((c) => c.type === 'number' && !c.unit)
  const cartesian = ['bar', 'row', 'line', 'area', 'combo'].includes(type)
  const lines = type === 'line' || type === 'area' || type === 'combo'
  const num = (v: string) => (v === '' ? null : Number(v))
  const dims = settings.dimensions ? columns.filter((c) => settings.dimensions?.includes(c.name)) : detected.dims
  const xCol = dims[0]
  const categorical = !!xCol && xCol.type !== 'date' && xCol.type !== 'datetime' && !(xCol.type === 'number' && !xCol.unit)
  const splitSeries = dims.length > 1 || (settings.metrics ?? detected.metrics.map((m) => m.name)).length > 1
  const refs = new Set(settings.ref_lines ?? [])
  const toggleRef = (k: 'average' | 'median', on: boolean) => {
    const next = new Set(refs)
    if (on) next.add(k)
    else next.delete(k)
    set({ ref_lines: [...next] })
  }
  const race = type === 'bar_race' || type === 'line_race'
  const colored = cartesian || race || type === 'pie' || type === 'funnel' || type === 'scatter' || type === 'radar'

  return (
    <div className="space-y-4">
      {cartesian || race || type === 'pie' || type === 'funnel' || type === 'trend' || type === 'scatter' ? (
        <Section title={$t('Données')}>
          <ColumnsPick label={$t('Dimensions (axe, puis séries)')} columns={columns} value={settings.dimensions ?? detected.dims.map((d) => d.name)} onChange={(v) => set({ dimensions: v })} />
          <ColumnsPick label={$t('Mesures')} columns={numeric} value={settings.metrics ?? detected.metrics.map((d) => d.name)} onChange={(v) => set({ metrics: v })} />
        </Section>
      ) : null}

      {colored ? (
        <Section title={$t('Couleurs')}>
          <PalettePicker settings={settings} set={set} />
          {settings.scheme === 'custom' ? <CustomPalette colors={settings.colors ?? []} onChange={(colors) => set({ colors })} /> : null}
          {settings.scheme === 'degrade' ? <p className="text-[11px] text-muted-foreground">{$t('Pour des catégories ordonnées (tranches, niveaux) : du plus clair au plus foncé, 5 au plus.')}</p> : null}
          {result ? <SeriesColors type={type} settings={settings} result={result} set={set} /> : null}
          {!splitSeries && (cartesian || type === 'scatter') ? (
            <Field label={$t('Couleur unique')}>
              <div className="flex flex-wrap gap-1.5">
                {schemeColors(settings.scheme, settings.colors, false, 8).map((c) => (
                  <button key={c} type="button" onClick={() => set({ color: settings.color === c ? undefined : c })} className={cn('size-6 rounded-full border-2', settings.color === c ? 'border-foreground' : 'border-transparent')} style={{ background: c }} aria-label={c} />
                ))}
              </div>
            </Field>
          ) : null}
        </Section>
      ) : null}

      {race ? (
        <Section title={$t('Course')}>
          <Field label={$t('Vitesse')}>
            <Segmented
              value={String(settings.race_speed ?? 1000) as '2000' | '1000' | '500'}
              onValueChange={(v) => set({ race_speed: Number(v) })}
              options={[
                { value: '2000', label: $t('Lente'), icon: Snail, hint: $t('Deux secondes par période') },
                { value: '1000', label: $t('Normale'), icon: Gauge, hint: $t('Une seconde par période') },
                { value: '500', label: $t('Rapide'), icon: Rabbit, hint: $t('Une demi-seconde par période') },
              ]}
              aria-label={$t('Vitesse')}
            />
          </Field>
          {type === 'bar_race' ? (
            <Field label={$t('Barres affichées')}>
              <Segmented
                value={String(settings.top_n ?? 10) as '5' | '10' | '15' | '20'}
                onValueChange={(v) => set({ top_n: Number(v) })}
                options={['5', '10', '15', '20'].map((n) => ({ value: n as '5' | '10' | '15' | '20', label: n, icon: ListOrdered }))}
                aria-label={$t('Barres affichées')}
              />
            </Field>
          ) : null}
          <div className="space-y-2">
            <Toggle label={$t('Cumuler les périodes')} checked={!!settings.race_cumulative} onChange={(v) => set({ race_cumulative: v })} />
            {type === 'bar_race' ? <Toggle label={$t('Lancer la course à l’ouverture')} checked={settings.race_autoplay !== false} onChange={(v) => set({ race_autoplay: v })} /> : null}
          </div>
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            {settings.race_cumulative ? <Sigma className="mt-px size-3 shrink-0" /> : <Play className="mt-px size-3 shrink-0" />}
            {settings.race_cumulative
              ? $t('Chaque période s’ajoute aux précédentes : un total qui grandit.')
              : $t('La date fait avancer la course ; la seconde dimension, ou chaque mesure, est un concurrent.')}
          </p>
        </Section>
      ) : null}

      {cartesian ? (
        <Section title={$t('Mise en avant')}>
          {!splitSeries ? (
            <Field label={$t('Faire ressortir')}>
              <Segmented
                value={settings.highlight ?? 'none'}
                onValueChange={(v) => set({ highlight: v })}
                options={[
                  { value: 'none', label: $t('Rien'), icon: Ban },
                  { value: 'max', label: $t('Plus haute'), icon: ArrowUpToLine, hint: $t('La plus haute valeur ressort, les autres s’estompent') },
                  { value: 'min', label: $t('Plus basse'), icon: ArrowDownToLine, hint: $t('La plus basse valeur ressort, les autres s’estompent') },
                  { value: 'last', label: $t('Dernière'), icon: ArrowRightToLine, hint: $t('La dernière valeur ressort, les autres s’estompent') },
                ]}
                aria-label={$t('Faire ressortir')}
              />
            </Field>
          ) : null}
          <div className="space-y-2">
            <Toggle label={$t('Ligne de la moyenne')} checked={refs.has('average')} onChange={(v) => toggleRef('average', v)} />
            <Toggle label={$t('Ligne de la médiane')} checked={refs.has('median')} onChange={(v) => toggleRef('median', v)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={$t('Objectif')}>
              <Input type="number" value={settings.goal ?? ''} onChange={(e) => set({ goal: num(e.target.value) })} className="h-8" />
            </Field>
            <Field label={$t('Libellé')}>
              <Input value={settings.goal_label ?? ''} onChange={(e) => set({ goal_label: e.target.value })} placeholder={$t('Objectif')} className="h-8" />
            </Field>
          </div>
        </Section>
      ) : null}

      {cartesian && type !== 'row' && xCol && (xCol.type === 'date' || xCol.type === 'datetime') ? (
        <Section title={$t('Prévision')}>
          <Field label={$t('Prolonger la tendance de')}>
            <div className="flex items-center gap-2">
              <Input type="number" min={0} max={36} value={settings.forecast ?? ''} placeholder="0" onChange={(e) => set({ forecast: num(e.target.value) })} className="h-8 w-20" />
              <span className="text-xs text-muted-foreground">{$t('périodes')}</span>
              <span className="flex-1" />
              {[3, 6, 12].map((n) => (
                <button key={n} type="button" onClick={() => set({ forecast: settings.forecast === n ? null : n })} className={cn('h-7 rounded-md border px-2 text-xs', settings.forecast === n ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-accent')}>
                  +{n}
                </button>
              ))}
            </div>
          </Field>
          {settings.forecast ? (
            <>
              <Field label={$t('Méthode')}>
                <Segmented
                  value={settings.forecast_method ?? 'auto'}
                  onValueChange={(v) => set({ forecast_method: v })}
                  options={[
                    { value: 'auto', label: $t('Auto'), icon: Wand2, hint: $t('Choisie selon la série : la saison si elle en couvre deux, sinon une tendance lissée') },
                    { value: 'linear', label: $t('Droite'), icon: IconStraight, hint: $t('Droite de tendance (moindres carrés)') },
                    { value: 'smooth', label: $t('Lissée'), icon: IconSmooth, hint: $t('Tendance lissée (Holt)') },
                    { value: 'seasonal', label: $t('Saison'), icon: Waves, hint: $t('Tendance et saison (Holt-Winters)') },
                  ]}
                  aria-label={$t('Méthode')}
                />
              </Field>
              {!splitSeries ? <Toggle label={$t('Intervalle de confiance (80 %)')} checked={settings.forecast_band !== false} onChange={(v) => set({ forecast_band: v })} /> : null}
              <p className="flex gap-1.5 text-[11px] text-muted-foreground">
                <TrendingUpDown className="mt-px size-3.5 shrink-0 text-primary" />
                {$t('La partie prévue est dessinée en pointillés verts. Automatique choisit la saison quand la série en couvre deux (12 mois, 4 trimestres, 7 jours), sinon une tendance lissée.')}
              </p>
            </>
          ) : null}
        </Section>
      ) : null}

      {cartesian && categorical ? (
        <Section title={$t('Tri et regroupement')}>
          <Field label={$t('Ordre des catégories')}>
            <Segmented
              value={settings.sort_values ?? 'none'}
              onValueChange={(v) => set({ sort_values: v })}
              options={[
                { value: 'none', label: $t('Résultat'), icon: ListOrdered, hint: $t('L’ordre du résultat') },
                { value: 'desc', label: $t('Décroissant'), icon: ArrowDownWideNarrow, hint: $t('La plus grande valeur d’abord') },
                { value: 'asc', label: $t('Croissant'), icon: ArrowUpWideNarrow, hint: $t('La plus petite valeur d’abord') },
              ]}
              aria-label={$t('Ordre des catégories')}
            />
          </Field>
          <Field label={$t('Seulement les premières (le reste devient « Autres »)')}>
            <Input type="number" min={1} max={50} value={settings.top_n ?? ''} placeholder={$t('Toutes')} onChange={(e) => set({ top_n: num(e.target.value) })} className="h-8" />
          </Field>
        </Section>
      ) : null}

      {cartesian ? (
        <Section title={$t('Forme')}>
          <Field label={$t('Empilement')}>
            <Segmented
              value={settings.stack ?? 'none'}
              onValueChange={(v) => set({ stack: v })}
              options={[
                { value: 'none', label: $t('Côte à côte'), icon: IconGrouped },
                { value: 'stacked', label: $t('Empilé'), icon: ChartColumnStacked },
                { value: 'percent', label: $t('100 %'), icon: Percent, hint: $t('Empilé à 100 % : la part de chaque série') },
              ]}
              aria-label={$t('Empilement')}
            />
          </Field>
          {lines ? (
            <>
              <Field label={$t('Tracé')}>
                <Segmented
                  value={settings.line_style ?? 'straight'}
                  onValueChange={(v) => set({ line_style: v })}
                  options={[
                    { value: 'straight', label: $t('Droit'), icon: IconStraight },
                    { value: 'smooth', label: $t('Lissé'), icon: IconSmooth },
                    { value: 'step', label: $t('Marches'), icon: IconSteps },
                  ]}
                  aria-label={$t('Tracé')}
                />
              </Field>
              <Field label={$t('Points')}>
                <Segmented
                  value={settings.markers ?? 'auto'}
                  onValueChange={(v) => set({ markers: v })}
                  options={[
                    { value: 'auto', label: $t('Auto'), icon: Sparkles, hint: $t('Selon le nombre de points : affichés jusqu’à 24') },
                    { value: 'always', label: $t('Toujours'), icon: CircleDot },
                    { value: 'never', label: $t('Jamais'), icon: CircleOff },
                  ]}
                  aria-label={$t('Points')}
                />
              </Field>
            </>
          ) : null}
          {type !== 'line' ? (
            <Field label={$t('Largeur des barres')}>
              <Segmented
                value={settings.bar_width ?? 'normal'}
                onValueChange={(v) => set({ bar_width: v })}
                options={[
                  { value: 'thin', label: $t('Fine'), icon: IconBarsThin },
                  { value: 'normal', label: $t('Normale'), icon: IconBarsNormal },
                  { value: 'wide', label: $t('Large'), icon: IconBarsWide },
                ]}
                aria-label={$t('Largeur')}
              />
            </Field>
          ) : null}
          {type === 'area' ? <Toggle label={$t('Aire en dégradé')} checked={settings.gradient !== false} onChange={(v) => set({ gradient: v })} /> : null}
        </Section>
      ) : null}

      {cartesian ? (
        <Section title={$t('Étiquettes et légende')}>
          <Toggle label={$t('Valeurs sur les marques')} checked={!!settings.values} onChange={(v) => set({ values: v })} />
          {settings.stack === 'stacked' ? <Toggle label={$t('Total au-dessus des piles')} checked={!!settings.stack_totals} onChange={(v) => set({ stack_totals: v })} /> : null}
          {lines && splitSeries ? <Toggle label={$t('Nom des courbes au bout du tracé')} checked={settings.end_labels !== false} onChange={(v) => set({ end_labels: v })} /> : null}
          <Toggle label={$t('Légende')} checked={settings.legend !== false} onChange={(v) => set({ legend: v })} />
        </Section>
      ) : null}

      {cartesian ? (
        <Section title={$t('Axes')}>
          <Field label={$t('Échelle')}>
            <Segmented
              value={settings.y_scale ?? 'linear'}
              onValueChange={(v) => set({ y_scale: v })}
              options={[
                { value: 'linear', label: $t('Linéaire'), icon: IconStraight },
                { value: 'log', label: $t('Logarithmique'), icon: IconLog, hint: $t('Pour des valeurs d’ordres de grandeur très différents') },
              ]}
              aria-label={$t('Échelle')}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={$t('Minimum')}>
              <Input type="number" value={settings.y_min ?? ''} placeholder={$t('auto')} onChange={(e) => set({ y_min: num(e.target.value) })} className="h-8" />
            </Field>
            <Field label={$t('Maximum')}>
              <Input type="number" value={settings.y_max ?? ''} placeholder={$t('auto')} onChange={(e) => set({ y_max: num(e.target.value) })} className="h-8" />
            </Field>
          </div>
          <Field label={$t('Libellés de l’axe horizontal')}>
            <Segmented
              value={String(settings.x_rotate ?? 0) as '0' | '30' | '90'}
              onValueChange={(v) => set({ x_rotate: Number(v) })}
              options={[
                { value: '0', label: $t('Droits'), icon: MoveHorizontal },
                { value: '30', label: $t('Inclinés'), icon: MoveDiagonal },
                { value: '90', label: $t('Verticaux'), icon: MoveVertical },
              ]}
              aria-label={$t('Libellés')}
            />
          </Field>
          <Toggle label={$t('Axe horizontal')} checked={settings.x_axis !== false} onChange={(v) => set({ x_axis: v })} />
          <Toggle label={$t('Axe vertical')} checked={settings.y_axis !== false} onChange={(v) => set({ y_axis: v })} />
          <Toggle label={$t('Grille')} checked={settings.grid_lines !== false} onChange={(v) => set({ grid_lines: v })} />
        </Section>
      ) : null}

      {type === 'pie' ? (
        <Section title={$t('Camembert')}>
          <Toggle label={$t('Anneau')} checked={settings.donut !== false} onChange={(v) => set({ donut: v })} />
          {settings.donut !== false ? (
            <Field label={$t('Épaisseur de l’anneau')}>
              <input type="range" min={10} max={70} value={settings.ring_width ?? 38} onChange={(e) => set({ ring_width: Number(e.target.value) })} className="w-full accent-primary" />
            </Field>
          ) : null}
          <Toggle label={$t('Total au centre')} checked={settings.total !== false} onChange={(v) => set({ total: v })} />
          <Toggle label={$t('Demi-cercle')} checked={!!settings.half} onChange={(v) => set({ half: v })} />
          <Toggle label={$t('Parts proportionnelles en rayon (rose)')} checked={!!settings.rose} onChange={(v) => set({ rose: v })} />
          <Field label={$t('Sur chaque part')}>
            <Choice
              value={settings.slice_labels ?? (settings.donut !== false ? 'none' : 'percent')}
              onValueChange={(v) => set({ slice_labels: v as VisualizationSettings['slice_labels'] })}
              options={[
                { value: 'none', label: $t('Rien') },
                { value: 'percent', label: $t('Pourcentage') },
                { value: 'value', label: $t('Valeur') },
                { value: 'name', label: $t('Nom') },
                { value: 'name_percent', label: $t('Nom et pourcentage') },
                { value: 'name_value', label: $t('Nom et valeur') },
              ]}
              aria-label={$t('Sur chaque part')}
              className="w-full"
            />
          </Field>
          <Toggle label={$t('Étiquettes à l’extérieur')} checked={!!settings.labels_outside} onChange={(v) => set({ labels_outside: v })} />
          <Toggle label={$t('Légende')} checked={settings.legend !== false} onChange={(v) => set({ legend: v })} />
          <Field label={$t('Parts au plus (le reste devient « Autres »)')}>
            <Input type="number" min={2} max={8} value={settings.slices_max ?? 7} onChange={(e) => set({ slices_max: Number(e.target.value) })} className="h-8" />
          </Field>
        </Section>
      ) : null}
      {type === 'scalar' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label={$t('Préfixe')}>
              <Input value={settings.prefix ?? ''} onChange={(e) => set({ prefix: e.target.value })} className="h-8" />
            </Field>
            <Field label={$t('Suffixe')}>
              <Input value={settings.suffix ?? ''} onChange={(e) => set({ suffix: e.target.value })} className="h-8" />
            </Field>
          </div>
          <Field label={$t('Décimales')}>
            <Input type="number" min={0} max={6} value={settings.decimals ?? ''} onChange={(e) => set({ decimals: num(e.target.value) })} className="h-8" />
          </Field>
          <Toggle label={$t('Format compact (1,2 k)')} checked={!!settings.compact} onChange={(v) => set({ compact: v })} />
          <Field label={$t('Légende sous le nombre')}>
            <Input value={settings.caption ?? ''} onChange={(e) => set({ caption: e.target.value })} className="h-8" />
          </Field>
        </>
      ) : null}

      {type === 'trend' ? <Toggle label={$t('Une baisse est une bonne nouvelle')} checked={!!settings.invert} onChange={(v) => set({ invert: v })} /> : null}

      {type === 'progress' || type === 'gauge' ? (
        <Field label={type === 'progress' ? $t('Objectif') : $t('Maximum')}>
          <Input type="number" value={(type === 'progress' ? settings.goal : settings.max) ?? ''} onChange={(e) => set(type === 'progress' ? { goal: num(e.target.value) } : { max: num(e.target.value) })} className="h-8" />
        </Field>
      ) : null}

      {type === 'table' ? (
        <>
          <Toggle label={$t('Numéros de ligne')} checked={!!settings.row_numbers} onChange={(v) => set({ row_numbers: v })} />
          <Field label={$t('Densité')}>
            <Segmented
              value={settings.density ?? 'normal'}
              onValueChange={(v) => set({ density: v })}
              options={[
                { value: 'compact', label: $t('Compacte'), icon: IconRows3 },
                { value: 'normal', label: $t('Normale'), icon: IconRows2 },
                { value: 'comfortable', label: $t('Aérée'), icon: IconRows1 },
              ]}
              aria-label={$t('Densité')}
            />
          </Field>
          <ColumnsPick label={$t('Barres dans les cellules')} columns={numeric} value={settings.cell_bars ?? []} onChange={(v) => set({ cell_bars: v })} />
        </>
      ) : null}

      {type === 'pivot' ? (
        <>
          <ColumnsPick label={$t('Lignes')} columns={columns} value={settings.pivot_rows ?? []} onChange={(v) => set({ pivot_rows: v.slice(-1) })} />
          <ColumnsPick label={$t('Colonnes')} columns={columns} value={settings.pivot_columns ?? []} onChange={(v) => set({ pivot_columns: v.slice(-1) })} />
          <ColumnsPick label={$t('Valeurs')} columns={numeric} value={settings.pivot_values ?? []} onChange={(v) => set({ pivot_values: v.slice(-1) })} />
          <Toggle label={$t('Totaux')} checked={settings.totals !== false} onChange={(v) => set({ totals: v })} />
          <Toggle label={$t('Carte de chaleur')} checked={settings.heatmap !== false} onChange={(v) => set({ heatmap: v })} />
        </>
      ) : null}

      {['scalar', 'progress', 'gauge'].includes(type) ? (
        <Section title={$t('Couleur')}>
          <div className="flex flex-wrap gap-1.5">
            {schemeColors(settings.scheme, settings.colors, false, 8).map((c) => (
              <button key={c} type="button" onClick={() => set({ color: settings.color === c ? undefined : c })} className={cn('size-6 rounded-full border-2', settings.color === c ? 'border-foreground' : 'border-transparent')} style={{ background: c }} aria-label={c} />
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  )
}
