'use client'

import { BUILTIN_ATTRIBUTES } from '@eodia/contracts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Hint } from '@/components/ui/tooltip'
import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Plus, X } from 'lucide-react'

export interface AttributeRow {
  readonly key: string
  readonly value: string
}

const KEY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

export const toRows = (attributes: Readonly<Record<string, string>>): AttributeRow[] =>
  Object.entries(attributes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value }))

/** The rows as the API takes them, or the message of the first wrong row. */
export function fromRows(rows: readonly AttributeRow[]): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  const out: Record<string, string> = {}
  for (const r of rows) {
    const key = r.key.trim()
    if (!key && !r.value.trim()) continue
    if (!KEY.test(key)) return { ok: false, error: $t('Nom d’attribut invalide : « {key} ». Lettres, chiffres et _ ; pas de chiffre en tête.', { key }) }
    if ((BUILTIN_ATTRIBUTES as readonly string[]).includes(key)) return { ok: false, error: $t('« {key} » est un attribut intégré : il ne se saisit pas.', { key }) }
    if (key in out) return { ok: false, error: $t('L’attribut « {key} » apparaît deux fois.', { key }) }
    out[key] = r.value
  }
  return { ok: true, value: out }
}

/** Key/value pairs of a person, as row rules cite them: `{{user.region}}`. */
export function AttributesEditor({ rows, onChange, known = [] }: { rows: readonly AttributeRow[]; onChange: (rows: AttributeRow[]) => void; known?: readonly string[] }) {
  const set = (i: number, patch: Partial<AttributeRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const used = new Set(rows.map((r) => r.key.trim()))
  const suggestions = known.filter((k) => !used.has(k))
  return (
    <div className="space-y-2">
      {rows.length > 0 ? (
        <div className="space-y-1.5">
          {rows.map((r, i) => {
            const bad = r.key.trim() !== '' && !KEY.test(r.key.trim())
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity but their place
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={r.key}
                  onChange={(e) => set(i, { key: e.target.value })}
                  placeholder={$t('region')}
                  aria-label={$t('Nom de l’attribut')}
                  aria-invalid={bad || undefined}
                  className={cn('w-40 font-mono text-[13px]')}
                />
                <span className="text-muted-foreground">=</span>
                <Input value={r.value} onChange={(e) => set(i, { value: e.target.value })} placeholder={$t('Bretagne')} aria-label={$t('Valeur de l’attribut')} className="flex-1" />
                <Hint label={$t('Retirer')}>
                  <Button type="button" size="icon-sm" variant="ghost" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={$t('Retirer')}>
                    <X />
                  </Button>
                </Hint>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{$t('Aucun attribut.')}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { key: '', value: '' }])}>
          <Plus /> {$t('Ajouter un attribut')}
        </Button>
        {suggestions.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange([...rows, { key: k, value: '' }])}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed px-2 font-mono text-xs text-muted-foreground hover:border-solid hover:text-foreground"
          >
            <Plus className="size-3" />
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}
