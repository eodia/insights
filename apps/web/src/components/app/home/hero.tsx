'use client'

import { Orb } from '@/components/app/assistant/orb'
import { $t } from '@/lib/i18n'
import { ArrowUp, Database } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Exploration, insightPrompt, insightTitle, useInsights } from './exploration'

/**
 * The top of the home page, on a dark ground whatever the theme: a greeting and the field
 * that opens the assistant on a question, its suggestions drawn from the figures found, and
 * on the right the exploration itself.
 */
export function HomeHero({ firstName, ai }: { firstName: string; ai: boolean }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const { data: insights = [] } = useInsights()
  const ask = (q: string) => {
    const m = q.trim()
    if (m) router.push(`/assistant?q=${encodeURIComponent(m)}`)
  }
  const hello = new Date().getHours() < 18 ? $t('Bonjour {name}.', { name: firstName }) : $t('Bonsoir {name}.', { name: firstName })
  const suggestions = [
    { label: $t('Que puis-je analyser ?'), prompt: $t('Que puis-je analyser dans mes données ?') },
    ...insights.slice(0, 3).map((i) => ({ label: $t('Évolution de « {title} »', { title: insightTitle(i) }), prompt: insightPrompt(i) })),
  ]

  return (
    <section className="relative overflow-hidden rounded-[28px] bg-[#0A0F0D] bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:36px_36px] shadow-[0_30px_60px_-30px_rgba(10,15,13,0.55)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-[30%] -left-[8%] h-[420px] w-[620px] animate-[home-drift_14s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,rgba(46,160,67,0.42),transparent)] blur-xl" />
        <div className="absolute -right-[10%] -bottom-[35%] h-[460px] w-[560px] animate-[home-drift_18s_ease-in-out_infinite_reverse] rounded-full bg-[radial-gradient(closest-side,rgba(124,92,255,0.38),transparent)] blur-2xl" />
      </div>
      <div className="relative grid items-center gap-10 p-7 md:p-10 lg:grid-cols-2 xl:p-13">
        <div className="flex flex-col gap-5 text-white">
          <div className="flex items-center gap-2.5 self-start rounded-full border border-white/10 bg-white/[0.06] py-1.5 pr-3 pl-2 text-[13px] text-white/80">
            <Orb size={16} />
            {ai ? $t('Assistant IA · interrogez vos données en français') : $t('Vos données, explorées pour vous')}
          </div>
          <h1 className="text-[clamp(40px,5vw,64px)] leading-none font-semibold tracking-[-0.035em]">
            {hello}
            <br />
            <span className="bg-gradient-to-r from-[#6EE7A0] to-[#A78BFA] bg-clip-text text-transparent">{$t('Que voulez-vous savoir ?')}</span>
          </h1>
          <p className="max-w-[480px] text-[17px] leading-normal text-pretty text-white/65">
            {ai
              ? $t('Posez votre question. L’assistant trouve les bonnes tables, écrit le SQL et vous répond en chiffres et en graphiques.')
              : $t('Vos chiffres clés sont calculés à chaque visite, sous vos droits, dans les tables que vous pouvez lire.')}
          </p>
          {ai ? (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  ask(text)
                }}
                className="rounded-[18px] bg-gradient-to-br from-[#6EE7A0]/75 via-white/10 to-[#A78BFA]/80 p-px shadow-[0_0_0_6px_rgba(110,231,160,0.05),0_20px_50px_-20px_rgba(110,231,160,0.35)]"
              >
                <div className="flex flex-col gap-3.5 rounded-[17px] bg-[#0E1613]/95 px-4 pt-4 pb-3">
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={$t('Demandez n’importe quoi sur vos données…')}
                    aria-label={$t('Votre question')}
                    className="w-full bg-transparent text-[17px] text-white caret-[#6EE7A0] outline-none placeholder:text-white/45"
                  />
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-7.5 items-center gap-1.5 rounded-full border border-white/12 px-3 text-[13px] text-white/75">
                      <Database className="size-3.5" /> {$t('Toutes les sources')}
                    </span>
                    <span className="flex-1 text-right text-xs text-white/45">{$t('Entrée pour envoyer')}</span>
                    <button
                      type="submit"
                      aria-label={$t('Envoyer')}
                      className="inline-flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#5BE37D] to-[#2EA043] text-[#06210F] shadow-[0_4px_16px_rgba(91,227,125,0.4)] transition-transform hover:scale-105"
                    >
                      <ArrowUp className="size-4.5" strokeWidth={2.4} />
                    </button>
                  </div>
                </div>
              </form>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => ask(s.prompt)}
                    className="rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-[13.5px] text-white/80 transition-colors hover:border-[#6EE7A0]/45 hover:bg-[#6EE7A0]/12 hover:text-white"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
        <Exploration ai={ai} />
      </div>
    </section>
  )
}
