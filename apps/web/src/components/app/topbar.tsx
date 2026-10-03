'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Hint } from '@/components/ui/tooltip'
import { $t } from '@/lib/i18n'
import { useMe } from '@/lib/queries'
import { useUi } from '@/lib/store'
import { Code2, Database, FolderPlus, LayoutDashboard, PanelLeft, Plus, Search, Sparkles, BarChart3 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useEffect } from 'react'

export function Topbar({ onNewFolder, onNewDashboard }: { onNewFolder: () => void; onNewDashboard: () => void }) {
  const crumbs = useUi((s) => s.crumbs)
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const setPalette = useUi((s) => s.setPalette)
  const openCopilot = useUi((s) => s.openCopilot)
  const router = useRouter()
  const { data: me } = useMe()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPalette])

  return (
    <header className="flex h-[54px] shrink-0 items-center gap-3 border-b bg-background px-4">
      <Hint label={$t('Afficher ou masquer le menu')}>
        <Button variant="ghost" size="icon-sm" onClick={toggleSidebar} aria-label={$t('Menu')}>
          <PanelLeft className="size-[18px] text-muted-foreground" />
        </Button>
      </Hint>
      <nav aria-label={$t("Fil d'Ariane")} className="flex min-w-0 flex-1 items-center gap-2 text-[17px]">
        {crumbs.map((c, i) => (
          <Fragment key={`${c.label}-${i}`}>
            {i > 0 ? <span className="text-muted-foreground/60">/</span> : null}
            {c.href && i < crumbs.length - 1 ? (
              <Link href={c.href} className="truncate font-semibold hover:underline">
                {c.label}
              </Link>
            ) : (
              <span className={i === crumbs.length - 1 && i > 0 ? 'truncate text-muted-foreground' : 'truncate font-semibold'}>{c.label}</span>
            )}
          </Fragment>
        ))}
      </nav>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-1.5">
            <Plus className="size-4" /> {$t('Nouveau')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => router.push('/question/new')}>
            <BarChart3 /> {$t('Question')}
          </DropdownMenuItem>
          {me?.can.use_sql ? (
            <DropdownMenuItem onSelect={() => router.push('/sql')}>
              <Code2 /> {$t('Requête SQL')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={onNewDashboard}>
            <LayoutDashboard /> {$t('Tableau de bord')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onNewFolder}>
            <FolderPlus /> {$t('Dossier')}
          </DropdownMenuItem>
          {me?.can.manage_sources ? (
            <DropdownMenuItem onSelect={() => router.push('/data?new=1')}>
              <Database /> {$t('Source de données')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        onClick={() => setPalette(true)}
        className="hidden h-9 w-[300px] items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground shadow-xs hover:bg-accent md:flex"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">{$t('Rechercher…')}</span>
        <kbd className="rounded border bg-muted px-1.5 font-mono text-[11px]">Ctrl</kbd>
        <kbd className="rounded border bg-muted px-1.5 font-mono text-[11px]">K</kbd>
      </button>
      {me?.ai_enabled ? (
        <Hint label={$t('Demander au copilote')}>
          <Button variant="ghost" size="icon-sm" onClick={() => openCopilot()} aria-label={$t('Copilote')}>
            <Sparkles className="size-[18px] text-violet-500" />
          </Button>
        </Hint>
      ) : null}
    </header>
  )
}
