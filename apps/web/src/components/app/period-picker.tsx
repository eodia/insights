'use client'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Choice } from '@/components/ui/choice'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { $t } from '@/lib/i18n'
import {
  type Anchor,
  type Bound,
  DEFAULT_ANCHOR,
  DEFAULT_ROLLING,
  PERIOD_GROUPS,
  PERIOD_UNITS,
  type PeriodUnit,
  type Rolling,
  boundExpression,
  periodLabel,
  periodSpanLabel,
  readPeriod,
  resolvePeriod,
  rollingExpression,
  unitName,
} from '@/lib/periods'
import { cn } from '@/lib/utils'
import { ArrowLeftRight, CalendarDays, CalendarRange, Repeat2, X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'

type Mode = 'rolling' | 'bound' | 'dates'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fromIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1)
}

const unitOptions = (count: number) => PERIOD_UNITS.map((u) => ({ value: u, label: unitName(u, count) }))

/**
 * The period of a date filter, as complete as a person needs: shortcuts on the left — the
 * recent days, each calendar period and « to date », what lies before or after —, and three
 * ways to say any other — rolling (« the last 3 complete months », « 2 months ago »), before or
 * after a moment (« before last month »), or chosen days on a calendar. The days it covers read
 * in clear below, as of today. The value stays a date expression (`before:lastmonth`).
 */
export function PeriodPicker({
  value,
  onChange,
  onClear,
}: {
  value: string | null | undefined
  /** A period chosen: a shortcut at once, the others on « Appliquer ». */
  onChange: (expression: string) => void
  onClear?: () => void
}) {
  const currentId = useId()
  const read = useMemo(() => readPeriod(value), [value])
  const [mode, setMode] = useState<Mode>(read?.mode ?? 'rolling')
  const [rolling, setRolling] = useState<Rolling>(read?.mode === 'rolling' ? read.rolling : DEFAULT_ROLLING)
  const [bound, setBound] = useState<Bound>(read?.mode === 'bound' ? read.bound : { relation: 'before', anchor: DEFAULT_ANCHOR })
  const [dates, setDates] = useState<{ from: string; to: string }>(read?.mode === 'dates' ? { from: read.from, to: read.to } : { from: '', to: '' })

  const draft = mode === 'rolling' ? rollingExpression(rolling) : mode === 'bound' ? boundExpression(bound) : dates.from || dates.to ? `${dates.from}~${dates.to}` : ''
  const valid = draft !== '' && resolvePeriod(draft) !== null
  const anchor = bound.anchor
  const setAnchor = (a: Partial<Anchor>) => setBound({ ...bound, anchor: { ...anchor, ...a } })

  return (
    <div className="flex max-h-[min(560px,80vh)] w-[min(760px,calc(100vw-2rem))] text-sm">
      {/* Shortcuts: one click, applied. */}
      <nav aria-label={$t('Raccourcis')} className="w-48 shrink-0 overflow-y-auto border-r p-1.5">
        {PERIOD_GROUPS.map((g) => (
          <div key={g.label} className="pb-1.5">
            <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{$t(g.label)}</div>
            {g.presets.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => onChange(p.value)}
                className={cn(
                  'flex w-full items-center rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent',
                  value === p.value && 'bg-primary/10 font-medium text-primary',
                )}
              >
                {$t(p.label)}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <Segmented
          value={mode}
          onValueChange={setMode}
          options={[
            { value: 'rolling', label: $t('Glissante'), icon: Repeat2, hint: $t('Les N derniers ou prochains jours, mois… ou il y a N périodes') },
            { value: 'bound', label: $t('Avant, après'), icon: ArrowLeftRight, hint: $t('Avant, après, depuis ou jusqu’à un moment') },
            { value: 'dates', label: $t('Dates'), icon: CalendarRange, hint: $t('Des jours précis sur le calendrier') },
          ]}
          aria-label={$t('Façon de dire la période')}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {mode === 'rolling' ? (
            <div className="space-y-3">
              <Segmented
                value={rolling.direction}
                onValueChange={(direction) => setRolling({ ...rolling, direction })}
                options={[
                  { value: 'past', label: $t('Derniers') },
                  { value: 'next', label: $t('Prochains') },
                  { value: 'ago', label: $t('Il y a') },
                ]}
                aria-label={$t('Sens')}
              />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={9999}
                  value={rolling.count}
                  onChange={(e) => setRolling({ ...rolling, count: Number(e.target.value) })}
                  className="h-8 w-24"
                  aria-label={$t('Nombre')}
                />
                <Choice value={rolling.unit} onValueChange={(u) => setRolling({ ...rolling, unit: u as PeriodUnit })} options={unitOptions(rolling.count)} aria-label={$t('Unité')} className="w-40" />
              </div>
              {rolling.direction === 'past' ? (
                <div className="flex items-center gap-2 text-[13px]">
                  <Switch id={currentId} checked={rolling.current} onCheckedChange={(current) => setRolling({ ...rolling, current })} />
                  <label htmlFor={currentId}>{$t('Inclure la période en cours')}</label>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {rolling.direction === 'ago'
                  ? $t('Une seule période entière : le mois d’il y a 2 mois, l’année d’il y a 1 an…')
                  : rolling.direction === 'past'
                    ? rolling.current
                      ? $t('La période en cours compte pour une : « 3 derniers mois » couvre ce mois-ci et les deux d’avant.')
                      : $t('Des périodes complètes, la période en cours laissée de côté.')
                    : $t('À partir de la prochaine période.')}
              </p>
            </div>
          ) : mode === 'bound' ? (
            <div className="space-y-3">
              <Segmented
                value={bound.relation}
                onValueChange={(relation) => setBound({ ...bound, relation })}
                options={[
                  { value: 'before', label: $t('Avant') },
                  { value: 'after', label: $t('Après') },
                  { value: 'since', label: $t('Depuis') },
                  { value: 'until', label: $t('Jusqu’à') },
                ]}
                aria-label={$t('Relation')}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Choice
                  value={anchor.kind}
                  onValueChange={(kind) => setAnchor({ kind: kind as Anchor['kind'] })}
                  options={[
                    { value: 'today', label: $t('Aujourd’hui') },
                    { value: 'this', label: $t('La période en cours') },
                    { value: 'last', label: $t('La période précédente') },
                    { value: 'ago', label: $t('Il y a…') },
                    { value: 'date', label: $t('Une date') },
                  ]}
                  aria-label={$t('Moment')}
                  className="w-52"
                />
                {anchor.kind === 'ago' ? (
                  <Input type="number" min={1} max={9999} value={anchor.count} onChange={(e) => setAnchor({ count: Number(e.target.value) })} className="h-8 w-20" aria-label={$t('Nombre')} />
                ) : null}
                {anchor.kind === 'this' || anchor.kind === 'last' || anchor.kind === 'ago' ? (
                  <Choice value={anchor.unit} onValueChange={(u) => setAnchor({ unit: u as PeriodUnit })} options={unitOptions(anchor.kind === 'ago' ? anchor.count : 1)} aria-label={$t('Unité')} className="w-36" />
                ) : null}
              </div>
              {anchor.kind === 'date' ? (
                <Calendar
                  mode="single"
                  selected={anchor.date ? fromIso(anchor.date) : undefined}
                  defaultMonth={anchor.date ? fromIso(anchor.date) : undefined}
                  onSelect={(d) => d && setAnchor({ date: iso(d) })}
                  className="rounded-lg border"
                />
              ) : null}
              <p className="text-xs text-muted-foreground">
                {bound.relation === 'before'
                  ? $t('Tout ce qui précède le début de ce moment.')
                  : bound.relation === 'after'
                    ? $t('Tout ce qui suit la fin de ce moment.')
                    : bound.relation === 'since'
                      ? $t('Ce moment compris, et tout ce qui le suit.')
                      : $t('Tout ce qui précède, ce moment compris.')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <DateField value={dates.from} onChange={(from) => setDates({ ...dates, from })} label={$t('Début')} placeholder={$t('Sans début')} />
                <span className="text-muted-foreground">→</span>
                <DateField value={dates.to} onChange={(to) => setDates({ ...dates, to })} label={$t('Fin')} placeholder={$t('Sans fin')} />
              </div>
              <Calendar
                mode="range"
                numberOfMonths={2}
                selected={{ from: dates.from ? fromIso(dates.from) : undefined, to: dates.to ? fromIso(dates.to) : undefined }}
                // The past is what one filters on most: last month and this one, when nothing is chosen.
                defaultMonth={dates.from ? fromIso(dates.from) : new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)}
                onSelect={(r) => setDates({ from: r?.from ? iso(r.from) : '', to: r?.to ? iso(r.to) : '' })}
                className="rounded-lg border"
              />
            </div>
          )}
        </div>

        {/* What the period covers, as of today; then apply. */}
        <div className="flex items-center gap-3 border-t pt-3">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{valid ? periodLabel(draft) : $t('Période incomplète')}</div>
            <div className="truncate text-xs text-muted-foreground">{valid ? periodSpanLabel(draft) : $t('Précisez au moins un jour.')}</div>
          </div>
          {onClear && value ? (
            <Button variant="ghost" size="sm" onClick={onClear}>
              {$t('Effacer')}
            </Button>
          ) : null}
          <Button size="sm" disabled={!valid} onClick={() => onChange(draft)}>
            {$t('Appliquer')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** A day typed or cleared — empty is an open side. */
function DateField({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder: string }) {
  return (
    <div className="relative flex-1">
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder={placeholder} className={cn('h-8 pr-7', !value && 'text-muted-foreground')} />
      {value ? (
        <button type="button" onClick={() => onChange('')} aria-label={$t('Effacer {what}', { what: label })} className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent">
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}
