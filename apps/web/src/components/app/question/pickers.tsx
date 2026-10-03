'use client'

import type { ColumnValue, Filter, ItemSummary, TableMeta } from '@eodia/contracts'
import { Chip, ItemTile, LookIcon } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Choice } from '@/components/ui/choice'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { type ColumnOption, DATE_PRESETS, OPS_BY_KIND, OP_LABELS, semanticLabel } from '@/lib/builder'
import { formatCount } from '@/lib/format'
import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { Calendar, CaseSensitive, Hash, Link2, Search, ToggleLeft, Braces } from 'lucide-react'
import { useMemo, useState } from 'react'

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = kind === 'number' ? Hash : kind === 'date' || kind === 'datetime' ? Calendar : kind === 'boolean' ? ToggleLeft : kind === 'json' ? Braces : CaseSensitive
  return <Icon className={cn('size-3.5 shrink-0 text-muted-foreground', className)} />
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input autoFocus value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 pl-8 text-sm" />
    </div>
  )
}

/** Columns grouped by table — those reached through a key come after the source's own. */
export function ColumnList({ options, onPick, filter }: { options: readonly ColumnOption[]; onPick: (o: ColumnOption) => void; filter?: (o: ColumnOption) => boolean }) {
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const out = new Map<string, ColumnOption[]>()
    for (const o of options) {
      if (filter && !filter(o)) continue
      if (q && !fold(`${o.label} ${o.ref.field} ${o.group}`).includes(fold(q))) continue
      out.set(o.group, [...(out.get(o.group) ?? []), o])
    }
    return [...out.entries()]
  }, [options, q, filter])
  return (
    <div className="flex max-h-[420px] w-72 flex-col">
      <div className="p-2">
        <SearchBox value={q} onChange={setQ} placeholder={$t('Chercher une colonne…')} />
      </div>
      <div className="overflow-y-auto px-1 pb-2">
        {groups.map(([group, list], gi) => (
          <div key={group} className="pb-1">
            <div className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {gi > 0 ? <Link2 className="size-3" /> : null}
              {group}
            </div>
            {list.map((o) => (
              <button
                key={`${o.ref.join ?? ''}.${o.ref.field}`}
                type="button"
                onClick={() => onPick(o)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <KindIcon kind={o.kind} />
                <span className="flex-1 truncate">{o.label}</span>
                {o.semantic ? <span className="truncate text-[11px] text-muted-foreground">{semanticLabel(o.semantic)}</span> : null}
              </button>
            ))}
          </div>
        ))}
        {groups.length === 0 ? <p className="px-3 py-4 text-sm text-muted-foreground">{$t('Aucune colonne')}</p> : null}
      </div>
    </div>
  )
}

/** Tables by source, then models: what a question starts from. */
export function SourceList({ tables, models, onPick }: { tables: readonly TableMeta[]; models: readonly ItemSummary[]; onPick: (ref: { kind: 'table' | 'question'; id: string }) => void }) {
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const out = new Map<string, TableMeta[]>()
    for (const t of tables) {
      if (t.visibility !== 'normal') continue
      if (q && !fold(`${t.label} ${t.name} ${t.schema}`).includes(fold(q))) continue
      const key = `${t.qualified.split('.')[0]?.replace(/"/g, '')} · ${t.schema}`
      out.set(key, [...(out.get(key) ?? []), t])
    }
    return [...out.entries()]
  }, [tables, q])
  const ms = models.filter((m) => !q || fold(m.name).includes(fold(q)))
  return (
    <div className="flex max-h-[460px] w-80 flex-col">
      <div className="p-2">
        <SearchBox value={q} onChange={setQ} placeholder={$t('Chercher une table ou un modèle…')} />
      </div>
      <div className="overflow-y-auto px-1 pb-2">
        {ms.length ? (
          <div className="pb-1">
            <div className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{$t('Modèles')}</div>
            {ms.map((m) => (
              <button key={m.id} type="button" onClick={() => onPick({ kind: 'question', id: m.id })} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
                <ItemTile kind="model" className="size-6" />
                <span className="flex-1 truncate">{m.name}</span>
              </button>
            ))}
          </div>
        ) : null}
        {groups.map(([group, list]) => (
          <div key={group} className="pb-1">
            <div className="px-2 pt-2 pb-1 font-mono text-[11px] text-muted-foreground">{group}</div>
            {list.map((t) => (
              <button key={t.id} type="button" onClick={() => onPick({ kind: 'table', id: t.id })} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
                {t.icon ? <LookIcon name={t.icon} color={t.color} className="size-4" /> : <ItemTile kind="table" className="size-6" />}
                <span className="flex-1 truncate">{t.label}</span>
                {t.row_count ? <span className="text-[11px] text-muted-foreground tabular-nums">{formatCount(t.row_count)}</span> : null}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** The values a column takes, under the reader's rights; with their labels and colours. */
export function useColumnValues(columnId: string | undefined, search = '') {
  return useQuery({
    queryKey: ['column-values', columnId, search],
    queryFn: () => api.get<{ values: ColumnValue[]; complete: boolean }>(`/v1/columns/${columnId}/values${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    enabled: !!columnId,
    staleTime: 60_000,
  })
}

export function ValuesChecklist({ columnId, selected, onChange, linked = [] }: { columnId: string; selected: readonly string[]; onChange: (v: string[]) => void; linked?: readonly { column: string; values: readonly string[] }[] }) {
  const [q, setQ] = useState('')
  const own = useColumnValues(linked.length ? undefined : columnId, q)
  // Narrowed by the other filters chosen on the same table: « ville » within the chosen « pays ».
  const narrowed = useQuery({
    queryKey: ['linked-values', columnId, linked, q],
    queryFn: () => api.post<{ values: ColumnValue[] }>(`/v1/columns/${columnId}/values/linked`, { filters: linked, search: q }),
    enabled: linked.length > 0,
  })
  const { data, isLoading } = linked.length ? narrowed : own
  return (
    <div className="space-y-2">
      <SearchBox value={q} onChange={setQ} placeholder={$t('Chercher une valeur…')} />
      <div className="max-h-56 overflow-y-auto rounded-md border p-1">
        {isLoading ? <p className="p-2 text-xs text-muted-foreground">{$t('Chargement…')}</p> : null}
        {(data?.values ?? []).map((v) => {
          const on = selected.includes(v.value)
          return (
            <label key={v.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent">
              <Checkbox checked={on} onCheckedChange={(c) => onChange(c ? [...selected, v.value] : selected.filter((x) => x !== v.value))} />
              {v.color || v.icon ? (
                <Chip color={v.color ?? 'gray'} icon={v.icon ?? null}>
                  {v.label || v.value}
                </Chip>
              ) : (
                <span className="truncate">{v.label || v.value}</span>
              )}
              {v.count ? <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{formatCount(v.count)}</span> : null}
            </label>
          )
        })}
      </div>
    </div>
  )
}

/** Edits one filter on one column, by what the column holds. */
export function FilterEditor({ option, initial, onApply }: { option: ColumnOption; initial?: Filter; onApply: (f: Filter) => void }) {
  const kind = option.kind === 'time' || option.kind === 'other' || option.kind === 'json' ? 'text' : option.kind
  const start = initial && 'column' in initial ? initial : null
  const defaultOp = kind === 'date' || kind === 'datetime' ? 'date' : kind === 'number' ? 'between' : kind === 'boolean' ? 'true' : option.hasValues ? 'is' : 'contains'
  const [op, setOp] = useState<string>(start?.op ?? defaultOp)
  const [values, setValues] = useState<(string | number | boolean)[]>(start ? [...start.values] : [])
  const ops = OPS_BY_KIND[kind] ?? OPS_BY_KIND.text ?? []
  const noValue = ['empty', 'not_empty', 'true', 'false'].includes(op)
  const apply = () => onApply({ column: option.ref, op: op as never, values: noValue ? [] : values } as Filter)

  return (
    <div className="w-80 space-y-3 p-3">
      <div className="flex items-center gap-2">
        <KindIcon kind={option.kind} />
        <span className="flex-1 truncate text-sm font-medium">{option.label}</span>
        <Choice value={op} onValueChange={(v) => { setOp(v); setValues([]) }} options={ops.map((o) => ({ value: o, label: $t(OP_LABELS[o] ?? o) }))} aria-label={$t('Opérateur')} size="xs" className="w-36" />
      </div>
      {noValue ? null : op === 'date' ? (
        <div className="grid grid-cols-2 gap-1">
          {DATE_PRESETS.map((p) => (
            <button key={p.value} type="button" onClick={() => setValues([p.value])} className={cn('rounded-md border px-2 py-1.5 text-left text-xs hover:bg-accent', values[0] === p.value && 'border-primary bg-primary/10 font-medium')}>
              {$t(p.label)}
            </button>
          ))}
        </div>
      ) : op === 'between' ? (
        <div className="flex items-center gap-2">
          <Input type={kind === 'number' ? 'number' : 'date'} value={String(values[0] ?? '')} onChange={(e) => setValues([e.target.value, values[1] ?? ''])} className="h-8" />
          <span className="text-xs text-muted-foreground">{$t('et')}</span>
          <Input type={kind === 'number' ? 'number' : 'date'} value={String(values[1] ?? '')} onChange={(e) => setValues([values[0] ?? '', e.target.value])} className="h-8" />
        </div>
      ) : (op === 'is' || op === 'is_not') && option.columnId && (option.hasValues || kind === 'text') ? (
        <ValuesChecklist columnId={option.columnId} selected={values.map(String)} onChange={setValues} />
      ) : (
        <Input
          autoFocus
          type={kind === 'number' ? 'number' : kind === 'date' || kind === 'datetime' ? 'date' : 'text'}
          value={String(values[0] ?? '')}
          onChange={(e) => setValues([kind === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value])}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          className="h-8"
        />
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={apply} disabled={!noValue && values.filter((v) => v !== '').length === 0}>
          {initial ? $t('Mettre à jour') : $t('Ajouter le filtre')}
        </Button>
      </div>
    </div>
  )
}
