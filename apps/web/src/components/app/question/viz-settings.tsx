'use client'

import type { ResultColumn, VisualizationSettings, VisualizationType } from '@eodia/contracts'
import { VISUALIZATIONS } from '@eodia/contracts'
import { Choice } from '@/components/ui/choice'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { $t } from '@/lib/i18n'
import { SERIES_LIGHT, VIZ_LABELS, type Result, roles, vizFits } from '@/lib/viz'
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

export function VizSettings({ type, settings, result, onChange }: { type: VisualizationType; settings: VisualizationSettings; result: Result | null; onChange: (s: VisualizationSettings) => void }) {
  const set = (patch: Partial<VisualizationSettings>) => onChange({ ...settings, ...patch })
  const columns = result?.columns.filter((c) => !c.hidden) ?? []
  const detected = result ? roles(result, settings) : { dims: [], metrics: [] }
  const numeric = columns.filter((c) => c.type === 'number' && !c.unit)
  const cartesian = ['bar', 'row', 'line', 'area', 'combo'].includes(type)
  const num = (v: string) => (v === '' ? null : Number(v))

  return (
    <div className="space-y-5">
      {cartesian || type === 'pie' || type === 'funnel' || type === 'trend' || type === 'scatter' ? (
        <>
          <ColumnsPick label={$t('Dimensions (axe, puis séries)')} columns={columns} value={settings.dimensions ?? detected.dims.map((d) => d.name)} onChange={(v) => set({ dimensions: v })} />
          <ColumnsPick label={$t('Mesures')} columns={numeric} value={settings.metrics ?? detected.metrics.map((d) => d.name)} onChange={(v) => set({ metrics: v })} />
        </>
      ) : null}

      {cartesian ? (
        <>
          <Field label={$t('Empilement')}>
            <Choice value={settings.stack ?? 'none'} onValueChange={(v) => set({ stack: v as VisualizationSettings['stack'] })} options={[{ value: 'none', label: $t('Aucun') }, { value: 'stacked', label: $t('Empilé') }, { value: 'percent', label: $t('Empilé à 100 %') }]} aria-label={$t('Empilement')} className="w-full" />
          </Field>
          {type === 'line' || type === 'area' || type === 'combo' ? (
            <Field label={$t('Tracé')}>
              <Choice value={settings.line_style ?? 'straight'} onValueChange={(v) => set({ line_style: v as VisualizationSettings['line_style'] })} options={[{ value: 'straight', label: $t('Droit') }, { value: 'smooth', label: $t('Lissé') }, { value: 'step', label: $t('Marches') }]} aria-label={$t('Tracé')} className="w-full" />
            </Field>
          ) : (
            <Field label={$t('Largeur des barres')}>
              <Choice value={settings.bar_width ?? 'normal'} onValueChange={(v) => set({ bar_width: v as VisualizationSettings['bar_width'] })} options={[{ value: 'thin', label: $t('Fine') }, { value: 'normal', label: $t('Normale') }, { value: 'wide', label: $t('Large') }]} aria-label={$t('Largeur')} className="w-full" />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label={$t('Objectif')}>
              <Input type="number" value={settings.goal ?? ''} onChange={(e) => set({ goal: num(e.target.value) })} className="h-8" />
            </Field>
            <Field label={$t('Libellé')}>
              <Input value={settings.goal_label ?? ''} onChange={(e) => set({ goal_label: e.target.value })} placeholder={$t('Objectif')} className="h-8" />
            </Field>
          </div>
          <Field label={$t('Échelle')}>
            <Choice value={settings.y_scale ?? 'linear'} onValueChange={(v) => set({ y_scale: v as 'linear' | 'log' })} options={[{ value: 'linear', label: $t('Linéaire') }, { value: 'log', label: $t('Logarithmique') }]} aria-label={$t('Échelle')} className="w-full" />
          </Field>
          <Toggle label={$t('Valeurs sur les marques')} checked={!!settings.values} onChange={(v) => set({ values: v })} />
          <Toggle label={$t('Légende')} checked={settings.legend !== false} onChange={(v) => set({ legend: v })} />
          <Toggle label={$t('Grille')} checked={settings.grid_lines !== false} onChange={(v) => set({ grid_lines: v })} />
        </>
      ) : null}

      {type === 'pie' ? (
        <>
          <Toggle label={$t('Anneau')} checked={settings.donut !== false} onChange={(v) => set({ donut: v })} />
          <Toggle label={$t('Total au centre')} checked={settings.total !== false} onChange={(v) => set({ total: v })} />
          <Toggle label={$t('Légende')} checked={settings.legend !== false} onChange={(v) => set({ legend: v })} />
          <Field label={$t('Parts au plus (le reste devient « Autres »)')}>
            <Input type="number" min={2} max={8} value={settings.slices_max ?? 7} onChange={(e) => set({ slices_max: Number(e.target.value) })} className="h-8" />
          </Field>
        </>
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

      {['scalar', 'progress', 'gauge', 'bar', 'row', 'line', 'area'].includes(type) ? (
        <Field label={$t('Couleur')}>
          <div className="flex flex-wrap gap-1.5">
            {SERIES_LIGHT.map((c) => (
              <button key={c} type="button" onClick={() => set({ color: settings.color === c ? undefined : c } as VisualizationSettings)} className={cn('size-6 rounded-full border-2', settings.color === c ? 'border-foreground' : 'border-transparent')} style={{ background: c }} aria-label={c} />
            ))}
          </div>
        </Field>
      ) : null}
    </div>
  )
}
