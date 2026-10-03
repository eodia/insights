'use client'

import type { ColumnFormat, ColumnMeta } from '@eodia/contracts'
import { kindOfTrinoType } from '@eodia/contracts'
import { Choice } from '@/components/ui/choice'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { formatValue } from '@/lib/format'
import { $t } from '@/lib/i18n'
import { Clock, Eye, EyeOff, Timer } from 'lucide-react'
import { Segmented } from '@/components/ui/segmented'
import { useEffect, useId, useRef, useState } from 'react'

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

const NUMBER_STYLE_LABELS = {
  '': 'Automatique (selon le type sémantique)',
  integer: 'Entier',
  decimal: 'Décimal',
  percent: 'Pourcentage',
  currency: 'Devise',
  duration: 'Durée',
  rating: 'Note',
  compact: 'Compact (1,2 k)',
} as const

const DATE_STYLE_LABELS = {
  default: 'Par défaut (3 mars 2026)',
  short: 'Court (03/03/2026)',
  long: 'Long (3 mars 2026)',
  relative: 'Relative (il y a 2 jours)',
  custom: 'Motif personnalisé',
} as const

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'JPY', 'CNY', 'XOF', 'MAD']

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

/** Values to preview a format on: what the fingerprint measured, or plausible stand-ins. */
function samples(column: ColumnMeta, kind: string): unknown[] {
  const fp = column.fingerprint
  if (kind === 'number') {
    const out = [fp?.min, fp?.avg, fp?.max].filter((v): v is number | string => v !== null && v !== undefined).map(Number).filter(Number.isFinite).map((n) => Math.round(n * 100) / 100)
    return out.length ? [...new Set(out)] : [0.4215, 1234.5, 98765.432]
  }
  if (kind === 'date' || kind === 'datetime') {
    const out = [fp?.min, fp?.max].filter((v): v is string => typeof v === 'string')
    const now = new Date(Date.now() - 2 * 86_400_000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const recent = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    return [...out, recent]
  }
  return []
}

/**
 * The display format of a column — numbers or dates — with a live preview through the very
 * function every table and chart formats with. Saves itself shortly after each change.
 */
export function FormatEditor({ column, disabled, onSave }: { column: ColumnMeta; disabled: boolean; onSave: (format: ColumnFormat) => Promise<unknown> }) {
  const kind = kindOfTrinoType(column.type)
  const [draft, setDraft] = useState<ColumnFormat>(column.format ?? {})
  const saved = useRef(JSON.stringify(column.format ?? {}))
  const lastId = useRef(column.id)
  const ids = { decimals: useId(), prefix: useId(), suffix: useId(), pattern: useId(), tz: useId(), rating: useId() }

  const formatJson = JSON.stringify(column.format ?? {})
  useEffect(() => {
    // Only when the column or its saved format really changes — not on every refetch.
    if (formatJson === saved.current && column.id === lastId.current) return
    lastId.current = column.id
    saved.current = formatJson
    setDraft(JSON.parse(formatJson) as ColumnFormat)
  }, [column.id, formatJson])

  useEffect(() => {
    const json = JSON.stringify(draft)
    if (json === saved.current || disabled) return
    const t = setTimeout(() => {
      saved.current = json
      void onSave(draft).catch(() => {
        saved.current = ''
      })
    }, 600)
    return () => clearTimeout(t)
  }, [draft, disabled, onSave])

  const set = <K extends keyof ColumnFormat>(key: K, value: ColumnFormat[K] | undefined) =>
    setDraft((f) => {
      const next: Mutable<ColumnFormat> = { ...f }
      if (value === undefined || value === '') delete next[key]
      else next[key] = value as Mutable<ColumnFormat>[K]
      return next
    })

  if (kind !== 'number' && kind !== 'date' && kind !== 'datetime') {
    return <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">{$t('Pas de format d’affichage pour une colonne de type {type}.', { type: column.type })}</p>
  }

  const preview = samples(column, kind).map((v) => ({
    raw: String(v),
    shown: formatValue(v, { type: kind, semantic: column.semantic ?? undefined, format: draft }),
  }))

  return (
    <div className="space-y-4">
      {kind === 'number' ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Row label={$t('Style')}>
              <Choice
                value={draft.number_style ?? ''}
                onValueChange={(v) => set('number_style', (v || undefined) as ColumnFormat['number_style'])}
                options={Object.entries(NUMBER_STYLE_LABELS).map(([value, label]) => ({ value, label: $t(label) }))}
                aria-label={$t('Style de nombre')}
                size="default"
                className="w-full"
                disabled={disabled}
                searchable={false}
              />
            </Row>
          </div>
          {draft.number_style === 'currency' ? (
            <Row label={$t('Devise')}>
              <Choice
                value={draft.currency ?? 'EUR'}
                onValueChange={(v) => set('currency', v)}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                aria-label={$t('Devise')}
                size="default"
                className="w-full"
                disabled={disabled}
              />
            </Row>
          ) : null}
          {draft.number_style !== 'duration' && draft.number_style !== 'compact' ? (
            <Row label={$t('Décimales')} htmlFor={ids.decimals}>
              <Input
                id={ids.decimals}
                type="number"
                min={0}
                max={10}
                value={draft.decimals ?? ''}
                placeholder={$t('Auto')}
                onChange={(e) => set('decimals', e.target.value === '' ? undefined : Math.max(0, Math.min(10, Math.trunc(Number(e.target.value)))))}
                disabled={disabled}
              />
            </Row>
          ) : null}
          {draft.number_style === 'duration' ? (
            <Row label={$t('Unité stockée')}>
              <Choice
                value={draft.duration_unit ?? 's'}
                onValueChange={(v) => set('duration_unit', v as ColumnFormat['duration_unit'])}
                options={[
                  { value: 'ms', label: $t('Millisecondes') },
                  { value: 's', label: $t('Secondes') },
                  { value: 'min', label: $t('Minutes') },
                  { value: 'h', label: $t('Heures') },
                  { value: 'd', label: $t('Jours') },
                ]}
                aria-label={$t('Unité de durée')}
                size="default"
                className="w-full"
                disabled={disabled}
              />
            </Row>
          ) : null}
          {draft.number_style === 'rating' ? (
            <Row label={$t('Note maximale')} htmlFor={ids.rating}>
              <Input
                id={ids.rating}
                type="number"
                min={1}
                max={10}
                value={draft.rating_max ?? 5}
                onChange={(e) => set('rating_max', Math.max(1, Math.min(10, Math.trunc(Number(e.target.value) || 5))))}
                disabled={disabled}
              />
            </Row>
          ) : null}
          <Row label={$t('Préfixe')} htmlFor={ids.prefix}>
            <Input id={ids.prefix} value={draft.prefix ?? ''} onChange={(e) => set('prefix', e.target.value)} placeholder="≈ " maxLength={20} disabled={disabled} />
          </Row>
          <Row label={$t('Suffixe')} htmlFor={ids.suffix}>
            <Input id={ids.suffix} value={draft.suffix ?? ''} onChange={(e) => set('suffix', e.target.value)} placeholder=" kg" maxLength={20} disabled={disabled} />
          </Row>
          <div className="col-span-2 flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <span className="text-sm">{$t('Séparateurs de milliers')}</span>
            <Switch aria-label={$t('Séparateurs de milliers')} checked={draft.separators !== false} onCheckedChange={(on) => set('separators', on ? undefined : false)} disabled={disabled} />
          </div>
          {draft.number_style === 'percent' ? (
            <div className="col-span-2 flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm">{$t('Stocké en ratio')}</span>
                <span className="block text-xs text-muted-foreground">{$t('0,42 signifie 42 % ; désactivé : 42 signifie 42 %.')}</span>
              </span>
              <Switch aria-label={$t('Stocké en ratio')} checked={draft.percent_ratio !== false} onCheckedChange={(on) => set('percent_ratio', on)} disabled={disabled} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Row label={$t('Style de date')}>
              <Choice
                value={draft.date_style ?? 'default'}
                onValueChange={(v) => set('date_style', v === 'default' ? undefined : (v as ColumnFormat['date_style']))}
                options={Object.entries(DATE_STYLE_LABELS).map(([value, label]) => ({ value, label: $t(label) }))}
                aria-label={$t('Style de date')}
                size="default"
                className="w-full"
                disabled={disabled}
              />
            </Row>
          </div>
          {draft.date_style === 'custom' ? (
            <div className="col-span-2">
              <Row label={$t('Motif')} htmlFor={ids.pattern}>
                <Input id={ids.pattern} value={draft.date_pattern ?? ''} onChange={(e) => set('date_pattern', e.target.value)} placeholder="dd/MM/yyyy HH:mm" className="font-mono" maxLength={60} disabled={disabled} />
              </Row>
            </div>
          ) : null}
          {kind === 'datetime' ? (
            <Row label={$t('Heure')}>
              <Segmented
                value={draft.time ?? 'minutes'}
                onValueChange={(v) => set('time', v === 'minutes' ? undefined : (v as ColumnFormat['time']))}
                options={[
                  { value: 'none', label: $t('Masquée'), icon: EyeOff },
                  { value: 'minutes', label: $t('hh:mm'), icon: Clock, hint: $t('Heures et minutes') },
                  { value: 'seconds', label: $t('hh:mm:ss'), icon: Timer, hint: $t('Avec les secondes') },
                ]}
                aria-label={$t('Heure')}
                className="w-full"
              />
            </Row>
          ) : null}
          <Row label={$t('Granularité par défaut')}>
            <Choice
              value={draft.default_unit ?? ''}
              onValueChange={(v) => set('default_unit', (v || undefined) as ColumnFormat['default_unit'])}
              options={[
                { value: '', label: $t('Automatique') },
                { value: 'day', label: $t('Jour') },
                { value: 'week', label: $t('Semaine') },
                { value: 'month', label: $t('Mois') },
                { value: 'quarter', label: $t('Trimestre') },
                { value: 'year', label: $t('Année') },
              ]}
              aria-label={$t('Granularité par défaut')}
              size="default"
              className="w-full"
              disabled={disabled}
            />
          </Row>
          <div className="col-span-2">
            <Row label={$t('Fuseau horaire')} htmlFor={ids.tz}>
              <Input id={ids.tz} value={draft.timezone ?? ''} onChange={(e) => set('timezone', e.target.value)} placeholder={$t('Celui de la source (Europe/Paris…)')} maxLength={60} disabled={disabled} />
            </Row>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-muted/30 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Eye className="size-3.5" /> {$t('Aperçu')}
        </div>
        <div className="space-y-1">
          {preview.map((p) => (
            <div key={p.raw} className="flex items-center gap-3 text-sm">
              <span className="w-1/2 truncate font-mono text-xs text-muted-foreground">{p.raw}</span>
              <span className="font-medium">{p.shown}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
