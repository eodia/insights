'use client'

import type { Dashboard, DashboardCard, DashboardSnapshot, DashboardVersion } from '@eodia/contracts'
import { Avatar } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { formatAgo } from '@/lib/format'
import { $t, $tp, intlLocale, msg } from '@/lib/i18n'
import { ThemeScope } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { History, Loader2, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DashboardView, type Runner } from './view'

const KIND_NAMES: Record<string, string> = {
  heading: msg('un titre'),
  text: msg('un texte'),
  filter: msg('un volet de filtre'),
  buttons: msg('des boutons'),
  link: msg('un lien'),
  variable: msg('une variable'),
  image: msg('une image'),
  separator: msg('un séparateur'),
  summary: msg('un résumé'),
  embed: msg('une intégration'),
  block: msg('un bloc'),
  question: msg('une carte'),
}

/** How a card is called in a list of changes: its title, or what it is. */
const cardName = (c: DashboardCard) => {
  const title = c.title || (c.kind === 'heading' || c.kind === 'text' ? (c.text ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 40) : '')
  return title ? `« ${title} »` : $t(KIND_NAMES[c.kind] ?? msg('une carte'))
}

const without = (c: DashboardCard) => {
  const { x: _x, y: _y, w: _w, h: _h, ...rest } = c
  return JSON.stringify(rest)
}

/** What changed from one version to the next, in a few lines. */
export function changesBetween(before: DashboardSnapshot | null, after: DashboardSnapshot, created = false): string[] {
  if (!before) return [created ? $t('Création du tableau de bord') : $t('Premier état gardé')]
  const out: string[] = []
  if (before.name !== after.name) out.push($t('Renommé « {from} » → « {to} »', { from: before.name, to: after.name }))
  if ((before.description ?? '') !== (after.description ?? '')) out.push($t('Description modifiée'))
  const was = new Map(before.cards.map((c) => [c.id, c]))
  const now = new Map(after.cards.map((c) => [c.id, c]))
  const added = after.cards.filter((c) => !was.has(c.id))
  const removed = before.cards.filter((c) => !now.has(c.id))
  const changed = after.cards.filter((c) => was.has(c.id) && without(was.get(c.id) as DashboardCard) !== without(c))
  const moved = after.cards.filter((c) => {
    const o = was.get(c.id)
    return o && without(o) === without(c) && (o.x !== c.x || o.y !== c.y || o.w !== c.w || o.h !== c.h || o.tab !== c.tab)
  })
  if (added.length) out.push(`${$t('Ajouté')} : ${added.slice(0, 3).map(cardName).join(', ')}${added.length > 3 ? ` +${added.length - 3}` : ''}`)
  if (removed.length) out.push(`${$t('Retiré')} : ${removed.slice(0, 3).map(cardName).join(', ')}${removed.length > 3 ? ` +${removed.length - 3}` : ''}`)
  if (changed.length) out.push(`${$t('Modifié')} : ${changed.slice(0, 3).map(cardName).join(', ')}${changed.length > 3 ? ` +${changed.length - 3}` : ''}`)
  if (moved.length) out.push($tp(moved.length, '{count} carte déplacée ou redimensionnée', '{count} cartes déplacées ou redimensionnées'))
  const tabsBefore = new Map(before.tabs.map((t) => [t.id, t]))
  const tabsAfter = new Map(after.tabs.map((t) => [t.id, t]))
  for (const t of after.tabs) if (!tabsBefore.has(t.id)) out.push($t('Onglet « {name} » ajouté', { name: t.label }))
  for (const t of before.tabs) if (!tabsAfter.has(t.id)) out.push($t('Onglet « {name} » retiré', { name: t.label }))
  for (const t of after.tabs) {
    const o = tabsBefore.get(t.id)
    if (o && JSON.stringify(o) !== JSON.stringify(t)) out.push($t('Onglet « {name} » modifié', { name: t.label }))
  }
  if (JSON.stringify(before.parameters) !== JSON.stringify(after.parameters)) {
    const diff = after.parameters.length - before.parameters.length
    out.push(diff > 0 ? $tp(diff, '{count} filtre ajouté', '{count} filtres ajoutés') : diff < 0 ? $tp(-diff, '{count} filtre retiré', '{count} filtres retirés') : $t('Filtres modifiés'))
  }
  if (before.theme !== after.theme) out.push($t('Thème changé'))
  if (before.width !== after.width) out.push(after.width === 'a4' ? $t('Passé en page A4') : $t('Passé en pleine largeur'))
  if (before.cache_ttl !== after.cache_ttl || before.preload !== after.preload) out.push($t('Réglages de cache modifiés'))
  return out.length ? out : [$t('Aucun changement visible')]
}

/**
 * A dashboard's history: each save, who made it and what it changed — and, chosen, that version
 * shown as it was, to restore if one may edit.
 */
export function VersionsDialog({ dashboard, runner, editable, onClose, onRestored }: { dashboard: Dashboard; runner: Runner; editable: boolean; onClose: () => void; onRestored: () => Promise<void> }) {
  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['dashboard-versions', dashboard.id, dashboard.updated_at],
    queryFn: () => api.get<DashboardVersion[]>(`/v1/dashboards/${dashboard.id}/versions`),
  })
  const [chosen, setChosen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const selected = versions.find((v) => v.id === chosen) ?? versions[0] ?? null
  const latest = versions[0]?.id
  const restore = async (v: DashboardVersion) => {
    setBusy(true)
    try {
      await api.post(`/v1/dashboards/${dashboard.id}/versions/${v.id}/restore`, {})
      await onRestored()
      toast.success($t('Version du {date} restaurée.', { date: new Date(v.at).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' }) }))
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  const preview: Dashboard | null = selected ? { ...dashboard, ...selected.snapshot, id: dashboard.id } : null

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[86vh] max-w-[min(1280px,95vw)] flex-col gap-0 p-0 sm:max-w-[min(1280px,95vw)]">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4.5 text-primary" /> {$t('Historique des versions')}
          </DialogTitle>
          <DialogDescription>{$t('Chaque enregistrement est gardé : qui a changé quoi, et quand. Une version restaurée devient la plus récente — rien ne se perd.')}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr]">
          <div className="min-h-0 overflow-y-auto border-r p-2">
            {isLoading ? <Loader2 className="mx-auto mt-8 size-5 animate-spin text-muted-foreground" /> : null}
            {!isLoading && versions.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{$t('Pas encore de version : elles sont gardées à chaque enregistrement.')}</p> : null}
            {versions.map((v, i) => {
              const before = versions[i + 1]?.snapshot ?? null
              const changes = v.note?.startsWith('restore:')
                ? [$t('Restauration de la version du {date}', { date: new Date(v.note.slice(8)).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' }) })]
                : changesBetween(i === versions.length - 1 && versions.length >= 60 ? v.snapshot : before, v.snapshot, v.note === 'create')
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setChosen(v.id)}
                  className={cn('flex w-full gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/60', selected?.id === v.id && 'bg-primary/[0.07] ring-1 ring-primary/25')}
                >
                  {v.author ? <Avatar name={v.author.name} color={v.author.color} size="sm" /> : <span className="size-6 shrink-0 rounded-full bg-muted" />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="truncate text-[13px] font-semibold">{v.author?.name ?? $t('Ancien membre')}</span>
                      {v.id === latest ? <span className="shrink-0 rounded-full bg-primary/12 px-1.5 text-[10.5px] font-medium text-primary">{$t('Actuelle')}</span> : null}
                    </span>
                    <span className="block text-[11.5px] text-muted-foreground" title={new Date(v.at).toLocaleString(intlLocale())}>
                      {formatAgo(v.at)}
                    </span>
                    <span className="mt-1 block space-y-0.5">
                      {changes.slice(0, 4).map((c) => (
                        <span key={c} className="block truncate text-xs text-foreground/80">
                          · {c}
                        </span>
                      ))}
                      {changes.length > 4 ? <span className="block text-xs text-muted-foreground">{$t('et {count} autre(s)', { count: changes.length - 4 })}</span> : null}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex min-h-0 flex-col bg-surface">
            {selected && preview ? (
              <>
                <div className="flex items-center gap-3 border-b bg-background px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{selected.snapshot.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(selected.at).toLocaleString(intlLocale(), { dateStyle: 'full', timeStyle: 'short' })}
                      {selected.author ? ` · ${selected.author.name}` : ''}
                    </div>
                  </div>
                  {editable && selected.id !== latest ? (
                    <Button size="sm" onClick={() => void restore(selected)} disabled={busy}>
                      {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} {$t('Restaurer cette version')}
                    </Button>
                  ) : null}
                </div>
                <ThemeScope theme={dashboard.resolved_theme} className="theme-surface min-h-0 flex-1 bg-surface">
                  <DashboardView key={selected.id} dashboard={preview} runner={runner} editable={false} />
                </ThemeScope>
              </>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
