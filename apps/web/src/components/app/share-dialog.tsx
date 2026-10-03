'use client'

import type { ItemKind } from '@eodia/contracts'
import { Avatar } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { useDirectory } from '@/lib/queries'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Globe, Link2, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface Share {
  id: string
  principal_kind: 'user' | 'group'
  principal_id: string
  access: 'view' | 'edit'
  name: string
  email: string | null
}

interface Link {
  id: string
  url: string
  audience: 'public' | 'members'
  can_embed: boolean
  groups: string[]
}

const copy = async (text: string) => {
  await navigator.clipboard.writeText(text)
  toast.success($t('Copié dans le presse-papiers.'))
}

/**
 * Two ways to share, which add up: with people or groups of the instance (view or edit), and —
 * for a question or a dashboard — by a link, public or for members, framable or not.
 */
export function ShareDialog({ open, onOpenChange, kind, id, name }: { open: boolean; onOpenChange: (o: boolean) => void; kind: ItemKind; id: string; name: string }) {
  const qc = useQueryClient()
  const { data: directory } = useDirectory()
  const shares = useQuery({ queryKey: ['shares', kind, id], queryFn: () => api.get<Share[]>(`/v1/shares/${kind}/${id}`), enabled: open })
  const linkable = kind === 'question' || kind === 'dashboard'
  const links = useQuery({ queryKey: ['links', kind, id], queryFn: () => api.get<Link[]>(`/v1/share-links/${kind}/${id}`), enabled: open && linkable })
  const [principal, setPrincipal] = useState<string | null>(null)
  const [access, setAccess] = useState<'view' | 'edit'>('view')
  const options = [
    ...(directory?.groups ?? []).filter((g) => g.kind !== 'admin').map((g) => ({ value: `group:${g.id}`, label: `${g.name} (${$t('groupe')})` })),
    ...(directory?.users ?? []).map((u) => ({ value: `user:${u.id}`, label: `${u.name} · ${u.email}` })),
  ]
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['shares', kind, id] }), qc.invalidateQueries({ queryKey: ['links', kind, id] })])
  const iframe = (url: string) => `<iframe src="${url}?embed=1" width="100%" height="600" frameborder="0"></iframe>`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{$t('Partager « {name} »', { name })}</DialogTitle>
          <DialogDescription>{$t('Le partage s’ajoute aux droits du dossier. Les personnes ne voient jamais que les données auxquelles elles ont droit.')}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="people">
          <TabsList>
            <TabsTrigger value="people">
              <Users className="size-4" /> {$t('Personnes et groupes')}
            </TabsTrigger>
            {linkable ? (
              <TabsTrigger value="links">
                <Link2 className="size-4" /> {$t('Liens et intégration')}
              </TabsTrigger>
            ) : null}
          </TabsList>
          <TabsContent value="people" className="space-y-4 pt-3">
            <div className="flex gap-2">
              <Choice value={principal} onValueChange={setPrincipal} options={options} aria-label={$t('Personne ou groupe')} placeholder={$t('Ajouter une personne ou un groupe…')} className="flex-1" size="default" searchable />
              <Choice value={access} onValueChange={(v) => setAccess(v as 'view' | 'edit')} options={[{ value: 'view', label: $t('Lecture') }, { value: 'edit', label: $t('Modification') }]} aria-label={$t('Accès')} className="w-36" size="default" />
              <Button
                disabled={!principal}
                onClick={async () => {
                  if (!principal) return
                  const [pk, pid] = principal.split(':')
                  await api.post('/v1/shares', { item_kind: kind, item_id: id, principal_kind: pk, principal_id: pid, access })
                  setPrincipal(null)
                  await refresh()
                }}
              >
                {$t('Partager')}
              </Button>
            </div>
            <div className="divide-y rounded-lg border">
              {(shares.data ?? []).length === 0 ? <p className="p-4 text-sm text-muted-foreground">{$t('Pas encore de partage direct.')}</p> : null}
              {(shares.data ?? []).map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2">
                  <Avatar name={s.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{s.principal_kind === 'group' ? $t('Groupe') : s.email}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">{s.access === 'edit' ? $t('Modification') : $t('Lecture')}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={async () => {
                      await api.delete(`/v1/shares/${s.id}`)
                      await refresh()
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>
          {linkable ? (
            <TabsContent value="links" className="space-y-3 pt-3">
              {(links.data ?? []).map((l) => (
                <div key={l.id} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Globe className="size-4 text-muted-foreground" />
                    <Input readOnly value={l.url} className="h-8 flex-1 font-mono text-xs" />
                    <Button variant="outline" size="icon-sm" onClick={() => copy(l.url)}>
                      <Copy className="size-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <Choice
                      value={l.audience}
                      onValueChange={async (v) => {
                        await api.patch(`/v1/share-links/${l.id}`, { audience: v })
                        await refresh()
                      }}
                      options={[{ value: 'public', label: $t('Toute personne disposant du lien') }, { value: 'members', label: $t('Membres connectés uniquement') }]}
                      aria-label={$t('Audience')}
                      className="w-72"
                    />
                    <label className="flex items-center gap-2">
                      <Switch
                        checked={l.can_embed}
                        onCheckedChange={async (v) => {
                          await api.patch(`/v1/share-links/${l.id}`, { can_embed: v })
                          await refresh()
                        }}
                      />
                      {$t('Intégrable (iframe)')}
                    </label>
                    <span className="flex-1" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={async () => {
                        await api.delete(`/v1/share-links/${l.id}`)
                        await refresh()
                      }}
                    >
                      {$t('Désactiver')}
                    </Button>
                  </div>
                  {l.can_embed ? (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">{iframe(l.url)}</code>
                      <Button variant="outline" size="icon-sm" onClick={() => copy(iframe(l.url))}>
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
              <Button
                variant="outline"
                onClick={async () => {
                  await api.post('/v1/share-links', { item_kind: kind, item_id: id, audience: 'public' })
                  await refresh()
                }}
              >
                <Link2 /> {$t('Créer un lien de partage')}
              </Button>
              <p className="text-xs text-muted-foreground">{$t('Un lien s’exécute avec les droits de son auteur : un visiteur ne voit jamais plus que vous, et ne choisit pas ce que filtrent les cartes.')}</p>
            </TabsContent>
          ) : null}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
