'use client'

import { BUILTIN_ATTRIBUTES, type ColumnMeta, ROW_OPS, type RowCondition, type RowOp } from '@eodia/contracts'
import { type PermissionsOverview, Segmented, adminKeys, fail } from '@/components/app/admin/common'
import { ConfirmDialog } from '@/components/app/dialogs'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Hint } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { useQueryClient } from '@tanstack/react-query'
import { Braces, Filter, Loader2, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

type Policy = PermissionsOverview['rows'][number]

export const OP_LABELS: Record<RowOp, string> = {
  eq: 'est égal à',
  ne: 'est différent de',
  in: 'est parmi',
  not_in: 'n’est pas parmi',
  gt: 'est supérieur à',
  gte: 'est supérieur ou égal à',
  lt: 'est inférieur à',
  lte: 'est inférieur ou égal à',
  contains: 'contient',
  empty: 'est vide',
  not_empty: 'n’est pas vide',
}

const LIST_OPS: readonly RowOp[] = ['in', 'not_in']
const NO_VALUE_OPS: readonly RowOp[] = ['empty', 'not_empty']
const NUMERIC = /^(tinyint|smallint|integer|int|bigint|real|double|decimal|numeric)/i

interface Draft {
  column: string
  op: RowOp
  /** What is typed: one value, or several separated by commas for « est parmi ». */
  text: string
}

const toDraft = (c: RowCondition): Draft => ({ column: c.column, op: c.op, text: c.values.map(String).join(LIST_OPS.includes(c.op) ? ', ' : '') })

function toCondition(d: Draft, columns: readonly ColumnMeta[]): RowCondition {
  const type = columns.find((c) => c.name === d.column)?.type ?? ''
  const parts = NO_VALUE_OPS.includes(d.op) ? [] : LIST_OPS.includes(d.op) ? d.text.split(',').map((s) => s.trim()).filter(Boolean) : [d.text.trim()]
  const values = parts.map((v) => (NUMERIC.test(type) && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v))
  return { column: d.column, op: d.op, values }
}

/** The attribute picker: `{{user.region}}`, the built-ins and those set on people. */
function AttributeMenu({ attributes, onPick }: { attributes: readonly string[]; onPick: (token: string) => void }) {
  return (
    <DropdownMenu>
      <Hint label={$t('Insérer un attribut de la personne')}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon-sm" aria-label={$t('Insérer un attribut de la personne')}>
            <Braces />
          </Button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{$t('Attributs de la personne qui lit')}</DropdownMenuLabel>
        {attributes.map((a) => (
          <DropdownMenuItem key={a} onSelect={() => onPick(`{{user.${a}}}`)} className="font-mono text-[13px]">
            {`{{user.${a}}}`}
          </DropdownMenuItem>
        ))}
        {attributes.length ? <DropdownMenuSeparator /> : null}
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{$t('Intégrés')}</DropdownMenuLabel>
        {BUILTIN_ATTRIBUTES.map((a) => (
          <DropdownMenuItem key={a} onSelect={() => onPick(`{{user.${a}}}`)} className="font-mono text-[13px]">
            {`{{user.${a}}}`}
            <span className="ml-auto font-sans text-xs text-muted-foreground">{a === 'id' ? $t('identifiant') : a === 'email' ? $t('e-mail') : $t('nom')}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The row rule of a group on a table: which rows its members may read. */
export function RowRuleEditor({ group, table, columns, policy, attributes }: { group: string; table: string; columns: readonly ColumnMeta[]; policy: Policy | undefined; attributes: readonly string[] }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [match, setMatch] = useState<'all' | 'any'>(policy?.match ?? 'all')
  const [drafts, setDrafts] = useState<Draft[]>(policy ? policy.conditions.map(toDraft) : [])
  const [description, setDescription] = useState(policy?.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const start = () => {
    setMatch(policy?.match ?? 'all')
    setDrafts(policy ? policy.conditions.map(toDraft) : [{ column: columns[0]?.name ?? '', op: 'eq', text: '' }])
    setDescription(policy?.description ?? '')
    setError(null)
    setEditing(true)
  }
  const set = (i: number, patch: Partial<Draft>) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  const columnOptions = columns.map((c) => ({ value: c.name, label: c.label && c.label !== c.name ? `${c.label} (${c.name})` : c.name }))
  const opOptions = ROW_OPS.map((op) => ({ value: op, label: $t(OP_LABELS[op]) }))

  const save = async () => {
    const conditions = drafts.map((d) => toCondition(d, columns))
    const missing = conditions.findIndex((c) => !c.column || (!NO_VALUE_OPS.includes(c.op) && c.values.length === 0))
    if (missing >= 0) {
      setError($t('La condition {n} est incomplète.', { n: missing + 1 }))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.put('/v1/permissions/rows', { group, table, match, conditions, description: description.trim() || null })
      await qc.invalidateQueries({ queryKey: adminKeys.permissions })
      toast.success($t('Règle de lignes enregistrée'))
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        {policy ? (
          <div className="rounded-lg border bg-background p-3">
            <div className="flex items-start gap-3">
              <Filter className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1 space-y-1.5">
                {policy.description ? <div className="text-sm font-medium">{policy.description}</div> : null}
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  {policy.conditions.map((c, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: conditions have no identity but their place
                    <span key={i} className="inline-flex items-center gap-1.5">
                      {i > 0 ? <span className="text-xs font-semibold text-muted-foreground uppercase">{policy.match === 'all' ? $t('et') : $t('ou')}</span> : null}
                      <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12.5px]">
                        {c.column} <span className="font-sans text-muted-foreground">{$t(OP_LABELS[c.op])}</span> {c.values.map(String).join(', ')}
                      </code>
                    </span>
                  ))}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={start}>
                {$t('Modifier')}
              </Button>
              <Hint label={$t('Supprimer la règle')}>
                <Button size="icon-sm" variant="ghost" onClick={() => setDeleting(true)} aria-label={$t('Supprimer la règle')}>
                  <Trash2 />
                </Button>
              </Hint>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-dashed bg-background p-3">
            <p className="flex-1 text-sm text-muted-foreground">{$t('Aucune règle : les membres lisent toutes les lignes de la table.')}</p>
            <Button size="sm" variant="outline" onClick={start} disabled={columns.length === 0}>
              <Plus /> {$t('Ajouter une règle de lignes')}
            </Button>
          </div>
        )}
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={$t('Supprimer la règle de lignes ?')}
          description={$t('Les membres du groupe liront à nouveau toutes les lignes de cette table.')}
          onConfirm={async () => {
            if (!policy) return
            try {
              await api.delete(`/v1/permissions/rows/${policy.id}`)
              await qc.invalidateQueries({ queryKey: adminKeys.permissions })
              toast.success($t('Règle supprimée'))
            } catch (err) {
              fail(err)
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>{$t('Les membres lisent les lignes qui remplissent')}</span>
        <Segmented
          value={match}
          onChange={setMatch}
          options={[
            { value: 'all', label: $t('toutes les conditions') },
            { value: 'any', label: $t('au moins une condition') },
          ]}
          aria-label={$t('Combinaison des conditions')}
        />
      </div>
      <div className="space-y-2">
        {drafts.map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: conditions have no identity but their place
          <div key={i} className="grid grid-cols-[2rem_minmax(0,12rem)_minmax(0,11rem)_minmax(0,1fr)_auto_auto] items-center gap-2">
            <span className="text-right text-xs font-semibold text-muted-foreground uppercase">{i === 0 ? '' : match === 'all' ? $t('et') : $t('ou')}</span>
            <Choice value={d.column} onValueChange={(v) => set(i, { column: v })} options={columnOptions} aria-label={$t('Colonne')} className="w-full" />
            <Choice value={d.op} onValueChange={(v) => set(i, { op: v as RowOp })} options={opOptions} aria-label={$t('Opérateur')} className="w-full" searchable={false} />
            {NO_VALUE_OPS.includes(d.op) ? (
              <span className="col-span-2" />
            ) : (
              <>
                <Input
                  value={d.text}
                  onChange={(e) => set(i, { text: e.target.value })}
                  placeholder={LIST_OPS.includes(d.op) ? $t('Valeur 1, valeur 2… ou {{user.region}}') : $t('Une valeur ou {{user.region}}')}
                  aria-label={$t('Valeur')}
                  className="h-8 font-mono text-[13px]"
                />
                <AttributeMenu attributes={attributes} onPick={(token) => set(i, { text: LIST_OPS.includes(d.op) && d.text.trim() ? `${d.text.trim()}, ${token}` : token })} />
              </>
            )}
            <Hint label={$t('Retirer la condition')}>
              <Button type="button" size="icon-sm" variant="ghost" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))} disabled={drafts.length === 1} aria-label={$t('Retirer la condition')}>
                <X />
              </Button>
            </Hint>
          </div>
        ))}
      </div>
      <Button type="button" size="sm" variant="ghost" onClick={() => setDrafts([...drafts, { column: columns[0]?.name ?? '', op: 'eq', text: '' }])} disabled={drafts.length >= 12}>
        <Plus /> {$t('Ajouter une condition')}
      </Button>
      <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={$t('Description, pour les autres administrateurs (facultative)')} aria-label={$t('Description')} />
      <p className="text-xs text-muted-foreground">
        {$t('Une valeur peut citer un attribut de la personne qui lit : ')}
        <code className="font-mono">{'{{user.region}}'}</code>
        {$t('. Une personne sans cet attribut ne voit aucune ligne : un attribut manquant n’ouvre jamais l’accès.')}
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {$t('Enregistrer la règle')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          {$t('Annuler')}
        </Button>
      </div>
    </div>
  )
}
