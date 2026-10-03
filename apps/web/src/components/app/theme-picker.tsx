'use client'

import { Choice } from '@/components/ui/choice'
import { api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { schemeColors } from '@/lib/palettes'
import type { ResolvedTheme, Theme } from '@eodia/contracts'
import { useQuery } from '@tanstack/react-query'

export const useThemes = () =>
  useQuery({
    queryKey: ['themes'],
    queryFn: () => api.get<Theme[]>('/v1/themes'),
    staleTime: 60_000,
  })

function Swatch({ theme }: { theme: Pick<Theme, 'settings'> }) {
  return (
    <span className="flex shrink-0">
      {schemeColors(theme.settings.scheme, theme.settings.colors, false, 4)
        .slice(0, 4)
        .map((c) => (
          <span
            key={c}
            className="size-2.5 rounded-full ring-1 ring-background"
            style={{ background: c, marginLeft: -2 }}
          />
        ))}
    </span>
  )
}

/**
 * The theme of a folder or a dashboard: its own, or what it inherits — named, with where it
 * comes from, so one sees what « inherit » will give.
 */
export function ThemePicker({
  value,
  resolved,
  self,
  onChange,
  size = 'default',
  className,
}: {
  /** The theme set on it (null: it inherits). */
  readonly value: string | null
  /** What it wears now. */
  readonly resolved: ResolvedTheme | null | undefined
  /** Its own id: a resolved theme that comes from it is its own, not an inherited one. */
  readonly self: string
  readonly onChange: (theme: string | null) => void
  readonly size?: 'default' | 'sm' | 'xs'
  readonly className?: string
}) {
  const { data: themes = [] } = useThemes()
  const inherited = resolved && resolved.from.id !== self ? resolved : null
  const inheritLabel = inherited
    ? $t('Hérité : {theme} (de « {from} »)', { theme: inherited.name, from: inherited.from.name })
    : value
      ? $t('Hériter du dossier parent')
      : $t('Aucun thème')
  return (
    <Choice
      value={value ?? 'inherit'}
      onValueChange={(v) => onChange(v === 'inherit' ? null : v)}
      options={[
        { value: 'inherit', label: inheritLabel },
        ...themes.map((t) => ({
          value: t.id,
          label: t.name,
          render: (
            <span className="flex items-center gap-2">
              <Swatch theme={t} /> {t.name}
            </span>
          ),
        })),
      ]}
      aria-label={$t('Thème')}
      size={size}
      {...(className ? { className } : {})}
    />
  )
}
