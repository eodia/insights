'use client'

import type { Folder } from '@eodia/contracts'
import { Avatar, LookIcon } from '@/components/app/look'
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
import { folderLabel } from '@/lib/folders'
import { useFolders, useMe } from '@/lib/queries'
import { cn } from '@/lib/utils'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Code2,
  Database,
  FolderClosed,
  FolderLock,
  History,
  Home,
  KeyRound,
  Languages,
  LogOut,
  Moon,
  Network,
  Palette,
  ScrollText,
  Settings,
  Shield,
  SlidersHorizontal,
  Sun,
  TableProperties,
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
        'group flex items-center gap-3 rounded-lg text-[15px] transition-colors',
        sub ? 'h-9 pl-10 pr-2 text-sm text-muted-foreground' : 'h-10 px-3 text-foreground',
        active ? 'bg-sidebar-accent font-medium text-foreground' : 'hover:bg-sidebar-accent/70',
      )}
    >
      {children ?? (Icon ? <Icon className={cn('size-[18px] shrink-0', sub ? 'size-4' : '', active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground')} /> : null)}
      <span className="truncate">{label}</span>
      {badge ? <span className="ml-auto">{badge}</span> : null}
    </Link>
  )
}

/**
 * A folder of the tree: its sub-folders unfold under it, and an item or folder dragged onto it
 * is filed there.
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
      {unfolded
        ? children.map((c) => <FolderNode key={c.id} folder={c} folders={folders} depth={depth + 1} path={path} me={me} />)
        : null}
    </>
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
  const [admin, setAdmin] = useState(path.startsWith('/admin'))
  const roots = folders.filter((f) => f.parent === null && (!f.personal || f.personal === me?.id))
  roots.sort((a, b) => (a.personal ? -1 : b.personal ? 1 : a.name.localeCompare(b.name)))
  const is = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`)
  const role = me?.is_admin ? $t('Administrateur') : me?.can.manage_metadata ? $t('Curateur') : $t('Analyste')

  return (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r bg-sidebar">
      {/* Application */}
      <div className="flex h-[76px] items-center gap-3 border-b px-4">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M5 18v-5M10 18V7M15 18v-8M20 18v-3" />
          </svg>
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[15px] font-semibold">eodia insights</div>
          <div className="truncate text-xs text-muted-foreground">{$t('Toutes les sources')}</div>
        </div>
        <ChevronsUpDown className="size-4 text-muted-foreground" />
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
        <NavItem href="/sql" icon={Code2} label={$t('Éditeur SQL')} active={is('/sql')} />
        <NavItem href="/data" icon={Database} label={$t('Sources de données')} active={is('/data')} />
        <NavItem href="/structure" icon={TableProperties} label={$t('Structure')} active={is('/structure')} />
        <NavItem href="/history" icon={History} label={$t('Historique')} active={is('/history')} />
      </nav>

      <div className="border-t px-2 py-2">
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
                <NavItem href="/admin/people" icon={Users} label={$t('Personnes')} active={is('/admin/people')} sub />
                <NavItem href="/admin/groups" icon={UsersRound} label={$t('Groupes')} active={is('/admin/groups')} sub />
                <NavItem href="/admin/permissions" icon={Shield} label={$t('Permissions')} active={is('/admin/permissions')} sub />
                <NavItem href="/admin/audit" icon={ScrollText} label={$t("Journal d'audit")} active={is('/admin/audit')} sub />
                <NavItem href="/admin/themes" icon={Palette} label={$t('Thèmes')} active={is('/admin/themes')} sub />
                <NavItem href="/admin/settings" icon={SlidersHorizontal} label={$t('Réglages')} active={is('/admin/settings')} sub />
              </div>
            ) : null}
          </>
        ) : null}
        <NavItem href="/docs" icon={BookOpen} label={$t('API et MCP')} active={is('/docs')} />
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
