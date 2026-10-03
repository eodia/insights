'use client'

import type { Folder } from '@eodia/contracts'
import { Choice } from '@/components/ui/choice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { $t } from '@/lib/i18n'
import { useFolders, useMe } from '@/lib/queries'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

/** The folders one can save into, by their path: « Ventes / Régions ». */
export function useWritableFolders(): { value: string; label: string }[] {
  const { data: folders = [] } = useFolders()
  const byId = new Map(folders.map((f) => [f.id, f]))
  const path = (f: Folder): string => {
    const parent = f.parent ? byId.get(f.parent) : undefined
    const name = f.personal ? $t('Mon dossier') : f.name
    return parent ? `${path(parent)} / ${name}` : name
  }
  return folders
    .filter((f) => f.access !== 'view')
    .map((f) => ({ value: f.id, label: path(f) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function FolderPicker({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const options = useWritableFolders()
  return <Choice value={value} onValueChange={onChange} options={options} aria-label={$t('Dossier')} size="default" className="w-full" />
}

/** Name, description and folder: what saving a question or creating a dashboard asks. */
export function SaveDialog({
  open,
  onOpenChange,
  title,
  description,
  initial,
  withFolder = true,
  withDescription = true,
  submitLabel = $t('Enregistrer'),
  onSubmit,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  initial?: { name?: string; description?: string | null; folder?: string | null }
  withFolder?: boolean
  withDescription?: boolean
  submitLabel?: string
  onSubmit: (v: { name: string; description: string; folder: string | null }) => Promise<void>
  children?: React.ReactNode
}) {
  const { data: me } = useMe()
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [folder, setFolder] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setText(initial?.description ?? '')
    setFolder(initial?.folder ?? me?.personal_folder ?? null)
    setError(null)
  }, [open, initial?.name, initial?.description, initial?.folder, me?.personal_folder])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!name.trim()) return
            setBusy(true)
            setError(null)
            try {
              await onSubmit({ name: name.trim(), description: text.trim(), folder })
              onOpenChange(false)
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            } finally {
              setBusy(false)
            }
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="save-name">{$t('Nom')}</Label>
            <Input id="save-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
          </div>
          {withDescription ? (
            <div className="space-y-1.5">
              <Label htmlFor="save-desc">{$t('Description')}</Label>
              <Textarea id="save-desc" value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={$t('Facultative')} />
            </div>
          ) : null}
          {withFolder ? (
            <div className="space-y-1.5">
              <Label>{$t('Dossier')}</Label>
              <FolderPicker value={folder} onChange={setFolder} />
            </div>
          ) : null}
          {children}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {$t('Annuler')}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Asks before something that cannot be undone. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = $t('Supprimer'),
  destructive = true,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {$t('Annuler')}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
                onOpenChange(false)
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
