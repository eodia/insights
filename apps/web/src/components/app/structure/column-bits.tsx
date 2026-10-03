'use client'

import type { ColumnMeta, Fingerprint, Visibility } from '@eodia/contracts'
import { SEMANTIC_GROUPS, type SemanticType, VISIBILITIES, kindOfTrinoType } from '@eodia/contracts'
import { Choice } from '@/components/ui/choice'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Hint } from '@/components/ui/tooltip'
import { formatCount } from '@/lib/format'
import { $t, $tp, intlLocale, msg } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Activity, Binary, Braces, Calendar, CalendarClock, Clock, Hash, KeyRound, Link2, ToggleLeft, Type } from 'lucide-react'

const NONE = 'semantic:none'

/**
 * The words of `@eodia/contracts` (`SEMANTIC_GROUPS`, `SEMANTIC_LABELS`, `VISIBILITY_LABELS`),
 * marked here for the catalog: the same French, so `$t` on the contracts' value finds them too.
 */
const SEMANTIC_GROUP_TEXT: Record<(typeof SEMANTIC_GROUPS)[number]['key'], string> = {
  identity: msg('Identité'),
  category: msg('Catégorie'),
  text: msg('Texte'),
  geo: msg('Géographie'),
  time: msg('Temps'),
  measure: msg('Mesure'),
}

export const SEMANTIC_TEXT: Record<SemanticType, string> = {
  pk: msg('Clé primaire'),
  fk: msg('Clé étrangère'),
  entity_name: msg("Nom d'entité"),
  title: msg('Titre'),
  category: msg('Catégorie'),
  status: msg('Statut'),
  business_boolean: msg('Booléen métier'),
  description: msg('Description'),
  comment: msg('Commentaire'),
  email: msg('E-mail'),
  url: msg('URL'),
  image_url: msg("URL d'image"),
  avatar_url: msg('Avatar'),
  phone: msg('Téléphone'),
  json: msg('JSON'),
  country: msg('Pays'),
  region: msg('Région'),
  city: msg('Ville'),
  zip: msg('Code postal'),
  address: msg('Adresse'),
  latitude: msg('Latitude'),
  longitude: msg('Longitude'),
  created_at: msg('Date de création'),
  updated_at: msg('Date de mise à jour'),
  event_at: msg("Date d'événement"),
  birth_date: msg('Date de naissance'),
  cancelled_at: msg("Date d'annulation"),
  amount: msg('Montant'),
  price: msg('Prix'),
  cost: msg('Coût'),
  discount: msg('Remise'),
  percentage: msg('Pourcentage'),
  quantity: msg('Quantité'),
  score: msg('Score'),
  rating: msg('Note'),
  duration: msg('Durée'),
}

export const VISIBILITY_TEXT: Record<Visibility, string> = {
  normal: msg('Normale'),
  hidden: msg('Masquée'),
  technical: msg('Technique'),
}

/** The semantic type, chosen in the groups of the plan: Identité, Catégorie, Texte… */
export function SemanticSelect({ value, onChange, disabled, className }: { value: string | null; onChange: (v: SemanticType | null) => void; disabled?: boolean; className?: string }) {
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : (v as SemanticType))} disabled={disabled}>
      <SelectTrigger aria-label={$t('Type sémantique')} className={cn('h-8 min-w-0 px-2.5 text-sm [&>span]:min-w-0 [&>span]:truncate', !value && 'text-muted-foreground', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value={NONE}>{$t('Aucun type')}</SelectItem>
        {SEMANTIC_GROUPS.map((g) => (
          <SelectGroup key={g.key}>
            <SelectPrimitive.Label className="px-2 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{$t(SEMANTIC_GROUP_TEXT[g.key])}</SelectPrimitive.Label>
            {g.types.map((t) => (
              <SelectItem key={t} value={t}>
                {$t(SEMANTIC_TEXT[t])}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

export function VisibilitySelect({ value, onChange, disabled, className }: { value: Visibility; onChange: (v: Visibility) => void; disabled?: boolean; className?: string }) {
  return (
    <Choice
      value={value}
      onValueChange={(v) => onChange(v as Visibility)}
      options={VISIBILITIES.map((v) => ({ value: v, label: $t(VISIBILITY_TEXT[v]) }))}
      aria-label={$t('Visibilité')}
      disabled={disabled ?? false}
      className={className}
    />
  )
}

/** A small glyph for the kind of a Trino type. */
export function TypeGlyph({ type, className }: { type: string; className?: string }) {
  const kind = kindOfTrinoType(type)
  const Icon = { number: Hash, text: Type, date: Calendar, datetime: CalendarClock, time: Clock, boolean: ToggleLeft, json: Braces, other: Binary }[kind]
  return <Icon className={cn('size-3.5 shrink-0 text-muted-foreground', className)} />
}

export function KeyBadge({ column }: { column: ColumnMeta }) {
  if (column.pk)
    return (
      <Hint label={$t('Clé primaire')}>
        <span className="inline-flex h-5 items-center gap-0.5 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <KeyRound className="size-3" /> PK
        </span>
      </Hint>
    )
  if (column.fk || column.semantic === 'fk')
    return (
      <Hint label={$t('Clé étrangère')}>
        <span className="inline-flex h-5 items-center gap-0.5 rounded bg-sky-100 px-1 text-[10px] font-bold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
          <Link2 className="size-3" /> FK
        </span>
      </Hint>
    )
  return null
}

const percent = (pct: number) => new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 1 }).format(pct / 100)

const short = (v: string | number | null | undefined) => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return formatCount(Math.round(v * 100) / 100)
  return v.length > 24 ? `${v.slice(0, 24)}…` : v
}

export function fingerprintLine(fp: Fingerprint): string {
  const nulls = fp.sample ? (fp.nulls / fp.sample) * 100 : 0
  return $tp(fp.distinct, '{count} distincte · {pct} nulls', '{count} distinctes · {pct} nulls', { pct: percent(nulls) })
}

/** What the sync measured: distinct values, nulls, min and max, in a popover. */
export function FingerprintPopover({ fp }: { fp: Fingerprint | null }) {
  if (!fp) return <span className="inline-flex size-7" />
  const nullPct = fp.sample ? (fp.nulls / fp.sample) * 100 : 0
  return (
    <Popover>
      <Hint label={$t('Empreinte')}>
        <PopoverTrigger asChild>
          <button type="button" onClick={(e) => e.stopPropagation()} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={$t('Empreinte')}>
            <Activity className="size-4" />
          </button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="end" className="w-64" onClick={(e) => e.stopPropagation()}>
        <FingerprintDetails fp={fp} nullPct={nullPct} />
      </PopoverContent>
    </Popover>
  )
}

export function FingerprintDetails({ fp, nullPct = fp.sample ? (fp.nulls / fp.sample) * 100 : 0 }: { fp: Fingerprint; nullPct?: number }) {
  const rows: [string, string][] = [
    [$t('Échantillon'), $tp(fp.sample, '{count} ligne', '{count} lignes')],
    [$t('Valeurs distinctes'), formatCount(fp.distinct)],
    [$t('Nulls'), `${formatCount(fp.nulls)} (${percent(nullPct)})`],
    ...(fp.min !== undefined && fp.min !== null ? [[$t('Minimum'), short(fp.min)] as [string, string]] : []),
    ...(fp.max !== undefined && fp.max !== null ? [[$t('Maximum'), short(fp.max)] as [string, string]] : []),
    ...(fp.avg !== undefined && fp.avg !== null ? [[$t('Moyenne'), short(fp.avg)] as [string, string]] : []),
    ...(fp.avg_length !== undefined && fp.avg_length !== null ? [[$t('Longueur moyenne'), short(fp.avg_length)] as [string, string]] : []),
  ]
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{$t('Empreinte')}</div>
      <dl className="space-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="flex-1 text-muted-foreground">{k}</dt>
            <dd className="font-mono text-xs">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, nullPct)}%` }} />
      </div>
      <div className="text-[11px] text-muted-foreground">{$t('Part de valeurs nulles')}</div>
    </div>
  )
}
