'use client'

import type { ResultColumn, VisualizationType } from '@eodia/contracts'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { $t, msg } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { GripVertical, Plus, X } from 'lucide-react'
import { useState } from 'react'

type Zone = 'dims' | 'metrics'

/**
 * What each place stands for in a chart of this type: the first dimension is the axis, the
 * second the series… A place beyond the list is not drawn. `max` is how many it takes.
 */
const DIM_ROLES: Partial<Record<VisualizationType, readonly string[]>> = {
  bar: [msg('Axe'), msg('Séries')],
  row: [msg('Axe'), msg('Séries')],
  line: [msg('Axe'), msg('Séries')],
  area: [msg('Axe'), msg('Séries')],
  combo: [msg('Axe'), msg('Séries')],
  polar: [msg('Catégories'), msg('Séries')],
  pie: [msg('Parts'), msg('Anneau 2'), msg('Anneau 3')],
  treemap: [msg('Niveau 1'), msg('Niveau 2'), msg('Niveau 3')],
  sankey: [msg('Étape 1'), msg('Étape 2'), msg('Étape 3'), msg('Étape 4'), msg('Étape 5')],
  funnel: [msg('Étapes')],
  calendar: [msg('Date')],
  trend: [msg('Date')],
  candlestick: [msg('Date')],
  bar_race: [msg('Temps'), msg('Concurrents')],
  line_race: [msg('Temps'), msg('Concurrents')],
  scatter: [msg('Points')],
  bubble: [msg('Bulles')],
}
const METRIC_ROLES: Partial<Record<VisualizationType, readonly string[]>> = {
  candlestick: [msg('Ouverture'), msg('Haut'), msg('Bas'), msg('Clôture')],
  scatter: [msg('Axe horizontal'), msg('Axe vertical')],
  bubble: [msg('Axe horizontal'), msg('Axe vertical'), msg('Taille')],
  pie: [msg('Valeur')],
  funnel: [msg('Valeur')],
  treemap: [msg('Valeur')],
  sankey: [msg('Valeur')],
  calendar: [msg('Valeur')],
  trend: [msg('Valeur')],
}

const measurable = (c: ResultColumn) => c.type === 'number' && !c.unit

/**
 * The columns a chart draws, each in its place — axis, series, measures —, moved by dragging
 * from one place to another or from the other columns; a click on one of those puts it where
 * it most likely belongs.
 */
export function DataRoles({
  type,
  columns,
  dims,
  metrics,
  onChange,
}: {
  type: VisualizationType
  columns: readonly ResultColumn[]
  dims: readonly string[]
  metrics: readonly string[]
  onChange: (next: { dimensions: string[]; metrics: string[] }) => void
}) {
  const [over, setOver] = useState<{ zone: Zone; at: number } | null>(null)
  const byName = new Map(columns.map((c) => [c.name, c]))
  const used = new Set([...dims, ...metrics])
  const others = columns.filter((c) => !used.has(c.name))
  const dimRoles = DIM_ROLES[type] ?? [msg('Axe'), msg('Séries')]
  const metricRoles = METRIC_ROLES[type]
  const lists: Record<Zone, readonly string[]> = { dims, metrics }

  /** `name` put at `at` in `zone`, taken from wherever it was. */
  const place = (name: string, zone: Zone, at: number) => {
    const column = byName.get(name)
    if (!column || (zone === 'metrics' && !measurable(column))) return
    const next: Record<Zone, string[]> = { dims: [...dims], metrics: [...metrics] }
    for (const z of ['dims', 'metrics'] as const) {
      const i = next[z].indexOf(name)
      if (i < 0) continue
      next[z].splice(i, 1)
      if (z === zone && i < at) at -= 1
    }
    next[zone].splice(Math.min(at, next[zone].length), 0, name)
    onChange({ dimensions: next.dims, metrics: next.metrics })
  }
  const remove = (name: string) => onChange({ dimensions: dims.filter((n) => n !== name), metrics: metrics.filter((n) => n !== name) })
  /** Where a column most likely goes: a number among the measures, anything else among the dimensions. */
  const add = (c: ResultColumn) => place(c.name, measurable(c) && dims.length > 0 ? 'metrics' : 'dims', Number.POSITIVE_INFINITY)

  const dragProps = (name: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData('text/x-eodia-column', name)
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragEnd: () => setOver(null),
  })
  const dropProps = (zone: Zone, at: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('text/x-eodia-column')) return
      e.preventDefault()
      // The nearest place answers, not the zone around it as well.
      e.stopPropagation()
      if (over?.zone !== zone || over.at !== at) setOver({ zone, at })
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setOver(null)
      const name = e.dataTransfer.getData('text/x-eodia-column')
      if (name) place(name, zone, at)
    },
  })

  const zone = (z: Zone, title: string, roles: readonly string[] | undefined, candidates: readonly ResultColumn[]) => {
    const list = lists[z]
    // Every place taken: no more to add (measures without named places take any number).
    const full = roles !== undefined && list.length >= roles.length
    return (
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className="space-y-1 rounded-lg border border-dashed p-1" {...dropProps(z, list.length)}>
          {list.map((name, i) => {
            const c = byName.get(name)
            const role = roles?.[i]
            return (
              <div key={name} {...dropProps(z, i)} className={cn('relative', over?.zone === z && over.at === i && 'before:absolute before:inset-x-1 before:-top-[3px] before:h-0.5 before:rounded before:bg-primary')}>
                <div
                  {...dragProps(name)}
                  className={cn('group flex h-8 cursor-grab items-center gap-1.5 rounded-md border bg-background pr-1 pl-1 text-[13px] shadow-xs active:cursor-grabbing', !role && roles && 'opacity-50')}
                >
                  <GripVertical className="size-3.5 shrink-0 text-muted-foreground/60" />
                  <span className="w-20 shrink-0 truncate text-[11px] text-muted-foreground">{role ? $t(role) : roles ? $t('Non utilisée') : ''}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{c?.label ?? name}</span>
                  <button type="button" onClick={() => remove(name)} className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100" aria-label={$t('Retirer « {column} »', { column: c?.label ?? name })}>
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
          {full ? null : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={candidates.length === 0}
                  className={cn(
                    'flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50',
                    over?.zone === z && over.at === list.length && 'bg-primary/5 text-primary',
                  )}
                >
                  <Plus className="size-3.5" />
                  {roles?.[list.length] ? $t('{role} : glisser ou choisir une colonne', { role: $t(roles[list.length] as string) }) : $t('Glisser ou choisir une colonne')}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
                {candidates.map((c) => (
                  <DropdownMenuItem key={c.name} onSelect={() => place(c.name, z, list.length)}>
                    {c.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {zone('dims', $t('Dimensions'), dimRoles, others)}
      {zone('metrics', $t('Mesures'), metricRoles, others.filter(measurable))}
      {others.length ? (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">{$t('Autres colonnes')}</div>
          <div className="flex flex-wrap gap-1">
            {others.map((c) => (
              <button
                key={c.name}
                type="button"
                {...dragProps(c.name)}
                onClick={() => add(c)}
                className="inline-flex h-7 cursor-grab items-center gap-1 rounded-full border bg-muted/40 px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground active:cursor-grabbing"
              >
                <Plus className="size-3" />
                {c.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">{$t('Glissez une colonne à sa place, ou cliquez pour l’ajouter.')}</p>
        </div>
      ) : null}
    </div>
  )
}
