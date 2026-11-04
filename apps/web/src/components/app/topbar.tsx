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
import { cn } from '@/lib/utils'
import { Code2, Database, FolderPlus, LayoutDashboard, PanelLeft, Plus, Search, Sparkles, BarChart3 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useEffect } from 'react'

export function Topbar({ onNewFolder, onNewDashboard }: { onNewFolder: () => void; onNewDashboard: () => void }) {
  const crumbs = useUi((s) => s.crumbs)
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const setPalette = useUi((s) => s.setPalette)
  const openCopilot = useUi((s) => s.openCopilot)
  const closeCopilot = useUi((s) => s.closeCopilot)
  const copilotOpen = useUi((s) => s.copilot)
  // The button opens the copilot, and closes it once open: a toggle.
  const toggleCopilot = () => (useUi.getState().copilot ? closeCopilot() : openCopilot())
  const router = useRouter()
  const { data: me } = useMe()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(true)
      }
      // Ctrl + J: the copilot, wherever one is.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j' && me?.ai_enabled) {
        e.preventDefault()
        if (useUi.getState().copilot) closeCopilot()
        else openCopilot()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPalette, openCopilot, closeCopilot, me?.ai_enabled])

  return (
    <header className="flex h-[54px] shrink-0 items-center gap-3 border-b bg-background px-4">
      <Hint label={$t('Afficher ou masquer le menu')}>
        <Button variant="ghost" size="icon-sm" onClick={toggleSidebar} aria-label={$t('Menu')}>
          <PanelLeft className="size-[18px] text-muted-foreground" />
        </Button>
      </Hint>
      <nav aria-label={$t("Fil d'Ariane")} className="flex min-w-0 flex-1 items-center gap-2 text-[15px]">
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

      {me?.ai_enabled ? (
        <button
          type="button"
          onClick={toggleCopilot}
          aria-pressed={copilotOpen}
          className="group relative inline-flex h-9 items-center rounded-full bg-gradient-to-r from-violet-500/70 via-fuchsia-400/60 to-primary/70 p-px shadow-[0_6px_20px_-10px_rgba(124,58,237,0.6)] transition-shadow hover:shadow-[0_8px_26px_-8px_rgba(124,58,237,0.7)]"
        >
          {/* Open, the button is filled: one click more closes the copilot. */}
          <span className={cn('inline-flex h-full items-center gap-2 rounded-full pr-2 pl-3 text-[13.5px] font-medium transition-colors', copilotOpen ? 'bg-transparent text-white' : 'bg-background/95 text-foreground group-hover:bg-background/85')}>
            <Sparkles className={cn('size-4 transition-transform group-hover:rotate-12', copilotOpen ? 'text-white' : 'text-violet-500')} />
            <span className="hidden sm:inline">{$t('Demander au copilote')}</span>
            <kbd className={cn('hidden rounded-md px-1.5 py-0.5 font-mono text-[10px] md:inline', copilotOpen ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground')}>Ctrl J</kbd>
          </span>
        </button>
      ) : null}
    </header>
  )
}
