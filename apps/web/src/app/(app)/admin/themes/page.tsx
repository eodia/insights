'use client'

import { AdminOnly, Empty, PageHeader, Spinner } from '@/components/app/admin/common'
import { ConfirmDialog } from '@/components/app/dialogs'
import { Visualization } from '@/components/app/visualization'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { PALETTES, schemeColors } from '@/lib/palettes'
import { useCrumbs } from '@/lib/store'
import { ThemeLogo, ThemeScope, loadFont } from '@/lib/theme'
import { cn } from '@/lib/utils'
import type { Result } from '@/lib/viz'
import {
  type ColorScheme,
  THEME_FONTS,
  type Theme,
  type ThemeFont,
  type ThemeSettings,
  type VisualizationType,
} from '@eodia/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlignLeft,
  AlignRight,
  CaseSensitive,
  CaseUpper,
  Check,
  FileImage,
  Palette,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  SquareDashed,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const LOGO_MAX = 300_000

function Field({
  label,
  children,
  hint,
}: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

/** A colour, or none (the application's). */
function ColorField({
  label,
  value,
  onChange,
}: { label: string; value: string | undefined; onChange: (v: string | undefined) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-1.5">
        <label
          className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border"
          style={{ background: value ?? 'transparent' }}
        >
          {!value ? (
            <SquareDashed className="absolute inset-1.5 size-4 text-muted-foreground" />
          ) : null}
          <input
            type="color"
            value={value ?? '#ffffff'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={label}
          />
        </label>
        <Input
          value={value ?? ''}
          placeholder={$t('Celle de l’application')}
          onChange={(e) => {
            const v = e.target.value.trim()
            if (v === '') onChange(undefined)
            else if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v)
          }}
          className="h-8 font-mono text-xs"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="rounded p-1 text-muted-foreground hover:bg-accent"
            aria-label={$t('Retirer la couleur')}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
    </Field>
  )
}

function FontField({
  label,
  value,
  onChange,
}: { label: string; value: ThemeFont | undefined; onChange: (v: ThemeFont | undefined) => void }) {
  useEffect(() => {
    for (const f of THEME_FONTS) loadFont(f)
  }, [])
  return (
    <Field label={label}>
      <Choice
        value={value ?? ''}
        onValueChange={(v) => onChange(v === '' ? undefined : (v as ThemeFont))}
        options={[
          { value: '', label: $t('Celle de l’application') },
          ...THEME_FONTS.map((f) => ({
            value: f,
            label: f,
            render: <span style={{ fontFamily: `'${f}'` }}>{f}</span>,
          })),
        ]}
        aria-label={label}
        className="w-full"
      />
    </Field>
  )
}

// ── Aperçu ──────────────────────────────────────────────────────────────────

const SAMPLE_BARS: Result = {
  columns: [
    { name: 'canal', label: 'Canal', type: 'string', role: 'dimension' },
    { name: 'ca', label: 'CA', type: 'number', role: 'metric' },
  ] as never,
  rows: [
    ['Web', 4200],
    ['Magasin', 3100],
    ['Marketplace', 1900],
    ['Téléphone', 900],
    ['Salons', 600],
  ],
}
const SAMPLE_LINES: Result = {
  columns: [
    { name: 'mois', label: 'Mois', type: 'date', unit: 'month', role: 'dimension' },
    { name: 'region', label: 'Région', type: 'string', role: 'dimension' },
    { name: 'ca', label: 'CA', type: 'number', role: 'metric' },
  ] as never,
  rows: Array.from({ length: 8 }, (_, m) =>
    ['Nord', 'Sud', 'Ouest'].map((r, i) => [
      `2026-${String(m + 1).padStart(2, '0')}-01`,
      r,
      800 + i * 300 + m * (60 + i * 25) + ((m * 37 + i * 11) % 120),
    ]),
  ).flat(),
}

function Preview({ name, settings }: { name: string; settings: ThemeSettings }) {
  const card = 'theme-card flex flex-col rounded-xl border bg-card p-3 shadow-xs'
  return (
    <ThemeScope theme={settings} className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center gap-3">
        {settings.logo_position !== 'right' ? (
          <ThemeLogo theme={settings} className="object-contain" />
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="theme-title truncate text-xl font-semibold tracking-tight">
            {name || $t('Ventes du trimestre')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {$t('Aperçu : un tableau de bord dans ce thème')}
          </p>
        </div>
        {settings.logo_position === 'right' ? (
          <ThemeLogo theme={settings} className="object-contain" />
        ) : null}
      </div>
      <div className="flex gap-1.5 text-xs">
        <span className="rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground">
          {$t('Vue d’ensemble')}
        </span>
        <span className="rounded-md px-2 py-1 text-muted-foreground">{$t('Détail')}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className={cn(card, 'justify-center')}>
          <span className="theme-title text-xs font-semibold">{$t('Chiffre d’affaires')}</span>
          <span className="mt-1 text-2xl font-semibold tabular-nums">10,7 k€</span>
          <span className="text-xs text-primary">+12,4 %</span>
        </div>
        <div className={cn(card, 'col-span-2 h-44')}>
          <span className="theme-title text-xs font-semibold">{$t('Par canal')}</span>
          <div className="min-h-0 flex-1">
            <Visualization
              result={SAMPLE_BARS}
              viz={{ type: 'bar' as VisualizationType }}
              compact
            />
          </div>
        </div>
        <div className={cn(card, 'col-span-3 h-48')}>
          <span className="theme-title text-xs font-semibold">{$t('Évolution par région')}</span>
          <div className="min-h-0 flex-1">
            <Visualization
              result={SAMPLE_LINES}
              viz={{ type: 'line' as VisualizationType }}
              compact
            />
          </div>
        </div>
      </div>
    </ThemeScope>
  )
}

// ── Éditeur ─────────────────────────────────────────────────────────────────

function Editor({ theme, onDone }: { theme: Theme | null; onDone: (t: Theme | null) => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(theme?.name ?? '')
  const [s, setS] = useState<ThemeSettings>(theme?.settings ?? {})
  const [remove, setRemove] = useState(false)
  useEffect(() => {
    setName(theme?.name ?? '')
    setS(theme?.settings ?? {})
  }, [theme])
  const set = <K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K] | undefined) =>
    setS((prev) => {
      const next = { ...prev } as Record<string, unknown>
      if (value === undefined) delete next[key]
      else next[key] = value
      return next as ThemeSettings
    })
  const save = useMutation({
    mutationFn: () =>
      theme
        ? api.patch<Theme>(`/v1/themes/${theme.id}`, { name, settings: s })
        : api.post<Theme>('/v1/themes', { name, settings: s }),
    onSuccess: async (t) => {
      await qc.invalidateQueries({ queryKey: ['themes'] })
      // Every dashboard wearing it reads it again.
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success($t('Thème enregistré.'))
      onDone(t)
    },
    onError: (e) => toast.error((e as Error).message),
  })
  const upload = (file: File | undefined) => {
    if (!file) return
    if (file.size > LOGO_MAX * 0.74) {
      toast.error($t('Image trop lourde : 220 Ko au plus.'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => set('logo', String(reader.result))
    reader.readAsDataURL(file)
  }
  const schemes = (Object.keys(PALETTES) as Exclude<ColorScheme, 'custom'>[]).map((k) => ({
    key: k,
    palette: PALETTES[k],
  }))

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Field label={$t('Nom du thème')}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={$t('Charte de l’entreprise')}
            className="h-9"
          />
        </Field>

        <Section title={$t('Polices')}>
          <FontField
            label={$t('Titres')}
            value={s.font_heading}
            onChange={(v) => set('font_heading', v)}
          />
          <FontField
            label={$t('Texte et graphiques')}
            value={s.font_body}
            onChange={(v) => set('font_body', v)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label={$t('Graisse des titres')}>
              <Choice
                value={String(s.title_weight ?? 600)}
                onValueChange={(v) =>
                  set('title_weight', Number(v) as ThemeSettings['title_weight'])
                }
                options={[400, 500, 600, 700, 800].map((w) => ({
                  value: String(w),
                  label: String(w),
                  render: <span style={{ fontWeight: w }}>{w}</span>,
                }))}
                aria-label={$t('Graisse des titres')}
                className="w-full"
              />
            </Field>
            <Field label={$t('Casse des titres')}>
              <Segmented
                value={s.title_case ?? 'normal'}
                onValueChange={(v) => set('title_case', v === 'normal' ? undefined : v)}
                options={[
                  { value: 'normal', label: $t('Normale'), icon: CaseSensitive },
                  { value: 'upper', label: $t('Capitales'), icon: CaseUpper },
                ]}
                aria-label={$t('Casse des titres')}
              />
            </Field>
          </div>
        </Section>

        <Section title={$t('Couleurs')}>
          <div className="grid grid-cols-2 gap-3">
            <ColorField label={$t('Accent')} value={s.accent} onChange={(v) => set('accent', v)} />
            <ColorField
              label={$t('Titres')}
              value={s.title_color}
              onChange={(v) => set('title_color', v)}
            />
            <ColorField
              label={$t('Texte')}
              value={s.text_color}
              onChange={(v) => set('text_color', v)}
            />
            <ColorField
              label={$t('Fond de la page')}
              value={s.background}
              onChange={(v) => set('background', v)}
            />
            <ColorField
              label={$t('Fond des cartes')}
              value={s.card_background}
              onChange={(v) => set('card_background', v)}
            />
            <ColorField
              label={$t('Bordure des cartes')}
              value={s.card_border}
              onChange={(v) => set('card_border', v)}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {$t(
              'En mode sombre, le thème garde ses polices, son accent, sa palette et son logo ; fonds et textes suivent le mode sombre.',
            )}
          </p>
        </Section>

        <Section title={$t('Cartes')}>
          <Field label={$t('Arrondi des coins : {radius} px', { radius: s.card_radius ?? 12 })}>
            <input
              type="range"
              min={0}
              max={24}
              value={s.card_radius ?? 12}
              onChange={(e) => set('card_radius', Number(e.target.value))}
              className="w-full accent-primary"
            />
          </Field>
          <Field label={$t('Ombre')}>
            <Segmented
              value={s.card_shadow ?? 'soft'}
              onValueChange={(v) => set('card_shadow', v)}
              options={[
                { value: 'none', label: $t('Aucune'), icon: SquareDashed },
                { value: 'soft', label: $t('Légère'), icon: Square },
                { value: 'strong', label: $t('Marquée'), icon: RectangleHorizontal },
              ]}
              aria-label={$t('Ombre')}
            />
          </Field>
        </Section>

        <Section title={$t('Graphiques')}>
          <Field
            label={$t('Palette')}
            hint={$t('Prise par chaque graphique qui n’a pas choisi la sienne.')}
          >
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => set('scheme', undefined)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs',
                  !s.scheme ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-accent',
                )}
              >
                <Palette className="size-3.5 text-muted-foreground" />{' '}
                {$t('Celle de l’application')}
              </button>
              {schemes.map(({ key, palette }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set('scheme', key)}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs',
                    s.scheme === key
                      ? 'border-primary bg-primary/5 font-medium'
                      : 'hover:bg-accent',
                  )}
                >
                  <span className="flex">
                    {palette.light.slice(0, 5).map((c) => (
                      <span
                        key={c}
                        className="size-3 rounded-full ring-1 ring-background"
                        style={{ background: c, marginLeft: -3 }}
                      />
                    ))}
                  </span>
                  {$t(palette.label)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  set('scheme', 'custom')
                  if (!s.colors?.length)
                    set('colors', [...schemeColors('eodia', undefined, false, 6)].slice(0, 6))
                }}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs',
                  s.scheme === 'custom'
                    ? 'border-primary bg-primary/5 font-medium'
                    : 'hover:bg-accent',
                )}
              >
                <Plus className="size-3.5 text-muted-foreground" /> {$t('Personnalisée')}
              </button>
            </div>
          </Field>
          {s.scheme === 'custom' ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {(s.colors ?? []).map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: two equal colours stay two places
                <label
                  key={`${c}${i}`}
                  className="relative size-7 cursor-pointer rounded-full border"
                  style={{ background: c }}
                >
                  <input
                    type="color"
                    value={c}
                    onChange={(e) =>
                      set(
                        'colors',
                        (s.colors ?? []).map((x, j) => (j === i ? e.target.value : x)),
                      )
                    }
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label={$t('Couleur {n}', { n: i + 1 })}
                  />
                </label>
              ))}
              {(s.colors?.length ?? 0) < 12 ? (
                <button
                  type="button"
                  onClick={() => set('colors', [...(s.colors ?? []), '#888888'])}
                  className="flex size-7 items-center justify-center rounded-full border border-dashed text-muted-foreground hover:bg-accent"
                  aria-label={$t('Ajouter une couleur')}
                >
                  <Plus className="size-3.5" />
                </button>
              ) : null}
              {(s.colors?.length ?? 0) > 1 ? (
                <button
                  type="button"
                  onClick={() => set('colors', (s.colors ?? []).slice(0, -1))}
                  className="flex size-7 items-center justify-center rounded-full border text-muted-foreground hover:bg-accent"
                  aria-label={$t('Retirer la dernière couleur')}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          ) : null}
        </Section>

        <Section title={$t('Logo')}>
          {s.logo ? (
            <div className="flex items-center gap-3 rounded-lg border p-2">
              <ThemeLogo theme={{ ...s, logo_height: 36 }} className="max-w-40 object-contain" />
              <span className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => set('logo', undefined)}>
                <Trash2 /> {$t('Retirer')}
              </Button>
            </div>
          ) : null}
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
            <FileImage className="size-4" /> {$t('Choisir une image (PNG, SVG, JPEG, WebP)')}
            <input
              type="file"
              accept="image/png,image/svg+xml,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
          <Input
            value={s.logo?.startsWith('https://') ? s.logo : ''}
            onChange={(e) =>
              set('logo', e.target.value.startsWith('https://') ? e.target.value : undefined)
            }
            placeholder={$t('ou son adresse : https://…')}
            className="h-8 text-xs"
          />
          {s.logo ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={$t('Hauteur : {height} px', { height: s.logo_height ?? 32 })}>
                <input
                  type="range"
                  min={16}
                  max={96}
                  value={s.logo_height ?? 32}
                  onChange={(e) => set('logo_height', Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </Field>
              <Field label={$t('Position')}>
                <Segmented
                  value={s.logo_position ?? 'left'}
                  onValueChange={(v) => set('logo_position', v)}
                  options={[
                    { value: 'left', label: $t('À gauche'), icon: AlignLeft },
                    { value: 'right', label: $t('À droite'), icon: AlignRight },
                  ]}
                  aria-label={$t('Position')}
                />
              </Field>
            </div>
          ) : null}
        </Section>

        <Section title={$t('Impression en PDF')}>
          <Field label={$t('Orientation')}>
            <Segmented
              value={s.pdf_orientation ?? 'landscape'}
              onValueChange={(v) => set('pdf_orientation', v)}
              options={[
                { value: 'landscape', label: $t('Paysage'), icon: RectangleHorizontal },
                { value: 'portrait', label: $t('Portrait'), icon: RectangleVertical },
              ]}
              aria-label={$t('Orientation')}
            />
          </Field>
          <label className="flex items-center justify-between gap-3 text-sm">
            {$t('Page de garde')}
            <Switch
              checked={s.pdf_cover !== false}
              onCheckedChange={(v) => set('pdf_cover', v ? undefined : false)}
            />
          </label>
          <Field label={$t('Pied de page')}>
            <Input
              value={s.pdf_footer ?? ''}
              onChange={(e) => set('pdf_footer', e.target.value || undefined)}
              placeholder={$t('Confidentiel — usage interne')}
              className="h-8"
            />
          </Field>
        </Section>

        <div className="flex items-center gap-2 border-t pt-4">
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            <Check /> {theme ? $t('Enregistrer') : $t('Créer le thème')}
          </Button>
          <Button variant="ghost" onClick={() => onDone(theme)}>
            {$t('Annuler')}
          </Button>
          <span className="flex-1" />
          {theme ? (
            <Button variant="ghost" className="text-destructive" onClick={() => setRemove(true)}>
              <Trash2 /> {$t('Supprimer')}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="lg:sticky lg:top-4 lg:self-start">
        <Preview name={name} settings={s} />
      </div>
      {theme ? (
        <ConfirmDialog
          open={remove}
          onOpenChange={setRemove}
          title={$t('Supprimer « {name} » ?', { name: theme.name })}
          description={$t(
            'Les dossiers et tableaux de bord qui le portaient reprennent le thème dont ils héritent.',
          )}
          onConfirm={async () => {
            await api.delete(`/v1/themes/${theme.id}`)
            await qc.invalidateQueries({ queryKey: ['themes'] })
            onDone(null)
          }}
        />
      ) : null}
    </div>
  )
}

function ThemesScreen() {
  useCrumbs([{ label: $t('Administration') }, { label: $t('Thèmes') }])
  const { data: themes } = useQuery({
    queryKey: ['themes'],
    queryFn: () => api.get<Theme[]>('/v1/themes'),
  })
  const [open, setOpen] = useState<Theme | 'new' | null>(null)
  if (!themes) return <Spinner />
  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title={$t('Thèmes')}
        description={$t(
          'Polices, couleurs, palette des graphiques et logo. Posez un thème sur un dossier : ses sous-dossiers, questions et tableaux de bord en héritent, et leurs PDF le portent.',
        )}
        actions={
          open === null ? (
            <Button onClick={() => setOpen('new')}>
              <Plus /> {$t('Nouveau thème')}
            </Button>
          ) : null
        }
      />
      {open !== null ? (
        <Editor theme={open === 'new' ? null : open} onDone={() => setOpen(null)} />
      ) : themes.length === 0 ? (
        <Empty icon={<Palette className="size-5" />} title={$t('Aucun thème pour l’instant')}>
          {$t('Créez la charte de votre entreprise, puis posez-la sur un dossier.')}
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((t) => (
            <button key={t.id} type="button" onClick={() => setOpen(t)} className="text-left">
              <ThemeScope
                theme={t.settings}
                className="theme-card h-full space-y-3 rounded-xl border p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-center gap-2">
                  <ThemeLogo
                    theme={{ ...t.settings, logo_height: 24 }}
                    className="object-contain"
                  />
                  <span className="theme-title truncate text-base font-semibold">{t.name}</span>
                </div>
                <div className="flex gap-1">
                  {schemeColors(t.settings.scheme, t.settings.colors, false, 6)
                    .slice(0, 6)
                    .map((c) => (
                      <span key={c} className="h-6 flex-1 rounded" style={{ background: c }} />
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {[t.settings.font_heading, t.settings.font_body].filter(Boolean).join(' · ') ||
                    $t('Polices de l’application')}
                </p>
              </ThemeScope>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ThemesPage() {
  return (
    <AdminOnly>
      <ThemesScreen />
    </AdminOnly>
  )
}
