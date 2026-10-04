'use client'

import { Choice } from '@/components/ui/choice'
import { api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { schemeColors } from '@/lib/palettes'
import { keys, useMe } from '@/lib/queries'
import { ThemeScope } from '@/lib/theme'
import { cn } from '@/lib/utils'
import type { Folder, ResolvedTheme, Theme, ThemeSettings } from '@eodia/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Settings2 } from 'lucide-react'
import Link from 'next/link'
import type { ComponentType, ReactNode } from 'react'
import { toast } from 'sonner'

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

const BARS = [45, 80, 60, 95]

/**
 * A theme at a glance, as small as a menu entry: its background, its title font and accent,
 * a card with its radius and border, and bars in its palette.
 */
export function ThemeThumb({
  settings,
  className,
}: { settings: ThemeSettings | null; className?: string }) {
  const s = settings ?? {}
  const colors = schemeColors(s.scheme, s.colors, false, 4).slice(0, 4)
  return (
    <ThemeScope
      theme={s}
      still
      className={cn(
        'flex h-11 w-[72px] shrink-0 flex-col gap-1 overflow-hidden rounded-md border bg-background p-1.5',
        className,
      )}
    >
      <span className="flex items-center gap-1">
        <span className="theme-title text-[10px] leading-none">Aa</span>
        <span className="h-[3px] w-3 rounded-full bg-primary" />
      </span>
      <span
        className="theme-card flex min-h-0 flex-1 items-end gap-[3px] border px-1 pb-0.5"
        // The theme's corners, at the thumbnail's scale.
        style={{ borderRadius: `${Math.min((s.card_radius ?? 12) / 3, 4)}px` }}
      >
        {colors.map((c, i) => (
          <span
            key={`${c}-${i}`}
            className="w-1.5"
            style={{
              background: c,
              height: `${BARS[i]}%`,
              borderRadius: `${Math.min(s.bar_radius ?? 1, 2)}px ${Math.min(s.bar_radius ?? 1, 2)}px 0 0`,
            }}
          />
        ))}
      </span>
    </ThemeScope>
  )
}

/** The pieces of a menu — a dropdown's or a right click's — the theme entries are made of. */
export interface MenuParts {
  readonly Item: ComponentType<{ onSelect?: (event: Event) => void; className?: string; asChild?: boolean; children?: ReactNode }>
  readonly Separator: ComponentType<{ className?: string }>
}

/**
 * A folder's theme, as menu entries — in its sub-menu « Thème » : its own theme, or the one it
 * inherits, each choice with a glimpse of what it gives.
 */
export function ThemeEntries({ folderId, M }: { folderId: string; M: MenuParts }) {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const { data: themes = [] } = useThemes()
  const { data: folder } = useQuery({ queryKey: ['folder', folderId], queryFn: () => api.get<Folder>(`/v1/folders/${folderId}`) })
  const value = folder?.theme ?? null
  const resolved = folder?.resolved_theme ?? null
  const inherited = resolved && resolved.from.id !== folderId ? resolved : null
  const choose = async (theme: string | null) => {
    if (theme === value) return
    try {
      await api.patch(`/v1/folders/${folderId}`, { theme })
      await Promise.all([qc.invalidateQueries({ queryKey: ['folder', folderId] }), qc.invalidateQueries({ queryKey: keys.folders }), qc.invalidateQueries({ queryKey: ['dashboard'] })])
      toast.success(theme ? $t('Thème posé : tout le dossier le porte.') : $t('Le dossier reprend le thème dont il hérite.'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }
  const entry = (key: string, settings: ThemeSettings | null, name: string, hint: string | null, on: boolean, theme: string | null) => (
    <M.Item key={key} onSelect={() => void choose(theme)} className={cn('gap-3 py-1.5', on && 'bg-primary/5')}>
      <ThemeThumb settings={settings} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        {hint ? <span className="block truncate text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      {on ? <Check className="size-4 shrink-0 text-primary" /> : null}
    </M.Item>
  )
  return (
    <>
      <div className="max-h-[60vh] w-72 overflow-x-hidden overflow-y-auto">
        {entry(
          'inherit',
          inherited?.settings ?? null,
          inherited ? $t('Hériter : {theme}', { theme: inherited.name }) : $t('Aucun thème'),
          inherited ? $t('du dossier « {from} »', { from: inherited.from.name }) : $t('L’habillage par défaut'),
          value === null,
          null,
        )}
        {themes.length ? <M.Separator /> : null}
        {themes.map((t) => entry(t.id, t.settings, t.name, null, value === t.id, t.id))}
      </div>
      <M.Separator />
      <p className="w-72 px-2 py-1 text-[11px] text-muted-foreground">{$t('Ses sous-dossiers, questions et tableaux de bord le portent, sauf là où un autre thème est posé.')}</p>
      {me?.is_admin ? (
        <M.Item asChild>
          <Link href="/admin/themes">
            <Settings2 /> {$t('Gérer les thèmes')}
          </Link>
        </M.Item>
      ) : null}
    </>
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
