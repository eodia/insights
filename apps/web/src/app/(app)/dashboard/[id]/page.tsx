'use client'

import { DashboardView, type Runner } from '@/components/app/dashboard/view'
import { FavoriteIcon } from '@/components/app/favorite-icon'
import { ConfirmDialog, FolderPicker } from '@/components/app/dialogs'
import { ShareDialog } from '@/components/app/share-dialog'
import { ExportDialog } from '@/components/app/delivery/export'
import { SubscriptionsDialog } from '@/components/app/delivery/subscriptions'
import { ThemePicker } from '@/components/app/theme-picker'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { type RunResult, api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { keys, useDashboard } from '@/lib/queries'
import { useCrumbs, useUi } from '@/lib/store'
import { ThemeLogo, ThemeScope } from '@/lib/theme'
import type { Dashboard, ParameterValue } from '@eodia/contracts'
import type { SummaryText } from '@/components/app/dashboard/cards'
import { cn } from '@/lib/utils'
import { cardConstraints, parseConditionCardId, savedConditionCard } from '@eodia/contracts'
import { useQueryClient } from '@tanstack/react-query'
import {
  BellRing,
  Braces,
  ClipboardPaste,
  Copy,
  Ellipsis,
  FileDown,
  Loader2,
  Maximize,
  Plus,
  Settings2,
  Share2,
  Trash2,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

function SettingsDialog({
  open,
  onOpenChange,
  dashboard,
}: { open: boolean; onOpenChange: (o: boolean) => void; dashboard: Dashboard }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: dashboard.name,
    description: dashboard.description ?? '',
    folder: dashboard.folder,
    cache_ttl: dashboard.cache_ttl,
    preload: dashboard.preload,
    theme: dashboard.theme,
  })
  useEffect(() => {
    if (open)
      setForm({
        name: dashboard.name,
        description: dashboard.description ?? '',
        folder: dashboard.folder,
        cache_ttl: dashboard.cache_ttl,
        preload: dashboard.preload,
        theme: dashboard.theme,
      })
  }, [open, dashboard])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{$t('Réglages du tableau de bord')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{$t('Nom')}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{$t('Description')}</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{$t('Dossier')}</Label>
            <FolderPicker value={form.folder} onChange={(folder) => setForm({ ...form, folder })} />
          </div>
          <div className="space-y-1.5">
            <Label>{$t('Thème')}</Label>
            <ThemePicker
              value={form.theme}
              resolved={form.theme === dashboard.theme ? dashboard.resolved_theme : null}
              self={dashboard.id}
              onChange={(theme) => setForm({ ...form, theme })}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              {$t(
                'Polices, couleurs, palette et logo du tableau de bord et de son PDF. Par défaut, celui de son dossier.',
              )}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>{$t('Durée de cache des résultats')}</Label>
            <Choice
              value={form.cache_ttl === null ? 'default' : String(form.cache_ttl)}
              onValueChange={(v) =>
                setForm({ ...form, cache_ttl: v === 'default' ? null : Number(v) })
              }
              options={[
                { value: 'default', label: $t("Celle de l'instance") },
                { value: '0', label: $t('Pas de cache') },
                { value: '300', label: $t('5 minutes') },
                { value: '3600', label: $t('1 heure') },
                { value: '86400', label: $t('24 heures') },
              ]}
              aria-label={$t('Cache')}
              className="w-full"
              size="default"
            />
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              {$t('Préchargé')}
              <span className="block text-xs text-muted-foreground">
                {$t('Le worker garde ses résultats au chaud, sous les droits de son auteur.')}
              </span>
            </span>
            <Switch
              checked={form.preload}
              onCheckedChange={(preload) => setForm({ ...form, preload })}
            />
          </label>
        </div>
        <DialogFooter>
          <Button
            onClick={async () => {
              await api.patch(`/v1/dashboards/${dashboard.id}`, {
                ...form,
                description: form.description || null,
              })
              await qc.invalidateQueries({ queryKey: keys.dashboard(dashboard.id) })
              onOpenChange(false)
            }}
          >
            {$t('Enregistrer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DashboardScreen({ id }: { id: string }) {
  const params = useSearchParams()
  const router = useRouter()
  const qc = useQueryClient()
  const { data: dashboard, error } = useDashboard(id)
  const setCopilotContext = useUi((s) => s.setCopilotContext)
  const [share, setShare] = useState(false)
  const [editingNow, setEditingNow] = useState(false)
  // Filters brought by a link from another dashboard (`?filters={"Canal":["Web"]}`).
  const carried = useMemo(() => {
    try {
      const raw = params.get('filters')
      return raw ? (JSON.parse(raw) as Record<string, ParameterValue>) : null
    } catch {
      return null
    }
  }, [params])
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [settings, setSettings] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [remove, setRemove] = useState(false)
  const [refresh, setRefresh] = useState<number | null>(null)
  const root = useRef<HTMLDivElement>(null)
  // Where the dashboard puts its actions: on the title's line, so the filters have theirs to themselves.
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null)
  // The filters as they stand: a print shows the dashboard as one sees it.
  const filterValues = useRef<Record<string, unknown>>({})
  const onValuesChange = useCallback((v: Record<string, unknown>) => {
    filterValues.current = v
  }, [])
  useCrumbs([
    {
      label: $t('Tableaux de bord'),
      href: dashboard?.folder ? `/browse/${dashboard.folder}` : '/browse',
    },
    { label: dashboard?.name ?? '…' },
  ])
  useEffect(() => setCopilotContext({ kind: 'dashboard', id }), [id, setCopilotContext])
  useEffect(() => {
    if (dashboard) setRefresh(dashboard.auto_refresh)
  }, [dashboard])

  if (error) return <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>
  if (!dashboard)
    return <Loader2 className="m-auto mt-20 size-5 animate-spin text-muted-foreground" />

  const runner: Runner = async (card, values, { fresh, draft }) => {
    // A display condition's query, as saved: the server finds it in the dashboard, and ties it.
    const saved = parseConditionCardId(card.id) ? savedConditionCard(dashboard, card) : dashboard.cards.some((c) => c.id === card.id && JSON.stringify(c) === JSON.stringify(card))
    if (draft || !saved) {
      // A card not saved yet runs as its own question, under the same filters.
      const constraints = cardConstraints(
        card.mappings,
        dashboard.parameters.length ? dashboard.parameters : [],
        values,
      )
      if (card.question)
        return api.post<RunResult>(`/v1/questions/${card.question}/run`, { constraints, fresh })
      const compare = (card.visualization?.settings as { compare?: string } | undefined)?.compare
      return api.post<RunResult>('/v1/query', { query: card.query, constraints, fresh, ...(compare && card.query?.kind === 'builder' ? { compare } : {}) })
    }
    return api.post<RunResult>(`/v1/dashboards/${dashboard.id}/cards/${card.id}/run`, {
      values,
      fresh,
    })
  }
  const editable = dashboard.access !== 'view'
  // The open tab lives in the address: a link opens it, and Back and Forward go from tab to tab.
  const tab = params.get('tab')
  const dashboardHref = (t: string | null) =>
    `/dashboard/${dashboard.id}${t ? `?tab=${encodeURIComponent(t)}` : ''}`
  const newQuestionHref = (t: string | null) =>
    `/question/new?dashboard=${dashboard.id}${t ? `&tab=${encodeURIComponent(t)}` : ''}`

  return (
    <div ref={root} className="h-full">
      <ThemeScope theme={dashboard.resolved_theme} className="flex h-full flex-col bg-background">
        <div className={cn('flex items-start gap-3 px-6 pt-5 pb-1 transition-colors', editingNow && 'bg-primary/[0.06]')}>
          {dashboard.resolved_theme?.settings.logo_position !== 'right' ? (
            <ThemeLogo
              theme={dashboard.resolved_theme}
              className="mt-0.5 shrink-0 object-contain"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="theme-title truncate text-2xl font-semibold tracking-tight">
              {dashboard.name}
            </h1>
            {dashboard.description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{dashboard.description}</p>
            ) : null}
          </div>
          <div ref={setActionsSlot} className="contents" />
          {dashboard.resolved_theme?.settings.logo_position === 'right' ? (
            <ThemeLogo
              theme={dashboard.resolved_theme}
              className="mt-0.5 shrink-0 object-contain"
            />
          ) : null}
        </div>
        <div className="min-h-0 flex-1">
          <DashboardView
            key={dashboard.updated_at}
            dashboard={dashboard}
            runner={runner}
            records
            editable={editable}
            startEditing={params.get('edit') === '1'}
            autoRefresh={refresh}
            onAutoRefreshChange={async (next) => {
              setRefresh(next)
              if (editable)
                await api.patch(`/v1/dashboards/${dashboard.id}`, { auto_refresh: next })
            }}
            onNewQuestion={(tab) => router.push(newQuestionHref(tab))}
            onEditingChange={setEditingNow}
            savedViews
            collaborative
            summarizer={(card, values, { fresh, draft }) =>
              api.post<SummaryText>(`/v1/dashboards/${dashboard.id}/cards/${card.id}/summary`, { values, fresh, ...(draft ? { card } : {}) })
            }
            {...(carried ? { initialFilters: carried } : {})}
            tab={tab}
            onValuesChange={onValuesChange}
            onTabChange={(next) => router.push(dashboardHref(next), { scroll: false })}
            onMoveCard={async (cardId, to, toTab) => {
              await api.post(`/v1/dashboards/${dashboard.id}/cards/${cardId}/move`, {
                dashboard: to,
                tab: toTab,
              })
              await Promise.all([
                qc.invalidateQueries({ queryKey: keys.dashboard(dashboard.id) }),
                qc.invalidateQueries({ queryKey: keys.dashboard(to) }),
              ])
              if (to === dashboard.id) return
              const target = await qc.fetchQuery({
                queryKey: keys.dashboard(to),
                queryFn: () => api.get<Dashboard>(`/v1/dashboards/${to}`),
              })
              toast.success($t('Carte déplacée dans « {name} ».', { name: target.name }), {
                action: {
                  label: $t('Ouvrir'),
                  onClick: () =>
                    router.push(
                      `/dashboard/${to}${toTab ? `?tab=${encodeURIComponent(toTab)}` : ''}`,
                    ),
                },
              })
            }}
            onSave={async (d) => {
              await api.patch(`/v1/dashboards/${dashboard.id}`, d)
              await qc.invalidateQueries({ queryKey: keys.dashboard(dashboard.id) })
              toast.success($t('Tableau de bord enregistré.'))
              if (params.get('edit')) router.replace(dashboardHref(tab))
            }}
            actionsSlot={actionsSlot}
            toolbar={
              <Button size="sm" variant="ghost" onClick={() => setShare(true)}>
                <Share2 /> {$t('Partager')}
              </Button>
            }
            more={
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label={$t('Plus')}>
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuLabel className={MENU_LABEL}>{$t('Affichage')}</DropdownMenuLabel>
                    <DropdownMenuGroup>
                      <DropdownMenuItem onSelect={() => root.current?.requestFullscreen?.()}>
                        <Maximize /> {$t('Plein écran')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setExporting(true)}>
                        <FileDown /> {$t('Exporter en PDF…')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setSubscribing(true)}>
                        <BellRing /> {$t('Abonnements…')}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className={MENU_LABEL}>{$t('Tableau de bord')}</DropdownMenuLabel>
                    <DropdownMenuGroup>
                      {editable ? (
                        <>
                          <DropdownMenuItem onSelect={() => router.push(newQuestionHref(tab))}>
                            <Plus /> {$t('Nouvelle question')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setSettings(true)}>
                            <Settings2 /> {$t('Réglages')}
                          </DropdownMenuItem>
                        </>
                      ) : null}
                      <DropdownMenuItem
                        onSelect={async () => {
                          await api.post('/v1/bookmarks', { kind: 'dashboard', id, on: true })
                          toast.success($t('Ajouté aux favoris.'))
                        }}
                      >
                        <FavoriteIcon /> {$t('Ajouter aux favoris')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={async () => {
                          const d = await api.post<Dashboard>(`/v1/dashboards/${id}/duplicate`, {})
                          router.push(`/dashboard/${d.id}`)
                        }}
                      >
                        <Copy /> {$t('Dupliquer')}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Braces /> JSON
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-56">
                          <DropdownMenuItem
                            onSelect={async () => {
                              try {
                                const json = await api.get<unknown>(`/v1/dashboards/${id}/export`)
                                await navigator.clipboard.writeText(JSON.stringify(json, null, 2))
                                toast.success($t('Tableau de bord copié en JSON : collez-le dans « Coller un JSON » pour en créer un autre.'))
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : String(err))
                              }
                            }}
                          >
                            <Braces /> {$t('Copier en JSON')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setPasting(true)}>
                            <ClipboardPaste /> {$t('Coller un JSON…')}
                          </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    {editable ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setRemove(true)}>
                          <Trash2 /> {$t('Supprimer')}
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
          />
        </div>
      </ThemeScope>
      <Dialog open={pasting} onOpenChange={setPasting}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{$t('Nouveau tableau de bord depuis un JSON')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{$t('Collez un tableau de bord copié avec « Copier en JSON » : il est créé à côté de celui-ci, dans le même dossier.')}</p>
          <Textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={12} spellCheck={false} className="font-mono text-xs" placeholder='{ "format": "eodia-insights/dashboard", … }' />
          {pasteError ? <p className="text-xs text-destructive">{pasteError}</p> : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPasting(false)}>
              {$t('Annuler')}
            </Button>
            <Button
              disabled={!pasted.trim()}
              onClick={async () => {
                let parsed: unknown
                try {
                  parsed = JSON.parse(pasted)
                } catch {
                  return setPasteError($t('Ce texte n’est pas du JSON.'))
                }
                try {
                  const d = await api.post<Dashboard>('/v1/dashboards/import', { folder: dashboard.folder, dashboard: parsed })
                  setPasting(false)
                  setPasted('')
                  setPasteError(null)
                  router.push(`/dashboard/${d.id}`)
                } catch (err) {
                  setPasteError(err instanceof Error ? err.message : String(err))
                }
              }}
            >
              {$t('Créer le tableau de bord')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {exporting ? <ExportDialog dashboard={dashboard} values={filterValues.current as Record<string, ParameterValue | null>} onClose={() => setExporting(false)} /> : null}
      {subscribing ? <SubscriptionsDialog dashboard={dashboard} values={filterValues.current as Record<string, ParameterValue | null>} onClose={() => setSubscribing(false)} /> : null}
      <ShareDialog
        open={share}
        onOpenChange={setShare}
        kind="dashboard"
        id={dashboard.id}
        name={dashboard.name}
      />
      <SettingsDialog open={settings} onOpenChange={setSettings} dashboard={dashboard} />
      <ConfirmDialog
        open={remove}
        onOpenChange={setRemove}
        title={$t('Supprimer « {name} » ?', { name: dashboard.name })}
        description={$t(
          'Les questions créées dans ce tableau de bord sont supprimées avec lui ; celles rangées dans un dossier restent.',
        )}
        onConfirm={async () => {
          await api.delete(`/v1/dashboards/${id}`)
          router.push(dashboard.folder ? `/browse/${dashboard.folder}` : '/browse')
        }}
      />
    </div>
  )
}


/** A group's name in a menu: small, quiet, above its items. */
const MENU_LABEL = 'text-[11px] font-medium tracking-wide text-muted-foreground uppercase'
export default function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <Suspense>
      <DashboardScreen id={id} />
    </Suspense>
  )
}
