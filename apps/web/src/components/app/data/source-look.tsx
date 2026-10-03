'use client'

import type { Datasource, Engine, SyncStatus } from '@eodia/contracts'
import { formatAgo } from '@/lib/format'
import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Each engine's little tile: two letters on its colour, as a logo would. */
const ENGINE_LOOK: Record<Engine, { abbr: string; tone: string }> = {
  postgresql: { abbr: 'Pg', tone: 'bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900' },
  mysql: { abbr: 'My', tone: 'bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:ring-orange-900' },
  sqlserver: { abbr: 'Ms', tone: 'bg-red-100 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900' },
  oracle: { abbr: 'Or', tone: 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900' },
  snowflake: { abbr: 'Sf', tone: 'bg-cyan-100 text-cyan-700 ring-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:ring-cyan-900' },
  mongodb: { abbr: 'Mg', tone: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900' },
  trino: { abbr: 'Tr', tone: 'bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900' },
}

export const ENGINE_NAMES: Record<Engine, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  sqlserver: 'SQL Server',
  oracle: 'Oracle',
  snowflake: 'Snowflake',
  mongodb: 'MongoDB',
  trino: 'Trino',
}

export function EngineBadge({ engine, size = 'md', className }: { engine: Engine; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const look = ENGINE_LOOK[engine] ?? ENGINE_LOOK.trino
  const dim = { sm: 'size-7 rounded-md text-[11px]', md: 'size-10 rounded-xl text-sm', lg: 'size-14 rounded-2xl text-lg' }[size]
  return <span className={cn('inline-flex shrink-0 items-center justify-center font-bold tracking-tight ring-1 ring-inset', dim, look.tone, className)}>{look.abbr}</span>
}

export const SYNC_LABELS: Record<SyncStatus, string> = {
  never: 'Jamais synchronisée',
  queued: 'En file d’attente',
  running: 'Synchronisation en cours',
  ok: 'À jour',
  failed: 'Échec de la synchronisation',
}

const SYNC_DOT: Record<SyncStatus, string> = {
  never: 'bg-zinc-300 dark:bg-zinc-600',
  queued: 'bg-amber-400',
  running: 'bg-sky-500 animate-pulse',
  ok: 'bg-green-500',
  failed: 'bg-red-500',
}

export function SyncDot({ status, className }: { status: SyncStatus; className?: string }) {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', SYNC_DOT[status], className)} />
}

export const SCHEDULE_LABELS: Record<Datasource['sync']['schedule'], string> = {
  hourly: 'Toutes les heures',
  daily: 'Tous les jours',
  manual: 'Manuelle',
}

/** « il y a 5 minutes », or the status when it never ran. */
export function syncSummary(ds: Datasource): string {
  if (ds.sync.status === 'running' || ds.sync.status === 'queued') return $t(SYNC_LABELS[ds.sync.status])
  if (ds.sync.status === 'failed') return $t(SYNC_LABELS.failed)
  if (!ds.sync.last_at) return $t(SYNC_LABELS.never)
  return $t('Synchronisée {when}', { when: formatAgo(ds.sync.last_at) })
}

/** The catalog name in mono, the way SQL cites it. */
export function CatalogName({ catalog, suffix, className }: { catalog: string; suffix?: string; className?: string }) {
  return (
    <code className={cn('rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground/80', className)}>
      {catalog}
      {suffix ? <span className="text-muted-foreground">{suffix}</span> : null}
    </code>
  )
}
