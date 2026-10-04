'use client'

import type { Me, Workspace } from '@eodia/contracts'
import { BrandMark } from '@/components/app/brand-mark'
import { LookIcon } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, api } from '@/lib/api'
import { LOOK_CLASSES } from '@/lib/format'
import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { enterWorkspace } from '@/lib/workspace'
import { Check, ChevronsUpDown, Layers, Loader2, Plus, Settings2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

/** A space's mark: its pictogram on its colour — without one, the mark of eodia insights. */
export function WorkspaceLogo({ workspace, className, iconClassName }: { workspace: Pick<Workspace, 'name' | 'color' | 'icon'>; className?: string; iconClassName?: string }) {
  if (!workspace.icon) {
    return (
      <span className={cn('inline-flex shrink-0 overflow-hidden rounded-lg', className)}>
        {/* « size-full! »: a menu item sizes its icons to 16 px, the mark fills its box. */}
        <BrandMark className="size-full!" />
      </span>
    )
  }
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-lg font-semibold', LOOK_CLASSES[workspace.color ?? 'green'], className)}>
      <LookIcon name={workspace.icon} className={cn('size-1/2', iconClassName)} />
    </span>
  )
}

/**
 * The top of the sidebar: the product, and the space everything below is about. The menu moves
 * to another space — what the screens, the sources and the queries show changes with it —,
 * leads to the space's settings, and lets an administrator of the instance create one.
 */
export function WorkspaceMenu({ me }: { me: Me | undefined }) {
  const [creating, setCreating] = useState(false)
  const current = me?.workspace
  const spaces = me?.workspaces ?? []
  // One space and nothing to manage: the same face, which does not pretend to be a button.
  const choosing = spaces.length > 1 || !!me?.can.manage_workspace || !!me?.can.create_workspaces

  const face = (
    <>
      {current ? <WorkspaceLogo workspace={current} className="size-10 text-sm" iconClassName="size-5" /> : <BrandMark size={40} className="size-10 shrink-0" />}
      <div className="min-w-0 flex-1 text-left leading-tight">
        <div className="truncate text-[15px] font-semibold">eodia insights</div>
        <div className="truncate text-xs text-muted-foreground">{current?.name ?? $t('Toutes les sources')}</div>
      </div>
      {choosing ? <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" /> : null}
    </>
  )
  if (!choosing) return <div className="flex h-[76px] items-center gap-3 border-b px-4">{face}</div>

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex h-[76px] w-full items-center gap-3 border-b px-4 transition-colors hover:bg-sidebar-accent/70 data-[state=open]:bg-sidebar-accent/70">
            {face}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[248px]">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{$t('Espaces')}</DropdownMenuLabel>
          {spaces.map((w) => (
            <DropdownMenuItem key={w.id} onSelect={() => (w.id === current?.id ? undefined : void enterWorkspace(w.id))} className="gap-2.5 py-2">
              <WorkspaceLogo workspace={w} className="size-7 text-[11px]" iconClassName="size-3.5" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{w.name}</span>
                {w.archived ? <span className="block text-[11px] text-muted-foreground">{$t('Archivé')}</span> : null}
              </span>
              {w.id === current?.id ? <Check className="size-4 text-primary" /> : null}
            </DropdownMenuItem>
          ))}
          {me?.can.manage_workspace || me?.can.create_workspaces ? <DropdownMenuSeparator /> : null}
          {me?.can.manage_workspace ? (
            <DropdownMenuItem asChild>
              <Link href="/admin/workspace">
                <Settings2 className="size-4" /> {$t('Paramètres de l’espace')}
              </Link>
            </DropdownMenuItem>
          ) : null}
          {me?.can.create_workspaces ? (
            <>
              <DropdownMenuItem asChild>
                <Link href="/admin/workspaces">
                  <Layers className="size-4" /> {$t('Tous les espaces')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCreating(true)}>
                <Plus className="size-4" /> {$t('Nouvel espace')}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <NewWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}

/** A new space: its name and what it is for; its members and its look come next, in its settings. */
export function NewWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const w = await api.post<Workspace>('/v1/workspaces', { name, description: description || null })
      await enterWorkspace(w.id, '/admin/workspace')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : $t('Création impossible.'))
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{$t('Nouvel espace')}</DialogTitle>
            <DialogDescription>{$t('Une équipe, une filiale : ses sources, ses dossiers et ses droits, à part. Vous en serez administrateur.')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">{$t('Nom')}</Label>
            <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus placeholder={$t('Finance, Filiale Nord…')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-description">{$t('Description')}</Label>
            <Textarea id="ws-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {$t('Annuler')}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : null} {$t('Créer l’espace')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
