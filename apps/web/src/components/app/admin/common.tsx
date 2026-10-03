'use client'

import type { ColumnAccess, DataAccess, FolderAccess, Group, QueryLevel, RowCondition, UserRow } from '@eodia/contracts'
import { Chip } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Hint } from '@/components/ui/tooltip'
import { ApiError, api } from '@/lib/api'
import { formatAgo } from '@/lib/format'
import { $t, intlLocale, msg } from '@/lib/i18n'
import { useMe } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, Loader2, ShieldAlert, ShieldCheck, Users, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

// ── Données ─────────────────────────────────────────────────────────────────

export const adminKeys = {
  users: ['admin', 'users'] as const,
  groups: ['admin', 'groups'] as const,
  members: (id: string) => ['admin', 'group-members', id] as const,
  invitations: ['admin', 'invitations'] as const,
  permissions: ['permissions'] as const,
  status: ['admin', 'status'] as const,
  embedSecrets: ['admin', 'embed-secrets'] as const,
  audit: (action: string, actor: string) => ['admin', 'audit', action, actor] as const,
  tokens: ['me', 'tokens'] as const,
}

export interface PermissionsOverview {
  readonly data: readonly { group: string; datasource: string; schema: string | null; table: string | null; access: DataAccess }[]
  readonly query: readonly { group: string; datasource: string; level: QueryLevel }[]
  readonly columns: readonly { group: string; column: string; access: ColumnAccess; mask: string | null }[]
  readonly rows: readonly { id: string; group: string; table: string; match: 'all' | 'any'; conditions: readonly RowCondition[]; description: string | null }[]
  readonly rights: readonly { group: string; right: string }[]
  readonly folders: readonly { group: string; folder: string; access: FolderAccess }[]
  readonly attributes: readonly string[]
}

/**
 * The words of `@eodia/contracts` (`DATA_ACCESS_LABELS`, `QUERY_LEVEL_LABELS`, `COLUMN_ACCESS_LABELS`,
 * `FOLDER_ACCESS_LABELS`), marked here for the catalog: the same French, translated where shown.
 */
export const DATA_ACCESS_TEXT: Record<DataAccess, string> = {
  none: msg('Aucun accès'),
  read: msg('Lecture'),
  restricted: msg('Restreint'),
}

export const QUERY_LEVEL_TEXT: Record<QueryLevel, string> = {
  none: msg('Aucune requête'),
  builder: msg('Éditeur visuel'),
  sql: msg('SQL'),
  native: msg('SQL natif'),
}

export const COLUMN_ACCESS_TEXT: Record<ColumnAccess, string> = {
  hidden: msg('Cachée'),
  masked: msg('Masquée'),
  read: msg('Lisible'),
}

export const FOLDER_ACCESS_TEXT: Record<FolderAccess, string> = {
  none: msg('Aucun'),
  view: msg('Lecture'),
  edit: msg('Modification'),
  manage: msg('Gestion'),
}

export interface Member {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly color: string | null
}

export const useGroups = () => useQuery({ queryKey: adminKeys.groups, queryFn: () => api.get<Group[]>('/v1/admin/groups') })
export const useUsers = (enabled = true) => useQuery({ queryKey: adminKeys.users, queryFn: () => api.get<UserRow[]>('/v1/admin/users'), enabled })
export const usePermissions = (enabled = true) =>
  useQuery({ queryKey: adminKeys.permissions, queryFn: () => api.get<PermissionsOverview>('/v1/permissions'), enabled })

/** Shows what went wrong, as the API worded it. */
export function fail(err: unknown): void {
  toast.error(err instanceof ApiError || err instanceof Error ? err.message : $t('Une erreur est survenue.'))
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' })
}

export function ago(iso: string | null | undefined): string {
  return iso ? formatAgo(iso) : $t('Jamais')
}

export function formatBytes(n: number): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return new Intl.NumberFormat(intlLocale(), { style: 'unit', unit: units[i], maximumFractionDigits: i === 0 ? 0 : 1 }).format(v)
}

// ── Mise en page ────────────────────────────────────────────────────────────

/** The small uppercase heading of a section of a pane. */
export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-2 flex items-center gap-2', className)}>
      <h3 className="flex-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h3>
      {action}
    </div>
  )
}

/** The title block of a simple page. */
export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** A bordered card with a title row. */
export function Card({ title, icon, action, children, className }: { title?: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border bg-card', className)}>
      {title ? (
        <div className="flex items-center gap-2 border-b px-5 py-3">
          {icon}
          <h2 className="flex-1 text-[15px] font-semibold">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  )
}

/** A soft notice: what a screen does, a rule to remember. */
export function Notice({ children, tone = 'info', className }: { children: React.ReactNode; tone?: 'info' | 'warn'; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 text-sm',
        tone === 'info' ? 'border-sky-200 bg-sky-50/60 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200' : 'border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function Empty({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-sm px-6 py-12 text-center">
      {icon ? <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</div> : null}
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-1 text-sm text-muted-foreground">{children}</div> : null}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('mx-auto mt-10 size-5 animate-spin text-muted-foreground', className)} />
}

/** Copies to the clipboard, and says so. */
export async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success($t('Copié dans le presse-papiers'))
  } catch {
    toast.error($t('Copie impossible : sélectionnez le texte à la main.'))
  }
}

/** A read-only value with a copy button: a link, a token, a secret. */
export function CopyField({ value, secret = false, className }: { value: string; secret?: boolean; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className={cn('flex items-center gap-2 rounded-lg border bg-muted/40 p-1.5 pl-3', className)}>
      <code className={cn('min-w-0 flex-1 truncate font-mono text-[13px]', secret && 'text-foreground')}>{value}</code>
      <Button
        type="button"
        size="sm"
        variant={done ? 'secondary' : 'default'}
        onClick={async () => {
          await copy(value)
          setDone(true)
          setTimeout(() => setDone(false), 1800)
        }}
      >
        {done ? <Check /> : <Copy />}
        {done ? $t('Copié') : $t('Copier')}
      </Button>
    </div>
  )
}

/** A block of code with a copy button in its corner. */
export function CodeBlock({ code, className }: { code: string; className?: string }) {
  return (
    <div className={cn('relative rounded-xl border bg-muted/40', className)}>
      <pre className="overflow-x-auto p-4 pr-14 font-mono text-[12.5px] leading-relaxed">{code}</pre>
      <Hint label={$t('Copier')}>
        <Button type="button" size="icon-sm" variant="ghost" className="absolute top-2 right-2" onClick={() => copy(code)} aria-label={$t('Copier')}>
          <Copy />
        </Button>
      </Hint>
    </div>
  )
}

/** Stops a screen meant for administrators — the API would refuse anyway, this says why. */
export function AdminOnly({ right, children }: { right?: 'manage_permissions'; children: React.ReactNode }) {
  const { data: me } = useMe()
  if (!me) return <Spinner />
  const allowed = me.is_admin || (right ? me.can[right] : false)
  if (!allowed) {
    return (
      <Empty icon={<ShieldAlert className="size-5" />} title={$t('Accès réservé')}>
        {$t('Cet écran est réservé aux administrateurs de l’instance.')}
      </Empty>
    )
  }
  return <>{children}</>
}

// ── Groupes ─────────────────────────────────────────────────────────────────

export const GROUP_KIND_LABELS: Record<Group['kind'], string> = {
  admin: msg('Système'),
  all: msg('Système'),
  custom: msg('Personnalisé'),
}

/** The round tile of a group in a list. */
export function GroupTile({ kind, className }: { kind: Group['kind']; className?: string }) {
  const Icon = kind === 'admin' ? ShieldCheck : kind === 'all' ? UsersRound : Users
  const tone =
    kind === 'admin'
      ? 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300'
      : kind === 'all'
        ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
        : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300'
  return (
    <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full', tone, className)}>
      <Icon className="size-4" />
    </span>
  )
}

export function GroupChip({ group }: { group: Pick<Group, 'name' | 'kind'> }) {
  return <Chip color={group.kind === 'admin' ? 'rose' : group.kind === 'all' ? 'gray' : 'indigo'}>{group.name}</Chip>
}

/** Choosing several groups — « Tous les utilisateurs » is left out: everyone is in it. */
export function GroupsPicker({ value, onChange, groups, id }: { value: readonly string[]; onChange: (next: string[]) => void; groups: readonly Group[]; id?: string }) {
  const choosable = groups.filter((g) => g.kind !== 'all')
  const chosen = choosable.filter((g) => value.includes(g.id))
  return (
    <Combobox
      value={null}
      selected={new Set(value)}
      onValueChange={(v) => {
        if (v === null) onChange([])
        else onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
      }}
      options={choosable.map((g) => ({ value: g.id, label: g.name }))}
      clearLabel={$t('Aucun groupe')}
      aria-label={$t('Groupes')}
      {...(id ? { id } : {})}
      className="h-auto min-h-9 py-1.5"
    >
      {chosen.length === 0 ? (
        <span className="text-muted-foreground">{$t('Aucun groupe')}</span>
      ) : (
        <span className="flex flex-wrap gap-1">
          {chosen.map((g) => (
            <GroupChip key={g.id} group={g} />
          ))}
        </span>
      )}
    </Combobox>
  )
}

/** A row of exclusive buttons, for two or three short choices. */
export function Segmented<T extends string>({ value, onChange, options, disabled, 'aria-label': ariaLabel }: { value: T; onChange: (v: T) => void; options: readonly { value: T; label: string }[]; disabled?: boolean; 'aria-label': string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-lg border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 rounded-md px-3 text-xs font-medium transition-colors disabled:opacity-50',
            value === o.value ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
