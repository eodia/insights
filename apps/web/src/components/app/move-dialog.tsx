'use client'

import type { Dashboard, ItemSummary } from '@eodia/contracts'
import { FolderPicker } from '@/components/app/dialogs'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { useDashboard, useMe } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { Check, FolderClosed, LayoutDashboard, Loader2, Search } from 'lucide-react'
import { useEffect, useState } from 'react'

export type MoveTarget =
  | { readonly kind: 'folder'; readonly folder: string }
  | { readonly kind: 'dashboard'; readonly dashboard: string; readonly tab: string | null }

/**
 * Where to move a chart: a folder, or a dashboard and one of its tabs. `targets` says which
 * of the two are offered; the current place is shown as such.
 */
export function MoveDialog({
  open,
  onOpenChange,
  name,
  targets = ['folder', 'dashboard'],
  current,
  onMove,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  name: string
  targets?: readonly ('folder' | 'dashboard')[]
  current?: { folder?: string | null; dashboard?: string | null; tab?: string | null }
  onMove: (target: MoveTarget) => Promise<void>
}) {
  const { data: me } = useMe()
  const [mode, setMode] = useState<'folder' | 'dashboard'>(targets[0] ?? 'folder')
  const [folder, setFolder] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<string | null>(null)
  const [tab, setTab] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const offered = targets.join(',')
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on opening; `offered` stands for `targets`
  useEffect(() => {
    if (!open) return
    setMode(
      current?.dashboard && targets.includes('dashboard') ? 'dashboard' : (targets[0] ?? 'folder'),
    )
    setFolder(current?.folder ?? me?.personal_folder ?? null)
    setDashboard(current?.dashboard ?? null)
    setTab(current?.tab ?? null)
    setQ('')
    setError(null)
  }, [open, current?.folder, current?.dashboard, current?.tab, me?.personal_folder, offered])
  const dashboards = useQuery({
    queryKey: ['search', 'dashboards'],
    queryFn: () =>
      api.get<{ items: ItemSummary[] }>('/v1/search?q=&kind=dashboard').then((r) => r.items),
    enabled: open && mode === 'dashboard',
  })
  const { data: chosen } = useDashboard(mode === 'dashboard' ? dashboard : null)
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const list = (dashboards.data ?? []).filter((d) => !q || fold(d.name).includes(fold(q)))
  const tabs = (chosen as Dashboard | undefined)?.tabs ?? []
  const effectiveTab = tabs.some((t) => t.id === tab) ? tab : (tabs[0]?.id ?? null)
  const same =
    mode === 'dashboard'
      ? dashboard === current?.dashboard && effectiveTab === (current?.tab ?? null)
      : !current?.dashboard && folder === current?.folder
  const ready =
    !same &&
    (mode === 'folder'
      ? folder !== null
      : dashboard !== null && (tabs.length === 0 || effectiveTab !== null))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{$t('Déplacer « {name} »', { name })}</DialogTitle>
          <DialogDescription>
            {mode === 'dashboard'
              ? $t(
                  'Elle appartiendra au tableau de bord choisi et n’apparaîtra dans aucun dossier ; ses liens aux filtres de l’ancien tableau ne suivent pas.',
                )
              : $t('Elle se range dans le dossier choisi et en prend les droits.')}
          </DialogDescription>
        </DialogHeader>
        {targets.length > 1 ? (
          <div className="flex rounded-lg border p-0.5">
            {targets.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setMode(t)}
                className={cn(
                  'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-sm',
                  mode === t ? 'bg-muted font-medium' : 'text-muted-foreground',
                )}
              >
                {t === 'folder' ? (
                  <FolderClosed className="size-4" />
                ) : (
                  <LayoutDashboard className="size-4" />
                )}
                {t === 'folder' ? $t('Dossier') : $t('Tableau de bord')}
              </button>
            ))}
          </div>
        ) : null}
        {mode === 'folder' ? (
          <div className="space-y-1.5">
            <Label>{$t('Dossier')}</Label>
            <FolderPicker value={folder} onChange={setFolder} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={$t('Rechercher un tableau de bord…')}
                className="pl-9"
              />
            </div>
            <div className="max-h-60 space-y-0.5 overflow-y-auto">
              {dashboards.isLoading ? (
                <Loader2 className="mx-auto my-4 size-4 animate-spin text-muted-foreground" />
              ) : null}
              {list.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setDashboard(d.id)
                    setTab(null)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent',
                    dashboard === d.id && 'bg-accent font-medium',
                  )}
                >
                  <LayoutDashboard className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{d.name}</span>
                  {d.id === current?.dashboard ? (
                    <span className="text-xs text-muted-foreground">{$t('actuel')}</span>
                  ) : null}
                  {dashboard === d.id ? <Check className="size-4 text-primary" /> : null}
                </button>
              ))}
              {!dashboards.isLoading && list.length === 0 ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">
                  {$t('Aucun tableau de bord')}
                </p>
              ) : null}
            </div>
            {tabs.length > 1 ? (
              <div className="space-y-1.5">
                <Label>{$t('Onglet')}</Label>
                <Choice
                  value={effectiveTab ?? ''}
                  onValueChange={setTab}
                  options={tabs.map((t) => ({ value: t.id, label: t.label }))}
                  aria-label={$t('Onglet')}
                  size="default"
                  className="w-full"
                />
              </div>
            ) : null}
          </div>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {$t('Annuler')}
          </Button>
          <Button
            disabled={!ready || busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await onMove(
                  mode === 'folder'
                    ? { kind: 'folder', folder: folder as string }
                    : { kind: 'dashboard', dashboard: dashboard as string, tab: effectiveTab },
                )
                onOpenChange(false)
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {$t('Déplacer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
