'use client'

import type { ColumnMeta, ColumnPatch, TableMeta } from '@eodia/contracts'
import { Chip } from '@/components/app/look'
import { Choice } from '@/components/ui/choice'
import { Hint } from '@/components/ui/tooltip'
import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { AlertTriangle, ArrowRight, ChevronRight } from 'lucide-react'
import { FingerprintPopover, KeyBadge, SemanticSelect, TypeGlyph, VisibilitySelect, fingerprintLine } from './column-bits'
import { InlineText } from './pickers'

/** The columns a foreign key may point to: those of the source's other tables, keys first. */
export function fkOptions(tables: readonly TableMeta[], tableId: string) {
  const out: { value: string; label: string; render: React.ReactNode }[] = [{ value: '', label: $t('Aucune cible'), render: <span className="text-muted-foreground">{$t('Aucune cible')}</span> }]
  for (const t of tables) {
    if (t.id === tableId) continue
    const cols = [...(t.columns ?? [])].sort((a, b) => Number(b.pk) - Number(a.pk) || a.position - b.position)
    for (const c of cols) {
      out.push({
        value: c.id,
        label: `${t.label} › ${c.label} (${t.name}.${c.name})`,
        render: (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{t.label}</span>
            <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{c.label}</span>
            {c.pk ? <span className="text-[10px] font-bold text-amber-600">PK</span> : null}
          </span>
        ),
      })
    }
  }
  return out
}

export function FkTargetSelect({ column, tables, disabled, onChange, className }: { column: ColumnMeta; tables: readonly TableMeta[]; disabled: boolean; onChange: (columnId: string | null) => void; className?: string }) {
  return (
    <Choice
      value={column.fk?.column ?? ''}
      onValueChange={(v) => onChange(v || null)}
      options={fkOptions(tables, column.table)}
      aria-label={$t('Cible de la clé étrangère')}
      placeholder={$t('Cible…')}
      searchable
      searchPlaceholder={$t('Rechercher une colonne…')}
      disabled={disabled}
      className={className}
    />
  )
}

function ColumnRow({
  column,
  tables,
  active,
  readOnly,
  onSelect,
  onPatch,
}: {
  column: ColumnMeta
  tables: readonly TableMeta[]
  active: boolean
  readOnly: boolean
  onSelect: () => void
  onPatch: (patch: ColumnPatch) => void
}) {
  const removed = column.status === 'removed'
  const disabled = readOnly || removed
  const target = column.fk ? tables.find((t) => t.id === column.fk?.table) : undefined
  const targetCol = target?.columns?.find((c) => c.id === column.fk?.column)
  return (
    // biome-ignore lint/a11y/useSemanticElements: a row holding inputs cannot be a button
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        // Inputs and pickers keep their clicks (portalled menus included); the rest opens the panel.
        if (!e.currentTarget.contains(e.target as Node)) return
        if ((e.target as HTMLElement).closest('input, button, [role="combobox"], textarea, a')) return
        onSelect()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onSelect()
      }}
      className={cn(
        'relative cursor-pointer space-y-2 rounded-xl border px-3 py-2.5 transition-colors',
        active ? 'border-primary/40 bg-muted' : 'hover:bg-muted/50',
        removed && 'opacity-60',
      )}
    >
      {active ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" /> : null}
      <div className="flex items-center gap-2">
        <TypeGlyph type={column.type} />
        <span className={cn('truncate font-mono text-sm font-medium', removed && 'line-through')}>{column.name}</span>
        <span className="truncate font-mono text-xs text-muted-foreground">{column.type}</span>
        <KeyBadge column={column} />
        {column.fk && target ? (
          <span className="hidden min-w-0 items-center gap-1 truncate text-xs text-muted-foreground md:inline-flex">
            <ArrowRight className="size-3 shrink-0" />
            <span className="truncate">
              {target.label}.{targetCol?.label ?? column.fk.name}
            </span>
          </span>
        ) : null}
        {removed ? <Chip color="gray">{$t('retirée')}</Chip> : null}
        {column.type_changed_from ? (
          <Hint label={$t('Type changé à la dernière synchro : {from} → {to}', { from: column.type_changed_from, to: column.type })}>
            <span className="inline-flex h-5 items-center gap-1 rounded bg-amber-100 px-1.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <AlertTriangle className="size-3" /> {$t('type changé')}
            </span>
          </Hint>
        ) : null}
        <span className="flex-1" />
        {column.fingerprint ? <span className="hidden truncate text-[11px] text-muted-foreground xl:inline">{fingerprintLine(column.fingerprint)}</span> : null}
        <FingerprintPopover fp={column.fingerprint} />
        <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', active && 'translate-x-0.5 text-primary')} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <InlineText
          value={column.label}
          onCommit={(label) => onPatch({ label })}
          placeholder={column.name}
          disabled={disabled}
          className="h-8 min-w-40 flex-1 text-sm"
          aria-label={$t('Libellé de {name}', { name: column.name })}
        />
        <SemanticSelect value={column.semantic} onChange={(semantic) => onPatch({ semantic })} disabled={disabled} className="w-44" />
        {column.semantic === 'fk' ? (
          <FkTargetSelect column={column} tables={tables} disabled={disabled} onChange={(fk) => onPatch({ fk })} className="w-56" />
        ) : null}
        <VisibilitySelect value={column.visibility} onChange={(visibility) => onPatch({ visibility })} disabled={disabled} className="w-32" />
      </div>
    </div>
  )
}

export function ColumnList({
  columns,
  tables,
  selected,
  readOnly,
  onSelect,
  onPatch,
}: {
  columns: readonly ColumnMeta[]
  tables: readonly TableMeta[]
  selected: string | null
  readOnly: boolean
  onSelect: (id: string) => void
  onPatch: (id: string, patch: ColumnPatch) => void
}) {
  const active = columns.filter((c) => c.status !== 'removed')
  const removed = columns.filter((c) => c.status === 'removed')
  return (
    <div className="space-y-2">
      {active.map((c) => (
        <ColumnRow key={c.id} column={c} tables={tables} active={selected === c.id} readOnly={readOnly} onSelect={() => onSelect(c.id)} onPatch={(p) => onPatch(c.id, p)} />
      ))}
      {removed.length ? (
        <>
          <div className="px-1 pt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {$t('Colonnes retirées')} <span className="ml-1 font-normal">{removed.length}</span>
          </div>
          <p className="px-1 text-xs text-muted-foreground">{$t('Disparues de la base à la dernière synchro ; leurs métadonnées sont conservées au cas où elles reviendraient.')}</p>
          {removed.map((c) => (
            <ColumnRow key={c.id} column={c} tables={tables} active={selected === c.id} readOnly={readOnly} onSelect={() => onSelect(c.id)} onPatch={(p) => onPatch(c.id, p)} />
          ))}
        </>
      ) : null}
    </div>
  )
}
