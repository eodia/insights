'use client'

import { substitute } from '@/components/app/dashboard/view'
import { Visualization } from '@/components/app/visualization'
import { Button } from '@/components/ui/button'
import { type RunResult, api } from '@/lib/api'
import { $t, intlLocale } from '@/lib/i18n'
import { useDashboard } from '@/lib/queries'
import { ThemeLogo, ThemeScope } from '@/lib/theme'
import {
  DASHBOARD_COLUMNS,
  DASHBOARD_ROW_HEIGHT,
  type Dashboard,
  type DashboardCard,
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

// A4 at 96 dpi, less 12 mm margins, less the footer.
const PAGE = { landscape: { w: 1032, h: 640 }, portrait: { w: 703, h: 980 } } as const
const GAP = 12

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
  return (
    <div className="theme-card flex h-full flex-col overflow-hidden rounded-xl border bg-card">
      {title && card.kind !== 'text' ? (
        <h3 className="theme-title shrink-0 truncate px-4 pt-3 pb-1 text-[14px] font-semibold">
          {title}
        </h3>
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
  const onlyTab = params.get('tab')

  // A printed page is light, whatever the screen's mode.
  useEffect(() => {
    const html = document.documentElement
    const dark = html.classList.contains('dark')
    html.classList.remove('dark')
    return () => {
      if (dark) html.classList.add('dark')
    }
  }, [])

  const questionCards = (dashboard?.cards ?? []).filter(
    (c) => c.kind === 'question' && (!onlyTab || c.tab === onlyTab),
  )
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
  const orientation = s.pdf_orientation ?? 'landscape'
  const page = PAGE[orientation]
  const colPx = (page.w + GAP) / DASHBOARD_COLUMNS
  const rowPx = DASHBOARD_ROW_HEIGHT + 14
  const tabs = dashboard.tabs.length
    ? dashboard.tabs.filter((t) => !onlyTab || t.id === onlyTab)
    : [{ id: null as string | null, label: '' }]
  const resultOf = new Map(questionCards.map((c, i) => [c.id, runs[i]]))
  const date = new Intl.DateTimeFormat(intlLocale(), {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date())
  const filters = dashboard.parameters
    .filter((p) => values[p.id] !== null && values[p.id] !== undefined && values[p.id] !== '')
    .map(
      (p) =>
        `${p.label} : ${Array.isArray(values[p.id]) ? (values[p.id] as unknown[]).join(', ') : String(values[p.id])}`,
    )
  const footer = (s.pdf_footer ?? '').replace(/["\\]/g, '\\$&').replace(/\n/g, ' ')
  const font = s.font_body ? `'${s.font_body}', sans-serif` : 'sans-serif'

  return (
    <ThemeScope theme={theme} still className="min-h-screen bg-background">
      <style>{`
        @page {
          size: A4 ${orientation};
          margin: 12mm 12mm 14mm;
          @bottom-left { content: "${footer || dashboard.name.replace(/["\\]/g, '\\$&')}"; font: 8pt ${font}; color: #71717a; }
          @bottom-right { content: counter(page) " / " counter(pages); font: 8pt ${font}; color: #71717a; }
        }
        @media print {
          html, body { background: ${s.background ?? '#ffffff'} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .screen-only { display: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; }
        }
        .sheet { width: ${page.w}px; break-after: page; }
        .sheet:last-child { break-after: auto; }
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

      <div className="flex flex-col items-center gap-8 py-8 print:block print:py-0">
        {s.pdf_cover !== false ? (
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
                {dashboard.name}
              </h1>
              {dashboard.description ? (
                <p className="max-w-2xl text-lg text-muted-foreground">{dashboard.description}</p>
              ) : null}
              <div className="h-1 w-24 rounded-full bg-primary" />
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>{date}</p>
              {filters.length ? (
                <p>{$t('Filtres : {filters}', { filters: filters.join(' · ') })}</p>
              ) : null}
              {onlyTab ? <p>{dashboard.tabs.find((t) => t.id === onlyTab)?.label}</p> : null}
            </div>
          </section>
        ) : null}

        {tabs.flatMap((tab, ti) => {
          const cards = dashboard.cards.filter((c) => (tab.id ? c.tab === tab.id : true))
          return pages(bands(cards), rowPx, page.h - (tab.label ? 44 : 0)).map((group, pi) => {
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
                className="sheet rounded-sm bg-[var(--theme-bg,var(--background))] p-0 shadow-lg print:shadow-none"
              >
                {tab.label && pi === 0 ? (
                  <h2 className="theme-title mb-4 text-2xl font-semibold tracking-tight">
                    {tab.label}
                  </h2>
                ) : null}
                {!tab.label && pi === 0 && ti === 0 && s.pdf_cover === false ? (
                  <div className="mb-4 flex items-center gap-3">
                    <ThemeLogo theme={s} className="object-contain" />
                    <h1 className="theme-title flex-1 text-2xl font-semibold tracking-tight">
                      {dashboard.name}
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
              </section>
            )
          })
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
