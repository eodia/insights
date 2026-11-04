'use client'

import type { ChannelKind, DashboardTab, DeliveryChannel, ExportOptions, Frequency, PaperSize, Schedule } from '@eodia/contracts'
import { Avatar } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Choice } from '@/components/ui/choice'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { $t, intlLocale, msg } from '@/lib/i18n'
import { useDirectory } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { Hash, Plus, Trash2, UserPlus, X } from 'lucide-react'

// ── Schedule ────────────────────────────────────────────────────────────────

export const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'
  } catch {
    return 'Europe/Paris'
  }
}

export const defaultSchedule = (frequency: Frequency = 'weekly'): Schedule => ({ frequency, hour: 8, minute: 0, weekdays: [1], day: 1, timezone: browserZone() })

const FREQUENCY_LABELS: Record<Frequency, string> = {
  quarter_hour: msg('Toutes les 15 min'),
  hourly: msg('Chaque heure'),
  daily: msg('Chaque jour'),
  weekly: msg('Chaque semaine'),
  monthly: msg('Chaque mois'),
}

/** Monday first, in the reader's language: « lun. », « mar. »… */
const weekdayName = (iso: number, style: 'short' | 'long' = 'short') =>
  new Intl.DateTimeFormat(intlLocale(), { weekday: style }).format(new Date(Date.UTC(2024, 0, iso)))

/** « Chaque lundi à 08:00 », « Le 1er du mois à 07:30 »… */
export function scheduleSummary(s: Schedule): string {
  const at = new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1, s.hour, s.minute)))
  switch (s.frequency) {
    case 'quarter_hour':
      return $t('Toutes les 15 minutes')
    case 'hourly':
      return $t('Chaque heure, à la minute {minute}', { minute: String(s.minute).padStart(2, '0') })
    case 'daily':
      return s.weekdays?.length && s.weekdays.length < 7
        ? $t('{days} à {time}', { days: s.weekdays.map((d) => weekdayName(d)).join(', '), time: at })
        : $t('Chaque jour à {time}', { time: at })
    case 'weekly':
      return $t('Chaque {days} à {time}', { days: (s.weekdays?.length ? s.weekdays : [1]).map((d) => weekdayName(d, 'long')).join(', '), time: at })
    case 'monthly':
      return s.day === -1 ? $t('Le dernier jour du mois à {time}', { time: at }) : $t('Le {day} du mois à {time}', { day: s.day ?? 1, time: at })
  }
}

export function ScheduleEditor({ value, onChange, frequencies }: { value: Schedule; onChange: (s: Schedule) => void; frequencies: readonly Frequency[] }) {
  const set = (patch: Partial<Schedule>) => onChange({ ...value, ...patch })
  const days = value.weekdays?.length ? value.weekdays : value.frequency === 'weekly' ? [1] : [1, 2, 3, 4, 5, 6, 7]
  const toggle = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort()
    if (next.length) set({ weekdays: next })
  }
  return (
    <div className="space-y-3">
      <Segmented value={value.frequency} onValueChange={(f) => set({ frequency: f, ...(f === 'weekly' && !value.weekdays?.length ? { weekdays: [1] } : {}) })} aria-label={$t('Fréquence')} options={frequencies.map((f) => ({ value: f, label: $t(FREQUENCY_LABELS[f]) }))} />
      {value.frequency === 'daily' || value.frequency === 'weekly' ? (
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              aria-pressed={days.includes(d)}
              className={cn('h-8 min-w-11 rounded-lg border px-2 text-xs font-medium capitalize transition-colors', days.includes(d) ? 'border-primary/40 bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent')}
            >
              {weekdayName(d)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {value.frequency === 'monthly' ? (
          <Choice
            value={String(value.day ?? 1)}
            onValueChange={(v) => set({ day: Number(v) })}
            aria-label={$t('Jour du mois')}
            className="w-44"
            options={[...Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: $t('Le {day} du mois', { day: i + 1 }) })), { value: '-1', label: $t('Le dernier jour') }]}
          />
        ) : null}
        {value.frequency === 'hourly' ? (
          <>
            <span className="text-muted-foreground">{$t('à la minute')}</span>
            <Input type="number" min={0} max={59} value={value.minute} onChange={(e) => set({ minute: Math.min(59, Math.max(0, Number(e.target.value) || 0)) })} className="h-8 w-20" />
          </>
        ) : value.frequency !== 'quarter_hour' ? (
          <>
            <span className="text-muted-foreground">{$t('à')}</span>
            <Input
              type="time"
              value={`${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number)
                set({ hour: h ?? 0, minute: m ?? 0 })
              }}
              className="h-8 w-28"
            />
            <span className="text-xs text-muted-foreground">{value.timezone}</span>
          </>
        ) : null}
      </div>
    </div>
  )
}

// ── People ──────────────────────────────────────────────────────────────────

/** People of the space, chosen by name or e-mail. */
export function PeoplePicker({ value, onChange }: { value: readonly string[]; onChange: (ids: string[]) => void }) {
  const { data } = useDirectory()
  const users = data?.users ?? []
  const chosen = new Set(value)
  return (
    <div className="space-y-2">
      {value.length ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const u = users.find((x) => x.id === id)
            return (
              <span key={id} className="inline-flex items-center gap-1.5 rounded-full border bg-background py-0.5 pr-1 pl-0.5 text-xs">
                <Avatar name={u?.name ?? '?'} color={(u?.color ?? null) as never} size="sm" />
                {u?.name ?? id.slice(0, 8)}
                <button type="button" onClick={() => onChange(value.filter((x) => x !== id))} className="rounded-full p-0.5 hover:bg-accent" aria-label={$t('Retirer')}>
                  <X className="size-3" />
                </button>
              </span>
            )
          })}
        </div>
      ) : null}
      <Combobox
        value={null}
        selected={chosen}
        onValueChange={(id) => {
          if (id === null) return onChange([])
          onChange(chosen.has(id) ? value.filter((x) => x !== id) : [...value, id])
        }}
        options={users.map((u) => ({ value: u.id, label: `${u.name} ${u.email}`, render: <span className="flex flex-col"><span>{u.name}</span><span className="text-xs text-muted-foreground">{u.email}</span></span> }))}
        searchPlaceholder={$t('Nom ou e-mail…')}
        aria-label={$t('Ajouter des destinataires')}
        className="h-8 w-full justify-start text-sm"
      >
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <UserPlus className="size-4" /> {$t('Ajouter des personnes de l’espace…')}
        </span>
      </Combobox>
    </div>
  )
}

// ── Channels ────────────────────────────────────────────────────────────────

export interface ChannelDraft {
  readonly id?: string
  readonly kind: ChannelKind
  readonly label: string
  /** Left empty for a channel already saved: its address is kept. */
  readonly url: string
}

export const channelDrafts = (channels: readonly DeliveryChannel[]): ChannelDraft[] => channels.map((c) => ({ id: c.id, kind: c.kind, label: c.label, url: '' }))

export const channelInputs = (drafts: readonly ChannelDraft[]) =>
  drafts.map((c) => ({ ...(c.id ? { id: c.id } : {}), kind: c.kind, label: c.label.trim() || (c.kind === 'teams' ? 'Teams' : 'Slack'), ...(c.url.trim() ? { url: c.url.trim() } : {}) }))

function ChannelGlyph({ kind }: { kind: ChannelKind }) {
  return (
    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white', kind === 'teams' ? 'bg-[#5059c9]' : 'bg-[#4a154b]')}>
      {kind === 'teams' ? 'T' : <Hash className="size-4" />}
    </span>
  )
}

export function ChannelsEditor({ value, onChange }: { value: readonly ChannelDraft[]; onChange: (c: ChannelDraft[]) => void }) {
  const set = (i: number, patch: Partial<ChannelDraft>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  return (
    <div className="space-y-2">
      {value.map((c, i) => (
        <div key={c.id ?? `new-${i}`} className="flex items-start gap-2 rounded-lg border p-2">
          <ChannelGlyph kind={c.kind} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex gap-1.5">
              <Choice value={c.kind} onValueChange={(k) => set(i, { kind: k as ChannelKind })} aria-label={$t('Messagerie')} className="w-28" options={[{ value: 'teams', label: 'Teams' }, { value: 'slack', label: 'Slack' }]} />
              <Input value={c.label} onChange={(e) => set(i, { label: e.target.value })} placeholder={c.kind === 'slack' ? '#ventes' : $t('Équipe commerciale')} className="h-8" />
            </div>
            <Input
              value={c.url}
              onChange={(e) => set(i, { url: e.target.value })}
              placeholder={c.id ? $t('Adresse enregistrée — la remplacer…') : c.kind === 'slack' ? 'https://hooks.slack.com/services/…' : 'https://….logic.azure.com/workflows/…'}
              className="h-8 font-mono text-xs"
            />
          </div>
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={$t('Retirer le canal')}>
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, { kind: 'teams', label: '', url: '' }])}>
          <Plus /> Teams
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, { kind: 'slack', label: '', url: '' }])}>
          <Plus /> Slack
        </Button>
        <span className="text-[11px] leading-snug text-muted-foreground">{$t('Un webhook entrant du canal : « Workflows » dans Teams, « Incoming Webhooks » dans Slack.')}</span>
      </div>
    </div>
  )
}

// ── Paper ───────────────────────────────────────────────────────────────────

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-sm">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

/** How a dashboard goes on paper — for an export, as for a subscription. */
export function ExportOptionsForm({ tabs, value, onChange, compact = false }: { tabs: readonly DashboardTab[]; value: ExportOptions; onChange: (o: ExportOptions) => void; compact?: boolean }) {
  const set = (patch: Partial<ExportOptions>) => {
    const next: Record<string, unknown> = { ...value, ...patch }
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '') delete next[k]
    onChange(next as ExportOptions)
  }
  const chosen = value.tabs?.length ? new Set(value.tabs) : null
  return (
    <div className="space-y-4">
      {tabs.length > 1 ? (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{$t('Onglets')}</Label>
          <div className="grid gap-1 sm:grid-cols-2">
            {tabs.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-accent">
                <Checkbox
                  checked={!chosen || chosen.has(t.id)}
                  onCheckedChange={(on) => {
                    const current = chosen ? [...chosen] : tabs.map((x) => x.id)
                    const next = on ? [...new Set([...current, t.id])] : current.filter((x) => x !== t.id)
                    if (!next.length) return
                    set({ tabs: next.length === tabs.length ? undefined : tabs.map((x) => x.id).filter((x) => next.includes(x)) })
                  }}
                />
                {t.label}
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{$t('Orientation')}</Label>
          <Segmented
            value={value.orientation ?? 'theme'}
            onValueChange={(v) => set({ orientation: v === 'theme' ? undefined : (v as 'portrait' | 'landscape') })}
            aria-label={$t('Orientation')}
            options={[
              { value: 'theme', label: $t('Du thème') },
              { value: 'landscape', label: $t('Paysage') },
              { value: 'portrait', label: $t('Portrait') },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{$t('Format du papier')}</Label>
          <Segmented value={value.paper ?? 'A4'} onValueChange={(v) => set({ paper: v === 'A4' ? undefined : (v as PaperSize) })} aria-label={$t('Format du papier')} options={[{ value: 'A4', label: 'A4' }, { value: 'A3', label: 'A3' }, { value: 'Letter', label: 'Letter' }]} />
        </div>
      </div>
      {compact ? null : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{$t('Titre (facultatif)')}</Label>
            <Input value={value.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder={$t('Le nom du tableau de bord')} className="h-8" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{$t('Note sur la page de garde')}</Label>
            <Textarea value={value.note ?? ''} onChange={(e) => set({ note: e.target.value })} placeholder={$t('Chiffres arrêtés au 3, pour le comité du lundi…')} className="min-h-8 text-sm" rows={1} />
          </div>
        </div>
      )}
      <div className="grid gap-x-6 sm:grid-cols-2">
        <Toggle label={$t('Page de garde')} checked={value.cover ?? true} onChange={(v) => set({ cover: v ? undefined : false })} />
        <Toggle label={$t('Filtres appliqués')} checked={value.filters !== false} onChange={(v) => set({ filters: v ? undefined : false })} />
        <Toggle label={$t('Titre de chaque onglet')} checked={value.tab_titles !== false} onChange={(v) => set({ tab_titles: v ? undefined : false })} />
        <Toggle label={$t('Numéros de page')} checked={value.page_numbers !== false} onChange={(v) => set({ page_numbers: v ? undefined : false })} />
        <Toggle label={$t('Cartes interactives (volets, boutons…)')} checked={!!value.interactive} onChange={(v) => set({ interactive: v || undefined })} />
      </div>
    </div>
  )
}
