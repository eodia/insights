'use client'

import type { ItemSummary } from '@eodia/contracts'
import { ItemTile, KIND_LABELS, LookIcon } from '@/components/app/look'
import { itemHref } from '@/components/app/palette'
import { api } from '@/lib/api'
import { formatCount } from '@/lib/format'
import { $t } from '@/lib/i18n'
import { useDatasources, useMe, useTables } from '@/lib/queries'
import { useCrumbs, useUi } from '@/lib/store'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BarChart3, Code2, Database, LayoutDashboard, Sparkles, Star } from 'lucide-react'
import Link from 'next/link'

function ItemCard({ item }: { item: ItemSummary }) {
  return (
    <Link href={itemHref(item)} className="group flex items-center gap-3 rounded-xl border bg-card p-3.5 transition-colors hover:border-primary/40 hover:bg-muted/40">
      <ItemTile kind={item.kind} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{item.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {$t(KIND_LABELS[item.kind])}
          {item.updated_by ? ` · ${item.updated_by.name}` : ''}
        </div>
      </div>
      {item.bookmarked ? <Star className="size-4 fill-amber-400 text-amber-400" /> : null}
    </Link>
  )
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center">
        <h2 className="flex-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export default function HomePage() {
  useCrumbs([{ label: $t('Accueil') }])
  const { data: me } = useMe()
  const openCopilot = useUi((s) => s.openCopilot)
  const { data: home } = useQuery({
    queryKey: ['home'],
    queryFn: () => api.get<{ recent: ItemSummary[]; bookmarks: ItemSummary[]; latest: ItemSummary[] }>('/v1/home'),
  })
  const { data: tables = [] } = useTables()
  const { data: sources = [] } = useDatasources()
  const hour = new Date().getHours()
  const firstName = me?.name.split(' ')[0] ?? ''
  const hello = hour < 18 ? $t('Bonjour {name}', { name: firstName }) : $t('Bonsoir {name}', { name: firstName })
  const starters = tables
    .filter((t) => t.visibility === 'normal')
    .sort((a, b) => (b.description ? 1 : 0) - (a.description ? 1 : 0) || (b.row_count ?? 0) - (a.row_count ?? 0))
    .slice(0, 6)

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-8 py-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">{hello}</h1>
        <p className="text-muted-foreground">{$t('Que voulez-vous savoir aujourd’hui ?')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: '/question/new', icon: BarChart3, title: $t('Nouvelle question'), text: $t('Explorer une table sans écrire de SQL'), tone: 'bg-sky-50 text-sky-600 dark:bg-sky-950' },
          ...(me?.can.use_sql ? [{ href: '/sql', icon: Code2, title: $t('Requête SQL'), text: $t('Trino SQL sur toutes vos sources'), tone: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200' }] : []),
          { href: '/browse', icon: LayoutDashboard, title: $t('Tableaux de bord'), text: $t('Parcourir les dossiers partagés'), tone: 'bg-green-50 text-green-700 dark:bg-green-950' },
          ...(me?.ai_enabled ? [{ href: '#copilot', icon: Sparkles, title: $t('Demander au copilote'), text: $t('Une question en français, une réponse chiffrée'), tone: 'bg-violet-50 text-violet-600 dark:bg-violet-950' }] : []),
        ].map((a) => (
          <Link
            key={a.title}
            href={a.href}
            onClick={(e) => {
              if (a.href === '#copilot') {
                e.preventDefault()
                openCopilot({ kind: 'general' })
              }
            }}
            className="group flex flex-col gap-3 rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm"
          >
            <span className={`inline-flex size-10 items-center justify-center rounded-xl ${a.tone}`}>
              <a.icon className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-1 font-semibold">
                {a.title} <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="text-sm text-muted-foreground">{a.text}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="space-y-10">
          {home?.recent.length ? (
            <Section title={$t('Consultés récemment')}>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {home.recent.slice(0, 8).map((i) => (
                  <ItemCard key={i.id} item={i} />
                ))}
              </div>
            </Section>
          ) : null}
          {home?.bookmarks.length ? (
            <Section title={$t('Favoris')}>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {home.bookmarks.map((i) => (
                  <ItemCard key={i.id} item={i} />
                ))}
              </div>
            </Section>
          ) : null}
          <Section title={$t('Nouveautés')}>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {(home?.latest ?? []).map((i) => (
                <ItemCard key={i.id} item={i} />
              ))}
            </div>
          </Section>
        </div>
        <div className="space-y-10">
          <Section title={$t('Explorer une table')} action={<Link href="/structure" className="text-xs text-primary hover:underline">{$t('Toutes')}</Link>}>
            <div className="divide-y rounded-xl border">
              {starters.map((t) => (
                <Link key={t.id} href={`/question/new?table=${t.id}`} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-muted/40">
                  {t.icon ? <LookIcon name={t.icon} color={t.color} className="size-4" /> : <ItemTile kind="table" className="size-7" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.label}</div>
                    <div className="truncate text-xs text-muted-foreground">{t.description ?? t.native_comment ?? `${t.schema}.${t.name}`}</div>
                  </div>
                  {t.row_count ? <span className="text-xs text-muted-foreground tabular-nums">{formatCount(t.row_count)}</span> : null}
                </Link>
              ))}
              {starters.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{$t('Aucune table accessible pour l’instant.')}</p> : null}
            </div>
          </Section>
          <Section title={$t('Sources')}>
            <div className="space-y-2">
              {sources.map((s) => (
                <Link key={s.id} href={`/data/${s.id}`} className="flex items-center gap-3 rounded-xl border px-3.5 py-2.5 hover:bg-muted/40">
                  <Database className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm font-medium">{s.name}</span>
                  <span className={`size-2 rounded-full ${s.sync.status === 'ok' ? 'bg-green-500' : s.sync.status === 'failed' ? 'bg-red-500' : 'bg-amber-400'}`} />
                </Link>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
