'use client'

import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Star } from 'lucide-react'

/** The same favourite symbol in actions and status badges. */
export function FavoriteIcon({
  active = false,
  className,
}: {
  active?: boolean
  className?: string
}) {
  return (
    <Star
      aria-hidden="true"
      focusable="false"
      strokeWidth={1.75}
      className={cn(
        'size-4 shrink-0',
        active
          ? 'fill-amber-200/80 text-amber-600 dark:fill-amber-300/25 dark:text-amber-300'
          : 'fill-none text-muted-foreground',
        className,
      )}
    />
  )
}

/** A quiet, accessible favourite marker, aligned with the list's chips. */
export function FavoriteBadge({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label={$t('Favori')}
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-200/60 ring-inset',
        'dark:bg-amber-300/10 dark:ring-amber-300/20',
        className,
      )}
    >
      <FavoriteIcon active className="size-3.5" />
    </span>
  )
}
