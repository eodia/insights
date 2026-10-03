'use client'

import type { ColumnMeta, Datasource, TableMeta, TablePatch } from '@eodia/contracts'
import { Chip } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Label } from '@/components/ui/label'
import { formatAgo } from '@/lib/format'
import { $t, $tp } from '@/lib/i18n'
import { useUi } from '@/lib/store'
import { Sparkles } from 'lucide-react'
import { VisibilitySelect } from './column-bits'
import { CopyConfigButton, PasteConfigButton } from './json-tools'
import { ColorPicker, IconPicker, InlineText } from './pickers'
import { TableGlyph } from './tree'

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

/** The header of a table in « Structure »: what it is called, what it holds, how it looks. */
export function TableEditor({
  table,
  source,
  readOnly,
  aiEnabled,
  onPatch,
}: {
  table: TableMeta & { columns: ColumnMeta[] }
  source: Datasource | undefined
  readOnly: boolean
  aiEnabled: boolean
  onPatch: (patch: TablePatch) => Promise<unknown>
}) {
  const active = table.columns.filter((c) => c.status === 'active')
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <TableGlyph table={table} className="size-12 rounded-xl [&>svg]:size-5" />
        <div className="min-w-0 flex-1">
          <InlineText
            value={table.label}
            onCommit={(label) => void onPatch({ label: label.trim() || table.name })}
            placeholder={table.name}
            disabled={readOnly}
            className="h-9 border-transparent px-1.5 text-xl font-semibold shadow-none hover:border-input focus-visible:border-input disabled:opacity-100"
            aria-label={$t('Libellé de la table')}
          />
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 px-1.5 text-xs text-muted-foreground">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground/80">
              {source?.catalog ?? '…'}.{table.schema}.{table.name}
            </code>
            {table.row_count != null ? <span>{$tp(table.row_count, '≈ {count} ligne', '≈ {count} lignes')}</span> : null}
            <span>· {$tp(active.length, '{count} colonne', '{count} colonnes')}</span>
            {table.synced_at ? <span>· {$t('synchronisée {when}', { when: formatAgo(table.synced_at) })}</span> : null}
            {table.status === 'removed' ? <Chip>{$t('retirée')}</Chip> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {aiEnabled && !readOnly ? (
            <Button
              size="sm"
              variant="outline"
              className="border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-900 dark:text-violet-300 dark:hover:bg-violet-950"
              onClick={() =>
                useUi
                  .getState()
                  .openCopilot(
                    { kind: 'structure', table: table.id },
                    $t('Décris cette table : propose un libellé, une description et pour chaque colonne un libellé, une description et un type sémantique.'),
                  )
              }
            >
              <Sparkles /> {$t('Décrire avec le copilot')}
            </Button>
          ) : null}
          <CopyConfigButton target={{ kind: 'table', id: table.id }} />
          {!readOnly ? <PasteConfigButton target={{ kind: 'table', id: table.id }} /> : null}
        </div>
      </div>

      <div className="grid gap-4 rounded-xl border p-4 md:grid-cols-6">
        <Field label={$t('Description')} className="md:col-span-6">
          <InlineText
            multiline
            value={table.description ?? ''}
            onCommit={(d) => void onPatch({ description: d.trim() || null })}
            placeholder={table.native_comment ?? $t('Ce que contient la table, pour les analystes et le copilot.')}
            disabled={readOnly}
            aria-label={$t('Description de la table')}
          />
        </Field>
        <Field label={$t('Entité')} className="md:col-span-2">
          <InlineText value={table.entity ?? ''} onCommit={(e) => void onPatch({ entity: e.trim() || null })} placeholder={$t('Commande, Client…')} disabled={readOnly} aria-label={$t('Entité')} />
        </Field>
        <Field label={$t('Visibilité')} className="md:col-span-2">
          <VisibilitySelect value={table.visibility} onChange={(visibility) => void onPatch({ visibility })} disabled={readOnly} className="h-9 w-full" />
        </Field>
        <Field label={$t('Colonne d’affichage')} className="md:col-span-2">
          <Choice
            value={table.display_column ?? ''}
            onValueChange={(v) => void onPatch({ display_column: v || null })}
            options={[{ value: '', label: $t('Aucune') }, ...active.map((c) => ({ value: c.name, label: `${c.label} (${c.name})` }))]}
            aria-label={$t('Colonne d’affichage')}
            size="default"
            className="w-full"
            disabled={readOnly}
          />
        </Field>
        <Field label={$t('Apparence')} className="md:col-span-6">
          <div className="flex flex-wrap items-center gap-2">
            <ColorPicker value={table.color} onChange={(color) => void onPatch({ color })} disabled={readOnly} />
            <IconPicker value={table.icon} color={table.color} onChange={(icon) => void onPatch({ icon })} disabled={readOnly} />
            <span className="text-xs text-muted-foreground">{$t('La colonne d’affichage nomme une ligne quand une autre table y fait référence.')}</span>
          </div>
        </Field>
      </div>
    </div>
  )
}
