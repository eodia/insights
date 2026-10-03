'use client'

import type { ColumnMeta, ColumnPatch, TableMeta } from '@eodia/contracts'
import { Chip } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { $t } from '@/lib/i18n'
import { AlertTriangle, X } from 'lucide-react'
import { useCallback } from 'react'
import { FingerprintDetails, KeyBadge, SemanticSelect, TypeGlyph, VisibilitySelect } from './column-bits'
import { FkTargetSelect } from './column-list'
import { FormatEditor } from './format-editor'
import { CopyConfigButton, PasteConfigButton } from './json-tools'
import { InlineText } from './pickers'
import { ValuesEditor } from './values-editor'
import { Pane } from '@/components/ui/pane'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

/** The right panel of a column: its description, format and list of values. */
export function ColumnPanel({
  column,
  tables,
  readOnly,
  onClose,
  onPatch,
}: {
  column: ColumnMeta
  tables: readonly TableMeta[]
  readOnly: boolean
  onClose: () => void
  onPatch: (id: string, patch: ColumnPatch) => Promise<unknown>
}) {
  const disabled = readOnly || column.status === 'removed'
  const saveFormat = useCallback((format: ColumnMeta['format']) => onPatch(column.id, { format }), [onPatch, column.id])
  return (
    <Pane as="aside" id="structure.column" side="right" defaultSize={400} min={300} max={720} className="flex flex-col border-l">
      <Tabs defaultValue="details" className="min-h-0 flex-1" key={column.id}>
        <div className="flex h-12 items-center gap-2 border-b px-5">
          <TabsList className="h-12 border-b-0">
            <TabsTrigger value="details" className="h-12 text-[15px]">
              {$t('Détails')}
            </TabsTrigger>
            <TabsTrigger value="format" className="h-12 text-[15px]">
              {$t('Format')}
            </TabsTrigger>
            {column.has_values ? (
              <TabsTrigger value="values" className="h-12 text-[15px]">
                {$t('Valeurs')}
              </TabsTrigger>
            ) : null}
          </TabsList>
          <span className="flex-1" />
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={$t('Fermer')}>
            <X />
          </Button>
        </div>

        <div className="border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <TypeGlyph type={column.type} className="size-4" />
            <span className="truncate font-mono text-base font-semibold">{column.name}</span>
            <KeyBadge column={column} />
            {column.status === 'removed' ? <Chip>{$t('retirée')}</Chip> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-xs text-muted-foreground">
            <span>{column.type}</span>
            {column.native_type && column.native_type !== column.type ? <span>· {$t('natif {type}', { type: column.native_type })}</span> : null}
            <span>· {column.nullable ? $t('nullable') : $t('non nulle')}</span>
          </div>
          {column.type_changed_from ? (
            <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {$t('Le type a changé à la dernière synchronisation : {from} → {to}. Vérifiez le format et le type sémantique.', { from: column.type_changed_from, to: column.type })}
            </p>
          ) : null}
          <div className="mt-3 flex gap-1.5">
            <CopyConfigButton target={{ kind: 'column', id: column.id, table: column.table }} />
            {!disabled ? <PasteConfigButton target={{ kind: 'column', id: column.id, table: column.table }} /> : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="details" className="space-y-4 p-5">
            <Field label={$t('Libellé')}>
              <InlineText value={column.label} onCommit={(label) => void onPatch(column.id, { label })} placeholder={column.name} disabled={disabled} aria-label={$t('Libellé')} />
            </Field>
            <Field label={$t('Description')}>
              <InlineText
                multiline
                value={column.description ?? ''}
                onCommit={(d) => void onPatch(column.id, { description: d.trim() || null })}
                placeholder={column.native_comment ?? $t('Ce que contient la colonne, pour les analystes et le copilot.')}
                disabled={disabled}
                aria-label={$t('Description')}
              />
              {column.native_comment ? <p className="text-xs text-muted-foreground">{$t('Commentaire de la base : {c}', { c: column.native_comment })}</p> : null}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={$t('Type sémantique')}>
                <SemanticSelect value={column.semantic} onChange={(semantic) => void onPatch(column.id, { semantic })} disabled={disabled} className="h-9 w-full" />
              </Field>
              <Field label={$t('Visibilité')}>
                <VisibilitySelect value={column.visibility} onChange={(visibility) => void onPatch(column.id, { visibility })} disabled={disabled} className="h-9 w-full" />
              </Field>
            </div>
            {column.semantic === 'fk' ? (
              <Field label={$t('Cible de la clé étrangère')}>
                <FkTargetSelect column={column} tables={tables} disabled={disabled} onChange={(fk) => void onPatch(column.id, { fk })} className="h-9 w-full" />
              </Field>
            ) : null}
            <Field label={$t('Unité')}>
              <InlineText value={column.unit ?? ''} onCommit={(u) => void onPatch(column.id, { unit: u.trim() || null })} placeholder={$t('kg, km, €, jours…')} disabled={disabled} aria-label={$t('Unité')} />
            </Field>
            {column.fingerprint ? (
              <div className="rounded-xl border p-3">
                <FingerprintDetails fp={column.fingerprint} />
              </div>
            ) : (
              <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">{$t('Pas encore d’empreinte : lancez la passe « Empreinte » de la synchronisation.')}</p>
            )}
          </TabsContent>
          <TabsContent value="format" className="p-5">
            <FormatEditor key={column.id} column={column} disabled={disabled} onSave={saveFormat} />
          </TabsContent>
          {column.has_values ? (
            <TabsContent value="values" className="px-5 pt-5">
              <ValuesEditor key={column.id} column={column} disabled={disabled} />
            </TabsContent>
          ) : null}
        </div>
      </Tabs>
    </Pane>
  )
}
