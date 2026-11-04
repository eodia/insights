'use client'

import type { DashboardCard, DashboardTab, LookColor, Question } from '@eodia/contracts'
import { LookIcon } from '@/components/app/look'
import { IconPicker } from '@/components/app/structure/pickers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Hint } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { LOOK_HEX } from '@/lib/format'
import { $t, $tp } from '@/lib/i18n'
import { keys } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useQueries } from '@tanstack/react-query'
import { BarChart3, Copy, Eye, type LucideIcon, Heading, ImageIcon, Link2, ListFilter, Minus, MousePointerClick, Smile, SlidersHorizontal, Sparkles, Trash2, Type } from 'lucide-react'
import { domToJpeg } from 'modern-screenshot'
import { useState, useSyncExternalStore } from 'react'

// ── Pictures of the tabs ────────────────────────────────────────────────────
// A tab is pictured when it has been shown with its cards loaded; hovering it afterwards shows
// that picture. Kept for the session of the browser tab, by dashboard and tab.

const shots = new Map<string, string>()
const listeners = new Set<() => void>()
const STORE = 'eodia:tab-shot:'

function shotOf(key: string): string | undefined {
  const known = shots.get(key)
  if (known) return known
  try {
    const kept = sessionStorage.getItem(STORE + key)
    if (kept) shots.set(key, kept)
    return kept ?? undefined
  } catch {
    return undefined
  }
}

/** The last picture of a tab, if it has been shown. */
export function useTabShot(key: string): string | undefined {
  return useSyncExternalStore(
    (on) => {
      listeners.add(on)
      return () => listeners.delete(on)
    },
    () => shotOf(key),
    () => undefined,
  )
}

/** Pictures what the grid shows — its visible part, small — as the tab's picture. */
export async function pictureTab(key: string, grid: HTMLElement): Promise<void> {
  const width = grid.clientWidth
  const height = Math.min(grid.scrollHeight, Math.round(width * 0.62))
  if (!width || !height) return
  const url = await domToJpeg(grid, {
    width,
    height,
    // Sharp at the preview's size on a dense screen, light everywhere else.
    scale: Math.min(1, 600 / width),
    quality: 0.72,
    backgroundColor: getComputedStyle(grid).backgroundColor || '#ffffff',
    font: false,
    timeout: 4000,
    // Another site's page cannot be pictured: its frame stays blank.
    filter: (el) => !(el instanceof HTMLIFrameElement),
  })
  shots.set(key, url)
  try {
    sessionStorage.setItem(STORE + key, url)
  } catch {
    // The session is full, or closed: the picture lives as long as the page.
  }
  for (const on of listeners) on()
}

/** A tab's name, after its pictogram — in its colour, when it has one. */
export function TabLabel({ tab, className }: { tab: Pick<DashboardTab, 'label' | 'icon' | 'color'>; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      {tab.icon ? <LookIcon name={tab.icon} color={tab.color ?? null} className="size-3.5 shrink-0" /> : null}
      <span className="truncate">{tab.label}</span>
    </span>
  )
}

/** The underline of the open tab: the tab's colour, or the theme's. */
export function TabMark({ color }: { color?: LookColor | undefined }) {
  return <span className={cn('pointer-events-none absolute inset-x-0 bottom-0 h-0.5 rounded-full', !color && 'bg-primary')} style={color ? { background: LOOK_HEX[color] } : undefined} />
}

const KIND_ICONS: Record<DashboardCard['kind'], LucideIcon> = {
  question: BarChart3,
  heading: Heading,
  text: Type,
  embed: Link2,
  filter: ListFilter,
  buttons: MousePointerClick,
  link: Link2,
  variable: SlidersHorizontal,
  image: ImageIcon,
  separator: Minus,
  summary: Sparkles,
}

/**
 * What a tab holds, seen from its name: its description, then its cards drawn small, where they
 * sit — a map of the tab, before one opens it. Questions' names are read once, then cached.
 */
export function TabPreview({ tab, cards, columns, names = true, shotKey }: { tab: DashboardTab; cards: readonly DashboardCard[]; columns: number; names?: boolean; shotKey: string }) {
  const shot = useTabShot(shotKey)
  const ids = [...new Set(cards.flatMap((c) => (c.kind === 'question' && !c.title && c.question ? [c.question] : [])))]
  const questions = useQueries({
    queries: ids.map((id) => ({ queryKey: keys.question(id), queryFn: () => api.get<Question>(`/v1/questions/${id}`), enabled: names && !shot, staleTime: 60_000 })),
  })
  const nameOf = new Map(ids.map((id, i) => [id, questions[i]?.data?.name]))
  const placed = cards.filter((c) => c.kind !== 'separator')
  const rows = Math.max(1, ...placed.map((c) => c.y + c.h))
  // The map keeps the grid's proportions, its height capped: a long tab is shown by its top.
  const width = 272
  const unit = width / columns
  const height = Math.min(rows * unit * 0.55, 190)
  const scaleY = height / rows
  const titleOf = (c: DashboardCard) => c.title || (c.kind === 'heading' ? c.text : undefined) || (c.question ? nameOf.get(c.question) : undefined) || ''
  return (
    <div className="w-[18.5rem] space-y-2 p-1">
      <div>
        <div className="text-sm font-semibold text-foreground">
          <TabLabel tab={tab} />
        </div>
        {tab.description ? <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{tab.description}</p> : null}
      </div>
      {shot ? (
        <img src={shot} alt="" className="block w-[272px] rounded-lg border object-cover object-top shadow-xs" style={{ maxHeight: 190 }} />
      ) : placed.length ? (
        <div className="relative overflow-hidden rounded-lg border bg-muted/40" style={{ width, height }}>
          {placed.map((c) => {
            const Icon = KIND_ICONS[c.kind] ?? BarChart3
            const title = titleOf(c)
            return (
              <div
                key={c.id}
                className="absolute flex items-start gap-1 overflow-hidden rounded-[4px] border bg-background px-1 py-0.5 text-[9px] leading-tight text-muted-foreground"
                style={{ left: c.x * unit + 1.5, top: c.y * scaleY + 1.5, width: c.w * unit - 3, height: Math.max(c.h * scaleY - 3, 8) }}
              >
                <Icon className="mt-px size-2.5 shrink-0" style={tab.color ? { color: LOOK_HEX[tab.color] } : undefined} />
                <span className="line-clamp-2 min-w-0">{title}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{$t('Onglet vide.')}</p>
      )}
      <p className="text-[11px] text-muted-foreground">{$tp(placed.length, '{count} carte', '{count} cartes')}</p>
    </div>
  )
}

/** A tab's settings, in a dialog: its name, its pictogram and colour, what its preview says. */
export function TabSettingsDialog({
  tab,
  conditionLabel,
  canRemove,
  onSave,
  onCondition,
  onRemove,
  onDuplicate,
  onClose,
}: {
  tab: DashboardTab
  /** How the display condition reads, when the tab has one. */
  conditionLabel?: string | undefined
  canRemove: boolean
  onSave: (patch: Pick<DashboardTab, 'label'> & { icon: string | undefined; color: LookColor | undefined; description: string | undefined }) => void
  onCondition: () => void
  onRemove: () => void
  /** A copy of the tab and its cards, just after it. */
  onDuplicate: () => void
  onClose: () => void
}) {
  const [label, setLabel] = useState(tab.label)
  const [icon, setIcon] = useState<string | null>(tab.icon ?? null)
  const [color, setColor] = useState<LookColor | null>(tab.color ?? null)
  const [description, setDescription] = useState(tab.description ?? '')
  const save = () => {
    onSave({ label: label.trim() || tab.label, icon: icon ?? undefined, color: color ?? undefined, description: description.trim() || undefined })
    onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{$t('Réglages de l’onglet')}</DialogTitle>
          <DialogDescription>{$t('Son nom, son pictogramme et sa couleur dans la rangée d’onglets ; sa description s’affiche au survol, avec un aperçu de ses cartes.')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{$t('Nom')}</Label>
            <div className="flex items-center gap-2">
              <IconPicker
                value={icon}
                onChange={setIcon}
                color={color}
                onColorChange={setColor}
                trigger={
                  <button type="button" aria-label={$t('Pictogramme et couleur')} className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background hover:bg-accent">
                    {icon ? <LookIcon name={icon} color={color} className="size-4" /> : <Smile className="size-4 text-muted-foreground" />}
                  </button>
                }
              />
              <Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{$t('Description (facultatif)')}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder={$t('Les ventes du mois, par canal et par région…')} className="min-h-16 text-sm" />
          </div>
          <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
            <Eye className={cn('size-4 shrink-0', conditionLabel ? 'text-violet-600' : 'text-muted-foreground')} />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium">{$t('Condition d’affichage')}</div>
              <div className="truncate text-xs text-muted-foreground">{conditionLabel ? `${$t('Affiché si')} ${conditionLabel}` : $t('Toujours affiché')}</div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onClose()
                onCondition()
              }}
            >
              {conditionLabel ? $t('Modifier') : $t('Ajouter')}
            </Button>
          </div>
          <DialogFooter className="flex-row items-center sm:justify-between">
            <div className="flex gap-1">
              <Hint label={$t('Dupliquer l’onglet')}>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={$t('Dupliquer l’onglet')}
                  onClick={() => {
                    onDuplicate()
                    onClose()
                  }}
                >
                  <Copy />
                </Button>
              </Hint>
              {canRemove ? (
                <Hint label={$t('Supprimer l’onglet')}>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={$t('Supprimer l’onglet')}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      onRemove()
                      onClose()
                    }}
                  >
                    <Trash2 />
                  </Button>
                </Hint>
              ) : null}
            </div>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                {$t('Annuler')}
              </Button>
              <Button type="submit">{$t('Appliquer')}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
