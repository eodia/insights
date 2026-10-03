'use client'

import { Combobox } from '@/components/ui/combobox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

/**
 * Choosing one value among options — the one field the interface uses for it.
 *
 * A short list is shadcn's Select; one that holds more than `SEARCH_ABOVE` options is the
 * Combobox, whose list is searched as one types. The switch follows the options
 * themselves: a list of tables or columns that grows past six gains its search box by
 * itself. Never a native `<select>`: its popup is drawn by the system, ignores the theme,
 * and in the dark reads as a white box.
 */

/** Beyond this many options, a list is searched rather than scrolled. */
export const SEARCH_ABOVE = 6

export interface ChoiceOption {
  readonly value: string
  readonly label: string
  /** What the list shows instead of the label — the label stays what is searched. */
  readonly render?: ReactNode
}

const SIZES = {
  default: 'h-9 text-sm',
  sm: 'h-8 px-2.5 text-sm',
  xs: 'h-7 px-2 text-xs',
} as const

/**
 * Radix reserves the empty string for "nothing chosen": an option whose value IS empty —
 * « Aucune colonne », « Toute colonne » — travels under this name inside the Select.
 */
const EMPTY = 'choice:empty'

export function Choice({
  value,
  onValueChange,
  options,
  placeholder = $t('Choisir…'),
  'aria-label': ariaLabel,
  size = 'sm',
  className,
  disabled = false,
  searchable,
  searchPlaceholder,
  id,
}: {
  /** The chosen option's value, `null` while nothing is chosen. */
  readonly value: string | null
  readonly onValueChange: (value: string) => void
  readonly options: readonly ChoiceOption[]
  readonly placeholder?: string
  readonly 'aria-label': string
  readonly size?: keyof typeof SIZES
  /** Styles the trigger — its width, typically. */
  readonly className?: string
  readonly disabled?: boolean
  /** Forces the search on (`true`) or off (`false`), whatever the number of options. */
  readonly searchable?: boolean
  readonly searchPlaceholder?: string
  /** The trigger's id — what a `<Label htmlFor>` points at. */
  readonly id?: string
}) {
  const chosen = options.find((o) => o.value === value) ?? null

  if (searchable ?? options.length > SEARCH_ABOVE) {
    return (
      <Combobox
        value={chosen?.value ?? null}
        onValueChange={(next) => {
          if (next !== null) onValueChange(next)
        }}
        options={options}
        id={id}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(SIZES[size], className)}
        {...(searchPlaceholder === undefined ? {} : { searchPlaceholder })}
      >
        {chosen === null ? (
          <span className="truncate text-muted-foreground">{placeholder}</span>
        ) : (
          <span className="flex min-w-0 items-center truncate">
            {chosen.render ?? chosen.label}
          </span>
        )}
      </Combobox>
    )
  }

  const encode = (v: string) => (v === '' ? EMPTY : v)
  return (
    <Select
      value={value === null ? '' : encode(value)}
      onValueChange={(next) => onValueChange(next === EMPTY ? '' : next)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn(SIZES[size], 'min-w-0 [&>span]:min-w-0 [&>span]:truncate', className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={encode(o.value)}>
            {o.render ?? o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
