'use client'

import type { Dashboard, DeliveryCapabilities, ExportOptions, ParameterValue, Schedule, Subscription, SubscriptionFormat } from '@eodia/contracts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Hint } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { formatAgo } from '@/lib/format'
import { $t, $tp, intlLocale } from '@/lib/i18n'
import { useMe } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, FileText, Image as ImageIcon, Loader2, Mail, Pencil, Plus, Send, Trash2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { type ChannelDraft, ChannelsEditor, ExportOptionsForm, PeoplePicker, ScheduleEditor, channelDrafts, channelInputs, defaultSchedule, scheduleSummary } from './editors'

export const useDelivery = () => useQuery({ queryKey: ['delivery'], queryFn: () => api.get<DeliveryCapabilities>('/v1/delivery'), staleTime: 300_000 })

const FORMAT_ICONS = { pdf: FileText, png: ImageIcon, summary: Mail } as const

export function StatusDot({ status }: { status: 'ok' | 'partial' | 'failed' | null }) {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', status === 'ok' ? 'bg-emerald-500' : status === 'partial' ? 'bg-amber-500' : status === 'failed' ? 'bg-red-500' : 'bg-muted-foreground/30')} />
}

export const when = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat(intlLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—'

/** A dashboard's subscriptions — one's own, and everyone's for an administrator — and the form to add one. */
export function SubscriptionsDialog({ dashboard, values, onClose }: { dashboard: Dashboard; values: Readonly<Record<string, ParameterValue | null>>; onClose: () => void }) {
  const qc = useQueryClient()
  const key = ['subscriptions', dashboard.id]
  const { data: list = [], isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<Subscription[]>(`/v1/subscriptions?dashboard=${dashboard.id}`) })
  const [editing, setEditing] = useState<Subscription | 'new' | null>(null)
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ['subscriptions'] })])
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {editing ? (
          <SubscriptionForm
            dashboard={dashboard}
            values={values}
            subscription={editing === 'new' ? null : editing}
            onDone={async () => {
              await refresh()
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{$t('Abonnements')}</DialogTitle>
              <DialogDescription>{$t('Recevoir « {name} » à heure fixe, par e-mail ou dans Teams et Slack — en PDF, en image ou en résumé écrit.', { name: dashboard.name })}</DialogDescription>
            </DialogHeader>
            {isLoading ? <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /> : null}
            {!isLoading && list.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{$t('Aucun abonnement à ce tableau de bord.')}</p> : null}
            <div className="space-y-2">
              {list.map((s) => (
                <SubscriptionRow key={s.id} subscription={s} onEdit={() => setEditing(s)} onChanged={refresh} />
              ))}
            </div>
            <DialogFooter>
              <Button onClick={() => setEditing('new')}>
                <Plus /> {$t('Nouvel abonnement')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function SubscriptionRow({ subscription: s, onEdit, onChanged, showDashboard = false }: { subscription: Subscription; onEdit: () => void; onChanged: () => Promise<unknown>; showDashboard?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null)
  const Icon = FORMAT_ICONS[s.format]
  const act = async (what: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(what)
    try {
      await fn()
      if (done) toast.success(done)
      await onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }
  const save = (patch: Partial<Subscription>) => {
    const next = { ...s, ...patch }
    return api.put(`/v1/subscriptions/${s.id}`, {
      dashboard: next.dashboard,
      name: next.name,
      schedule: next.schedule,
      format: next.format,
      options: next.options,
      values: next.values,
      recipients: next.recipients.map((r) => r.id),
      channels: next.channels.map((c) => ({ id: c.id, kind: c.kind, label: c.label })),
      message: next.message,
      enabled: next.enabled,
    })
  }
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border p-3', !s.enabled && 'opacity-60')}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{s.name || (showDashboard ? s.dashboard_name : scheduleSummary(s.schedule))}</span>
          {!s.mine && s.owner ? <span className="shrink-0 text-xs font-normal text-muted-foreground">· {s.owner.name}</span> : null}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {showDashboard && s.name ? `${s.dashboard_name} · ` : ''}
          {scheduleSummary(s.schedule)} · {[$tp(s.recipients.length, '{count} personne', '{count} personnes'), ...s.channels.map((c) => c.label)].join(', ')}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <StatusDot status={s.last_status} />
          {s.last_run_at ? $t('Dernier envoi {when}', { when: formatAgo(s.last_run_at) }) : $t('Jamais envoyé')}
          {s.enabled && s.next_run_at ? <span>· {$t('prochain : {when}', { when: when(s.next_run_at) })}</span> : null}
          {s.last_error ? (
            <Hint label={s.last_error}>
              <TriangleAlert className="size-3 text-amber-600" />
            </Hint>
          ) : null}
        </div>
      </div>
      <Hint label={s.enabled ? $t('Actif') : $t('En pause')}>
        <span>
          <Switch checked={s.enabled} onCheckedChange={(on) => act('toggle', () => save({ enabled: on }))} disabled={busy !== null || !s.mine} aria-label={$t('Actif')} />
        </span>
      </Hint>
      <Hint label={$t('M’envoyer un essai')}>
        <Button size="icon-sm" variant="ghost" disabled={busy !== null} onClick={() => act('test', () => api.post(`/v1/subscriptions/${s.id}/send`, { only_me: true }), $t('Essai envoyé : regardez votre boîte de réception.'))} aria-label={$t('M’envoyer un essai')}>
          {busy === 'test' ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </Hint>
      <Hint label={$t('Envoyer maintenant à tous')}>
        <Button size="icon-sm" variant="ghost" disabled={busy !== null} onClick={() => act('send', () => api.post(`/v1/subscriptions/${s.id}/send`, { only_me: false }), $t('Envoi lancé.'))} aria-label={$t('Envoyer maintenant à tous')}>
          {busy === 'send' ? <Loader2 className="animate-spin" /> : <Mail />}
        </Button>
      </Hint>
      <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label={$t('Modifier')}>
        <Pencil />
      </Button>
      <Button size="icon-sm" variant="ghost" disabled={busy !== null} onClick={() => act('delete', () => api.delete(`/v1/subscriptions/${s.id}`), $t('Abonnement supprimé.'))} aria-label={$t('Supprimer')}>
        <Trash2 className="text-destructive" />
      </Button>
    </div>
  )
}

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}

export function SubscriptionForm({
  dashboard,
  values,
  subscription,
  onDone,
  onCancel,
}: {
  dashboard: Dashboard
  values: Readonly<Record<string, ParameterValue | null>>
  subscription: Subscription | null
  onDone: () => void | Promise<void>
  onCancel: () => void
}) {
  const { data: me } = useMe()
  const { data: can } = useDelivery()
  const [name, setName] = useState(subscription?.name ?? '')
  const [format, setFormat] = useState<SubscriptionFormat>(subscription?.format ?? 'pdf')
  const [schedule, setSchedule] = useState<Schedule>(subscription?.schedule ?? defaultSchedule('weekly'))
  const [recipients, setRecipients] = useState<string[]>(subscription ? subscription.recipients.map((r) => r.id) : me ? [me.id] : [])
  const [channels, setChannels] = useState<ChannelDraft[]>(subscription ? channelDrafts(subscription.channels) : [])
  const [message, setMessage] = useState(subscription?.message ?? '')
  const [options, setOptions] = useState<ExportOptions>(subscription?.options ?? {})
  // The filters it is sent with: those on screen now, or the dashboard's defaults.
  const hasFilters = Object.values(values).some((v) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))
  const [current, setCurrent] = useState(subscription ? Object.keys(subscription.values).length > 0 : hasFilters)
  const [layout, setLayout] = useState(false)
  const [busy, setBusy] = useState(false)
  const pictured = format !== 'summary'

  const save = async () => {
    setBusy(true)
    try {
      const body = {
        dashboard: dashboard.id,
        name: name.trim(),
        schedule,
        format,
        options,
        values: current ? (subscription && Object.keys(subscription.values).length ? subscription.values : values) : {},
        recipients,
        channels: channelInputs(channels),
        message,
        enabled: subscription?.enabled ?? true,
      }
      if (subscription) await api.put(`/v1/subscriptions/${subscription.id}`, body)
      else await api.post('/v1/subscriptions', body)
      toast.success(subscription ? $t('Abonnement modifié.') : $t('Abonnement créé : premier envoi {when}.', { when: scheduleSummary(schedule).toLowerCase() }))
      await onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <DialogHeader>
        <DialogTitle>{subscription ? $t('Modifier l’abonnement') : $t('Nouvel abonnement')}</DialogTitle>
        <DialogDescription>{dashboard.name}</DialogDescription>
      </DialogHeader>
      <Section title={$t('Quand')}>
        <ScheduleEditor value={schedule} onChange={setSchedule} frequencies={['daily', 'weekly', 'monthly']} />
      </Section>
      <Section title={$t('Sous quelle forme')}>
        <Segmented
          value={format}
          onValueChange={setFormat}
          aria-label={$t('Format')}
          inline
          options={[
            { value: 'pdf', label: 'PDF', icon: FileText, hint: $t('Le tableau de bord mis en pages, joint au message') },
            { value: 'png', label: $t('Image'), icon: ImageIcon, hint: $t('Le tableau de bord en image, dans le corps du message') },
            { value: 'summary', label: $t('Résumé'), icon: Mail, hint: $t('Les chiffres clés et les premières lignes, écrits dans le message') },
          ]}
        />
        {pictured && can && !can.render ? (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            {$t('Aucun service de rendu n’est configuré sur cette instance (RENDER_URL) : le résumé écrit sera envoyé à la place.')}
          </p>
        ) : null}
        <label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-sm">
          <span>
            {$t('Avec les filtres actuels')}
            <span className="block text-xs text-muted-foreground">{current ? $t('Les filtres choisis à l’écran, gardés tels quels.') : $t('Les valeurs par défaut du tableau de bord.')}</span>
          </span>
          <Switch checked={current} onCheckedChange={setCurrent} />
        </label>
        <button type="button" onClick={() => setLayout((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ChevronDown className={cn('size-3.5 transition-transform', layout && 'rotate-180')} /> {$t('Mise en page : onglets, orientation, page de garde…')}
        </button>
        {layout ? (
          <div className="rounded-lg border p-3">
            <ExportOptionsForm tabs={dashboard.tabs} value={options} onChange={setOptions} />
          </div>
        ) : null}
      </Section>
      <Section title={$t('À qui')} hint={$t('Chacun reçoit le tableau de bord tel qu’il le verrait : ses droits et ses filtres de lignes s’appliquent.')}>
        <PeoplePicker value={recipients} onChange={setRecipients} />
        {can && !can.email ? (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            {$t('Aucun serveur d’e-mails n’est configuré (SMTP_URL) : seuls les canaux recevront l’envoi.')}
          </p>
        ) : null}
      </Section>
      <Section title={$t('Canaux Teams et Slack')} hint={$t('Un canal voit le tableau de bord tel que vous le voyez.')}>
        <ChannelsEditor value={channels} onChange={setChannels} />
      </Section>
      <Section title={$t('Message')}>
        <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr]">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{$t('Objet (facultatif)')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={dashboard.name} className="h-8" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{$t('Un mot en tête du message')}</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={$t('Les chiffres de la semaine, bonne lecture !')} className="min-h-8 text-sm" rows={1} />
          </div>
        </div>
      </Section>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {$t('Annuler')}
        </Button>
        <Button type="submit" disabled={busy || (!recipients.length && !channels.length)}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {subscription ? $t('Enregistrer') : $t('Créer l’abonnement')}
        </Button>
      </DialogFooter>
    </form>
  )
}
