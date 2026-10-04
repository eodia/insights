'use client'

import type { Folder, ItemKind, ItemSummary, LookColor } from '@eodia/contracts'
import { ColorPicker, IconPicker } from '@/components/app/structure/pickers'
import { Avatar, Chip, ItemTile, KIND_LABELS, LookIcon } from '@/components/app/look'
import { itemHref } from '@/components/app/palette'
import { DashboardView, type Runner } from '@/components/app/dashboard/view'
import { BrowseIllustration } from '@/components/app/browse-illustration'
import {
  ItemMenu,
  SelectionBar,
  TickBox,
  outsideFields,
  useDeleteItems,
  useTicks,
} from '@/components/app/item-selection'
import { ShareDialog } from '@/components/app/share-dialog'
import { Hint } from '@/components/ui/tooltip'
import { ResultFooter, Visualization } from '@/components/app/visualization'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { type RunResult, api } from '@/lib/api'
import { $t, $tp, intlLocale } from '@/lib/i18n'
import { folderLabel } from '@/lib/folders'
import { draggable, useDropFolder } from '@/lib/dnd'
import { keys, useDashboard, useFolderItems, useFolders, useMe, useQuestion } from '@/lib/queries'
import { useCrumbs } from '@/lib/store'
import { VIZ_LABELS } from '@/lib/viz'
import { ThemePicker } from '@/components/app/theme-picker'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  CornerLeftUp,
  FolderOpen,
  FolderPlus,
  Loader2,
  PanelRight,
  Search,
  Share2,
  Star,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useEffect, useMemo, useState } from 'react'
import { Pane } from '@/components/ui/pane'
import { TabRow } from '@/components/ui/tab-row'

type Tab = 'all' | ItemKind

const DETAILS_KEY = 'eodia:browse:details'

/** Whether the details pane shows, remembered in the browser when it can be. */
function useDetailsShown(): [boolean, () => void] {
  const [shown, setShown] = useState(true)
  useEffect(() => {
    try {
      if (localStorage.getItem(DETAILS_KEY) === '0') setShown(false)
    } catch {}
  }, [])
  const toggle = () =>
    setShown((v) => {
      try {
        localStorage.setItem(DETAILS_KEY, v ? '0' : '1')
      } catch {}
      return !v
    })
  return [shown, toggle]
}

function groupOf(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((start(today) - start(d)) / 86_400_000)
  if (days <= 0) return $t("Aujourd'hui")
  if (days === 1) return $t('Hier')
  if (days < 7) return $t('Cette semaine')
  if (days < 31) return $t('Ce mois-ci')
  return $t('Plus ancien')
}

function when(iso: string): string {
  const d = new Date(iso)
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000)
  if (days < 1) return d.toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' })
  if (days < 2) return $t('Hier')
  if (days < 7) return $tp(days, '{count} j', '{count} j')
  return d.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' })
}

function Row({
  item,
  active,
  ticked,
  ticking,
  onSelect,
  onTick,
  onDelete,
}: {
  item: ItemSummary
  active: boolean
  ticked: boolean
  /** Some row is ticked: every box shows. */
  ticking: boolean
  onSelect: () => void
  onTick: (range: boolean) => void
  onDelete: () => void
}) {
  return (
    // A div, not a button: Firefox does not drag a button.
    <div
      {...draggable({ kind: item.kind, id: item.id, name: item.name, folder: item.folder })}
      // biome-ignore lint/a11y/useSemanticElements: a button cannot be dragged everywhere
      role="button"
      tabIndex={0}
      aria-selected={ticked}
      onKeyDown={(e) => {
        if (e.key === 'Enter') window.location.href = itemHref(item)
        else if (e.key === ' ') {
          e.preventDefault()
          onSelect()
        } else if (e.key === 'Delete' && !ticking) {
          e.preventDefault()
          onDelete()
        }
      }}
      onClick={(e) => {
        // Shift: a range; Ctrl or ⌘: one more — the preview stays where it is.
        if (e.shiftKey) onTick(true)
        else if (e.ctrlKey || e.metaKey) onTick(false)
        else onSelect()
      }}
      // Shift ticks a range: no text selected on the way.
      onMouseDown={(e) => e.shiftKey && e.preventDefault()}
      onDoubleClick={() => (window.location.href = itemHref(item))}
      className={cn(
        'relative flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors',
        active ? 'bg-muted' : ticked ? 'bg-primary/5' : 'hover:bg-muted/60',
      )}
    >
      {active ? (
        <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" />
      ) : null}
      <ItemTile
        kind={item.kind}
        className={cn(
          'transition-opacity',
          ticked || ticking ? 'opacity-0' : 'group-hover/row:opacity-0',
        )}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate font-semibold">{item.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{when(item.updated_at)}</span>
        </div>
        <div className="truncate text-sm text-muted-foreground">
          {item.description ||
            (item.updated_by ? $t('Modifié par {name}', { name: item.updated_by.name }) : '')}
        </div>
        <div className="flex items-center gap-1.5">
          <Chip
            color={
              item.kind === 'dashboard'
                ? 'green'
                : item.kind === 'model'
                  ? 'violet'
                  : item.kind === 'metric'
                    ? 'amber'
                    : 'sky'
            }
          >
            {$t(KIND_LABELS[item.kind])}
          </Chip>
          {item.viz && item.kind === 'question' ? (
            <Chip>{$t(VIZ_LABELS[item.viz as keyof typeof VIZ_LABELS] ?? item.viz)}</Chip>
          ) : null}
          {item.bookmarked ? <Star className="size-3.5 fill-amber-400 text-amber-400" /> : null}
          <span className="flex-1" />
          {item.updated_by ? (
            <Avatar name={item.updated_by.name} color={item.updated_by.color} size="sm" />
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** A sub-folder: opened by a click, filed elsewhere by a drag, and a place to drop items on. */
function FolderTile({
  folder,
  label,
  draggableAs,
  icon,
}: { folder: string | null; label: string; draggableAs?: Folder; icon?: React.ReactNode }) {
  const drop = useDropFolder(folder, label)
  return (
    <Link
      href={folder ? `/browse/${folder}` : '/browse'}
      {...(draggableAs
        ? draggable({ kind: 'folder', id: draggableAs.id, name: label, folder: draggableAs.parent })
        : {})}
      {...drop.props}
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/60',
        drop.over && 'border-primary bg-primary/5 ring-2 ring-primary/30',
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  )
}

/** The folder's name with its pictogram and colour — to change them for those who may. */
function FolderLook({ folder, label }: { folder: Folder; label: string }) {
  const qc = useQueryClient()
  const editable = folder.access === 'edit' || folder.access === 'manage'
  const patch = async (p: { icon?: string | null; color?: LookColor | null }) => {
    try {
      await api.patch(`/v1/folders/${folder.id}`, p)
      await Promise.all([qc.invalidateQueries({ queryKey: keys.folders }), qc.invalidateQueries({ queryKey: ['folder-items'] })])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        {folder.icon ? <LookIcon name={folder.icon} color={folder.color} className="size-5" /> : <FolderOpen className="size-4 text-muted-foreground" />}
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold">{label}</span>
      {editable ? (
        <>
          <FolderTheme folder={folder} />
          <IconPicker value={folder.icon} color={folder.color} onChange={(icon) => void patch({ icon })} size="xs" />
          <ColorPicker value={folder.color} onChange={(color) => void patch({ color })} size="xs" />
        </>
      ) : null}
    </div>
  )
}

/** The folder's theme: what it and all it holds wear. */
function FolderTheme({ folder }: { folder: Folder }) {
  const qc = useQueryClient()
  const { data: full } = useQuery({ queryKey: ['folder', folder.id], queryFn: () => api.get<Folder>(`/v1/folders/${folder.id}`) })
  return (
    <ThemePicker
      value={full?.theme ?? folder.theme ?? null}
      resolved={full?.resolved_theme}
      self={folder.id}
      size="xs"
      className="w-48"
      onChange={async (theme) => {
        try {
          await api.patch(`/v1/folders/${folder.id}`, { theme })
          await Promise.all([qc.invalidateQueries({ queryKey: ['folder', folder.id] }), qc.invalidateQueries({ queryKey: keys.folders }), qc.invalidateQueries({ queryKey: ['dashboard'] })])
          toast.success(theme ? $t('Thème posé : tout le dossier le porte.') : $t('Le dossier reprend le thème dont il hérite.'))
        } catch (err) {
          toast.error(err instanceof Error ? err.message : String(err))
        }
      }}
    />
  )
}

/** A new sub-folder, named where it will appear. */
function NewFolderTile({ parent }: { parent: string | null }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const create = async () => {
    const n = name.trim()
    setEditing(false)
    setName('')
    if (!n) return
    try {
      await api.post<Folder>('/v1/folders', { name: n, parent })
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.folders }),
        qc.invalidateQueries({ queryKey: ['folder-items'] }),
      ])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }
  if (editing) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary px-3 py-1.5 text-sm">
        <FolderPlus className="size-4 shrink-0 text-primary" />
        <input
          // biome-ignore lint/a11y/noAutofocus: the field appears on the click that asks for it
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={create}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            else if (e.key === 'Escape') {
              setName('')
              setEditing(false)
            }
          }}
          placeholder={$t('Nom du dossier')}
          aria-label={$t('Nom du dossier')}
          className="h-7 min-w-0 flex-1 bg-transparent outline-none"
        />
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-left text-sm text-muted-foreground hover:border-primary hover:text-primary"
    >
      <FolderPlus className="size-4 shrink-0" />
      <span className="truncate">{$t('Nouveau dossier')}</span>
    </button>
  )
}

function QuestionPreview({
  id,
  details,
  onToggleDetails,
}: { id: string; details: boolean; onToggleDetails: () => void }) {
  const { data: q } = useQuestion(id)
  const run = useQuery({
    queryKey: ['preview-run', id],
    queryFn: () => api.post<RunResult>(`/v1/questions/${id}/run`, {}),
    retry: false,
  })
  if (!q) return <Loader2 className="m-auto size-5 animate-spin text-muted-foreground" />
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b px-6 py-4">
        <ItemTile kind={q.type === 'question' ? 'question' : q.type} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{q.name}</h2>
          {q.description ? <p className="text-sm text-muted-foreground">{q.description}</p> : null}
        </div>
        <Button asChild size="sm">
          <Link href={`/question/${id}`}>
            {$t('Ouvrir')} <ArrowUpRight />
          </Link>
        </Button>
        <Hint label={$t('Afficher ou masquer le détail')}>
          <Button
            size="icon-sm"
            variant={details ? 'secondary' : 'ghost'}
            onClick={onToggleDetails}
            aria-label={$t('Afficher ou masquer le détail')}
            aria-pressed={details}
            className="hidden xl:inline-flex"
          >
            <PanelRight />
          </Button>
        </Hint>
      </div>
      <div className="min-h-0 flex-1 p-4">
        {run.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : run.error ? (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {(run.error as Error).message}
          </p>
        ) : run.data ? (
          <div className="h-full rounded-xl border p-3">
            <Visualization result={run.data} viz={q.visualization} />
          </div>
        ) : null}
      </div>
      {run.data ? (
        <div className="border-t px-6 py-2">
          <ResultFooter result={run.data} />
        </div>
      ) : null}
    </div>
  )
}

/** A dashboard, shown as it is — its cards run under the person's rights, as on its own page. */
function DashboardPreview({ id }: { id: string }) {
  const { data: d, error } = useDashboard(id)
  if (error) return <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>
  if (!d) return <Loader2 className="m-auto size-5 animate-spin text-muted-foreground" />
  const runner: Runner = (card, values, { fresh }) =>
    api.post<RunResult>(`/v1/dashboards/${d.id}/cards/${card.id}/run`, { values, fresh })
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 px-6 pt-4 pb-1">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{d.name}</h2>
          {d.description ? <p className="text-sm text-muted-foreground">{d.description}</p> : null}
        </div>
        <Button asChild size="sm">
          <Link href={`/dashboard/${id}`}>
            {$t('Ouvrir')} <ArrowUpRight />
          </Link>
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <DashboardView
          key={d.updated_at}
          dashboard={d}
          runner={runner}
          editable={false}
          autoRefresh={d.auto_refresh}
        />
      </div>
    </div>
  )
}

function Details({
  item,
  folder,
  onShare,
  onBookmark,
}: { item: ItemSummary; folder?: Folder; onShare: () => void; onBookmark: () => void }) {
  const { data: me } = useMe()
  const { data: q } = useQuestion(item.kind !== 'dashboard' ? item.id : null)
  return (
    <Pane
      as="aside"
      id="browse.details"
      side="right"
      defaultSize={340}
      min={260}
      max={560}
      className="hidden overflow-y-auto border-l xl:block"
    >
      <div className="flex h-12 items-center gap-6 border-b px-5 text-[15px]">
        <span className="relative py-3 font-semibold after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary">
          {$t('Détails')}
        </span>
      </div>
      <div className="space-y-6 p-5">
        <div className="flex items-center gap-3">
          <ItemTile kind={item.kind} className="size-12" />
          <div className="min-w-0">
            <div className="truncate font-semibold">{item.name}</div>
            <Chip className="mt-1">{$t(KIND_LABELS[item.kind])}</Chip>
          </div>
        </div>
        <dl className="space-y-3 text-sm">
          {[
            [$t('Dossier'), folder ? folderLabel(folder, me?.id) : '—'],
            [
              $t('Modifié'),
              new Date(item.updated_at).toLocaleString(intlLocale(), {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            ],
            [$t('Par'), item.updated_by?.name ?? '—'],
            ...(q
              ? [
                  [
                    $t('Requête'),
                    q.query.kind === 'builder'
                      ? $t('Éditeur visuel')
                      : q.query.kind === 'sql'
                        ? $t('SQL Trino')
                        : $t('SQL natif'),
                  ],
                ]
              : []),
            ...(q
              ? [
                  [
                    $t('Accès'),
                    { view: $t('Lecture'), edit: $t('Modification'), manage: $t('Gestion') }[
                      q.access
                    ],
                  ],
                ]
              : []),
          ].map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <dt className="w-24 shrink-0 text-muted-foreground">{k}</dt>
              <dd className="min-w-0 flex-1 truncate">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onBookmark}>
            <Star className={cn(item.bookmarked && 'fill-amber-400 text-amber-400')} />{' '}
            {item.bookmarked ? $t('Retirer des favoris') : $t('Favori')}
          </Button>
          <Button variant="outline" size="sm" onClick={onShare}>
            <Share2 /> {$t('Partager')}
          </Button>
        </div>
      </div>
    </Pane>
  )
}

export default function BrowsePage({ params }: { params: Promise<{ folder?: string[] }> }) {
  const { folder: segments } = use(params)
  const folderId = segments?.[0] ?? 'root'
  const router = useRouter()
  const { data: folders = [] } = useFolders()
  const { data: me } = useMe()
  const { data, isLoading } = useFolderItems(folderId)
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [share, setShare] = useState<ItemSummary | null>(null)
  const qc = useQueryClient()
  const [details, toggleDetails] = useDetailsShown()
  const folder = folders.find((f) => f.id === folderId)
  const byId = new Map(folders.map((f) => [f.id, f]))
  const path: Folder[] = []
  for (let cursor = folder; cursor; cursor = cursor.parent ? byId.get(cursor.parent) : undefined)
    path.unshift(cursor)
  useCrumbs([
    { label: $t('Dossiers'), href: '/browse' },
    ...path.map((f) => ({ label: folderLabel(f, me?.id), href: `/browse/${f.id}` })),
  ])

  const items = data?.items ?? []
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length }
    for (const i of items) c[i.kind] = (c[i.kind] ?? 0) + 1
    return c
  }, [items])
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const visible = items
    .filter((i) => tab === 'all' || i.kind === tab)
    .filter((i) => !search || fold(`${i.name} ${i.description ?? ''}`).includes(fold(search)))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const groups = new Map<string, ItemSummary[]>()
  for (const i of visible) {
    const g = groupOf(i.updated_at)
    groups.set(g, [...(groups.get(g) ?? []), i])
  }
  const current = visible.find((i) => i.id === selected) ?? visible[0]
  // The items ticked, to act on at once — among those listed, in their order.
  const ticks = useTicks(visible, `${folderId}|${tab}`)
  const ticking = ticks.rows.length > 0
  const removal = useDeleteItems((ids) => {
    ticks.drop(ids)
    if (selected && ids.includes(selected)) setSelected(null)
  })
  const bookmark = async (item: ItemSummary) => {
    await api.post('/v1/bookmarks', { kind: item.kind, id: item.id, on: !item.bookmarked })
    await qc.invalidateQueries({ queryKey: ['folder-items'] })
  }
  // Outside a field, a dialog or a menu: Escape unticks them all, Delete deletes them.
  useEffect(() => {
    if (!ticking) return
    const onKey = (e: KeyboardEvent) => {
      if (!outsideFields(e.target)) return
      if (e.key === 'Escape') ticks.clear()
      else if (e.key === 'Delete') {
        e.preventDefault()
        removal.ask(ticks.rows)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  // Where the folder sits: its parent, or the root for a shared folder at the top (personal ones stay put).
  const parent: Folder | null | undefined = !folder
    ? undefined
    : folder.parent
      ? byId.get(folder.parent)
      : folder.personal
        ? undefined
        : null
  const canCreate =
    folderId === 'root' ? !!me?.is_admin : folder?.access === 'edit' || folder?.access === 'manage'
  const subfolders =
    folderId === 'root'
      ? folders.filter((f) => f.parent === null && (!f.personal || f.personal === me?.id))
      : (data?.folders ?? [])

  return (
    <div className="flex h-full">
      {/* List */}
      <Pane
        as="section"
        id="browse.list"
        side="left"
        defaultSize={380}
        min={280}
        max={640}
        className="flex flex-col border-r"
      >
        {folder && !folder.personal ? <FolderLook folder={folder} label={folderLabel(folder, me?.id)} /> : null}
        <div className="flex items-center gap-2 p-3">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={$t('Rechercher dans le dossier…')}
              className="h-10 rounded-lg pl-9"
            />
          </div>
        </div>
        {ticking ? (
          <SelectionBar
            count={ticks.rows.length}
            all={ticks.rows.length === visible.length ? true : 'some'}
            onAll={ticks.all}
            onClear={ticks.clear}
            onDelete={() => removal.ask(ticks.rows)}
          />
        ) : (
          <TabRow className="gap-5 border-b px-4 text-sm">
            {(['all', 'dashboard', 'question', 'model', 'metric'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'relative py-2.5 whitespace-nowrap',
                  tab === t
                    ? 'font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t === 'all'
                  ? $t('Tout')
                  : t === 'dashboard'
                    ? $t('Tableaux')
                    : t === 'question'
                      ? $t('Questions')
                      : t === 'model'
                        ? $t('Modèles')
                        : $t('Métriques')}{' '}
                <span className="text-xs text-muted-foreground">{counts[t] ?? 0}</span>
              </button>
            ))}
          </TabRow>
        )}
        <div
          className="flex-1 overflow-y-auto px-2 pb-4"
          // Ctrl or ⌘ + A, on the list: every item listed ticked.
          onKeyDown={(e) => {
            if (
              e.key.toLowerCase() === 'a' &&
              (e.ctrlKey || e.metaKey) &&
              outsideFields(e.target) &&
              visible.length
            ) {
              e.preventDefault()
              ticks.all()
            }
          }}
        >
          {(subfolders.length > 0 || canCreate || parent !== undefined) &&
          tab === 'all' &&
          !search ? (
            <div className="px-2 pt-4">
              <div className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {$t('Dossiers')}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {parent !== undefined ? (
                  <FolderTile
                    folder={parent?.id ?? null}
                    label={parent ? folderLabel(parent, me?.id) : $t('Dossiers')}
                    icon={<CornerLeftUp className="size-4 text-muted-foreground" />}
                  />
                ) : null}
                {subfolders.map((f) => (
                  <FolderTile
                    key={f.id}
                    folder={f.id}
                    label={folderLabel(f, me?.id)}
                    {...(f.personal ? {} : { draggableAs: f })}
                    icon={
                      f.icon ? (
                        <LookIcon name={f.icon} color={f.color} />
                      ) : (
                        <FolderOpen className="size-4 text-muted-foreground" />
                      )
                    }
                  />
                ))}
                {canCreate ? (
                  <NewFolderTile parent={folderId === 'root' ? null : folderId} />
                ) : null}
              </div>
              {subfolders.length > 0 || parent !== undefined ? (
                <p className="mt-2 px-1 text-[11px] text-muted-foreground">
                  {$t('Glissez un élément ou un dossier sur un dossier pour l’y ranger.')}
                </p>
              ) : null}
            </div>
          ) : null}
          {isLoading ? (
            <Loader2 className="mx-auto mt-10 size-5 animate-spin text-muted-foreground" />
          ) : null}
          {[...groups.entries()].map(([g, list]) => (
            <div key={g} className="pt-4">
              <div className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {g} <span className="ml-1 font-normal">{list.length}</span>
              </div>
              {list.map((i) => {
                const on = ticks.ticked.has(i.id)
                return (
                  <ItemMenu
                    key={i.id}
                    item={i}
                    selection={ticks.rows}
                    ticked={on}
                    onTick={() => ticks.tick(i.id, false)}
                    onShare={() => setShare(i)}
                    onBookmark={() => void bookmark(i)}
                    onDelete={removal.ask}
                    onClear={ticks.clear}
                  >
                    <div className="group/row relative">
                      <Row
                        item={i}
                        active={current?.id === i.id}
                        ticked={on}
                        ticking={ticking}
                        onSelect={() => setSelected(i.id)}
                        onTick={(range) => ticks.tick(i.id, range)}
                        onDelete={() => removal.ask([i])}
                      />
                      <TickBox
                        state={on}
                        label={$t('Sélectionner « {name} »', { name: i.name })}
                        onToggle={(e) => ticks.tick(i.id, e.shiftKey)}
                        className={cn(
                          'absolute top-[22px] left-[22px] focus-visible:opacity-100',
                          on || ticking ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100',
                        )}
                      />
                    </div>
                  </ItemMenu>
                )
              })}
            </div>
          ))}
          {!isLoading && visible.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              <BrowseIllustration variant="folder" className="mx-auto mb-5 w-44" />
              <p>
                {folderId === 'root' ? $t('Choisissez un dossier.') : $t('Ce dossier est vide.')}
              </p>
              <div className="mt-4">
                <Button size="sm" variant="outline" onClick={() => router.push('/question/new')}>
                  {$t('Nouvelle question')}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Pane>

      {/* Preview */}
      <section className="flex min-w-0 flex-1 flex-col">
        {current ? (
          current.kind === 'dashboard' ? (
            <DashboardPreview key={current.id} id={current.id} />
          ) : (
            <QuestionPreview
              key={current.id}
              id={current.id}
              details={details}
              onToggleDetails={toggleDetails}
            />
          )
        ) : (
          <div className="m-auto w-full max-w-sm px-6 py-10 text-center">
            <BrowseIllustration variant="preview" className="mx-auto mb-6 w-64" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              {folder
                ? folder.description || $t('Sélectionnez un élément pour le prévisualiser.')
                : $t(
                    'Parcourez vos dossiers : chaque dossier porte ses droits, et chaque élément peut aussi être partagé avec une personne ou un groupe.',
                  )}
            </p>
          </div>
        )}
      </section>

      {current && current.kind !== 'dashboard' && details ? (
        <Details
          item={current}
          {...(folder ? { folder } : {})}
          onShare={() => setShare(current)}
          onBookmark={() => bookmark(current)}
        />
      ) : null}
      {share ? (
        <ShareDialog
          open
          onOpenChange={(open) => !open && setShare(null)}
          kind={share.kind}
          id={share.id}
          name={share.name}
        />
      ) : null}
      {removal.dialog}
    </div>
  )
}
