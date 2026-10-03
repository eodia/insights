'use client'

import type { LookColor } from '@eodia/contracts'
import { AdminOnly, Empty, PageHeader, Spinner, adminKeys, dateTime, useUsers } from '@/components/app/admin/common'
import { Avatar, Chip } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Hint } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { formatAgo } from '@/lib/format'
import { $t, $tp, intlLocale, msg } from '@/lib/i18n'
import { useCrumbs } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ChevronDown, Loader2, RotateCw, ScrollText } from 'lucide-react'
import { useState } from 'react'

interface AuditRow {
  readonly id: number
  readonly at: string
  readonly action: string
  readonly target_kind: string | null
  readonly target_id: string | null
  readonly details: Record<string, unknown> | null
  readonly ip: string | null
  readonly actor_id: string | null
  readonly actor_name: string | null
  readonly actor_email: string | null
}

const PAGE = 100

/** The families of actions, by their prefix. */
const FAMILIES: readonly { prefix: string; label: string; color: LookColor }[] = [
  { prefix: 'auth.', label: msg('Connexions'), color: 'sky' },
  { prefix: 'user.', label: msg('Personnes'), color: 'teal' },
  { prefix: 'invitation.', label: msg('Invitations'), color: 'cyan' },
  { prefix: 'group.', label: msg('Groupes'), color: 'indigo' },
  { prefix: 'permission.', label: msg('Permissions'), color: 'rose' },
  { prefix: 'datasource.', label: msg('Sources de données'), color: 'violet' },
  { prefix: 'metadata.', label: msg('Métadonnées'), color: 'purple' },
  { prefix: 'question.', label: msg('Questions'), color: 'blue' },
  { prefix: 'dashboard.', label: msg('Tableaux de bord'), color: 'green' },
  { prefix: 'folder.', label: msg('Dossiers'), color: 'amber' },
  { prefix: 'share', label: msg('Partages'), color: 'orange' },
  { prefix: 'token.', label: msg('Jetons'), color: 'lime' },
  { prefix: 'embed_secret.', label: msg('Intégration signée'), color: 'pink' },
  { prefix: 'setting.', label: msg('Réglages'), color: 'gray' },
]

const colorOf = (action: string): LookColor => FAMILIES.find((f) => action.startsWith(f.prefix))?.color ?? 'gray'

function Details({ details }: { details: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false)
  if (!details || Object.keys(details).length === 0) return <span className="text-muted-foreground">—</span>
  const text = JSON.stringify(details)
  return (
    <button type="button" onClick={() => setOpen(!open)} className="block w-full min-w-0 text-left">
      {open ? (
        <pre className="font-mono text-xs break-all whitespace-pre-wrap">{JSON.stringify(details, null, 2)}</pre>
      ) : (
        <span className="block truncate font-mono text-xs text-muted-foreground">{text}</span>
      )}
    </button>
  )
}

function Audit() {
  const [action, setAction] = useState('')
  const [actor, setActor] = useState('')
  const { data: users = [] } = useUsers()
  const q = useInfiniteQuery({
    queryKey: adminKeys.audit(action, actor),
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      api.get<AuditRow[]>(`/v1/admin/audit?${new URLSearchParams({ ...(pageParam ? { before: pageParam } : {}), ...(action ? { action } : {}), ...(actor ? { actor } : {}) })}`),
    getNextPageParam: (last) => (last.length >= PAGE ? String(last[last.length - 1]?.id ?? '') : undefined),
  })
  const rows = q.data?.pages.flat() ?? []

  return (
    <div className="mx-auto max-w-6xl px-8 py-6">
      <PageHeader
        title={$t("Journal d'audit")}
        description={$t('Chaque action sensible laisse une trace : connexions, changements de droits, de sources, de contenu et de réglages.')}
        actions={
          <Hint label={$t('Actualiser')}>
            <Button variant="outline" size="icon" onClick={() => q.refetch()} aria-label={$t('Actualiser')}>
              <RotateCw className={cn(q.isFetching && 'animate-spin')} />
            </Button>
          </Hint>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Choice
          value={action}
          onValueChange={setAction}
          options={[
            { value: '', label: $t('Toutes les actions') },
            ...FAMILIES.map((f) => ({ value: f.prefix, label: $t(f.label) })),
            ...(action && !FAMILIES.some((f) => f.prefix === action) ? [{ value: action, label: action }] : []),
          ]}
          aria-label={$t('Type d’action')}
          className="w-56"
          size="default"
        />
        <Choice
          value={actor}
          onValueChange={setActor}
          options={[{ value: '', label: $t('Toutes les personnes') }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
          aria-label={$t('Auteur')}
          className="w-56"
          size="default"
        />
        <span className="flex-1" />
        <span className="text-sm text-muted-foreground">{q.hasNextPage ? $t('{count}+ événements', { count: rows.length }) : $tp(rows.length, '{count} événement', '{count} événements')}</span>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted/40 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="w-44 px-4 py-2.5">{$t('Date')}</th>
              <th className="w-52 px-4 py-2.5">{$t('Auteur')}</th>
              <th className="w-52 px-4 py-2.5">{$t('Action')}</th>
              <th className="w-48 px-4 py-2.5">{$t('Cible')}</th>
              <th className="px-4 py-2.5">{$t('Détails')}</th>
              <th className="w-28 px-4 py-2.5">{$t('IP')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top hover:bg-muted/30">
                <td className="px-4 py-2.5">
                  <Hint label={dateTime(r.at)}>
                    <span className="whitespace-nowrap">{formatAgo(r.at)}</span>
                  </Hint>
                  <div className="text-xs text-muted-foreground">{new Date(r.at).toLocaleString(intlLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                </td>
                <td className="px-4 py-2.5">
                  {r.actor_name ? (
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={r.actor_name} size="sm" color={users.find((u) => u.id === r.actor_id)?.color ?? null} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{r.actor_name}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.actor_email}</div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">{$t('Système')}</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <button type="button" onClick={() => setAction(r.action)} className="max-w-full">
                    <Chip color={colorOf(r.action)} className="max-w-full font-mono">
                      <span className="truncate">{r.action}</span>
                    </Chip>
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  {r.target_kind ? (
                    <div className="min-w-0">
                      <div className="truncate">{r.target_kind}</div>
                      {r.target_id ? <div className="truncate font-mono text-xs text-muted-foreground">{r.target_id}</div> : null}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <Details details={r.details} />
                </td>
                <td className="truncate px-4 py-2.5 font-mono text-xs text-muted-foreground">{r.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {q.isLoading ? <Spinner className="my-8" /> : null}
        {!q.isLoading && rows.length === 0 ? <Empty icon={<ScrollText className="size-5" />} title={$t('Aucun événement.')} /> : null}
      </div>
      {q.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            {q.isFetchingNextPage ? <Loader2 className="animate-spin" /> : <ChevronDown />}
            {$t('Charger plus')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default function AuditPage() {
  useCrumbs([{ label: $t('Administration') }, { label: $t("Journal d'audit") }])
  return (
    <AdminOnly>
      <Audit />
    </AdminOnly>
  )
}
