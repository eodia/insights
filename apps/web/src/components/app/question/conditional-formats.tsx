'use client'

import { type CellScale, type ColorRule, RULE_ICON_NAMES, type ResultColumn, SCALE_PALETTES, type ScalePalette } from '@eodia/contracts'
import { LookIcon } from '@/components/app/look'
import { IconPicker } from '@/components/app/structure/pickers'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Hint } from '@/components/ui/tooltip'
import { $t, msg } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Paintbrush, Plus, Smile, Trash2, Type } from 'lucide-react'

const OPS: Record<ColorRule['op'], string> = {
  gt: msg('supérieur à'),
  gte: msg('au moins'),
  lt: msg('inférieur à'),
  lte: msg('au plus'),
  eq: msg('égal à'),
  ne: msg('différent de'),
  between: msg('entre'),
  contains: msg('contient'),
}
const measurable = (c: ResultColumn | undefined) => !!c && c.type === 'number' && !c.unit
const COLORS = ['#16a34a', '#dc2626', '#f59e0b', '#2563eb', '#7c3aed', '#71717a'] as const
const PALETTES: Record<ScalePalette, string> = { green_red: msg('Vert → rouge'), red_green: msg('Rouge → vert'), blue: msg('Bleu') }

const gradient = (p: ScalePalette) => `linear-gradient(90deg, ${SCALE_PALETTES[p].join(', ')})`

/**
 * A table's conditional formatting: rules (a colour, a fill, a pictogram when a value meets a
 * test — against a value written, another column of the row, or a variable of the question)
 * and colour scales (cells coloured from the smallest value to the largest).
 */
export function ConditionalFormats({
  columns,
  rules,
  scales,
  variables = [],
  onRules,
  onScales,
}: {
  columns: readonly ResultColumn[]
  rules: readonly ColorRule[]
  scales: readonly CellScale[]
  /** The question's variables, which a rule can compare to. */
  variables?: readonly string[]
  onRules: (r: ColorRule[]) => void
  onScales: (s: CellScale[]) => void
}) {
  const first = columns[0]?.name
  const numbers = columns.filter(measurable)
  const setRule = (i: number, patch: Partial<ColorRule>) => onRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const setScale = (i: number, patch: Partial<CellScale>) => onScales(scales.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const options = columns.map((c) => ({ value: c.name, label: c.label }))
  const numberOptions = numbers.map((c) => ({ value: c.name, label: c.label }))
  if (!first) return <p className="text-xs text-muted-foreground">{$t('Aucune colonne à mettre en forme.')}</p>
  return (
    <div className="space-y-2">
      {rules.map((r, i) => {
        const column = columns.find((c) => c.name === (r.column ?? first))
        const numeric = measurable(column)
        const source = r.against ? ('column' in r.against ? 'column' : 'variable') : 'value'
        // A text is equal, different or contains; a number is compared; between, only two values written.
        const ops = (Object.keys(OPS) as ColorRule['op'][]).filter((o) => (numeric ? o !== 'contains' : o === 'eq' || o === 'ne' || o === 'contains') && (o !== 'between' || source === 'value'))
        return (
        <div key={`rule-${i}`} className="space-y-1.5 rounded-lg border p-2">
          <div className="flex items-center gap-1.5">
            <Choice
              value={r.column ?? first}
              onValueChange={(v) => {
                // A text column keeps only what a text can be: equal, different, contained.
                const text = !measurable(columns.find((c) => c.name === v))
                setRule(i, { column: v, ...(text && !['eq', 'ne', 'contains'].includes(r.op) ? { op: 'eq', value: '' } : {}), ...(!text && r.op === 'contains' ? { op: 'eq' } : {}) })
              }}
              aria-label={$t('Colonne')}
              className="min-w-0 flex-1"
              options={options}
            />
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => onRules(rules.filter((_, j) => j !== i))} aria-label={$t('Retirer la règle')}>
              <Trash2 className="text-destructive" />
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <Choice value={ops.includes(r.op) ? r.op : 'eq'} onValueChange={(v) => setRule(i, { op: v as ColorRule['op'] })} aria-label={$t('Comparaison')} className="min-w-0 flex-1" options={ops.map((o) => ({ value: o, label: $t(OPS[o]) }))} />
            <Choice
              value={source}
              onValueChange={(v) => {
                if (v === 'value') {
                  const { against: _gone, ...rest } = r
                  onRules(rules.map((x, j) => (j === i ? rest : x)))
                } else if (v === 'column') {
                  const other = (numeric ? numbers : columns).find((c) => c.name !== column?.name) ?? column
                  if (other) setRule(i, { against: { column: other.name }, ...(r.op === 'between' ? { op: 'eq' } : {}) })
                } else if (variables[0]) {
                  setRule(i, { against: { variable: variables[0] }, ...(r.op === 'between' ? { op: 'eq' } : {}) })
                }
              }}
              aria-label={$t('Comparé à')}
              className="w-32"
              options={[
                { value: 'value', label: $t('une valeur') },
                { value: 'column', label: $t('une colonne') },
                ...(variables.length ? [{ value: 'variable', label: $t('une variable') }] : []),
              ]}
            />
          </div>
          <div className="flex items-center gap-1.5">
            {r.against && 'column' in r.against ? (
              <Choice value={r.against.column} onValueChange={(v) => setRule(i, { against: { column: v } })} aria-label={$t('Colonne comparée')} className="min-w-0 flex-1" options={numeric ? numberOptions : options} />
            ) : r.against && 'variable' in r.against ? (
              <Choice value={r.against.variable} onValueChange={(v) => setRule(i, { against: { variable: v } })} aria-label={$t('Variable comparée')} className="min-w-0 flex-1" options={variables.map((v) => ({ value: v, label: `{{${v}}}` }))} />
            ) : numeric ? (
              <>
                <Input type="number" value={typeof r.value === 'number' && Number.isFinite(r.value) ? r.value : ''} onChange={(e) => setRule(i, { value: Number(e.target.value) })} className="h-8 min-w-0 flex-1" aria-label={$t('Valeur')} />
                {r.op === 'between' ? <Input type="number" value={r.value2 ?? ''} onChange={(e) => setRule(i, { value2: Number(e.target.value) })} className="h-8 min-w-0 flex-1" aria-label={$t('et')} /> : null}
              </>
            ) : (
              <Input value={String(r.value ?? '')} onChange={(e) => setRule(i, { value: e.target.value })} placeholder={$t('Texte')} className="h-8 min-w-0 flex-1" aria-label={$t('Valeur')} />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setRule(i, { color: c })} className={cn('size-5 rounded-full border-2', r.color === c ? 'border-foreground' : 'border-transparent')} style={{ background: c }} aria-label={c} />
            ))}
            <span className="mx-1 h-4 w-px bg-border" />
            <Hint label={$t('Colorer le texte')}>
              <button type="button" onClick={() => setRule(i, { style: 'text' })} className={cn('rounded p-1', r.style !== 'fill' ? 'bg-accent text-foreground' : 'text-muted-foreground')} aria-label={$t('Colorer le texte')}>
                <Type className="size-3.5" />
              </button>
            </Hint>
            <Hint label={$t('Remplir la cellule')}>
              <button type="button" onClick={() => setRule(i, { style: 'fill' })} className={cn('rounded p-1', r.style === 'fill' ? 'bg-accent text-foreground' : 'text-muted-foreground')} aria-label={$t('Remplir la cellule')}>
                <Paintbrush className="size-3.5" />
              </button>
            </Hint>
            <span className="mx-1 h-4 w-px bg-border" />
            {/* Any pictogram: lucide's, an emoji, an image — or none. */}
            <IconPicker
              value={r.icon ? (RULE_ICON_NAMES[r.icon] ?? r.icon) : null}
              onChange={(icon) => {
                const { icon: _gone, ...rest } = r
                onRules(rules.map((x, j) => (j === i ? (icon ? { ...r, icon } : rest) : x)))
              }}
              trigger={
                <button type="button" className="inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={$t('Pictogramme')}>
                  {r.icon ? <span style={{ color: r.color }} className="inline-flex"><LookIcon name={RULE_ICON_NAMES[r.icon] ?? r.icon} className="size-3.5" /></span> : <Smile className="size-3.5" />}
                  {r.icon ? null : $t('Pictogramme')}
                </button>
              }
            />
          </div>
          <label className="flex cursor-pointer items-center justify-between text-xs text-muted-foreground">
            {$t('Toute la ligne')}
            <Switch checked={!!r.row} onCheckedChange={(on) => setRule(i, { row: on })} />
          </label>
        </div>
        )
      })}
      {scales.map((sc, i) => (
        <div key={`scale-${i}`} className="space-y-1.5 rounded-lg border p-2">
          <div className="flex items-center gap-1.5">
            <Choice value={sc.column} onValueChange={(v) => setScale(i, { column: v })} aria-label={$t('Colonne')} className="min-w-0 flex-1" options={numberOptions} />
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => onScales(scales.filter((_, j) => j !== i))} aria-label={$t('Retirer l’échelle')}>
              <Trash2 className="text-destructive" />
            </Button>
          </div>
          <div className="flex gap-1.5">
            {(Object.keys(SCALE_PALETTES) as ScalePalette[]).map((p) => (
              <Hint key={p} label={$t(PALETTES[p])}>
                <button type="button" onClick={() => setScale(i, { palette: p })} className={cn('h-5 flex-1 rounded border-2', sc.palette === p ? 'border-foreground' : 'border-transparent')} style={{ background: gradient(p) }} aria-label={$t(PALETTES[p])} />
              </Hint>
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-1.5">
        <Button type="button" size="sm" variant="outline" onClick={() => onRules([...rules, numbers[0] ? { column: numbers[0].name, op: 'lt', value: 0, color: COLORS[1], style: 'text' } : { column: first, op: 'eq', value: '', color: COLORS[1], style: 'text' }])}>
          <Plus /> {$t('Règle')}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!numbers[0]} onClick={() => numbers[0] && onScales([...scales, { column: numbers[0].name, palette: 'red_green' }])}>
          <Plus /> {$t('Échelle de couleur')}
        </Button>
      </div>
    </div>
  )
}
