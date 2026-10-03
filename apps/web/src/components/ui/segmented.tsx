'use client'

import { Hint } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  readonly value: T
  readonly label: string
  /** A pictogram above the label. */
  readonly icon?: React.ComponentType<{ className?: string }>
  /** A longer explanation, in a tooltip. */
  readonly hint?: string
}

/**
 * A choice among a few options (four at most), all in sight: buttons side by side, each
 * with its pictogram — rather than a list to open. Arrow keys move the choice.
 */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  'aria-label': ariaLabel,
  className,
}: {
  value: T
  onValueChange: (v: T) => void
  options: readonly SegmentedOption<T>[]
  'aria-label': string
  className?: string
}) {
  const index = options.findIndex((o) => o.value === value)
  const move = (delta: number) => {
    const next = options[(Math.max(index, 0) + delta + options.length) % options.length]
    if (next) onValueChange(next.value)
  }
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault()
          move(1)
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault()
          move(-1)
        }
      }}
      className={cn('grid gap-0.5 rounded-lg bg-muted p-0.5', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = o.value === value
        const Icon = o.icon
        const button = (
          <button
            key={o.value}
            type="button"
            // biome-ignore lint/a11y/useSemanticElements: a radio group of buttons with pictograms, as WAI-ARIA describes it
            role="radio"
            aria-checked={on}
            tabIndex={on || (index < 0 && o === options[0]) ? 0 : -1}
            onClick={() => onValueChange(o.value)}
            className={cn(
              'flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 text-[11px] leading-tight transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              on
                ? 'bg-background font-semibold text-foreground shadow-sm ring-1 ring-primary/40'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
            )}
          >
            {Icon ? <Icon className={cn('size-4', on ? 'text-primary' : '')} /> : null}
            <span className="w-full truncate text-center">{o.label}</span>
          </button>
        )
        return o.hint ? (
          <Hint key={o.value} label={o.hint}>
            {button}
          </Hint>
        ) : (
          button
        )
      })}
    </div>
  )
}
