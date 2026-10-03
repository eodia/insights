'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Hint } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { keys } from '@/lib/queries'
import { useQueryClient } from '@tanstack/react-query'
import { ClipboardPaste, Copy, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

type Target = { kind: 'table'; id: string } | { kind: 'column'; id: string; table: string }

/** « Copier la configuration » : the whole metadata of a table or a column, as JSON. */
export function CopyConfigButton({ target, compact = false }: { target: Target; compact?: boolean }) {
  const [busy, setBusy] = useState(false)
  const copy = async () => {
    setBusy(true)
    try {
      const cfg = await api.get<unknown>(target.kind === 'table' ? `/v1/tables/${target.id}/config` : `/v1/columns/${target.id}/config`)
      await navigator.clipboard.writeText(JSON.stringify(cfg, null, 2))
      toast.success(target.kind === 'table' ? $t('Configuration de la table copiée.') : $t('Configuration de la colonne copiée.'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : $t('Copie impossible.'))
    } finally {
      setBusy(false)
    }
  }
  const label = $t('Copier la configuration')
  return compact ? (
    <Hint label={label}>
      <Button variant="ghost" size="icon-sm" onClick={copy} disabled={busy} aria-label={label}>
        {busy ? <Loader2 className="animate-spin" /> : <Copy />}
      </Button>
    </Hint>
  ) : (
    <Button variant="outline" size="sm" onClick={copy} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <Copy />}
      {label}
    </Button>
  )
}

/** « Coller » : applies a copied configuration; columns are matched by name. */
export function PasteConfigButton({ target, compact = false }: { target: Target; compact?: boolean }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setError(null)
    setText('')
  }, [open])

  const apply = async () => {
    let config: unknown
    try {
      config = JSON.parse(text)
    } catch {
      setError($t('Ce texte n’est pas du JSON valide.'))
      return
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      setError($t('Attendu un objet JSON.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await api.post<{ applied: number }>('/v1/metadata/import', { [target.kind]: target.id, config })
      const tableId = target.kind === 'table' ? target.id : target.table
      await qc.invalidateQueries({ queryKey: keys.table(tableId) })
      await qc.invalidateQueries({ queryKey: ['column-values'] })
      await qc.invalidateQueries({ queryKey: ['tables'] })
      toast.success($t('Configuration appliquée ({n} élément(s)).', { n: res.applied }))
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const label = $t('Coller')
  return (
    <>
      {compact ? (
        <Hint label={$t('Coller une configuration')}>
          <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label={$t('Coller une configuration')}>
            <ClipboardPaste />
          </Button>
        </Hint>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <ClipboardPaste /> {label}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{target.kind === 'table' ? $t('Coller la configuration d’une table') : $t('Coller la configuration d’une colonne')}</DialogTitle>
            <DialogDescription>
              {target.kind === 'table'
                ? $t('Libellés, descriptions, types sémantiques, formats et valeurs ; les colonnes sont rapprochées par leur nom, les absentes restent inchangées.')
                : $t('Libellé, description, type sémantique, format et valeurs de la colonne.')}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} className="font-mono text-xs" placeholder='{ "kind": "eodia.table", … }' autoFocus />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {$t('Annuler')}
            </Button>
            <Button onClick={apply} disabled={busy || !text.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {$t('Appliquer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
