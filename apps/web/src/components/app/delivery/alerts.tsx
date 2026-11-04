'use client'

import type { Alert, AlertCondition, AlertMode, AlertOp, AlertRead, ResultColumn, Schedule } from '@eodia/contracts'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Hint } from '@/components/ui/tooltip'
import { type RunResult, api } from '@/lib/api'
import { formatAgo } from '@/lib/format'
import { $t, intlLocale, msg } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, Loader2, Pencil, Plus, RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { type ChannelDraft, ChannelsEditor, ScheduleEditor, channelDrafts, channelInputs, defaultSchedule, scheduleSummary } from './editors'
import { useDelivery, when } from './subscriptions'

const OPS: Record<AlertOp, string> = { lt: msg('passe sous'), lte: msg('est au plus'), gt: msg('dépasse'), gte: msg('atteint au moins'), eq: msg('vaut'), ne: msg('ne vaut plus') }
const READS: Record<AlertRead, string> = { first: msg('la première ligne'), last: msg('la dernière ligne'), sum: msg('la somme des lignes'), min: msg('la plus petite valeur'), max: msg('la plus grande valeur') }

/** « CA passe sous 10 000 », « des lignes reviennent »… */
export function conditionSummary(c: AlertCondition, columns: readonly Pick<ResultColumn, 'name' | 'label'>[] = []): string {
  if (c.kind === 'rows') return c.test === 'some' ? $t('La question renvoie des lignes') : $t('La question ne renvoie aucune ligne')
  const label = columns.find((x) => x.name === c.column)?.label ?? c.column
  return `${label} ${$t(OPS[c.op])} ${new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 2 }).format(c.value)}`
}

/** A question's alerts, and the form to add one. */
export function AlertsDialog({ question, onClose }: { question: { id: string; name: string }; onClose: () => void }) {
  const qc = useQueryClient()
  const key = ['alerts', question.id]
  const { data: list = [], isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<Alert[]>(`/v1/alerts?question=${question.id}`) })
  // Its columns, for a threshold: the question run once.
  const { data: result } = useQuery({ queryKey: ['alert-columns', question.id], queryFn: () => api.post<RunResult>(`/v1/questions/${question.id}/run`, {}), staleTime: 300_000 })
  const columns = result?.columns ?? []
  const [editing, setEditing] = useState<Alert | 'new' | null>(null)
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ['alerts'] })])
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {editing ? (
          <AlertForm
            question={question}
            columns={columns}
            alert={editing === 'new' ? null : editing}
            onDone={async () => {
              await refresh()
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{$t('Alertes')}</DialogTitle>
              <DialogDescription>{$t('Être prévenu quand « {name} » dit ce que vous attendez : un seuil franchi, des lignes qui reviennent.', { name: question.name })}</DialogDescription>
            </DialogHeader>
            {isLoading ? <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /> : null}
            {!isLoading && list.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{$t('Aucune alerte sur cette question.')}</p> : null}
            <div className="space-y-2">
              {list.map((a) => (
                <AlertRow key={a.id} alert={a} columns={columns} onEdit={() => setEditing(a)} onChanged={refresh} />
              ))}
            </div>
            <DialogFooter>
              <Button onClick={() => setEditing('new')}>
                <Plus /> {$t('Nouvelle alerte')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function AlertRow({ alert: a, columns = [], onEdit, onChanged, showQuestion = false }: { alert: Alert; columns?: readonly ResultColumn[]; onEdit: () => void; onChanged: () => Promise<unknown>; showQuestion?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null)
  const act = async (what: string, fn: () => Promise<unknown>, done?: (r: unknown) => string | null) => {
    setBusy(what)
    try {
      const r = await fn()
      const said = done?.(r)
      if (said) toast.success(said)
      await onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }
  const toggle = (enabled: boolean) =>
    api.put(`/v1/alerts/${a.id}`, {
      question: a.question,
      name: a.name,
      condition: a.condition,
      schedule: a.schedule,
      mode: a.mode,
      email: a.email,
      channels: a.channels.map((c) => ({ id: c.id, kind: c.kind, label: c.label })),
      message: a.message,
      enabled,
    })
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border p-3', !a.enabled && 'opacity-60')}>
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', a.triggered ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-muted text-muted-foreground')}>
        <BellRing className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{a.name || conditionSummary(a.condition, columns)}</span>
          {!a.mine && a.owner ? <span className="shrink-0 text-xs font-normal text-muted-foreground">· {a.owner.name}</span> : null}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {showQuestion ? `${a.question_name} · ` : ''}
          {a.name ? `${conditionSummary(a.condition, columns)} · ` : ''}
          {scheduleSummary(a.schedule)}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={cn('inline-block size-2 rounded-full', a.last_error ? 'bg-red-500' : a.triggered ? 'bg-amber-500' : a.checked_at ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
          {a.checked_at ? (a.triggered ? $t('Déclenchée — vérifiée {when}', { when: formatAgo(a.checked_at) }) : $t('Au calme — vérifiée {when}', { when: formatAgo(a.checked_at) })) : $t('Jamais vérifiée')}
          {a.last_value !== null && a.condition.kind === 'threshold' ? <span>· {new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 2 }).format(a.last_value)}</span> : null}
          {a.enabled && a.next_run_at ? <span>· {$t('prochaine : {when}', { when: when(a.next_run_at) })}</span> : null}
          {a.last_error ? (
            <Hint label={a.last_error}>
              <TriangleAlert className="size-3 text-amber-600" />
            </Hint>
          ) : null}
        </div>
      </div>
      <Hint label={a.enabled ? $t('Active') : $t('En pause')}>
        <span>
          <Switch checked={a.enabled} onCheckedChange={(on) => act('toggle', () => toggle(on))} disabled={busy !== null || !a.mine} aria-label={$t('Active')} />
        </span>
      </Hint>
      <Hint label={$t('Vérifier maintenant')}>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={busy !== null}
          onClick={() =>
            act('check', () => api.post<{ holds: boolean; notified: boolean; error?: string }>(`/v1/alerts/${a.id}/check`, {}), (r) => {
              const c = r as { holds: boolean; notified: boolean; error?: string }
              if (c.error && !c.notified) {
                toast.error(c.error)
                return null
              }
              return c.holds ? (c.notified ? $t('L’alerte tient : le message est parti.') : $t('L’alerte tient.')) : $t('L’alerte ne tient pas pour l’instant.')
            })
          }
          aria-label={$t('Vérifier maintenant')}
        >
          {busy === 'check' ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </Button>
      </Hint>
      <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label={$t('Modifier')}>
        <Pencil />
      </Button>
      <Button size="icon-sm" variant="ghost" disabled={busy !== null} onClick={() => act('delete', () => api.delete(`/v1/alerts/${a.id}`), () => $t('Alerte supprimée.'))} aria-label={$t('Supprimer')}>
        <Trash2 className="text-destructive" />
      </Button>
    </div>
  )
}

export function AlertForm({
  question,
  columns,
  alert,
  onDone,
  onCancel,
}: {
  question: { id: string; name: string }
  columns: readonly ResultColumn[]
  alert: Alert | null
  onDone: () => void | Promise<void>
  onCancel: () => void
}) {
  const { data: can } = useDelivery()
  const numeric = columns.filter((c) => c.role === 'metric' || c.type === 'number' || /int|double|decimal|real|float|number/i.test(c.type))
  const [kind, setKind] = useState<AlertCondition['kind']>(alert?.condition.kind ?? (numeric.length ? 'threshold' : 'rows'))
  const first = alert?.condition.kind === 'threshold' ? alert.condition : null
  const [column, setColumn] = useState(first?.column ?? numeric[0]?.name ?? '')
  const [op, setOp] = useState<AlertOp>(first?.op ?? 'lt')
  const [threshold, setThreshold] = useState(first ? String(first.value) : '')
  const [read, setRead] = useState<AlertRead>(first?.read ?? 'last')
  const [test, setTest] = useState<'some' | 'none'>(alert?.condition.kind === 'rows' ? alert.condition.test : 'some')
  const [schedule, setSchedule] = useState<Schedule>(alert?.schedule ?? defaultSchedule('hourly'))
  const [mode, setMode] = useState<AlertMode>(alert?.mode ?? 'change')
  const [email, setEmail] = useState(alert?.email ?? true)
  const [channels, setChannels] = useState<ChannelDraft[]>(alert ? channelDrafts(alert.channels) : [])
  const [name, setName] = useState(alert?.name ?? '')
  const [message, setMessage] = useState(alert?.message ?? '')
  const [busy, setBusy] = useState(false)
  const value = Number(threshold.replace(/\s/g, '').replace(',', '.'))
  const valid = kind === 'rows' || (column !== '' && threshold.trim() !== '' && Number.isFinite(value))

  const save = async () => {
    setBusy(true)
    try {
      const condition: AlertCondition = kind === 'rows' ? { kind: 'rows', test } : { kind: 'threshold', column, op, value, read }
      const body = { question: question.id, name: name.trim(), condition, schedule, mode, email, channels: channelInputs(channels), message, enabled: alert?.enabled ?? true }
      if (alert) await api.put(`/v1/alerts/${alert.id}`, body)
      else await api.post('/v1/alerts', body)
      toast.success(alert ? $t('Alerte modifiée.') : $t('Alerte créée.'))
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
        if (valid) void save()
      }}
    >
      <DialogHeader>
        <DialogTitle>{alert ? $t('Modifier l’alerte') : $t('Nouvelle alerte')}</DialogTitle>
        <DialogDescription>{question.name}</DialogDescription>
      </DialogHeader>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{$t('Prévenir quand')}</h3>
        <Segmented
          value={kind}
          onValueChange={setKind}
          aria-label={$t('Condition')}
          options={[
            { value: 'threshold', label: $t('Un seuil est franchi') },
            { value: 'rows', label: $t('Des lignes reviennent') },
          ]}
        />
        {kind === 'threshold' ? (
          numeric.length ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Choice value={column} onValueChange={setColumn} aria-label={$t('Colonne')} className="w-48" options={numeric.map((c) => ({ value: c.name, label: c.label }))} />
              <Choice value={op} onValueChange={(v) => setOp(v as AlertOp)} aria-label={$t('Comparaison')} className="w-40" options={(Object.keys(OPS) as AlertOp[]).map((o) => ({ value: o, label: $t(OPS[o]) }))} />
              <Input value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" placeholder="10 000" className="h-8 w-32" />
              <span className="text-muted-foreground">{$t('en lisant')}</span>
              <Choice value={read} onValueChange={(v) => setRead(v as AlertRead)} aria-label={$t('Valeur lue')} className="w-48" options={(Object.keys(READS) as AlertRead[]).map((r) => ({ value: r, label: $t(READS[r]) }))} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{$t('Cette question n’a pas de colonne numérique : choisissez « Des lignes reviennent ».')}</p>
          )
        ) : (
          <Segmented
            value={test}
            onValueChange={setTest}
            aria-label={$t('Lignes')}
            options={[
              { value: 'some', label: $t('Au moins une ligne') },
              { value: 'none', label: $t('Aucune ligne') },
            ]}
          />
        )}
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{$t('Vérifier')}</h3>
        <ScheduleEditor value={schedule} onChange={setSchedule} frequencies={['quarter_hour', 'hourly', 'daily', 'weekly']} />
        <Segmented
          value={mode}
          onValueChange={setMode}
          aria-label={$t('Fréquence des messages')}
          options={[
            { value: 'change', label: $t('Une fois, quand elle se déclenche'), hint: $t('Un message quand la condition devient vraie ; plus rien tant qu’elle le reste.') },
            { value: 'always', label: $t('À chaque vérification'), hint: $t('Un message à chaque vérification où la condition est vraie.') },
          ]}
        />
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{$t('Prévenir par')}</h3>
        <label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-sm">
          {$t('E-mail (à moi)')}
          <Switch checked={email} onCheckedChange={setEmail} />
        </label>
        {email && can && !can.email ? <p className="text-xs text-amber-700 dark:text-amber-400">{$t('Aucun serveur d’e-mails n’est configuré (SMTP_URL) : ajoutez un canal.')}</p> : null}
        <ChannelsEditor value={channels} onChange={setChannels} />
      </section>
      <section className="grid gap-2 sm:grid-cols-[1fr_1.4fr]">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{$t('Nom (facultatif)')}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={$t('CA du jour sous 10 k€')} className="h-8" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{$t('Un mot dans le message')}</Label>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={$t('Vérifier les remontées de caisse.')} className="min-h-8 text-sm" rows={1} />
        </div>
      </section>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {$t('Annuler')}
        </Button>
        <Button type="submit" disabled={busy || !valid || (!email && !channels.length)}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {alert ? $t('Enregistrer') : $t('Créer l’alerte')}
        </Button>
      </DialogFooter>
    </form>
  )
}
