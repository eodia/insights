'use client'

import type { HomeInsight } from '@eodia/contracts'
import { Orb } from '@/components/app/assistant/orb'
import { stashDraft } from '@/components/app/copilot'
import { api } from '@/lib/api'
import { formatValue, parseDate } from '@/lib/format'
import { $t, $tp, intlLocale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Check, Code2, Database, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

/** The key figures the API found by itself, under the reader's identity. */
export const useInsights = () =>
  useQuery({
    queryKey: ['home-insights'],
    queryFn: () => api.get<HomeInsight[]>('/v1/home/insights'),
    staleTime: 300_000,
  })

/** What the figure is called: the column read, or the table counted. */
export const insightTitle = (i: HomeInsight) => i.column?.label ?? i.table.label

/** The question one may ask the assistant about a figure. */
export const insightPrompt = (i: HomeInsight) =>
  $t('Analyse l’évolution de « {title} » ({table}) mois par mois', {
    title: insightTitle(i),
    table: i.table.label,
  })

const CYCLE_MS = 7000

function Spinner() {
  return (
    <span className="size-3 animate-spin rounded-full border-2 border-emerald-300/25 border-t-emerald-300" />
  )
}

/**
 * The right half of the home hero: the base explored without being asked — the tables read,
 * the SQL written, the figures computed — then one figure after another, each one a click
 * away from a question or from the assistant.
 */
export function Exploration({ ai }: { ai: boolean }) {
  const router = useRouter()
  const { data: insights, isPending, isError } = useInsights()
  const [step, setStep] = useState(0)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const steps = [$t('Lecture des tables'), $t('Écriture du SQL'), $t('Calcul des chiffres clés')]
  const list = insights ?? []
  const current = list[index % Math.max(list.length, 1)]

  // While the API works, the steps light up one after the other — the last one waits for it.
  useEffect(() => {
    if (!isPending) return
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, 2)), 700)
    return () => clearInterval(timer)
  }, [isPending])
  // biome-ignore lint/correctness/useExhaustiveDependencies: each new figure restarts the count
  useEffect(() => {
    if (paused || list.length < 2) return
    const timer = setTimeout(() => setIndex((i) => (i + 1) % list.length), CYCLE_MS)
    return () => clearTimeout(timer)
  }, [index, paused, list.length])

  const status = isPending
    ? $t('Analyse…')
    : isError
      ? $t('Indisponible')
      : $tp(list.length, '{count} chiffre clé', '{count} chiffres clés')

  return (
    <div
      className="flex min-h-[460px] flex-col gap-4 rounded-[22px] border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.025] p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="flex items-center gap-2.5">
        <Orb size={24} busy={isPending} />
        <div className="flex-1 text-sm font-semibold">{$t('Exploration automatique')}</div>
        <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-xs text-emerald-200">
          {status}
        </span>
      </div>

      <ul className="space-y-2">
        {steps.map((label, i) => {
          const done = !isPending || i < step
          const active = isPending && i === step
          return (
            <li
              key={label}
              className={cn(
                'flex items-center gap-2.5 font-mono text-[12.5px] text-white/75 transition-opacity',
                done || active ? 'opacity-100' : 'opacity-35',
              )}
            >
              <span className="flex size-4 items-center justify-center">
                {done ? (
                  <Check className="size-3.5 text-emerald-300" strokeWidth={2.6} />
                ) : active ? (
                  <Spinner />
                ) : (
                  <span className="size-1.5 rounded-full bg-white/40" />
                )}
              </span>
              {label}
            </li>
          )
        })}
      </ul>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {isPending ? (
          <div className="flex flex-1 flex-col gap-2.5">
            <div className="h-3 w-2/5 animate-pulse rounded-md bg-white/10" />
            <div className="h-8 w-1/2 animate-pulse rounded-lg bg-white/10" />
            <div className="flex-1 animate-pulse rounded-xl bg-white/5" />
          </div>
        ) : current ? (
          <Figure key={current.id} insight={current} />
        ) : (
          <div className="m-auto max-w-xs space-y-2 text-center text-sm text-white/60">
            <Sparkles className="mx-auto size-5 text-violet-300" />
            <p>
              {isError
                ? $t('L’exploration n’a pas pu aboutir.')
                : $t('Aucune table avec une date et une mesure à suivre pour l’instant.')}
            </p>
            {!isError ? (
              <Link
                href="/data"
                className="inline-block text-emerald-300 hover:text-emerald-200"
              >
                {$t('Décrire les colonnes des sources de données')}
              </Link>
            ) : null}
          </div>
        )}
      </div>

      {current ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto flex gap-1.5" role="tablist" aria-label={$t('Chiffres clés')}>
            {list.map((i, n) => (
              <button
                key={i.id}
                type="button"
                role="tab"
                aria-selected={n === index % list.length}
                aria-label={insightTitle(i)}
                title={insightTitle(i)}
                onClick={() => setIndex(n)}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  n === index % list.length
                    ? 'w-5 bg-emerald-300'
                    : 'w-1.5 bg-white/25 hover:bg-white/50',
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              stashDraft({
                name: insightTitle(current),
                query: {
                  ...current.query,
                  sort: [{ target: { kind: 'breakout', index: 0 } }],
                  limit: null,
                },
                visualization: { type: current.fn === 'avg' ? 'line' : 'bar' },
              })
              router.push('/question/new?draft=1')
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            {$t('Ouvrir en question')} <ArrowUpRight className="size-3.5" />
          </button>
          {ai ? (
            <Link
              href={`/assistant?q=${encodeURIComponent(insightPrompt(current))}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/30 bg-violet-300/10 px-3 py-1.5 text-xs text-violet-100 transition-colors hover:bg-violet-300/20"
            >
              <Sparkles className="size-3.5" /> {$t('Demander à l’assistant')}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Figure({ insight: i }: { insight: HomeInsight }) {
  const max = Math.max(...i.points.map((p) => Math.abs(p.value)), 1)
  // parseDate reads the day in local time: so is it said.
  const month = new Intl.DateTimeFormat(intlLocale(), { month: 'narrow' })
  const span = (p: unknown) => formatValue(p, i.period_column)
  const first = i.points[0]
  const last = i.points[i.points.length - 1]
  const caption =
    i.fn === 'sum' ? $t('Total') : i.fn === 'avg' ? $t('Moyenne') : $t('Nombre de lignes')
  const up = (i.delta ?? 0) >= 0
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[12.5px] text-white/55">
            <Database className="size-3" />
            <span className="truncate">
              {i.table.label} · {caption} ·{' '}
              {first && last ? `${span(first.period)} – ${span(last.period)}` : ''}
            </span>
          </div>
          <div className="truncate text-sm font-medium text-white/85">{insightTitle(i)}</div>
          <div className="text-[34px] leading-tight font-semibold tracking-tight tabular-nums">
            {formatValue(
              i.value,
              i.value_column,
              i.fn === 'avg' ? { decimals: 2 } : { compact: true },
            )}
          </div>
        </div>
        {i.delta !== null ? (
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-[12.5px] tabular-nums',
              up ? 'bg-emerald-300/15 text-emerald-200' : 'bg-rose-300/15 text-rose-200',
            )}
          >
            {new Intl.NumberFormat(intlLocale(), {
              style: 'percent',
              signDisplay: 'always',
              maximumFractionDigits: 1,
            }).format(i.delta)}{' '}
            {$t('vs mois précédent')}
          </span>
        ) : null}
      </div>
      <div className="relative min-h-24 flex-1 border-b border-white/10">
        <div className="absolute inset-0 flex items-end gap-1.5 pt-1.5">
          {i.points.map((p, n) => (
            <div
              key={String(p.period)}
              title={`${span(p.period)} · ${formatValue(p.value, i.value_column)}`}
              className={cn(
                'flex-1 rounded-t-md rounded-b-[2px] transition-[height] duration-700',
                n === i.points.length - 1
                  ? 'bg-gradient-to-b from-emerald-200 to-emerald-600'
                  : 'bg-gradient-to-b from-emerald-300/45 to-emerald-600/20',
              )}
              style={{
                height: `${Math.max(3, (Math.abs(p.value) / max) * 100)}%`,
                transitionDelay: `${n * 40}ms`,
              }}
            />
          ))}
        </div>
      </div>
      <div className="-mt-1.5 flex gap-1.5">
        {i.points.map((p) => {
          const d = typeof p.period === 'string' ? parseDate(p.period) : null
          return (
            <span
              key={String(p.period)}
              className="flex-1 truncate text-center text-[10.5px] text-white/45"
            >
              {d ? month.format(d) : ''}
            </span>
          )
        })}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/35 px-2.5 py-2">
        <Code2 className="size-3.5 shrink-0 text-violet-300" />
        <code className="truncate font-mono text-[11.5px] text-white/70">
          {i.sql.replace(/\s+/g, ' ')}
        </code>
      </div>
    </div>
  )
}
