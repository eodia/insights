/**
 * The most a floating panel (menu, popover) may be tall: the room Radix says is left on screen
 * (`available`, one of its `--radix-…-available-height`), and the cap its `className` may set
 * (`max-h-80`, `max-h-[22rem]`) — the smaller of the two, so that a long one scrolls instead of
 * running off the window.
 */
export function fitHeight(available: string, className?: string): string {
  const room = `var(${available}, 100dvh)`
  const step = className?.match(/(?:^|\s)max-h-(\d+(?:\.\d+)?)(?=\s|$)/)
  if (step) return `min(${Number(step[1]) * 0.25}rem, ${room})`
  const given = className?.match(/(?:^|\s)max-h-\[([^\]\s]+)\](?=\s|$)/)
  if (given) return `min(${given[1]?.replace(/_/g, ' ')}, ${room})`
  return room
}
