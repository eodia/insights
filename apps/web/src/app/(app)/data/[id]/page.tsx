'use client'

import type { Datasource, TableMeta } from '@eodia/contracts'
import { VISIBILITY_LABELS } from '@eodia/contracts'
import { SourceForm } from '@/components/app/data/source-form'
import { CatalogName, ENGINE_NAMES, EngineBadge, SyncDot, syncSummary } from '@/components/app/data/source-look'
import { SyncPanel } from '@/components/app/data/sync-panel'
import { ConfirmDialog } from '@/components/app/dialogs'
import { Chip, ItemTile, LookIcon } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { formatCount, LOOK_CLASSES } from '@/lib/format'
import { $t } from '@/lib/i18n'
import { keys, useEngines, useMe, useTables } from '@/lib/queries'
import { useCrumbs } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Loader2, Pencil, Search, TableProperties, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useState } from 'react'
import { toast } from 'sonner'

function TablesList({ source }: { source: Datasource }) {
  const { data: tables = [], isLoading } = useTables(source.id)
  const [search, setSearch] = useState('')
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const visible = tables.filter((t) => !search || fold(`${t.label} ${t.name} ${t.schema}`).includes(fold(search)))
  const bySchema = new Map<string, TableMeta[]>()
  for (const t of visible) bySchema.set(t.schema, [...(bySchema.get(t.schema) ?? []), t])

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={$t('Rechercher une table…')} className="h-9 rounded-lg pl-9" />
      </div>
      {isLoading ? <Loader2 className="mx-auto mt-6 size-5 animate-spin text-muted-foreground" /> : null}
      {[...bySchema.entries()].map(([schema, list]) => (
        <div key={schema}>
          <div className="mb-1 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {$t('Schéma {name}', { name: schema })} <span className="ml-1 font-normal">{list.length}</span>
          </div>
          <div className="divide-y rounded-xl border">
            {list.map((t) => (
              <Link key={t.id} href={`/structure/${source.id}/${t.id}`} className="group flex items-center gap-3 px-3 py-2.5 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/50">
                {t.icon ? (
                  <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full', LOOK_CLASSES[t.color ?? 'gray'])}>
                    <LookIcon name={t.icon} />
                  </span>
                ) : (
                  <ItemTile kind="table" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{t.label}</div>
                  <div className="truncate font-mono text-xs text-muted-foreground">
                    {source.catalog}.{t.schema}.{t.name}
                  </div>
                </div>
                {t.visibility !== 'normal' ? <Chip color={t.visibility === 'hidden' ? 'gray' : 'amber'}>{$t(VISIBILITY_LABELS[t.visibility])}</Chip> : null}
                {t.entity ? <Chip color={t.color ?? 'gray'}>{t.entity}</Chip> : null}
                <span className="w-24 shrink-0 text-right font-mono text-xs text-muted-foreground">
                  {t.row_count != null ? $t('{n} lignes', { n: formatCount(t.row_count) }) : '—'}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      ))}
      {!isLoading && visible.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {tables.length === 0 ? $t('Aucune table : lancez une synchronisation.') : $t('Aucune table ne correspond.')}
        </p>
      ) : null}
    </div>
  )
}

function ConnectionView({ source, canEdit }: { source: Datasource; canEdit: boolean }) {
  const qc = useQueryClient()
  const { data: engines } = useEngines()
  const spec = engines?.find((e) => e.engine === source.engine)
  const [editing, setEditing] = useState(false)
  if (!spec) return <Loader2 className="mx-auto mt-6 size-5 animate-spin text-muted-foreground" />

  if (editing) {
    return (
      <div className="rounded-xl border p-5">
        <SourceForm
          spec={spec}
          source={source}
          onCancel={() => setEditing(false)}
          onSaved={async (ds) => {
            qc.setQueryData(['datasource', source.id], ds)
            await qc.invalidateQueries({ queryKey: keys.datasources })
            await qc.invalidateQueries({ queryKey: keys.tree })
            toast.success($t('Connexion enregistrée.'))
            setEditing(false)
          }}
        />
      </div>
    )
  }

  const rows: [string, React.ReactNode][] = spec.fields.map((f) => {
    const v = source.config[f.key]
    const value = f.secret
      ? source.secrets.includes(f.key)
        ? '•••••'
        : '—'
      : typeof v === 'boolean'
        ? v
          ? $t('Oui')
          : $t('Non')
        : v === undefined || v === ''
          ? '—'
          : String(v)
    return [$t(f.label), <span key={f.key} className={cn(typeof v !== 'boolean' && 'font-mono text-[13px]')}>{value}</span>]
  })
  const trino = Object.entries(source.options.trino_properties ?? {})
  return (
    <div className="space-y-4">
      <div className="rounded-xl border">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <div className="flex-1 text-sm font-semibold">{$t('Paramètres de connexion')}</div>
          {canEdit ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> {$t('Modifier')}
            </Button>
          ) : null}
        </div>
        <dl className="divide-y text-sm">
          {[
            [$t('Moteur'), spec.label],
            [$t('Catalogue Trino'), <CatalogName key="c" catalog={source.catalog} />],
            ...rows,
            [$t('SQL natif'), source.options.native_sql ? $t('Autorisé') : $t('Interdit')],
            [$t('Cache des résultats'), source.options.cache_ttl != null ? $t('{n} s', { n: source.options.cache_ttl }) : $t('Réglage de l’instance')],
          ].map(([k, v]) => (
            <div key={k as string} className="flex gap-4 px-4 py-2.5">
              <dt className="w-48 shrink-0 text-muted-foreground">{k}</dt>
              <dd className="min-w-0 flex-1 truncate">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      {trino.length ? (
        <div className="rounded-xl border">
          <div className="border-b px-4 py-3 text-sm font-semibold">{$t('Propriétés du catalogue Trino')}</div>
          <div className="divide-y font-mono text-xs">
            {trino.map(([k, v]) => (
              <div key={k} className="flex gap-2 px-4 py-2">
                <span className="text-muted-foreground">{k}</span>=<span>{v}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const qc = useQueryClient()
  const { data: me } = useMe()
  const { data: source, error } = useQuery({
    queryKey: ['datasource', id],
    queryFn: () => api.get<Datasource>(`/v1/datasources/${id}`),
    refetchInterval: (q) => (q.state.data && (q.state.data.sync.status === 'running' || q.state.data.sync.status === 'queued') ? 2000 : false),
  })
  const [confirm, setConfirm] = useState(false)
  useCrumbs([{ label: $t('Sources de données'), href: '/data' }, { label: source?.name ?? '…' }])

  if (error) return <p className="m-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{(error as Error).message}</p>
  if (!source) return <Loader2 className="m-10 size-5 animate-spin text-muted-foreground" />
  const canSources = !!me?.can.manage_sources

  return (
    <div className="flex h-full">
      <section className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 px-6 py-6">
          <div className="flex items-start gap-4">
            <EngineBadge engine={source.engine} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{source.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <CatalogName catalog={source.catalog} suffix=".schéma.table" />
                <span>·</span>
                <span>{ENGINE_NAMES[source.engine]}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1.5">
                  <SyncDot status={source.sync.status} /> {syncSummary(source)}
                </span>
              </div>
              {source.description ? <p className="mt-2 text-sm">{source.description}</p> : null}
            </div>
            <Button asChild>
              <Link href={`/structure/${source.id}`}>
                <TableProperties /> {$t('Ouvrir la structure')}
              </Link>
            </Button>
          </div>

          <Tabs defaultValue="tables">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="tables">
                {$t('Tables')} <span className="text-xs text-muted-foreground">{source.stats.tables}</span>
              </TabsTrigger>
              <TabsTrigger value="connection">{$t('Connexion')}</TabsTrigger>
            </TabsList>
            <TabsContent value="tables" className="pt-4">
              <TablesList source={source} />
            </TabsContent>
            <TabsContent value="connection" className="pt-4">
              <ConnectionView source={source} canEdit={canSources} />
            </TabsContent>
          </Tabs>
        </div>
      </section>

      <aside className="hidden w-[340px] shrink-0 overflow-y-auto border-l lg:block">
        <div className="flex h-12 items-center gap-6 border-b px-5 text-[15px]">
          <span className="relative py-3 font-semibold after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary">{$t('Détails')}</span>
        </div>
        <div className="space-y-6 p-5">
          <div className="grid grid-cols-3 gap-2">
            {[
              [$t('Schémas'), source.stats.schemas],
              [$t('Tables'), source.stats.tables],
              [$t('Colonnes'), source.stats.columns],
            ].map(([l, v]) => (
              <div key={l as string} className="rounded-xl border px-3 py-2.5">
                <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{l}</div>
                <div className="mt-0.5 text-xl font-semibold">{formatCount(v as number)}</div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{$t('Synchronisation')}</div>
            <SyncPanel source={source} canSync={!!me?.can.manage_metadata} />
          </div>
          {canSources ? (
            <div className="space-y-2 border-t pt-5">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{$t('Zone sensible')}</div>
              <p className="text-xs text-muted-foreground">{$t('Supprimer la source retire son catalogue de Trino, ses métadonnées et ses permissions. Les questions qui l’utilisent ne fonctionneront plus.')}</p>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirm(true)}>
                <Trash2 /> {$t('Supprimer la source')}
              </Button>
            </div>
          ) : null}
        </div>
      </aside>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={$t('Supprimer « {name} » ?', { name: source.name })}
        description={$t('Le catalogue « {catalog} » sera retiré de Trino. Cette action est définitive.', { catalog: source.catalog })}
        onConfirm={async () => {
          try {
            await api.delete(`/v1/datasources/${source.id}`)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : String(err))
            return
          }
          await qc.invalidateQueries({ queryKey: keys.datasources })
          await qc.invalidateQueries({ queryKey: keys.tree })
          toast.success($t('Source supprimée.'))
          router.push('/data')
        }}
      />
    </div>
  )
}
