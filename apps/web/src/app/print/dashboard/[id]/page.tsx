'use client'

import { valueLabel } from '@/components/app/dashboard/parameters'
import { substitute } from '@/components/app/dashboard/view'
import { LookIcon } from '@/components/app/look'
import { Visualization } from '@/components/app/visualization'
import { Button } from '@/components/ui/button'
import { type RunResult, api } from '@/lib/api'
import { $t, intlLocale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useDashboard } from '@/lib/queries'
import { ThemeLogo, ThemeScope } from '@/lib/theme'
import {
  DASHBOARD_COLUMNS,
  DASHBOARD_ROW_HEIGHT,
  type Dashboard,
  type DashboardCard,
  type ExportOptions,
  type PaperSize,
  type ThemeSettings,
  type Visualization as Viz,
} from '@eodia/contracts'
import { useQueries } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, use, useEffect, useMemo, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Un tableau de bord mis en pages pour l'imprimer ou l'enregistrer en PDF : une page de garde
 * à son thème, puis ses cartes, onglet après onglet, sur des pages A4 — une rangée de cartes ne
 * se coupe jamais —, et en pied de chaque page la mention du thème et le numéro de page.
 * Les graphiques sont dessinés en SVG, sans animation : nets à toute taille.
 */

type Values = Record<string, unknown>

// Each paper at 96 dpi, less 12 mm margins, less the footer.
const PAGES: Record<PaperSize, Record<'landscape' | 'portrait', { w: number; h: number }>> = {
  A4: { landscape: { w: 1032, h: 640 }, portrait: { w: 703, h: 980 } },
  A3: { landscape: { w: 1496, h: 969 }, portrait: { w: 1032, h: 1433 } },
  Letter: { landscape: { w: 965, h: 662 }, portrait: { w: 725, h: 902 } },
}

/** What one clicks — filter panes, buttons, variables, links — and what only a screen shows. */
const INTERACTIVE = new Set<DashboardCard['kind']>(['filter', 'buttons', 'variable', 'link', 'summary'])

declare global {
  interface Window {
    /** Set once every card is drawn: the renderer waits for it before taking the picture. */
    __eodiaReady?: boolean
  }
}
const GAP = 12
/** The foot of each page: its words, the logo, its number. */
const FOOTER = 36

interface Band {
  readonly top: number
  readonly bottom: number
  readonly cards: DashboardCard[]
}

/** Cards in horizontal bands no card crosses: a page break can only fall between two bands. */
function bands(cards: readonly DashboardCard[]): Band[] {
  const sorted = [...cards].sort((a, b) => a.y - b.y || a.x - b.x)
  const out: Band[] = []
  for (const c of sorted) {
    const last = out[out.length - 1]
    if (last && c.y < last.bottom) {
      last.cards.push(c)
      ;(last as { bottom: number }).bottom = Math.max(last.bottom, c.y + c.h)
    } else out.push({ top: c.y, bottom: c.y + c.h, cards: [c] })
  }
  return out
}

/** Bands gathered into pages, each as many as fit; a band taller than a page gets one of its own. */
function pages(list: Band[], rowPx: number, pageH: number): Band[][] {
  const out: Band[][] = []
  let current: Band[] = []
  let used = 0
  for (const b of list) {
    const h = (b.bottom - b.top) * rowPx + GAP
    if (current.length && used + h > pageH) {
      out.push(current)
      current = []
      used = 0
    }
    current.push(b)
    used += h
  }
  if (current.length) out.push(current)
  return out
}

function PrintCard({
  card,
  result,
  error,
  viz,
  title,
  values,
  dashboard,
}: {
  card: DashboardCard
  result?: RunResult
  error?: Error | null
  viz: Viz
  title: string
  values: Values
  dashboard: Dashboard
}) {
  if (card.kind === 'heading') {
    return (
      <h2 className="theme-title flex h-full items-end pb-1 text-xl font-semibold tracking-tight">
        {substitute(card.text ?? '', dashboard.parameters, values as never)}
      </h2>
    )
  }
  if (card.kind === 'separator') {
    return (
      <div className="flex h-full items-center">
        <div className="h-px w-full bg-border" />
      </div>
    )
  }
  if (card.kind === 'image') {
    const src = card.image?.url ?? ''
    return /^(https?:\/\/|data:image\/)/i.test(src) ? (
      <img src={src} alt={card.image?.alt ?? ''} className="h-full w-full rounded-xl" style={{ objectFit: card.image?.fit ?? 'contain' }} />
    ) : null
  }
  return (
    <div className="theme-card flex h-full flex-col overflow-hidden rounded-xl border bg-card">
      {title && card.kind !== 'text' ? (
        <div className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-1">
          {card.icon ? (
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
              <LookIcon name={card.icon} className="size-3.5" />
            </span>
          ) : null}
          <h3 className="theme-title truncate text-[14px] font-semibold">{title}</h3>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 px-3 pb-3">
        {card.kind === 'text' ? (
          <div className="prose-sm h-full overflow-hidden p-1 text-sm leading-relaxed text-muted-foreground [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_li]:ml-4 [&_strong]:text-foreground [&_ul]:list-disc">
            <Markdown remarkPlugins={[remarkGfm]}>
              {substitute(card.text ?? '', dashboard.parameters, values as never)}
            </Markdown>
          </div>
        ) : card.kind === 'embed' ? (
          <p className="pt-6 text-center text-xs text-muted-foreground">{card.url}</p>
        ) : error ? (
          <p className="pt-6 text-center text-xs text-destructive">{error.message}</p>
        ) : result ? (
          <Visualization
            result={result}
            viz={{ ...viz, settings: { ...(viz.settings ?? {}), race_autoplay: false } }}
            compact
          />
        ) : null}
      </div>
    </div>
  )
}

function PrintScreen({ id }: { id: string }) {
  const params = useSearchParams()
  const { data: dashboard, error } = useDashboard(id)
  const values = useMemo<Values>(() => {
    try {
      return JSON.parse(params.get('values') ?? '{}') as Values
    } catch {
      return {}
    }
  }, [params])
  // How the dashboard goes on paper: the export's choices (`options`), the theme's elsewhere.
  const options = useMemo<ExportOptions>(() => {
    try {
      const parsed = JSON.parse(params.get('options') ?? '{}') as ExportOptions
      const tab = params.get('tab')
      return tab && !parsed.tabs ? { ...parsed, tabs: [tab] } : parsed
    } catch {
      return {}
    }
  }, [params])
  const chosenTabs = options.tabs?.length ? new Set(options.tabs) : null
  const inTabs = (c: DashboardCard) => !chosenTabs || !dashboard?.tabs.length || (c.tab !== null && chosenTabs.has(c.tab))
  const shown = (c: DashboardCard) => inTabs(c) && (options.interactive || !INTERACTIVE.has(c.kind))
  // Opened by the renderer: no toolbar, and for a picture, the pages as a screen shows them.
  const rendering = params.has('render')
  const screen = params.get('screen') === '1'

  useEffect(() => {
    if (dashboard) document.title = options.title?.trim() || dashboard.name
  }, [dashboard, options.title])

  // A printed page is light, whatever the screen's mode.
  useEffect(() => {
    const html = document.documentElement
    const dark = html.classList.contains('dark')
    html.classList.remove('dark')
    return () => {
      if (dark) html.classList.add('dark')
    }
  }, [])

  const questionCards = (dashboard?.cards ?? []).filter((c) => c.kind === 'question' && shown(c))
  const runs = useQueries({
    queries: questionCards.map((card) => ({
      queryKey: ['print-card', id, card.id, values],
      queryFn: () =>
        api.post<RunResult>(`/v1/dashboards/${id}/cards/${card.id}/run`, { values, fresh: false }),
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    })),
  })
  // A card shows its question the question's way, under its name, unless it says otherwise.
  const asked = questionCards.filter((c) => c.question)
  const questions = useQueries({
    queries: asked.map((card) => ({
      queryKey: ['question', card.question],
      queryFn: () =>
        api.get<{ name: string; visualization: Viz }>(`/v1/questions/${card.question}`),
      staleTime: 60_000,
    })),
  })
  const questionOf = new Map(asked.map((c, i) => [c.id, questions[i]?.data]))
  const ready =
    !!dashboard && runs.every((r) => !r.isPending) && questions.every((q) => !q.isPending)

  // Prints once every chart is drawn — on demand afterwards.
  const printed = useRef(false)
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    if (!ready || printed.current) return
    const t = setTimeout(() => {
      setDrawn(true)
      window.__eodiaReady = true
      if (params.get('auto') !== '0') {
        printed.current = true
        window.print()
      }
    }, 900)
    return () => clearTimeout(t)
  }, [ready, params])

  if (error) return <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>
  if (!dashboard)
    return <Loader2 className="m-auto mt-20 size-5 animate-spin text-muted-foreground" />

  const theme = dashboard.resolved_theme
  const s: ThemeSettings = theme?.settings ?? {}
  const orientation = options.orientation ?? s.pdf_orientation ?? 'landscape'
  const paper = options.paper ?? 'A4'
  const page = PAGES[paper][orientation]
  const cover = options.cover ?? s.pdf_cover !== false
  const title = options.title?.trim() || dashboard.name
  const tabTitles = options.tab_titles !== false
  const colPx = (page.w + GAP) / DASHBOARD_COLUMNS
  const rowPx = DASHBOARD_ROW_HEIGHT + 14
  const tabs = dashboard.tabs.length
    ? dashboard.tabs.filter((t) => !chosenTabs || chosenTabs.has(t.id)).map((t) => (tabTitles ? t : { ...t, label: '' }))
    : [{ id: null as string | null, label: '' }]
  const resultOf = new Map(questionCards.map((c, i) => [c.id, runs[i]]))
  const date = new Intl.DateTimeFormat(intlLocale(), {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date())
  const filters = (options.filters === false ? [] : dashboard.parameters)
    .filter((p) => values[p.id] !== null && values[p.id] !== undefined && values[p.id] !== '')
    // As the filter bar says them: « 12 derniers mois », not `past12months`.
    .map((p) => `${p.label || p.id} : ${valueLabel(p, values[p.id] as never)}`)
  // Every page, counted before any is drawn: its number, and how many there are.
  const sheets = tabs.flatMap((tab, ti) => {
    const cards = dashboard.cards.filter((c) => (tab.id ? c.tab === tab.id : true) && shown(c))
    return pages(bands(cards), rowPx, page.h - (tab.label ? 44 : 0)).map((group, pi) => ({ tab, ti, pi, group }))
  })
  const font = s.font_body ? `'${s.font_body}', sans-serif` : 'sans-serif'

  return (
    <ThemeScope theme={theme} still className="min-h-screen bg-background">
      <style>{`
        @page {
          size: ${paper} ${orientation};
          /* No margin: the browser has nowhere to write its own header and footer (title, address). */
          margin: 0;
        }
        @media print {
          html, body { background: ${s.background ?? '#ffffff'} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .screen-only { display: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; padding: 12mm 12mm 10mm !important; box-sizing: content-box !important; border-radius: 0 !important; }
        }
        .sheet { width: ${page.w}px; break-after: page; }
        .sheet .table-search { display: none; }
        .sheet:last-child { break-after: auto; }
        ${rendering ? '.screen-only { display: none !important; }' : ''}
        ${screen ? '.sheet { box-shadow: none !important; }' : ''}
      `}</style>

      <div className="screen-only sticky top-0 z-10 flex items-center gap-3 border-b bg-background/90 px-6 py-3 backdrop-blur">
        <Button asChild size="sm" variant="ghost">
          <Link href={`/dashboard/${id}`}>
            <ArrowLeft /> {$t('Retour au tableau de bord')}
          </Link>
        </Button>
        <span className="flex-1 text-xs text-muted-foreground">
          {drawn
            ? $t(
                'Choisissez « Enregistrer au format PDF » comme destination pour obtenir le fichier.',
              )
            : $t('Préparation des graphiques…')}
        </span>
        <Button size="sm" onClick={() => window.print()} disabled={!drawn}>
          {drawn ? <Printer /> : <Loader2 className="animate-spin" />}{' '}
          {$t('Imprimer ou enregistrer en PDF')}
        </Button>
      </div>

      <div className={cn('flex flex-col items-center print:block print:py-0', screen ? 'gap-0 py-4' : 'gap-8 py-8')}>
        {cover ? (
          <section
            className="sheet flex flex-col justify-between rounded-sm bg-[var(--theme-bg,var(--background))] p-12 shadow-lg"
            style={{ height: page.h }}
          >
            <ThemeLogo
              theme={{ ...s, logo_height: Math.max(48, (s.logo_height ?? 32) * 1.8) }}
              className="self-start object-contain"
            />
            <div className="space-y-4">
              <h1 className="theme-title text-5xl leading-tight font-semibold tracking-tight">
                {title}
              </h1>
              {dashboard.description ? (
                <p className="max-w-2xl text-lg text-muted-foreground">{dashboard.description}</p>
              ) : null}
              <div className="h-1 w-24 rounded-full bg-primary" />
              {options.note ? <p className="max-w-2xl pt-2 text-base whitespace-pre-wrap">{options.note}</p> : null}
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>{date}</p>
              {filters.length ? (
                <p>{$t('Filtres : {filters}', { filters: filters.join(' · ') })}</p>
              ) : null}
              {chosenTabs && dashboard.tabs.length > 1 ? (
                <p>{dashboard.tabs.filter((t) => chosenTabs.has(t.id)).map((t) => t.label).join(' · ')}</p>
              ) : null}
            </div>
          </section>
        ) : null}

        {sheets.map(({ tab, ti, pi, group }, k) => {
          {
            const top = group[0]?.top ?? 0
            const rows = (group[group.length - 1]?.bottom ?? 0) - top
            // A band taller than the page is shrunk to fit it.
            const scale = Math.min(
              1,
              (page.h - (tab.label && pi === 0 ? 44 : 0)) / Math.max(rows * rowPx, 1),
            )
            return (
              <section
                key={`${tab.id ?? 'all'}-${pi}`}
                className="sheet relative overflow-hidden rounded-sm bg-[var(--theme-bg,var(--background))] p-0 shadow-lg print:shadow-none"
                style={{ height: page.h + FOOTER }}
              >
                {tab.label && pi === 0 ? (
                  <h2 className="theme-title mb-4 text-2xl font-semibold tracking-tight">
                    {tab.label}
                  </h2>
                ) : null}
                {pi === 0 && ti === 0 && !cover ? (
                  <div className="mb-4 flex items-center gap-3">
                    <ThemeLogo theme={s} className="object-contain" />
                    <h1 className="theme-title flex-1 text-2xl font-semibold tracking-tight">
                      {title}
                    </h1>
                    <span className="text-xs text-muted-foreground">{date}</span>
                  </div>
                ) : null}
                <div className="relative" style={{ height: rows * rowPx * scale }}>
                  {group
                    .flatMap((b) => b.cards)
                    .map((card) => {
                      const run = resultOf.get(card.id)
                      const data = run?.data
                      const question = questionOf.get(card.id)
                      const viz = (card.visualization ??
                        question?.visualization ?? { type: 'table' }) as Viz
                      return (
                        <div
                          key={card.id}
                          className="absolute"
                          style={{
                            left: card.x * colPx,
                            top: (card.y - top) * rowPx * scale,
                            width: card.w * colPx - GAP,
                            height: card.h * rowPx * scale - GAP,
                          }}
                        >
                          <PrintCard
                            card={card}
                            result={data}
                            error={run?.error as Error | null}
                            viz={viz}
                            title={card.title || question?.name || ''}
                            values={values}
                            dashboard={dashboard}
                          />
                        </div>
                      )
                    })}
                </div>
                {/* The foot of the page: the theme's words on the left; its logo and the page's number on the right, on one line. */}
                <footer className="absolute inset-x-0 bottom-0 flex items-center gap-3 text-[8pt] text-muted-foreground" style={{ height: FOOTER - 8, fontFamily: font }}>
                  <span className="min-w-0 flex-1 truncate">{s.pdf_footer ?? ''}</span>
                  {s.logo ? <img src={s.logo} alt="" className="h-4 w-auto object-contain" /> : null}
                  {options.page_numbers !== false ? (
                    <span className="tabular-nums">
                      {k + 1 + (cover ? 1 : 0)} / {sheets.length + (cover ? 1 : 0)}
                    </span>
                  ) : null}
                </footer>
              </section>
            )
          }
        })}
      </div>
    </ThemeScope>
  )
}

export default function PrintDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <Suspense>
      <PrintScreen id={id} />
    </Suspense>
  )
}
