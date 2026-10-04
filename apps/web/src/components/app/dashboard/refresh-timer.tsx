'use client'

import { Button } from '@/components/ui/button'
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
import { ChevronDown, Timer, TimerOff } from 'lucide-react'

const CHOICES: readonly { value: number | null; label: string; shortLabel: string }[] = [
  { value: null, label: msg('Pas de rafraîchissement'), shortLabel: msg('Désactivé') },
  { value: 60, label: msg('Toutes les minutes'), shortLabel: msg('1 min') },
  { value: 300, label: msg('Toutes les 5 minutes'), shortLabel: msg('5 min') },
  { value: 900, label: msg('Toutes les 15 minutes'), shortLabel: msg('15 min') },
  { value: 3600, label: msg('Toutes les heures'), shortLabel: msg('1 h') },
]

/**
 * A dashboard's refresh interval and state, with a ring that fills until the next refresh.
 * `since` is when the current cycle started — a new value starts the ring over.
 */
export function RefreshTimer({
  seconds,
  since,
  paused = false,
  onChange,
}: {
  seconds: number | null
  since: number
  paused?: boolean
  onChange: (seconds: number | null) => void
}) {
  const current = CHOICES.find((c) => c.value === seconds)
  const label = current
    ? $t(current.label)
    : $t('Toutes les {seconds} secondes', { seconds: seconds ?? 0 })
  const active = seconds !== null && !paused
  const interval = current ? $t(current.shortLabel) : $t('{seconds} s', { seconds: seconds ?? 0 })
  const state = paused && seconds !== null ? $t('En pause') : interval
  const accessibleLabel = $t('Rafraîchissement automatique : {state}', {
    state: paused && seconds !== null ? $t('En pause · {interval}', { interval: label }) : label,
  })
  return (
    <DropdownMenu>
      <Hint label={accessibleLabel}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={accessibleLabel}
            className={cn(
              'group gap-2 rounded-lg px-2.5 shadow-none',
              active &&
                'border-primary/25 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary',
            )}
          >
            {active ? (
              <svg
                viewBox="0 0 20 20"
                className="size-5 -rotate-90"
                aria-hidden="true"
                focusable="false"
              >
                <circle
                  cx="10"
                  cy="10"
                  r="8"
                  fill="none"
                  strokeWidth="1.75"
                  className="stroke-primary/15"
                />
                <circle
                  key={`${since}-${seconds}`}
                  cx="10"
                  cy="10"
                  r="8"
                  fill="none"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={100}
                  className="stroke-primary [animation-name:refresh-ring] motion-reduce:animate-none"
                  style={{
                    animationDuration: `${seconds}s`,
                    animationTimingFunction: 'linear',
                    animationFillMode: 'both',
                  }}
                />
                <circle cx="10" cy="10" r="2" className="fill-primary" />
              </svg>
            ) : paused && seconds !== null ? (
              <TimerOff className="size-4 text-muted-foreground" />
            ) : (
              <Timer className="size-4 text-muted-foreground" />
            )}
            <span className="hidden sm:inline">{$t('Auto')}</span>
            <span
              className={cn(
                'text-xs tabular-nums',
                active ? 'rounded bg-primary/10 px-1.5 py-0.5' : 'text-muted-foreground',
              )}
            >
              {state}
            </span>
            <ChevronDown className="size-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
          </Button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-foreground">
          {$t('Rafraîchissement automatique')}
        </DropdownMenuLabel>
        <p className="px-2 pb-2 text-xs leading-relaxed text-muted-foreground">
          {$t('Actualiser les données à intervalle régulier.')}
        </p>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={String(seconds)}
          onValueChange={(v) => onChange(v === 'null' ? null : Number(v))}
        >
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
  )
}
