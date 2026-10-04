'use client'

import { type Datasource, ENGINE_SPECS, type TableMeta } from '@eodia/contracts'
import {
  CatalogName,
  ENGINE_NAMES,
  EngineBadge,
  SCHEDULE_LABELS,
  SyncDot,
  syncSummary,
} from '@/components/app/data/source-look'
import { Input } from '@/components/ui/input'
import { $t, $tp } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ArrowUpRight, Loader2, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Where the papers lean, at rest and when the folder is hovered. */
const PAPERS = [
  'left-[8%] -rotate-3 group-hover:-translate-x-1.5 group-hover:-translate-y-6 group-hover:-rotate-6',
  'left-[21%] group-hover:-translate-y-9 group-hover:rotate-1',
  'left-[34%] rotate-3 group-hover:translate-x-2 group-hover:-translate-y-7 group-hover:rotate-6',
]

/** One source as a folder: its tables peek out as papers, its card in front. */
function SourceFolder({
  source,
  tables,
  dark,
}: { source: Datasource; tables: readonly TableMeta[]; dark: boolean }) {
  const chip = 'rounded-lg px-2.5 py-1 text-xs'
  return (
    <Link href={`/data/${source.id}`} className="group relative block h-80">
      <div
        className={cn(
          'absolute top-0 left-0 h-10 w-[44%] rounded-t-[18px]',
          dark ? 'bg-[#1E7A36]' : 'bg-[#9A85F7]',
        )}
      />
      <div
        className={cn(
          'absolute inset-x-0 top-6 bottom-0 rounded-tr-3xl rounded-b-3xl',
          dark
            ? 'bg-gradient-to-b from-[#2EA043] to-[#1A6B30]'
            : 'bg-gradient-to-b from-[#B4A3FF] to-[#8467F2]',
        )}
      />
      {tables.slice(0, 3).map((t, i) => (
        <div
          key={t.id}
          className={cn(
            'absolute top-[34px] flex h-30 w-[42%] flex-col gap-1.5 rounded-xl bg-white p-3 shadow-[0_6px_18px_-8px_rgba(14,20,17,0.35)] transition-transform duration-500 ease-[cubic-bezier(.2,.9,.2,1)]',
            PAPERS[i],
          )}
        >
          <span className="truncate font-mono text-[11px] text-zinc-600">{t.name}</span>
          {['w-4/5', 'w-3/5', 'w-[70%]'].map((w) => (
            <span key={w} className={cn('h-1 rounded-full bg-zinc-100', w)} />
          ))}
        </div>
      ))}
      <div
        className={cn(
          'absolute inset-x-0 top-21 bottom-0 flex flex-col justify-between rounded-3xl p-5.5 transition-transform duration-500 ease-[cubic-bezier(.2,.9,.2,1)] group-hover:translate-y-1.5',
          dark
            ? 'bg-[#0E1411] bg-[radial-gradient(70%_90%_at_100%_0%,rgba(91,227,125,0.28),transparent_60%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_30px_50px_-28px_rgba(14,20,17,0.7)]'
            : 'border border-violet-100 bg-card bg-[radial-gradient(70%_90%_at_100%_0%,rgba(167,139,250,0.18),transparent_60%)] shadow-[0_30px_50px_-28px_rgba(106,75,240,0.45)] dark:border-violet-900/40',
        )}
      >
        <div className="flex items-start gap-3.5">
          <EngineBadge engine={source.engine} className="size-11.5 rounded-[14px]" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-xl font-semibold tracking-tight">{source.name}</span>
              <CatalogName
                catalog={source.catalog}
                suffix={`.${$t('schéma.table')}`}
                className={dark ? 'bg-violet-300/15 text-violet-200' : undefined}
              />
            </div>
            <div
              className={cn(
                'mt-1 line-clamp-2 text-sm',
                dark ? 'text-white/65' : 'text-muted-foreground',
              )}
            >
              {source.description || $t('Aucune description')}
            </div>
          </div>
          <span
            className={cn(
              'inline-flex h-8.5 shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-[13.5px] font-medium transition-colors',
              dark
                ? 'border-white/15 bg-white/8 group-hover:bg-white/15'
                : 'bg-card group-hover:bg-violet-50 dark:group-hover:bg-violet-950/40',
            )}
          >
            {$t('Ouvrir')} <ArrowUpRight className="size-3.5" />
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span
            className={cn(
              chip,
              dark
                ? 'bg-sky-400/20 text-sky-200'
                : 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
            )}
          >
            {ENGINE_NAMES[source.engine]}
          </span>
          <span
            className={cn(
              chip,
              dark ? 'bg-white/8 text-white/80' : 'bg-muted text-muted-foreground',
            )}
          >
            {$t(SCHEDULE_LABELS[source.sync.schedule])}
          </span>
          {source.shared ? (
            <span className={cn(chip, dark ? 'bg-violet-300/15 text-violet-200' : 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300')}>
              {$t('Partagée par « {name} »', { name: source.workspace.name })}
            </span>
          ) : null}
          {source.options.native_sql && ENGINE_SPECS[source.engine].nativeQuery ? (
            <span
              className={cn(
                chip,
                dark
                  ? 'bg-emerald-300/15 text-emerald-200'
                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
              )}
            >
              {$t('SQL natif')}
            </span>
          ) : null}
        </div>
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-3 border-t pt-3.5',
            dark ? 'border-white/10' : 'border-violet-50 dark:border-violet-900/40',
          )}
        >
          <span
            className={cn(
              'inline-flex items-center gap-2 text-[13px]',
              dark ? 'text-white/85' : '',
              source.sync.status === 'failed' && 'text-destructive',
            )}
          >
            <SyncDot status={source.sync.status} /> {syncSummary(source)}
          </span>
          <span
            className={cn('font-mono text-xs', dark ? 'text-white/55' : 'text-muted-foreground')}
          >
            {[
              $tp(source.stats.schemas, '{count} schéma', '{count} schémas'),
              $tp(source.stats.tables, '{count} table', '{count} tables'),
              $tp(source.stats.columns, '{count} col.', '{count} col.'),
            ].join(' · ')}
          </span>
        </div>
      </div>
    </Link>
  )
}

/** What `/data` shows before a source is chosen: every source as a folder, and the way to add one. */
export function SourcesOverview({
  sources,
  tables,
  loading,
  onAdd,
}: {
  sources: readonly Datasource[]
  tables: readonly TableMeta[]
  loading: boolean
  onAdd?: (() => void) | undefined
}) {
  const [search, setSearch] = useState('')
  const q = fold(search.trim())
  const visible = sources.filter(
    (s) =>
      !q ||
      fold(`${s.name} ${s.catalog} ${ENGINE_NAMES[s.engine]} ${s.description ?? ''}`).includes(q) ||
      tables.some((t) => t.datasource === s.id && fold(`${t.label} ${t.name}`).includes(q)),
  )

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-5 px-6 py-7 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-tight">{$t('Sources connectées')}</h1>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[12.5px] font-semibold text-primary">
            {sources.length}
          </span>
        </div>
        <div className="relative w-full max-w-80">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={$t('Rechercher une source ou une table…')}
            className="h-10 rounded-xl pl-9"
          />
        </div>
      </div>
      {loading ? (
        <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />
      ) : null}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,380px),1fr))] gap-x-6 gap-y-7 pt-1.5">
        {visible.map((s) => (
          <SourceFolder
            key={s.id}
            source={s}
            tables={tables.filter((t) => t.datasource === s.id)}
            // A source keeps its colour while the search narrows the list.
            dark={sources.indexOf(s) % 2 === 0}
          />
        ))}
        {onAdd ? (
          <button type="button" onClick={onAdd} className="group relative block h-80 text-left">
            <div className="absolute top-0 left-0 h-10.5 w-[44%] rounded-t-[18px] border-[1.5px] border-b-0 border-dashed border-muted-foreground/30" />
            <div className="absolute inset-x-0 top-10 bottom-0 flex flex-col items-center justify-center gap-3 rounded-tr-3xl rounded-b-3xl border-[1.5px] border-dashed border-muted-foreground/30 bg-card/50 transition-colors group-hover:border-primary group-hover:bg-card">
              <span className="inline-flex size-13 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Plus className="size-5.5" strokeWidth={2.2} />
              </span>
              <span className="text-base font-semibold">{$t('Connecter une source')}</span>
              <span className="text-[13.5px] text-muted-foreground">
                {$t('Base de données, entrepôt ou fichier')}
              </span>
            </div>
          </button>
        ) : null}
      </div>
      {!loading && q && visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {$t('Aucune source ne correspond à la recherche.')}
        </p>
      ) : null}
      {!loading && sources.length === 0 && !onAdd ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {$t('Aucune source connectée pour l’instant.')}
        </p>
      ) : null}
    </div>
  )
}
