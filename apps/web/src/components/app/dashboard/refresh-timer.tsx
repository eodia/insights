'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Hint } from '@/components/ui/tooltip'
import { $t, msg } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ChevronDown, RefreshCw } from 'lucide-react'

const CHOICES: readonly { value: number | null; label: string; shortLabel: string }[] = [
  { value: null, label: msg('Pas de rafraîchissement'), shortLabel: msg('Désactivé') },
  { value: 60, label: msg('Toutes les minutes'), shortLabel: msg('1 min') },
  { value: 300, label: msg('Toutes les 5 minutes'), shortLabel: msg('5 min') },
  { value: 900, label: msg('Toutes les 15 minutes'), shortLabel: msg('15 min') },
  { value: 3600, label: msg('Toutes les heures'), shortLabel: msg('1 h') },
]

/**
 * Refreshing a dashboard, in one split button: the arrows refresh it now, the chevron sets
 * the interval. Refreshed on its own, a ring fills around the arrows until the next time —
 * `since` is when the current cycle started, a new value starts the ring over.
 */
export function RefreshTimer({
  seconds,
  since,
  paused = false,
  onRefresh,
  onChange,
}: {
  seconds: number | null
  since: number
  paused?: boolean
  onRefresh: () => void
  /** Without it, the interval is not the person's to choose: only the arrows show. */
  onChange?: ((seconds: number | null) => void) | undefined
}) {
  const current = CHOICES.find((c) => c.value === seconds)
  const label = current
    ? $t(current.label)
    : $t('Toutes les {seconds} secondes', { seconds: seconds ?? 0 })
  const active = seconds !== null && !paused
  const interval = current ? $t(current.shortLabel) : $t('{seconds} s', { seconds: seconds ?? 0 })
  const accessibleLabel = $t('Rafraîchissement automatique : {state}', {
    state: paused && seconds !== null ? $t('En pause · {interval}', { interval: label }) : label,
  })
  return (
    <div
      className={cn(
        'inline-flex h-8 items-center rounded-lg border bg-background shadow-xs',
        active && 'border-primary/25 bg-primary/5 text-primary',
      )}
    >
      <Hint label={active ? `${$t('Rafraîchir')} · ${label}` : $t('Rafraîchir')}>
        <button
          type="button"
          onClick={onRefresh}
          aria-label={$t('Rafraîchir')}
          className={cn(
            'inline-flex h-full items-center gap-1.5 px-2 transition-colors',
            onChange ? 'rounded-l-lg' : 'rounded-lg',
            active ? 'hover:bg-primary/10' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {active ? (
            <span className="relative inline-flex size-4.5 items-center justify-center">
              <svg viewBox="0 0 20 20" className="absolute inset-0 -rotate-90" aria-hidden="true" focusable="false">
                <circle cx="10" cy="10" r="8.5" fill="none" strokeWidth="1.5" className="stroke-primary/15" />
                <circle
                  key={`${since}-${seconds}`}
                  cx="10"
                  cy="10"
                  r="8.5"
                  fill="none"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={100}
                  className="stroke-primary [animation-name:refresh-ring] motion-reduce:animate-none"
                  style={{ animationDuration: `${seconds}s`, animationTimingFunction: 'linear', animationFillMode: 'both' }}
                />
              </svg>
              <RefreshCw className="size-2.5" />
            </span>
          ) : (
            <RefreshCw className="size-4" />
          )}
          {active ? <span className="text-xs font-medium tabular-nums">{interval}</span> : null}
        </button>
      </Hint>
      {onChange ? (
        <>
          <span className={cn('h-4 w-px', active ? 'bg-primary/20' : 'bg-border')} />
          <DropdownMenu>
            <Hint label={accessibleLabel}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={accessibleLabel}
                  className={cn(
                    'inline-flex h-full w-6 items-center justify-center rounded-r-lg transition-colors',
                    active ? 'hover:bg-primary/10' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <ChevronDown className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
            </Hint>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-foreground">{$t('Rafraîchissement automatique')}</DropdownMenuLabel>
              <p className="px-2 pb-2 text-xs leading-relaxed text-muted-foreground">
                {$t('Actualiser les données à intervalle régulier.')}
              </p>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={String(seconds)} onValueChange={(v) => onChange(v === 'null' ? null : Number(v))}>
                {CHOICES.map((c) => (
                  <DropdownMenuRadioItem
                    key={String(c.value)}
                    value={String(c.value)}
                    className="py-2 data-[state=checked]:bg-primary/5 data-[state=checked]:font-medium"
                  >
                    {$t(c.label)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}
    </div>
  )
}
