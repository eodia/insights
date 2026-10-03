'use client'

import type { ColumnMeta, ColumnValue } from '@eodia/contracts'
import { Chip } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { formatCount } from '@/lib/format'
import { $t } from '@/lib/i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, Loader2, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ColorPicker, IconPicker, ImageUrlPicker } from './pickers'

interface ValuesResponse {
  readonly values: ColumnValue[]
  readonly complete: boolean
}

export const valuesKey = (columnId: string) => ['column-values', columnId] as const

/** How a value is drawn wherever it appears: its label, colour, pictogram or image. */
export function ValueChip({ value }: { value: ColumnValue }) {
  return (
    <Chip color={value.color ?? 'gray'} icon={value.image_url ? null : value.icon}>
      {value.image_url ? (
        <img src={value.image_url} alt="" className="size-4 rounded-sm object-cover" />
      ) : null}
      {value.label || value.value}
    </Chip>
  )
}

/** The values of a category column, each with its label, colour, pictogram or image. */
export function ValuesEditor({ column, disabled }: { column: ColumnMeta; disabled: boolean }) {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: valuesKey(column.id),
    queryFn: () => api.get<ValuesResponse>(`/v1/columns/${column.id}/values`),
  })
  const [draft, setDraft] = useState<ColumnValue[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  useEffect(() => {
    if (data) {
      setDraft(data.values)
      setDirty(false)
    }
  }, [data])

  const update = (value: string, patch: Partial<ColumnValue>) => {
    setDraft((list) => list.map((v) => (v.value === value ? { ...v, ...patch } : v)))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`/v1/columns/${column.id}/values`, {
        values: draft.map((v) => ({ value: v.value, label: v.label || null, color: v.color ?? null, icon: v.icon || null, image_url: v.image_url || null })),
      })
      await qc.invalidateQueries({ queryKey: valuesKey(column.id) })
      toast.success($t('Valeurs enregistrées.'))
      setDirty(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <Loader2 className="mx-auto mt-6 size-5 animate-spin text-muted-foreground" />
  if (error) return <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{(error as Error).message}</p>
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const shown = draft.filter((v) => !search || fold(`${v.value} ${v.label ?? ''}`).includes(fold(search)))

  return (
    <div className="space-y-3">
      {draft.length > 8 ? (
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={$t('Filtrer les valeurs…')} className="h-8 pl-9" />
        </div>
      ) : null}
      {data && !data.complete ? (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {$t('Liste partielle : seules les premières valeurs sont affichées.')}
        </p>
      ) : null}
      {draft.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">{$t('Aucune valeur relevée : lancez la passe « Valeurs » de la synchronisation.')}</p>
      ) : null}
      <div className="space-y-2">
        {shown.map((v) => (
          <div key={v.value} className="space-y-2 rounded-xl border p-2.5">
            <div className="flex items-center gap-2">
              <ValueChip value={v} />
              <span className="min-w-0 flex-1 truncate text-right font-mono text-xs text-muted-foreground">{v.value}</span>
              {v.count != null ? <span className="shrink-0 font-mono text-[11px] text-muted-foreground">×{formatCount(v.count)}</span> : null}
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                value={v.label ?? ''}
                onChange={(e) => update(v.value, { label: e.target.value })}
                placeholder={v.value}
                className="h-7 flex-1 text-sm"
                disabled={disabled}
                aria-label={$t('Libellé de {value}', { value: v.value })}
              />
              <ColorPicker value={v.color} onChange={(color) => update(v.value, { color })} disabled={disabled} size="xs" />
              <IconPicker value={v.icon} color={v.color} onChange={(icon) => update(v.value, { icon })} disabled={disabled} size="xs" />
              <ImageUrlPicker value={v.image_url} onChange={(image_url) => update(v.value, { image_url })} disabled={disabled} />
            </div>
          </div>
        ))}
      </div>
      {!disabled && draft.length > 0 ? (
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-background py-3">
          {dirty ? <span className="mr-auto text-xs whitespace-nowrap text-amber-600 dark:text-amber-400">{$t('Non enregistrées')}</span> : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={!dirty || saving}
            onClick={() => {
              if (data) setDraft(data.values)
              setDirty(false)
            }}
          >
            {$t('Annuler')}
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {$t('Enregistrer les valeurs')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
