'use client'

import type { Folder, ItemSummary } from '@eodia/contracts'
import { WorkspaceMenu } from '@/components/app/workspace-menu'
import { Avatar, ItemTile, LookIcon } from '@/components/app/look'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Orb } from '@/components/app/assistant/orb'
import { api } from '@/lib/api'
import { $t, LOCALES, LOCALE_NAMES, chooseLocale, rememberedLocale } from '@/lib/i18n'
import { draggable, useDropFolder } from '@/lib/dnd'
import { FolderMenu } from '@/components/app/folder-menu'
import { folderLabel } from '@/lib/folders'
import { useFolders, useMe } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { useUi } from '@/lib/store'
import {
  BellRing,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Database,
  FolderClosed,
  FolderLock,
  History,
  Home,
  KeyRound,
  Languages,
  Layers,
  LogOut,
  Moon,
  Network,
  Palette,
  ScrollText,
  Settings,
  Shield,
  SlidersHorizontal,
  Sun,
  UserRound,
  Users,
  UsersRound,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

/** The assistant's mark: its ring of light, small. */
function AssistantIcon({ className }: { className?: string }) {
  return <Orb size={18} className={className} />
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  sub = false,
  badge,
  children,
}: {
  href: string
  icon?: React.ComponentType<{ className?: string }>
  label: string
  active: boolean
  sub?: boolean
  /** After the label, on the right. */
  badge?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg text-[14px] transition-all duration-150',
        sub ? 'h-8 pl-10 pr-2 text-[13.5px] text-muted-foreground' : 'h-9 px-3 text-foreground/85',
        // The page one is on: a sheet lifted off the sidebar, its pictogram in the brand's colour.
        active
          ? 'bg-background font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)] dark:bg-sidebar-accent'
          : 'hover:bg-sidebar-accent hover:text-foreground',
      )}
    >
      {children ?? (Icon ? <Icon className={cn('size-[18px] shrink-0 transition-colors', sub ? 'size-4' : '', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} /> : null)}
      <span className="truncate">{label}</span>
      {badge ? <span className="ml-auto">{badge}</span> : null}
    </Link>
  )
}

/**
 * A folder of the tree: its sub-folders unfold under it, and an item or folder dragged onto it
 * is filed there. A right click opens its menu — its theme, its deletion.
 */
function FolderNode({ folder, folders, depth, path, me }: { folder: Folder; folders: readonly Folder[]; depth: number; path: string; me: string | undefined }) {
  const children = folders.filter((f) => f.parent === folder.id)
  const href = `/browse/${folder.id}`
  const active = path === href || path.startsWith(`${href}/`)
  // Unfolded on the way to the open folder, and as the person chooses.
  const current = path.startsWith('/browse/') ? path.split('/')[2] : undefined
  const onPath = !!current && (current === folder.id || folders.find((f) => f.id === current)?.path.some((p) => p.id === folder.id))
  const [open, setOpen] = useState<boolean | null>(null)
  const unfolded = open ?? onPath
  const label = folderLabel(folder, me)
  const drop = useDropFolder(folder.id, label)
  return (
    <>
      <FolderMenu folder={folder} as="context">
        <Link
          href={href}
          {...(folder.personal ? {} : draggable({ kind: 'folder', id: folder.id, name: label, folder: folder.parent }))}
          {...drop.props}
          style={{ paddingLeft: 16 + depth * 14 }}
          className={cn(
            'group flex h-9 items-center gap-2 rounded-lg pr-2 text-sm text-muted-foreground transition-colors',
            active ? 'bg-sidebar-accent font-medium text-foreground' : 'hover:bg-sidebar-accent/70',
            drop.over && 'bg-primary/10 text-foreground ring-2 ring-primary/40',
          )}
        >
          {children.length ? (
            <button
              type="button"
              aria-label={unfolded ? $t('Replier') : $t('Déplier')}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setOpen(!unfolded)
              }}
              className="-ml-1 rounded p-0.5 hover:bg-sidebar-accent"
            >
              <ChevronRight className={cn('size-3.5 transition-transform', unfolded && 'rotate-90')} />
            </button>
          ) : (
            <span className="w-[18px] shrink-0" />
          )}
          {folder.icon ? (
            <LookIcon name={folder.icon} color={folder.color} className="size-4 shrink-0" />
          ) : folder.personal ? (
            <FolderLock className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <FolderClosed className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{label}</span>
        </Link>
      </FolderMenu>
      {unfolded
        ? children.map((c) => <FolderNode key={c.id} folder={c} folders={folders} depth={depth + 1} path={path} me={me} />)
        : null}
    </>
  )
}

/** A short list of items, under a quiet title — folded once one has had enough of it. */
function QuickList({ title, items, path }: { title: string; items: readonly ItemSummary[]; path: string }) {
  const [open, setOpen] = useState(true)
  if (!items.length) return null
  const hrefOf = (i: ItemSummary) => (i.kind === 'dashboard' ? `/dashboard/${i.id}` : `/question/${i.id}`)
  return (
    <div className="pt-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="group flex w-full items-center gap-1 px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase hover:text-foreground">
        <span className="flex-1 text-left">{title}</span>
        <ChevronDown className={cn('size-3.5 opacity-0 transition-all group-hover:opacity-100', !open && '-rotate-90')} />
      </button>
      {open
        ? items.slice(0, 5).map((i) => {
            const href = hrefOf(i)
            const active = path === href
            return (
              <Link
                key={`${i.kind}-${i.id}`}
                href={href}
                className={cn(
                  'flex h-8 items-center gap-2.5 rounded-lg px-3 text-[13.5px] transition-colors',
                  active ? 'bg-background font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)] dark:bg-sidebar-accent' : 'text-foreground/80 hover:bg-sidebar-accent hover:text-foreground',
                )}
              >
                <ItemTile kind={i.kind} className="size-5 rounded-md [&_svg]:size-3" />
                <span className="truncate">{i.name}</span>
              </Link>
            )
          })
        : null}
    </div>
  )
}

export function setTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem('eodia-theme', dark ? 'dark' : 'light')
  } catch {}
}

export function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const { data: me } = useMe()
  const { data: folders = [] } = useFolders()
  const setPalette = useUi((s) => s.setPalette)
  // What one opens most: one's favourites, then what one opened last — the home page's lists.
  const { data: home } = useQuery({
    queryKey: ['home'],
    queryFn: () => api.get<{ recent: ItemSummary[]; bookmarks: ItemSummary[]; latest: ItemSummary[] }>('/v1/home'),
    staleTime: 60_000,
  })
  const [admin, setAdmin] = useState(path.startsWith('/admin') || path.startsWith('/history'))
  const roots = folders.filter((f) => f.parent === null && (!f.personal || f.personal === me?.id))
  roots.sort((a, b) => (a.personal ? -1 : b.personal ? 1 : a.name.localeCompare(b.name)))
  const is = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`)
  const role = me?.is_admin ? $t('Administrateur') : me?.can.manage_metadata ? $t('Curateur') : $t('Analyste')

  return (
    <aside className="flex h-full w-[256px] shrink-0 flex-col border-r bg-sidebar">
      {/* L'application, et l'espace où l'on travaille */}
      <WorkspaceMenu me={me} />

      {/* Searching, first: everything is a few letters away. */}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => setPalette(true)}
          className="flex h-9 w-full items-center gap-2 rounded-lg border bg-background px-2.5 text-[13.5px] text-muted-foreground shadow-xs transition-colors hover:border-foreground/20 hover:text-foreground"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">{$t('Rechercher…')}</span>
          <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">Ctrl K</kbd>
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        <NavItem href="/" icon={Home} label={$t('Accueil')} active={path === '/'} />
        {me?.ai_enabled !== false ? (
          <NavItem
            href="/assistant"
            icon={AssistantIcon}
            label={$t('Assistant IA')}
            active={path.startsWith('/assistant')}
            badge={<span className="rounded-full bg-gradient-to-r from-primary to-violet-500 px-1.5 py-px text-[10px] font-semibold text-white">{$t('Nouveau')}</span>}
          />
        ) : null}
        <NavItem href="/browse" icon={FolderClosed} label={$t('Dossiers')} active={path === '/browse'} />
        {roots.map((f) => (
          <FolderNode key={f.id} folder={f} folders={folders} depth={0} path={path} me={me?.id} />
        ))}
        <QuickList title={$t('Favoris')} items={home?.bookmarks ?? []} path={path} />
        <QuickList title={$t('Récents')} items={(home?.recent ?? []).filter((r) => !(home?.bookmarks ?? []).some((b) => b.id === r.id))} path={path} />
      </nav>

      <div className="border-t px-2 py-2">
        <NavItem href="/data" icon={Database} label={$t('Sources de données')} active={is('/data')} />
        {/* The history goes with the administration — down here for whoever has no such menu. */}
        {me?.is_admin || me?.can.manage_permissions ? null : <NavItem href="/history" icon={History} label={$t('Historique')} active={is('/history')} />}
        {me?.is_admin || me?.can.manage_permissions ? (
          <>
            <button
              type="button"
              onClick={() => setAdmin((v) => !v)}
              className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[15px] hover:bg-sidebar-accent/70"
            >
              <Settings className="size-[18px] text-muted-foreground" />
              <span className="flex-1 text-left">{$t('Administration')}</span>
              <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', admin && 'rotate-180')} />
            </button>
            {admin ? (
              <div className="space-y-0.5 pb-1">
                {me?.can.create_workspaces ? <NavItem href="/admin/workspaces" icon={Layers} label={$t('Espaces')} active={is('/admin/workspaces')} sub /> : null}
                <NavItem href="/admin/people" icon={Users} label={$t('Personnes')} active={is('/admin/people')} sub />
                <NavItem href="/admin/groups" icon={UsersRound} label={$t('Groupes')} active={is('/admin/groups')} sub />
                <NavItem href="/admin/permissions" icon={Shield} label={$t('Permissions')} active={is('/admin/permissions')} sub />
                <NavItem href="/admin/audit" icon={ScrollText} label={$t("Journal d'audit")} active={is('/admin/audit')} sub />
                <NavItem href="/history" icon={History} label={$t('Historique')} active={is('/history')} sub />
                <NavItem href="/admin/themes" icon={Palette} label={$t('Thèmes')} active={is('/admin/themes')} sub />
                <NavItem href="/admin/settings" icon={SlidersHorizontal} label={$t('Réglages')} active={is('/admin/settings')} sub />
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Person */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex h-[68px] items-center gap-3 border-t px-4 text-left hover:bg-sidebar-accent/60">
            {me ? <Avatar name={me.name} color={me.color} online /> : <span className="size-8 rounded-full bg-muted" />}
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[15px] font-semibold">{me?.name ?? '…'}</div>
              <div className="truncate text-sm text-muted-foreground">{role}</div>
            </div>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <div className="text-sm font-medium">{me?.name}</div>
            <div className="text-xs text-muted-foreground">{me?.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push('/account')}>
            <UserRound /> {$t('Mon profil')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push('/deliveries')}>
            <BellRing /> {$t('Abonnements et alertes')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push('/account?tab=tokens')}>
            <KeyRound /> {$t("Jetons d'intégration")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push('/docs')}>
            <Network /> {$t('Serveur MCP')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setTheme(false)}>
            <Sun /> {$t('Thème clair')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTheme(true)}>
            <Moon /> {$t('Thème sombre')}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Languages /> {$t('Langue')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={rememberedLocale() ?? 'auto'}
                onValueChange={(v) => chooseLocale(v === 'auto' ? null : (v as (typeof LOCALES)[number]))}
              >
                <DropdownMenuRadioItem value="auto">{$t('Langue du navigateur')}</DropdownMenuRadioItem>
                {LOCALES.map((l) => (
                  <DropdownMenuRadioItem key={l} value={l} lang={l}>
                    {LOCALE_NAMES[l]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await api.post('/auth/logout')
              window.location.href = '/login'
            }}
          >
            <LogOut /> {$t('Se déconnecter')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </aside>
  )
}
