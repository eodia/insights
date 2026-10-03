'use client'

import type { ColorScheme, ResultColumn, VisualizationSettings, VisualizationType } from '@eodia/contracts'
import { VISUALIZATIONS } from '@eodia/contracts'
import { Choice } from '@/components/ui/choice'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { $t } from '@/lib/i18n'
import { LOOK_HEX } from '@/lib/format'
import { DEFAULT_SCHEME, PALETTES, checkPalette, schemeColors } from '@/lib/palettes'
import { VIZ_LABELS, type Result, chartOption, roles, vizFits } from '@/lib/viz'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  AreaChart,
  BarChart3,
  BarChartHorizontal,
  ChartColumnBig,
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

export function VizPicker({ value, result, onChange }: { value: VisualizationType; result: Result | null; onChange: (v: VisualizationType) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {VISUALIZATIONS.map((v) => {
        const Icon = VIZ_ICONS[v]
        const fits = !result || vizFits(v, result)
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] transition-colors',
              value === v ? 'border-primary bg-primary/10 font-semibold text-foreground' : 'hover:bg-accent',
              !fits && value !== v && 'opacity-40',
            )}
          >
            <Icon className={cn('size-4', value === v ? 'text-primary' : 'text-muted-foreground')} />
            {$t(VIZ_LABELS[v])}
          </button>
        )
      })}
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
            {$t('Voir les {n} autres', { n: targets.length - shown.length })}
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
  const colored = cartesian || type === 'pie' || type === 'funnel' || type === 'scatter'

  return (
    <div className="space-y-4">
      {cartesian || type === 'pie' || type === 'funnel' || type === 'trend' || type === 'scatter' ? (
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

      {cartesian ? (
        <Section title={$t('Mise en avant')}>
          {!splitSeries ? (
            <Field label={$t('Faire ressortir')}>
              <Choice
                value={settings.highlight ?? 'none'}
                onValueChange={(v) => set({ highlight: v as VisualizationSettings['highlight'] })}
                options={[
                  { value: 'none', label: $t('Rien') },
                  { value: 'max', label: $t('La plus haute valeur') },
                  { value: 'min', label: $t('La plus basse valeur') },
                  { value: 'last', label: $t('La dernière valeur') },
                ]}
                aria-label={$t('Faire ressortir')}
                className="w-full"
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

      {cartesian && categorical ? (
        <Section title={$t('Tri et regroupement')}>
          <Field label={$t('Ordre des catégories')}>
            <Choice
              value={settings.sort_values ?? 'none'}
              onValueChange={(v) => set({ sort_values: v as VisualizationSettings['sort_values'] })}
              options={[
                { value: 'none', label: $t('Celui du résultat') },
                { value: 'desc', label: $t('Valeur décroissante') },
                { value: 'asc', label: $t('Valeur croissante') },
              ]}
              aria-label={$t('Ordre des catégories')}
              className="w-full"
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
            <Choice value={settings.stack ?? 'none'} onValueChange={(v) => set({ stack: v as VisualizationSettings['stack'] })} options={[{ value: 'none', label: $t('Aucun') }, { value: 'stacked', label: $t('Empilé') }, { value: 'percent', label: $t('Empilé à 100 %') }]} aria-label={$t('Empilement')} className="w-full" />
          </Field>
          {lines ? (
            <>
              <Field label={$t('Tracé')}>
                <Choice value={settings.line_style ?? 'straight'} onValueChange={(v) => set({ line_style: v as VisualizationSettings['line_style'] })} options={[{ value: 'straight', label: $t('Droit') }, { value: 'smooth', label: $t('Lissé') }, { value: 'step', label: $t('Marches') }]} aria-label={$t('Tracé')} className="w-full" />
              </Field>
              <Field label={$t('Points')}>
                <Choice value={settings.markers ?? 'auto'} onValueChange={(v) => set({ markers: v as VisualizationSettings['markers'] })} options={[{ value: 'auto', label: $t('Selon le nombre') }, { value: 'always', label: $t('Toujours') }, { value: 'never', label: $t('Jamais') }]} aria-label={$t('Points')} className="w-full" />
              </Field>
            </>
          ) : null}
          {type !== 'line' ? (
            <Field label={$t('Largeur des barres')}>
              <Choice value={settings.bar_width ?? 'normal'} onValueChange={(v) => set({ bar_width: v as VisualizationSettings['bar_width'] })} options={[{ value: 'thin', label: $t('Fine') }, { value: 'normal', label: $t('Normale') }, { value: 'wide', label: $t('Large') }]} aria-label={$t('Largeur')} className="w-full" />
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
            <Choice value={settings.y_scale ?? 'linear'} onValueChange={(v) => set({ y_scale: v as 'linear' | 'log' })} options={[{ value: 'linear', label: $t('Linéaire') }, { value: 'log', label: $t('Logarithmique') }]} aria-label={$t('Échelle')} className="w-full" />
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
            <Choice value={String(settings.x_rotate ?? 0)} onValueChange={(v) => set({ x_rotate: Number(v) })} options={[{ value: '0', label: $t('Droits') }, { value: '30', label: $t('Inclinés') }, { value: '90', label: $t('Verticaux') }]} aria-label={$t('Libellés')} className="w-full" />
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
            <Choice value={settings.density ?? 'normal'} onValueChange={(v) => set({ density: v as VisualizationSettings['density'] })} options={[{ value: 'compact', label: $t('Compacte') }, { value: 'normal', label: $t('Normale') }, { value: 'comfortable', label: $t('Aérée') }]} aria-label={$t('Densité')} className="w-full" />
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
