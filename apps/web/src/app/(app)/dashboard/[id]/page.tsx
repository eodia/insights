'use client'

import type { Dashboard } from '@eodia/contracts'
import { cardConstraints } from '@eodia/contracts'
import { ConfirmDialog, FolderPicker } from '@/components/app/dialogs'
import { DashboardView, type Runner } from '@/components/app/dashboard/view'
import { ShareDialog } from '@/components/app/share-dialog'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { type RunResult, api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { keys, useDashboard, useMe } from '@/lib/queries'
import { useCrumbs, useUi } from '@/lib/store'
import { useQueryClient } from '@tanstack/react-query'
import { Copy, Ellipsis, Loader2, Maximize, Plus, Settings2, Share2, Sparkles, Star, Trash2 } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, use, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

function SettingsDialog({ open, onOpenChange, dashboard }: { open: boolean; onOpenChange: (o: boolean) => void; dashboard: Dashboard }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: dashboard.name, description: dashboard.description ?? '', folder: dashboard.folder, cache_ttl: dashboard.cache_ttl, preload: dashboard.preload })
  useEffect(() => {
    if (open) setForm({ name: dashboard.name, description: dashboard.description ?? '', folder: dashboard.folder, cache_ttl: dashboard.cache_ttl, preload: dashboard.preload })
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
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>{$t('Dossier')}</Label>
            <FolderPicker value={form.folder} onChange={(folder) => setForm({ ...form, folder })} />
          </div>
          <div className="space-y-1.5">
            <Label>{$t('Durée de cache des résultats')}</Label>
            <Choice
              value={form.cache_ttl === null ? 'default' : String(form.cache_ttl)}
              onValueChange={(v) => setForm({ ...form, cache_ttl: v === 'default' ? null : Number(v) })}
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
              <span className="block text-xs text-muted-foreground">{$t('Le worker garde ses résultats au chaud, sous les droits de son auteur.')}</span>
            </span>
            <Switch checked={form.preload} onCheckedChange={(preload) => setForm({ ...form, preload })} />
          </label>
        </div>
        <DialogFooter>
          <Button
            onClick={async () => {
              await api.patch(`/v1/dashboards/${dashboard.id}`, { ...form, description: form.description || null })
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
  const { data: me } = useMe()
  const { data: dashboard, error } = useDashboard(id)
  const openCopilot = useUi((s) => s.openCopilot)
  const setCopilotContext = useUi((s) => s.setCopilotContext)
  const [share, setShare] = useState(false)
  const [settings, setSettings] = useState(false)
  const [remove, setRemove] = useState(false)
  const [refresh, setRefresh] = useState<number | null>(null)
  const root = useRef<HTMLDivElement>(null)
  useCrumbs([{ label: $t('Tableaux de bord'), href: dashboard?.folder ? `/browse/${dashboard.folder}` : '/browse' }, { label: dashboard?.name ?? '…' }])
  useEffect(() => setCopilotContext({ kind: 'dashboard', id }), [id, setCopilotContext])
  useEffect(() => {
    if (dashboard) setRefresh(dashboard.auto_refresh)
  }, [dashboard])

  if (error) return <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>
  if (!dashboard) return <Loader2 className="m-auto mt-20 size-5 animate-spin text-muted-foreground" />

  const runner: Runner = async (card, values, { fresh, draft }) => {
    if (draft || !dashboard.cards.some((c) => c.id === card.id && JSON.stringify(c) === JSON.stringify(card))) {
      // A card not saved yet runs as its own question, under the same filters.
      const constraints = cardConstraints(card.mappings, dashboard.parameters.length ? dashboard.parameters : [], values)
      if (card.question) return api.post<RunResult>(`/v1/questions/${card.question}/run`, { constraints, fresh })
      return api.post<RunResult>('/v1/query', { query: card.query, constraints, fresh })
    }
    return api.post<RunResult>(`/v1/dashboards/${dashboard.id}/cards/${card.id}/run`, { values, fresh })
  }
  const editable = dashboard.access !== 'view'

  return (
    <div ref={root} className="flex h-full flex-col bg-background">
      <div className="flex items-start gap-3 px-6 pt-5 pb-1">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{dashboard.name}</h1>
          {dashboard.description ? <p className="mt-0.5 text-sm text-muted-foreground">{dashboard.description}</p> : null}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <DashboardView
          key={dashboard.updated_at}
          dashboard={dashboard}
          runner={runner}
          editable={editable}
          startEditing={params.get('edit') === '1'}
          autoRefresh={refresh}
          onNewQuestion={(tab) => router.push(`/question/new?dashboard=${dashboard.id}${tab ? `&tab=${encodeURIComponent(tab)}` : ''}`)}
          onSave={async (d) => {
            await api.patch(`/v1/dashboards/${dashboard.id}`, d)
            await qc.invalidateQueries({ queryKey: keys.dashboard(dashboard.id) })
            toast.success($t('Tableau de bord enregistré.'))
            if (params.get('edit')) router.replace(`/dashboard/${dashboard.id}`)
          }}
          toolbar={
            <>
              <Choice
                value={refresh === null ? 'off' : String(refresh)}
                onValueChange={async (v) => {
                  const next = v === 'off' ? null : Number(v)
                  setRefresh(next)
                  if (editable) await api.patch(`/v1/dashboards/${dashboard.id}`, { auto_refresh: next })
                }}
                options={[
                  { value: 'off', label: $t('Pas de rafraîchissement') },
                  { value: '60', label: $t('Toutes les minutes') },
                  { value: '300', label: $t('Toutes les 5 minutes') },
                  { value: '900', label: $t('Toutes les 15 minutes') },
                  { value: '3600', label: $t('Toutes les heures') },
                ]}
                aria-label={$t('Rafraîchissement automatique')}
                className="w-52"
              />
              <Button size="sm" variant="outline" onClick={() => setShare(true)}>
                <Share2 /> {$t('Partager')}
              </Button>
              {me?.ai_enabled ? (
                <Button size="sm" variant="ghost" onClick={() => openCopilot({ kind: 'dashboard', id })}>
                  <Sparkles className="text-violet-500" /> {$t('Copilote')}
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label={$t('Plus')}>
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onSelect={() => root.current?.requestFullscreen?.()}>
                    <Maximize /> {$t('Plein écran')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={async () => {
                      await api.post('/v1/bookmarks', { kind: 'dashboard', id, on: true })
                      toast.success($t('Ajouté aux favoris.'))
                    }}
                  >
                    <Star /> {$t('Ajouter aux favoris')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={async () => {
                      const d = await api.post<Dashboard>(`/v1/dashboards/${id}/duplicate`, {})
                      router.push(`/dashboard/${d.id}`)
                    }}
                  >
                    <Copy /> {$t('Dupliquer')}
                  </DropdownMenuItem>
                  {editable ? (
                    <>
                      <DropdownMenuItem onSelect={() => router.push(`/question/new?dashboard=${dashboard.id}`)}>
                        <Plus /> {$t('Nouvelle question')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setSettings(true)}>
                        <Settings2 /> {$t('Réglages')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onSelect={() => setRemove(true)}>
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
      <ShareDialog open={share} onOpenChange={setShare} kind="dashboard" id={dashboard.id} name={dashboard.name} />
      <SettingsDialog open={settings} onOpenChange={setSettings} dashboard={dashboard} />
      <ConfirmDialog
        open={remove}
        onOpenChange={setRemove}
        title={$t('Supprimer « {name} » ?', { name: dashboard.name })}
        description={$t('Les questions créées dans ce tableau de bord sont supprimées avec lui ; celles rangées dans un dossier restent.')}
        onConfirm={async () => {
          await api.delete(`/v1/dashboards/${id}`)
          router.push(dashboard.folder ? `/browse/${dashboard.folder}` : '/browse')
        }}
      />
    </div>
  )
}

export default function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <Suspense>
      <DashboardScreen id={id} />
    </Suspense>
  )
}
