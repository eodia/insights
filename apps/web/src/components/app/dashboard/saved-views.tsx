'use client'

import type { DashboardSavedView, ParameterValue } from '@eodia/contracts'
import { ConfirmDialog } from '@/components/app/dialogs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Hint } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, BookmarkPlus, Check, Loader2, Replace, Star, Trash2, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Values } from './parameters'

const sameValues = (a: Values, b: Readonly<Record<string, unknown>>) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    const x = a[k] ?? null
    const y = (b[k] as ParameterValue | null | undefined) ?? null
    if (JSON.stringify(x) !== JSON.stringify(y)) return false
  }
  return true
}

/**
 * The dashboard's saved views — Qlik's bookmarks: filters and a tab kept under a name, one's
 * own or shared. One may be applied when the dashboard opens; a click applies any other.
 */
export function SavedViews({
  dashboardId,
  values,
  tab,
  onApply,
  applyDefault,
}: {
  dashboardId: string
  values: Values
  tab: string | null
  onApply: (values: Values, tab: string | null) => void
  /** Whether the default view applies on opening (not when a link brought filters). */
  applyDefault: boolean
}) {
  const qc = useQueryClient()
  const key = ['dashboard-views', dashboardId]
  const { data: views = [] } = useQuery({ queryKey: key, queryFn: () => api.get<DashboardSavedView[]>(`/v1/dashboards/${dashboardId}/views`) })
  const [saving, setSaving] = useState<DashboardSavedView | 'new' | null>(null)
  const applied = useRef(false)
  // The default view, once, when the dashboard opens.
  useEffect(() => {
    if (applied.current || !applyDefault) return
    const def = views.find((v) => v.is_default)
    if (!def) return
    applied.current = true
    onApply(def.values as Values, def.tab)
  }, [views, applyDefault, onApply])
  const current = views.find((v) => sameValues(values, v.values) && (v.tab ?? null) === (tab ?? null))

  const remove = async (v: DashboardSavedView) => {
    try {
      await api.delete(`/v1/dashboards/${dashboardId}/views/${v.id}`)
      await qc.invalidateQueries({ queryKey: key })
      toast.success($t('Vue « {name} » supprimée.', { name: v.name }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }
  const [replacing, setReplacing] = useState<DashboardSavedView | null>(null)
  const update = async (v: DashboardSavedView) => {
    try {
      await api.put(`/v1/dashboards/${dashboardId}/views/${v.id}`, { name: v.name, values, tab, shared: v.shared, is_default: v.is_default })
      await qc.invalidateQueries({ queryKey: key })
      toast.success($t('Vue « {name} » mise à jour.', { name: v.name }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }
  const mine = views.filter((v) => v.mine)
  const shared = views.filter((v) => !v.mine)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className={cn('gap-1.5', current && 'text-primary')}>
            <Bookmark className={cn(current && 'fill-current')} />
            <span className="max-w-40 truncate">{current ? current.name : $t('Vues')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {mine.length ? <DropdownMenuLabel className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{$t('Mes vues')}</DropdownMenuLabel> : null}
          {mine.map((v) => (
            <ViewItem key={v.id} view={v} active={current?.id === v.id} onApply={() => onApply(v.values as Values, v.tab)} onUpdate={() => setReplacing(v)} onRemove={() => void remove(v)} />
          ))}
          {shared.length ? (
            <>
              {mine.length ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{$t('Partagées')}</DropdownMenuLabel>
              {shared.map((v) => (
                <ViewItem key={v.id} view={v} active={current?.id === v.id} onApply={() => onApply(v.values as Values, v.tab)} />
              ))}
            </>
          ) : null}
          {views.length === 0 ? <p className="px-2 py-2 text-xs text-muted-foreground">{$t('Gardez les filtres choisis sous un nom — « Bretagne, mois en cours » — pour les retrouver d’un clic.')}</p> : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSaving('new')}>
            <BookmarkPlus /> {$t('Enregistrer la vue actuelle…')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={replacing !== null}
        onOpenChange={(o) => !o && setReplacing(null)}
        title={$t('Remplacer « {name} » ?', { name: replacing?.name ?? '' })}
        description={$t('La vue garde son nom ; ses filtres et son onglet deviennent ceux affichés maintenant.')}
        confirmLabel={$t('Remplacer')}
        destructive={false}
        onConfirm={async () => {
          if (replacing) await update(replacing)
        }}
      />
      {saving ? <SaveViewDialog dashboardId={dashboardId} values={values} tab={tab} onClose={() => setSaving(null)} onSaved={() => void qc.invalidateQueries({ queryKey: key })} /> : null}
    </>
  )
}

function ViewItem({ view, active, onApply, onUpdate, onRemove }: { view: DashboardSavedView; active: boolean; onApply: () => void; onUpdate?: () => void; onRemove?: () => void }) {
  return (
    <DropdownMenuItem onSelect={onApply} className="group/view pr-1">
      {active ? <Check className="text-primary" /> : view.is_default ? <Star className="fill-amber-400 text-amber-400" /> : view.shared ? <Users /> : <Bookmark />}
      <span className="min-w-0 flex-1 truncate">{view.name}</span>
      {!view.mine && view.author ? <span className="max-w-20 truncate text-[11px] text-muted-foreground">{view.author.name}</span> : null}
      {onUpdate ? (
        <Hint label={$t('Remplacer par les filtres actuels')}>
          <button
            type="button"
            aria-label={$t('Remplacer par les filtres actuels')}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onUpdate()
            }}
            className="rounded p-1 opacity-0 group-hover/view:opacity-100 hover:bg-background"
          >
            <Replace className="size-3.5" />
          </button>
        </Hint>
      ) : null}
      {onRemove ? (
        <Hint label={$t('Supprimer')}>
          <button
            type="button"
            aria-label={$t('Supprimer')}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onRemove()
            }}
            className="rounded p-1 text-destructive opacity-0 group-hover/view:opacity-100 hover:bg-destructive/10"
          >
            <Trash2 className="size-3.5 text-destructive" />
          </button>
        </Hint>
      ) : null}
    </DropdownMenuItem>
  )
}

function SaveViewDialog({ dashboardId, values, tab, onClose, onSaved }: { dashboardId: string; values: Values; tab: string | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [shared, setShared] = useState(false)
  const [isDefault, setDefault] = useState(false)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await api.post(`/v1/dashboards/${dashboardId}/views`, { name, values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v ?? null])), tab, shared, is_default: isDefault })
      onSaved()
      toast.success($t('Vue « {name} » enregistrée.', { name }))
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{$t('Enregistrer la vue')}</DialogTitle>
          <DialogDescription>{$t('Les filtres choisis et l’onglet ouvert, gardés sous un nom.')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) void save()
          }}
        >
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={$t('Bretagne, mois en cours')} />
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              {$t('Partager avec tous')}
              <span className="block text-xs text-muted-foreground">{$t('Toute personne qui ouvre ce tableau de bord la voit.')}</span>
            </span>
            <Switch checked={shared} onCheckedChange={setShared} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              {$t('Ma vue par défaut')}
              <span className="block text-xs text-muted-foreground">{$t('Appliquée quand vous ouvrez ce tableau de bord.')}</span>
            </span>
            <Switch checked={isDefault} onCheckedChange={setDefault} />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {$t('Annuler')}
            </Button>
            <Button type="submit" disabled={!name.trim() || busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {$t('Enregistrer')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
