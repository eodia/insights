'use client'

import type { ItemSummary } from '@eodia/contracts'
import { ConfirmDialog } from '@/components/app/dialogs'
import { FavoriteIcon } from '@/components/app/favorite-icon'
import { itemHref } from '@/components/app/palette'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Hint } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { $t, $tp } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, CheckSquare, Share2, Square, Trash2, X } from 'lucide-react'
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

/**
 * Les éléments cochés d'un dossier, pour agir sur plusieurs à la fois — comme la liste des
 * conversations de la Messagerie : la case au survol, Maj pour une plage, Ctrl ou ⌘ pour un de
 * plus, Échap pour tout décocher, Suppr pour supprimer. Chaque suppression passe seule : le
 * serveur dit lesquelles il refuse, et pourquoi.
 */

/** Ce qui est coché parmi `listed`, et de quoi le changer. */
export function useTicks(listed: readonly ItemSummary[], resetOn: unknown) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set())
  const anchor = useRef<string | null>(null)
  const rows = listed.filter((i) => ticked.has(i.id))
  const clear = () => {
    setTicked(new Set())
    anchor.current = null
  }
  /** Coche ou décoche un élément — ou, avec Maj, tous ceux du dernier coché jusqu'à lui. */
  const tick = (id: string, range: boolean) => {
    const ids = listed.map((i) => i.id)
    const from = anchor.current === null ? -1 : ids.indexOf(anchor.current)
    const to = ids.indexOf(id)
    setTicked((before) => {
      const next = new Set(before)
      if (range && from >= 0 && to >= 0) {
        for (const one of ids.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(one)
      } else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    anchor.current = id
  }
  const all = () => setTicked(new Set(listed.map((i) => i.id)))
  /** Retire des éléments — supprimés — de la sélection. */
  const drop = (ids: readonly string[]) =>
    setTicked((before) => {
      const next = new Set(before)
      for (const id of ids) next.delete(id)
      return next
    })
  // Un autre dossier ou un autre onglet : rien de coché.
  // biome-ignore lint/correctness/useExhaustiveDependencies: vidé quand la vue change
  useEffect(clear, [resetOn])
  return { ticked, rows, tick, all, clear, drop }
}

/** Hors d'un champ, d'une boîte de dialogue ou d'un menu : là où un raccourci de la liste s'applique. */
export const outsideFields = (target: EventTarget | null) =>
  !(target instanceof Element) ||
  !target.closest(
    'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]',
  )

/** La case d'un élément, ou de tous : cochée, vide, ou — pour tous — en partie. */
export function TickBox({
  state,
  label,
  onToggle,
  className,
}: {
  state: boolean | 'some'
  label: string
  /** Le clic lui-même : Maj coche une plage. */
  onToggle: (event: MouseEvent) => void
  className?: string
}) {
  return (
    <Checkbox
      checked={state === 'some' ? 'indeterminate' : state}
      aria-label={label}
      onClick={onToggle}
      // Maj coche une plage : pas de texte sélectionné au passage.
      onMouseDown={(e) => e.shiftKey && e.preventDefault()}
      className={cn('bg-background', className)}
    />
  )
}

const deletePath = (i: ItemSummary) =>
  i.kind === 'dashboard' ? `/v1/dashboards/${i.id}` : `/v1/questions/${i.id}`

/** Ce que la confirmation dit de ce qui part avec. */
function consequence(items: readonly ItemSummary[]): string {
  const dashboards = items.some((i) => i.kind === 'dashboard')
  const questions = items.some((i) => i.kind !== 'dashboard')
  if (dashboards && questions)
    return $t(
      'Les questions créées dans un tableau de bord supprimé partent avec lui ; les tableaux de bord qui affichent une question supprimée perdent la carte.',
    )
  if (dashboards)
    return $t(
      'Les questions créées dans ce tableau de bord sont supprimées avec lui ; celles rangées dans un dossier restent.',
    )
  return $t('Les tableaux de bord qui l’affichent perdront la carte.')
}

/** La suppression d'éléments, confirmée une fois : la boîte à rendre, et de quoi l'ouvrir. */
export function useDeleteItems(onDeleted: (ids: string[]) => void) {
  const qc = useQueryClient()
  const [asked, setAsked] = useState<readonly ItemSummary[]>([])
  const run = async () => {
    const results = await Promise.allSettled(asked.map((i) => api.delete(deletePath(i))))
    const done = asked.filter((_, n) => results[n]?.status === 'fulfilled').map((i) => i.id)
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    await qc.invalidateQueries({ queryKey: ['folder-items'] })
    if (done.length) {
      onDeleted(done)
      toast.success($tp(done.length, '{count} élément supprimé.', '{count} éléments supprimés.'))
    }
    if (refused.length) {
      const why =
        refused[0]?.reason instanceof Error ? refused[0].reason.message : String(refused[0]?.reason)
      toast.error(
        $tp(
          refused.length,
          '{count} élément n’a pas pu être supprimé : {why}',
          '{count} éléments n’ont pas pu être supprimés : {why}',
          { why },
        ),
      )
    }
  }
  const one = asked.length === 1 ? asked[0] : undefined
  const dialog = (
    <ConfirmDialog
      open={asked.length > 0}
      onOpenChange={(open) => !open && setAsked([])}
      title={
        one
          ? $t('Supprimer « {name} » ?', { name: one.name })
          : $tp(asked.length, 'Supprimer {count} élément ?', 'Supprimer {count} éléments ?')
      }
      description={consequence(asked)}
      onConfirm={run}
    />
  )
  const ask = (items: readonly ItemSummary[]) => {
    if (items.length) setAsked(items)
  }
  return { ask, dialog }
}

/**
 * Le clic droit sur un élément. Sur un élément coché parmi d'autres, il agit sur toute la
 * sélection, comme dans un explorateur de fichiers.
 */
export function ItemMenu({
  item,
  selection,
  ticked,
  onTick,
  onShare,
  onBookmark,
  onDelete,
  onClear,
  children,
}: {
  item: ItemSummary
  /** Les éléments cochés, dans l'ordre de la liste. */
  selection: readonly ItemSummary[]
  ticked: boolean
  onTick: () => void
  onShare: () => void
  onBookmark: () => void
  onDelete: (items: readonly ItemSummary[]) => void
  onClear: () => void
  children: ReactNode
}) {
  const many = ticked && selection.length > 1
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {many ? (
          <>
            <ContextMenuLabel>
              {$tp(
                selection.length,
                '{count} élément sélectionné',
                '{count} éléments sélectionnés',
              )}
            </ContextMenuLabel>
            <ContextMenuItem onSelect={onClear}>
              <X />
              {$t('Annuler la sélection')}
              <ContextMenuShortcut>{$t('Échap')}</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => onDelete(selection)}>
              <Trash2 />
              {$tp(selection.length, 'Supprimer {count} élément', 'Supprimer {count} éléments')}
              <ContextMenuShortcut>{$t('Suppr')}</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuItem onSelect={() => window.location.assign(itemHref(item))}>
              <ArrowUpRight />
              {$t('Ouvrir')}
              <ContextMenuShortcut>{$t('Entrée')}</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={onTick}>
              {ticked ? <Square /> : <CheckSquare />}
              {ticked ? $t('Désélectionner') : $t('Sélectionner')}
            </ContextMenuItem>
            <ContextMenuItem onSelect={onBookmark}>
              <FavoriteIcon active={item.bookmarked} />
              {item.bookmarked ? $t('Retirer des favoris') : $t('Ajouter aux favoris')}
            </ContextMenuItem>
            <ContextMenuItem onSelect={onShare}>
              <Share2 />
              {$t('Partager')}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => onDelete([item])}>
              <Trash2 />
              {$t('Supprimer')}
              <ContextMenuShortcut>{$t('Suppr')}</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** À la place des onglets tant que des éléments sont cochés : tout cocher, combien, supprimer. */
export function SelectionBar({
  count,
  all,
  onAll,
  onClear,
  onDelete,
}: {
  count: number
  /** Si tous les éléments listés sont cochés : oui, en partie. */
  all: boolean | 'some'
  onAll: () => void
  onClear: () => void
  onDelete: () => void
}) {
  const label = $tp(count, '{count} élément sélectionné', '{count} éléments sélectionnés')
  return (
    // Aussi haute que les onglets qu'elle remplace ; sa case au-dessus de celles des lignes.
    <div className="flex h-[41px] shrink-0 items-center gap-1 border-b bg-primary/5 pr-2 pl-[30px] text-sm">
      <TickBox
        state={all}
        label={all === true ? $t('Tout désélectionner') : $t('Tout sélectionner')}
        onToggle={all === true ? onClear : onAll}
        className="mr-3"
      />
      <span className="min-w-0 flex-1 truncate font-semibold tabular-nums" aria-live="polite">
        {label}
      </span>
      <Hint label={$t('Supprimer (Suppr)')}>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive"
          aria-label={$t('Supprimer')}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </Hint>
      <Hint label={$t('Annuler la sélection (Échap)')}>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          aria-label={$t('Annuler la sélection')}
          onClick={onClear}
        >
          <X />
        </Button>
      </Hint>
    </div>
  )
}
