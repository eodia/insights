'use client'

import type { ItemKind, LookColor } from '@eodia/contracts'
import { LOOK_CLASSES, LOOK_HEX } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  BarChart3,
  Box,
  Database,
  Folder,
  FolderLock,
  Gauge,
  LayoutDashboard,
  type LucideIcon,
  Sigma,
  Table2,
} from 'lucide-react'
import { DynamicIcon, type IconName } from 'lucide-react/dynamic'

/**
 * A pictogram as stored on a table, a folder, a value: a lucide name (kebab-case), an emoji
 * (`emoji:🚚`) or an image (`img:https://…`).
 */
export function LookIcon({ name, className, color }: { name: string | null | undefined; className?: string; color?: LookColor | null }) {
  if (!name) return null
  if (name.startsWith('emoji:')) {
    return (
      <span className={cn('inline-flex size-4 shrink-0 items-center justify-center leading-none', className)} style={{ fontSize: '0.95em' }} aria-hidden="true">
        {name.slice(6)}
      </span>
    )
  }
  if (name.startsWith('img:')) {
    const src = name.slice(4)
    if (!/^https?:\/\//i.test(src)) return null
    return <img src={src} alt="" className={cn('size-4 shrink-0 rounded-[3px] object-cover', className)} loading="lazy" />
  }
  return <DynamicIcon name={name as IconName} className={cn('size-4', className)} style={color ? { color: LOOK_HEX[color] } : undefined} />
}

export const KIND_ICONS: Record<ItemKind, LucideIcon> = {
  question: BarChart3,
  model: Box,
  metric: Sigma,
  dashboard: LayoutDashboard,
  folder: Folder,
}

export const KIND_LABELS: Record<ItemKind, string> = {
  question: 'Question',
  model: 'Modèle',
  metric: 'Métrique',
  dashboard: 'Tableau de bord',
  folder: 'Dossier',
}

/** The round tile of an item in a list, like a conversation's avatar. */
export function ItemTile({ kind, personal, className }: { kind: ItemKind | 'table' | 'source' | 'gauge'; personal?: boolean; className?: string }) {
  const Icon = kind === 'table' ? Table2 : kind === 'source' ? Database : kind === 'gauge' ? Gauge : kind === 'folder' && personal ? FolderLock : KIND_ICONS[kind]
  const tone = {
    question: 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300',
    model: 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300',
    metric: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300',
    dashboard: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
    folder: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
    table: 'bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-300',
    source: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300',
    gauge: 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300',
  }[kind]
  return (
    <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full', tone, className)}>
      <Icon className="size-4" />
    </span>
  )
}

/** A soft chip, as the « Ouverte », « Habitation » pills of a list row. */
export function Chip({ color = 'gray', children, className, icon }: { color?: LookColor | null; children: React.ReactNode; className?: string; icon?: string | null }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium whitespace-nowrap', LOOK_CLASSES[color ?? 'gray'], className)}>
      {icon ? <LookIcon name={icon} className="size-3" /> : null}
      {children}
    </span>
  )
}

/** Initials in a circle, the person's colour behind them. */
export function Avatar({ name, color, size = 'md', online }: { name: string; color?: LookColor | string | null; size?: 'sm' | 'md' | 'lg'; online?: boolean }) {
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  const dim = { sm: 'size-6 text-[10px]', md: 'size-8 text-xs', lg: 'size-14 text-lg' }[size]
  const look = (color && (LOOK_CLASSES as Record<string, string>)[color]) || LOOK_CLASSES.green
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold', dim, look)}>
      {initials}
      {online ? <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-background bg-green-500" /> : null}
    </span>
  )
}
