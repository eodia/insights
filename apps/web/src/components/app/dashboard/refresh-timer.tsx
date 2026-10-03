'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Hint } from '@/components/ui/tooltip'
import { $t, msg } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Timer } from 'lucide-react'

const CHOICES: readonly { value: number | null; label: string }[] = [
  { value: null, label: msg('Pas de rafraîchissement') },
  { value: 60, label: msg('Toutes les minutes') },
  { value: 300, label: msg('Toutes les 5 minutes') },
  { value: 900, label: msg('Toutes les 15 minutes') },
  { value: 3600, label: msg('Toutes les heures') },
]

/**
 * The automatic refresh of a dashboard, as a stopwatch: a ring around it fills until the next
 * refresh. `since` is when the current cycle started — a new value starts the ring over.
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
  const label = current ? $t(current.label) : $t('Rafraîchissement automatique')
  const active = seconds !== null && !paused
  return (
    <DropdownMenu>
      <Hint label={seconds === null ? $t('Rafraîchissement automatique') : label}>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={$t('Rafraîchissement automatique')}
            className="relative"
          >
            {active ? (
              <svg viewBox="0 0 32 32" className="absolute inset-0.5 -rotate-90" aria-hidden="true">
                <circle
                  cx="16"
                  cy="16"
                  r="14"
                  fill="none"
                  strokeWidth="2.5"
                  className="stroke-muted"
                />
                <circle
                  key={`${since}-${seconds}`}
                  cx="16"
                  cy="16"
                  r="14"
                  fill="none"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={100}
                  className="stroke-primary"
                  style={{ animation: `refresh-ring ${seconds}s linear both` }}
                />
              </svg>
            ) : null}
            <Timer
              className={cn('relative', active ? 'size-3.5 text-primary' : 'text-muted-foreground')}
            />
          </Button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{$t('Rafraîchissement automatique')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(seconds)}
          onValueChange={(v) => onChange(v === 'null' ? null : Number(v))}
        >
          {CHOICES.map((c) => (
            <DropdownMenuRadioItem key={String(c.value)} value={String(c.value)}>
              {$t(c.label)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
