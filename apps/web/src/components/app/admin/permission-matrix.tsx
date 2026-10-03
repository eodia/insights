'use client'

import type { ColumnAccess, ColumnMeta, DataAccess, Datasource, Folder, FolderAccess, Group, QueryLevel, TableMeta } from '@eodia/contracts'
import {
  COLUMN_ACCESS_TEXT,
  DATA_ACCESS_TEXT,
  FOLDER_ACCESS_TEXT,
  type PermissionsOverview,
  QUERY_LEVEL_TEXT,
  adminKeys,
  fail,
} from '@/components/app/admin/common'
import { RowRuleEditor } from '@/components/app/admin/row-rule-editor'
import { Chip, ItemTile, LookIcon } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Input } from '@/components/ui/input'
import { Hint } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { $t, $tp } from '@/lib/i18n'
import { keys, useTables } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Columns3, Filter, FolderClosed, Layers, Loader2, Lock, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

type Perms = PermissionsOverview
type Inheritable<T extends string> = T | 'inherit'

// ── Lecture des permissions d'un groupe ─────────────────────────────────────

export function sourceAccess(p: Perms, group: string, ds: string): DataAccess | null {
  return p.data.find((d) => d.group === group && d.datasource === ds && d.schema === null && d.table === null)?.access ?? null
}
export function schemaAccess(p: Perms, group: string, ds: string, schema: string): DataAccess | null {
  return p.data.find((d) => d.group === group && d.datasource === ds && d.schema === schema && d.table === null)?.access ?? null
}
export function tableAccess(p: Perms, group: string, table: string): DataAccess | null {
  return p.data.find((d) => d.group === group && d.table === table)?.access ?? null
}
export function queryLevel(p: Perms, group: string, ds: string): QueryLevel {
  return p.query.find((q) => q.group === group && q.datasource === ds)?.level ?? 'none'
}

function AccessDot({ access }: { access: DataAccess }) {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', access === 'read' ? 'bg-green-500' : access === 'restricted' ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-600')} />
}

const accessOptions = (inherited?: DataAccess) => [
  ...(inherited ? [{ value: 'inherit', label: $t('Hérité · {access}', { access: $t(DATA_ACCESS_TEXT[inherited]) }), render: <span className="flex items-center gap-2 text-muted-foreground"><AccessDot access={inherited} />{$t('Hérité · {access}', { access: $t(DATA_ACCESS_TEXT[inherited]) })}</span> }] : []),
  ...(['none', 'read', 'restricted'] as const).map((a) => ({
    value: a,
    label: $t(DATA_ACCESS_TEXT[a]),
    render: (
      <span className="flex items-center gap-2">
        <AccessDot access={a} />
        {$t(DATA_ACCESS_TEXT[a])}
      </span>
    ),
  })),
]

/** Sends one change, refreshes the overview, says it is done. */
function useApply() {
  const qc = useQueryClient()
  const [pending, setPending] = useState<string | null>(null)
  const apply = async (key: string, path: string, body: unknown, message = $t('Permission enregistrée')) => {
    setPending(key)
    try {
      await api.put(path, body)
      await qc.invalidateQueries({ queryKey: adminKeys.permissions })
      toast.success(message)
    } catch (err) {
      fail(err)
    } finally {
      setPending(null)
    }
  }
  return { apply, pending }
}

// ── Colonnes ────────────────────────────────────────────────────────────────

function ColumnRules({ group, columns, perms }: { group: string; columns: readonly ColumnMeta[]; perms: Perms }) {
  const { apply, pending } = useApply()
  const [masks, setMasks] = useState<Record<string, string>>({})
  const ruleOf = (col: string) => perms.columns.find((c) => c.group === group && c.column === col)
  const options = (['read', 'masked', 'hidden'] as const).map((a) => ({ value: a, label: $t(COLUMN_ACCESS_TEXT[a]) }))
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      {columns.map((col) => {
        const rule = ruleOf(col.id)
        const access: ColumnAccess = rule?.access ?? 'read'
        const mask = masks[col.id] ?? rule?.mask ?? ''
        const saveMask = () => {
          if ((rule?.mask ?? '') === mask.trim()) return
          void apply(col.id, '/v1/permissions/column', { group, column: col.id, access: 'masked', mask: mask.trim() || null }, $t('Masque enregistré'))
        }
        return (
          <div key={col.id} className="flex flex-wrap items-center gap-3 border-b px-3 py-2 last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{col.label || col.name}</div>
              <div className="truncate font-mono text-xs text-muted-foreground">
                {col.name} · {col.type}
              </div>
            </div>
            {access === 'masked' ? (
              <Hint label={$t('Une expression Trino sur la colonne ; vide, la valeur devient NULL.')}>
                <Input
                  value={mask}
                  onChange={(e) => setMasks({ ...masks, [col.id]: e.target.value })}
                  onBlur={saveMask}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveMask()
                  }}
                  placeholder={$t('NULL (par défaut)')}
                  aria-label={$t('Masque de {col}', { col: col.name })}
                  className="h-8 w-72 font-mono text-[12.5px]"
                />
              </Hint>
            ) : null}
            {pending === col.id ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
            <Choice
              value={access}
              onValueChange={(v) => apply(col.id, '/v1/permissions/column', { group, column: col.id, access: v === 'read' ? 'inherit' : v, mask: v === 'masked' ? mask.trim() || null : null })}
              options={options}
              aria-label={$t('Accès à la colonne {col}', { col: col.name })}
              className={cn('w-32', access === 'hidden' && 'text-destructive', access === 'masked' && 'text-amber-700 dark:text-amber-400')}
              size="xs"
            />
          </div>
        )
      })}
    </div>
  )
}

// ── Tables ──────────────────────────────────────────────────────────────────

function TableRow({ table, group, perms, inherited }: { table: TableMeta; group: string; perms: Perms; inherited: DataAccess }) {
  const { apply, pending } = useApply()
  const [open, setOpen] = useState(false)
  const own = tableAccess(perms, group, table.id)
  const effective = own ?? inherited
  const columns = table.columns ?? []
  const colIds = new Set(columns.map((c) => c.id))
  const colRules = perms.columns.filter((c) => c.group === group && colIds.has(c.column)).length
  const policy = perms.rows.find((r) => r.group === group && r.table === table.id)
  const restricted = effective === 'restricted'
  return (
    <div className={cn('border-t', open && restricted && 'bg-muted/30')}>
      <div className="grid grid-cols-[minmax(0,1fr)_200px_200px] items-center gap-4 py-2 pr-4 pl-12">
        <button type="button" onClick={() => restricted && setOpen(!open)} className={cn('flex min-w-0 items-center gap-2 text-left', !restricted && 'cursor-default')}>
          {restricted ? <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} /> : <span className="size-4 shrink-0" />}
          {table.icon ? <LookIcon name={table.icon} color={table.color} /> : <ItemTile kind="table" className="size-6 [&_svg]:size-3" />}
          <span className="min-w-16 truncate text-sm font-medium">{table.label || table.name}</span>
          {table.label && table.label !== table.name ? <span className="min-w-0 shrink-[3] truncate font-mono text-xs text-muted-foreground">{table.name}</span> : null}
          {restricted && colRules > 0 ? (
            <Chip color="amber" className="h-5 shrink-0">
              <Columns3 className="size-3" />
              {$tp(colRules, '{count} colonne', '{count} colonnes')}
            </Chip>
          ) : null}
          {restricted && policy ? (
            <Chip color="violet" className="h-5 shrink-0">
              <Filter className="size-3" />
              {$t('Lignes filtrées')}
            </Chip>
          ) : null}
        </button>
        <div className="flex items-center gap-2">
          <Choice
            value={own ?? 'inherit'}
            onValueChange={(v) => apply(table.id, '/v1/permissions/data', { group, datasource: table.datasource, schema: table.schema, table: table.id, access: v as Inheritable<DataAccess> })}
            options={accessOptions(inherited)}
            aria-label={$t('Accès à la table {table}', { table: table.name })}
            className="w-full"
            size="xs"
          />
        </div>
        <div className="flex items-center gap-2">
          {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          {restricted ? (
            <Button variant={open ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs" onClick={() => setOpen(!open)}>
              <SlidersHorizontal /> {open ? $t('Masquer les règles') : $t('Règles de restriction')}
            </Button>
          ) : null}
        </div>
      </div>
      {open && restricted ? (
        <div className="space-y-5 px-12 pt-2 pb-5">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Columns3 className="size-4 text-muted-foreground" />
              <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{$t('Colonnes')}</h4>
              <span className="text-xs text-muted-foreground">{$t('Masquée : la valeur est remplacée (NULL par défaut). Cachée : la colonne n’existe plus pour le groupe.')}</span>
            </div>
            <ColumnRules group={group} columns={columns} perms={perms} />
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Filter className="size-4 text-muted-foreground" />
              <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{$t('Lignes')}</h4>
            </div>
            <RowRuleEditor key={policy ? `${policy.id}:${JSON.stringify(policy.conditions)}:${policy.match}` : 'none'} group={group} table={table.id} columns={columns} policy={policy} attributes={perms.attributes} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SourceTables({ ds, group, perms, dsAccess }: { ds: Datasource; group: string; perms: Perms; dsAccess: DataAccess }) {
  const { data: tables, isLoading } = useTables(ds.id, true)
  const { apply, pending } = useApply()
  if (isLoading) return <Loader2 className="mx-auto my-4 size-4 animate-spin text-muted-foreground" />
  const active = (tables ?? []).filter((t) => t.status === 'active')
  const schemas = [...new Set(active.map((t) => t.schema))].sort()
  if (active.length === 0) return <p className="border-t px-12 py-3 text-sm text-muted-foreground">{$t('Aucune table synchronisée.')}</p>
  return (
    <div>
      {schemas.map((schema) => {
        const own = schemaAccess(perms, group, ds.id, schema)
        const inherited = own ?? dsAccess
        return (
          <div key={schema}>
            <div className="grid grid-cols-[minmax(0,1fr)_200px_200px] items-center gap-4 border-t bg-muted/40 py-2 pr-4 pl-10">
              <div className="flex min-w-0 items-center gap-2">
                <Layers className="size-4 text-muted-foreground" />
                <span className="truncate font-mono text-[13px]">{schema}</span>
                <span className="text-xs text-muted-foreground">{$tp(active.filter((t) => t.schema === schema).length, '{count} table', '{count} tables')}</span>
              </div>
              <Choice
                value={own ?? 'inherit'}
                onValueChange={(v) => apply(`schema:${schema}`, '/v1/permissions/data', { group, datasource: ds.id, schema, table: null, access: v as Inheritable<DataAccess> })}
                options={accessOptions(dsAccess)}
                aria-label={$t('Accès au schéma {schema}', { schema })}
                className="w-full"
                size="xs"
              />
              <div>{pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}</div>
            </div>
            {active
              .filter((t) => t.schema === schema)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((t) => (
                <TableRow key={t.id} table={t} group={group} perms={perms} inherited={inherited} />
              ))}
          </div>
        )
      })}
    </div>
  )
}

// ── Sources ─────────────────────────────────────────────────────────────────

function SourceRow({ ds, group, perms, readOnly }: { ds: Datasource; group: string; perms: Perms; readOnly: boolean }) {
  const { apply, pending } = useApply()
  const [open, setOpen] = useState(false)
  const access = readOnly ? 'read' : (sourceAccess(perms, group, ds.id) ?? 'none')
  const level = readOnly ? 'native' : queryLevel(perms, group, ds.id)
  const overrides = perms.data.filter((d) => d.group === group && d.datasource === ds.id && (d.schema !== null || d.table !== null)).length
  const levels = (['none', 'builder', 'sql', 'native'] as const).filter((l) => l !== 'native' || ds.options.native_sql || level === 'native')
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="grid grid-cols-[minmax(0,1fr)_200px_200px] items-center gap-4 px-4 py-3">
        <button type="button" onClick={() => !readOnly && setOpen(!open)} disabled={readOnly} className="flex min-w-0 items-center gap-3 text-left">
          <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90', readOnly && 'invisible')} />
          <ItemTile kind="source" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold">{ds.name}</span>
              <Chip>{ds.engine}</Chip>
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {$tp(ds.stats.tables, '{count} table', '{count} tables')}
              {overrides > 0 ? ` · ${$tp(overrides, '{count} réglage plus fin', '{count} réglages plus fins')}` : ''}
            </div>
          </div>
        </button>
        <Choice
          value={access}
          onValueChange={(v) => apply(`ds:${ds.id}`, '/v1/permissions/data', { group, datasource: ds.id, schema: null, table: null, access: v as DataAccess })}
          options={accessOptions()}
          aria-label={$t('Accès aux données de {source}', { source: ds.name })}
          disabled={readOnly}
          className="w-full"
        />
        <div className="flex items-center gap-2">
          <Choice
            value={level}
            onValueChange={(v) => apply(`q:${ds.id}`, '/v1/permissions/query', { group, datasource: ds.id, level: v as QueryLevel })}
            options={levels.map((l) => ({ value: l, label: $t(QUERY_LEVEL_TEXT[l]) }))}
            aria-label={$t('Requêtes sur {source}', { source: ds.name })}
            disabled={readOnly}
            className="w-full"
          />
          {pending ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" /> : null}
        </div>
      </div>
      {!readOnly && access === 'restricted' && level === 'native' ? (
        <div className="border-t bg-amber-50/60 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {$t('En accès restreint, le SQL natif reste interdit : les règles ne pourraient pas s’y appliquer. Le groupe écrira en SQL Trino.')}
        </div>
      ) : null}
      {open ? <SourceTables ds={ds} group={group} perms={perms} dsAccess={access} /> : null}
    </div>
  )
}

export function DataMatrix({ group, perms, datasources }: { group: Group; perms: Perms; datasources: readonly Datasource[] }) {
  const readOnly = group.kind === 'admin'
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)_200px_200px] gap-4 px-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <span className="pl-7">{$t('Source')}</span>
        <span>{$t('Accès aux données')}</span>
        <span>{$t('Requêtes')}</span>
      </div>
      {datasources.map((ds) => (
        <SourceRow key={`${group.id}:${ds.id}`} ds={ds} group={group.id} perms={perms} readOnly={readOnly} />
      ))}
      {datasources.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{$t('Aucune source de données connectée.')}</p> : null}
    </div>
  )
}

// ── Dossiers ────────────────────────────────────────────────────────────────

export function FolderMatrix({ group, perms, folders }: { group: Group; perms: Perms; folders: readonly Folder[] }) {
  const qc = useQueryClient()
  const { apply, pending } = useApply()
  const readOnly = group.kind === 'admin'
  const shared = folders.filter((f) => !f.personal)
  const children = (parent: string | null) => shared.filter((f) => f.parent === parent).sort((a, b) => a.name.localeCompare(b.name))
  const ordered: { folder: Folder; depth: number }[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const f of children(parent)) {
      ordered.push({ folder: f, depth })
      walk(f.id, depth + 1)
    }
  }
  walk(null, 0)
  // Folders whose parent is out of sight (personal): shown at the root.
  for (const f of shared) if (!ordered.some((o) => o.folder.id === f.id)) ordered.push({ folder: f, depth: 0 })

  const options = (['inherit', 'none', 'view', 'edit', 'manage'] as const).map((a) => ({ value: a, label: a === 'inherit' ? $t('Hérité') : $t(FOLDER_ACCESS_TEXT[a]) }))
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-4 border-b bg-muted/40 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <span>{$t('Dossier')}</span>
        <span>{$t('Accès du groupe')}</span>
      </div>
      {ordered.map(({ folder, depth }) => {
        const own = perms.folders.find((p) => p.group === group.id && p.folder === folder.id)?.access
        return (
          <div key={folder.id} className="grid grid-cols-[minmax(0,1fr)_220px] items-center gap-4 border-b px-4 py-2.5 last:border-b-0">
            <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * 20 }}>
              {folder.icon ? <LookIcon name={folder.icon} color={folder.color} /> : <FolderClosed className="size-4 text-muted-foreground" />}
              <span className="truncate text-sm font-medium">{folder.name}</span>
              {folder.description ? <span className="truncate text-xs text-muted-foreground">{folder.description}</span> : null}
            </div>
            <div className="flex items-center gap-2">
              {readOnly ? (
                <Chip color="green">
                  <Lock className="size-3" /> {$t(FOLDER_ACCESS_TEXT.manage)}
                </Chip>
              ) : (
                <Choice
                  value={own ?? 'inherit'}
                  onValueChange={async (v) => {
                    await apply(folder.id, '/v1/permissions/folder', { group: group.id, folder: folder.id, access: v as Inheritable<FolderAccess> })
                    await qc.invalidateQueries({ queryKey: keys.folders })
                  }}
                  options={options}
                  aria-label={$t('Accès au dossier {folder}', { folder: folder.name })}
                  className="w-full"
                  size="xs"
                />
              )}
              {pending === folder.id ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" /> : null}
            </div>
          </div>
        )
      })}
      {ordered.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{$t('Aucun dossier partagé.')}</p> : null}
    </div>
  )
}

/** A one-line summary of what a group may read — for the list of groups. */
export function groupSummary(p: Perms, group: Group): string {
  if (group.kind === 'admin') return $t('Les administrateurs lisent tout')
  const own = p.data.filter((d) => d.group === group.id && d.schema === null && d.table === null)
  const read = own.filter((d) => d.access === 'read').length
  const restricted = own.filter((d) => d.access === 'restricted').length
  const parts: string[] = []
  if (read) parts.push($tp(read, '{count} source en lecture', '{count} sources en lecture'))
  if (restricted) parts.push($tp(restricted, '{count} restreinte', '{count} restreintes'))
  return parts.length ? parts.join(' · ') : $t('Aucun accès aux données')
}

