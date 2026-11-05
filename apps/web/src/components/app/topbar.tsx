'use client'

import { Orb } from '@/components/app/assistant/orb'
import { DashboardArt, QuestionArt, SqlArt } from '@/components/app/illustrations'
import { NotificationsBell } from '@/components/app/notifications'
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
import { Database, FolderPlus, PanelLeft, Plus, Search } from 'lucide-react'
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

      <NotificationsBell />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-1.5">
            <Plus className="size-4" /> {$t('Nouveau')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[min(600px,calc(100vw-2rem))] p-2">
          {/* What each opens, drawn as on the home page; then the smaller things to create. */}
          <div className={cn('grid gap-2', me?.can.use_sql ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
            <NewTile title={$t('Question')} text={$t('Explorer une table sans écrire de SQL')} onSelect={() => router.push('/question/new')}>
              <QuestionArt className="px-3.5" />
            </NewTile>
            {me?.can.use_sql ? (
              <NewTile title={$t('Requête SQL')} text={$t('Trino SQL sur toutes vos sources')} onSelect={() => router.push('/sql')}>
                <SqlArt className="px-3.5 text-[11px]" />
              </NewTile>
            ) : null}
            <NewTile title={$t('Tableau de bord')} text={$t('Des cartes à placer sur une grille')} onSelect={onNewDashboard}>
              <DashboardArt className="px-3.5 py-3" />
            </NewTile>
          </div>
          <div className="mt-2 flex gap-1 border-t pt-2">
            <DropdownMenuItem onSelect={onNewFolder} className="flex-1">
              <FolderPlus /> {$t('Dossier')}
            </DropdownMenuItem>
            {me?.can.manage_sources ? (
              <DropdownMenuItem onSelect={() => router.push('/data?new=1')} className="flex-1">
                <Database /> {$t('Source de données')}
              </DropdownMenuItem>
            ) : null}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {me?.ai_enabled ? (
        copilotOpen ? (
          // Open: a quiet pressed pill — it says the copilot is there, and closes it.
          <Hint label={`${$t('Fermer le copilote')} (Ctrl+J)`}>
            <button
              type="button"
              onClick={toggleCopilot}
              aria-pressed
              className="inline-flex h-9 items-center gap-2 rounded-full bg-violet-500/10 pr-2 pl-3 text-[13.5px] font-medium text-violet-700 ring-1 ring-violet-500/25 ring-inset transition-colors hover:bg-violet-500/15 dark:text-violet-300"
            >
              <Orb size={16} tone="violet" />
              <span className="hidden sm:inline">{$t('Demander au copilote')}</span>
              <kbd className="hidden rounded-md bg-violet-500/15 px-1.5 py-0.5 font-mono text-[10px] text-violet-700 md:inline dark:text-violet-300">Ctrl J</kbd>
            </button>
          </Hint>
        ) : (
        <button
          type="button"
          onClick={toggleCopilot}
          aria-pressed={false}
          className="group relative inline-flex h-9 items-center rounded-full bg-gradient-to-r from-violet-500/70 via-fuchsia-400/60 to-primary/70 p-px shadow-[0_6px_20px_-10px_rgba(124,58,237,0.6)] transition-shadow hover:shadow-[0_8px_26px_-8px_rgba(124,58,237,0.7)]"
        >
          <span className="inline-flex h-full items-center gap-2 rounded-full bg-background/95 pr-2 pl-3 text-[13.5px] font-medium text-foreground transition-colors group-hover:bg-background/85">
            <Orb size={16} tone="violet" className="transition-transform group-hover:rotate-12" />
            <span className="hidden sm:inline">{$t('Demander au copilote')}</span>
            <kbd className="hidden rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:inline">Ctrl J</kbd>
          </span>
        </button>
        )
      ) : null}
    </header>
  )
}

/** A thing to create, drawn as what it opens. */
function NewTile({ title, text, onSelect, children }: { title: string; text: string; onSelect: () => void; children: React.ReactNode }) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className="group flex-col items-stretch gap-0 overflow-hidden rounded-xl border p-0 transition-[box-shadow,border-color] focus:border-primary/40 focus:bg-card focus:shadow-[0_14px_30px_-18px_rgba(31,138,58,0.5)]"
    >
      <div className="h-24 border-b">{children}</div>
      <div className="px-3 py-2.5">
        <div className="text-[13.5px] font-semibold tracking-tight">{title}</div>
        <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{text}</div>
      </div>
    </DropdownMenuItem>
  )
}
