'use client'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Check, ChevronDownIcon, LoaderCircle, Search } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'

export interface ComboboxOption {
  readonly value: string
  readonly label: string
  /**
   * What the list shows for this option instead of its label — a coloured chip, say. The
   * label stays what is searched, and what a screen reader hears through the row's text.
   */
  readonly render?: ReactNode
}

/** Lowercased and stripped of accents, so `ete` finds `Été` — the server folds the same way. */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * The options a typed text keeps, best matches first: those that START with it, then
 * those that merely contain it. Otherwise the order is the input's, because it means
 * something — a declared order for a list of choices, the target's sort for a link.
 */
export function filterOptions(
  options: readonly ComboboxOption[],
  query: string,
): readonly ComboboxOption[] {
  const needle = fold(query.trim())
  if (needle === '') return options

  const starting: ComboboxOption[] = []
  const containing: ComboboxOption[] = []
  for (const option of options) {
    if (fold(option.label).startsWith(needle)) starting.push(option)
    else if (fold(option.label).includes(needle) || fold(option.value).includes(needle)) {
      containing.push(option)
    }
  }
  return [...starting, ...containing]
}

interface ComboboxProps {
  /** The value of the chosen option, or `null` while nothing is chosen. */
  readonly value: string | null
  readonly onValueChange: (value: string | null) => void
  readonly options: readonly ComboboxOption[]
  /**
   * Called with the text typed, and with `''` each time the list opens.
   *
   * Passing it hands the filtering to the caller: `options` is then what matches the
   * text, whatever produced it — a request, typically. Without it, the options are
   * narrowed here.
   */
  readonly onQueryChange?: (query: string) => void
  readonly loading?: boolean
  /** A line under the list: a truncated result, a search that failed. */
  readonly notice?: string | null
  /** When set, a leading entry with this label empties the value. */
  readonly clearLabel?: string
  readonly searchPlaceholder?: string
  readonly emptyLabel?: string
  /**
   * Makes the list a MULTIPLE choice: the values checked are these, choosing an option
   * toggles it (`onValueChange` receives it) and the list stays open for the next one.
   * The clear entry, when offered, empties the whole set (`onValueChange(null)`).
   */
  readonly selected?: ReadonlySet<string>
  /** Styles the trigger, which otherwise looks like a `SelectTrigger`. */
  readonly className?: string
  /** Greys the trigger out and keeps the list closed, as a disabled `SelectTrigger`. */
  readonly disabled?: boolean
  /** The trigger's id — what a `<Label htmlFor>` points at. */
  readonly id?: string
  readonly 'aria-label'?: string
  /** What the trigger shows: the chosen value, or a placeholder. */
  readonly children: ReactNode
}

/**
 * A list of choices you can type into.
 *
 * It is the pattern of a select-only combobox with a search box in its popup: the trigger
 * opens the popup, focus goes to the search box and STAYS there, and the arrow keys move
 * a highlight the input points at with `aria-activedescendant` — so the caret and the
 * screen reader never leave the field being typed in.
 */
export function Combobox({
  value,
  onValueChange,
  options,
  onQueryChange,
  loading = false,
  notice = null,
  clearLabel,
  searchPlaceholder = $t('Rechercher…'),
  emptyLabel = $t('Aucun résultat'),
  selected: checked,
  className,
  disabled = false,
  id,
  'aria-label': ariaLabel,
  children,
}: ComboboxProps) {
  const multiple = checked !== undefined
  const filled = multiple ? checked.size > 0 : value !== null
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)

  const visible = onQueryChange === undefined ? filterOptions(options, query) : options

  // `null` is the entry that empties the value. It leads the list only while nothing is
  // typed: once there is a text, the list is a list of matches and this is not one.
  const entries: readonly (ComboboxOption | null)[] =
    clearLabel !== undefined && filled && query === '' ? [null, ...visible] : visible

  // Clamped at render, not corrected in an effect: results that arrive late can shorten
  // the list under the highlight, and one frame pointing past the end must not happen.
  const current = Math.min(highlighted, Math.max(entries.length - 1, 0))

  useEffect(() => {
    document.getElementById(`${listId}-${current}`)?.scrollIntoView({ block: 'nearest' })
  }, [listId, current])

  const choose = (entry: ComboboxOption | null) => {
    onValueChange(entry === null ? null : entry.value)
    // A multiple choice is made one option after another: only emptying it closes.
    if (!multiple || entry === null) setOpen(false)
  }

  const type = (text: string) => {
    setQuery(text)
    setHighlighted(0)
    onQueryChange?.(text)
  }

  return (
    <Popover
      // Modal, as a Select is: the list gets its own scroll lock. Otherwise, opened from a
      // dialog, it sits outside the dialog's lock — the wheel does nothing over it.
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) type('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          // biome-ignore lint/a11y/useSemanticElements: a <select> cannot host a search box — this is the combobox pattern of the ARIA Authoring Practices
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          id={id}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            // The same look as `SelectTrigger`, so a form mixing both stays even.
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] [&_svg:not([class*='size-'])]:size-4",
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span className="flex min-w-0 flex-1 items-center text-left">{children}</span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[max(var(--radix-popover-trigger-width),16rem)] overflow-hidden p-0"
        // React events cross portals. Without this, a click in the list would reach the
        // grid cell that hosts the trigger and start a selection there.
        onMouseDown={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          input.current?.focus()
        }}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={input}
            role="combobox"
            aria-expanded
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={entries.length === 0 ? undefined : `${listId}-${current}`}
            value={query}
            placeholder={searchPlaceholder}
            onChange={(e) => type(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const entry = entries[current]
                if (entry !== undefined) choose(entry)
                return
              }
              if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && entries.length > 0) {
                e.preventDefault()
                const step = e.key === 'ArrowDown' ? 1 : -1
                setHighlighted((current + step + entries.length) % entries.length)
              }
            }}
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && (
            <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* biome-ignore lint/a11y/useFocusableInteractive: focus stays in the search box, which points at the highlighted option with aria-activedescendant */}
        <div
          id={listId}
          // biome-ignore lint/a11y/useSemanticElements: a <select> cannot host a search box — see the trigger
          role="listbox"
          aria-multiselectable={multiple || undefined}
          className="scroll-discret max-h-64 overflow-y-auto p-1"
        >
          {entries.map((entry, index) => {
            const selected =
              entry !== null && (multiple ? checked.has(entry.value) : entry.value === value)
            return (
              // biome-ignore lint/a11y/useFocusableInteractive: the options never take focus — see the list
              // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard belongs to the search box, which drives this list through aria-activedescendant
              <div
                key={entry === null ? 'clear-entry' : `option:${entry.value}`}
                id={`${listId}-${index}`}
                // biome-ignore lint/a11y/useSemanticElements: an <option> cannot live outside a <select> — see the trigger
                role="option"
                aria-selected={selected}
                // Keeps the caret in the search box: a click on an option must not blur it.
                onMouseDown={(e) => e.preventDefault()}
                // `mousemove`, not `mouseenter`: with the arrow keys scrolling the list
                // under a still pointer, `mouseenter` would fight the keyboard for the
                // highlight.
                onMouseMove={() => index !== current && setHighlighted(index)}
                onClick={() => choose(entry)}
                className={cn(
                  'relative flex cursor-default select-none items-center rounded-md py-1.5 pr-8 pl-2 text-sm',
                  index === current && 'bg-accent text-accent-foreground',
                )}
              >
                {entry === null ? (
                  <span className="text-muted-foreground">{clearLabel}</span>
                ) : (
                  (entry.render ?? <span className="truncate">{entry.label}</span>)
                )}
                {selected && <Check className="absolute right-2 size-4" />}
              </div>
            )
          })}

          {entries.length === 0 && !loading && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
          )}
        </div>

        {notice !== null && (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">{notice}</p>
        )}
      </PopoverContent>
    </Popover>
  )
}
