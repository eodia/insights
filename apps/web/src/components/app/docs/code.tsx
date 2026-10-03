'use client'

import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Check, Copy } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { TabRow } from '@/components/ui/tab-row'

export async function copyText(text: string, message = $t('Copié dans le presse-papiers.')): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(message)
  } catch {
    toast.error($t('Copie impossible : sélectionnez le texte à la main.'))
  }
}

export function CopyButton({ text, className, label }: { text: string; className?: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await copyText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
      className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors', className)}
      aria-label={label ?? $t('Copier')}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {label ? <span>{label}</span> : null}
    </button>
  )
}

// A few colours are enough to read a request: strings, numbers, keywords, flags, comments.
// A comment starts a line or follows a space: `http://…` and `#anchor` stay as they are.
const TOKEN = /((?<=^|\s)(?:\/\/|#)[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\$\{?[A-Z_]+\}?)|(\s-{1,2}[A-Za-z-]+)|\b(curl|const|await|async|fetch|return|true|false|null|export|npx|claude)\b|(\b\d+(?:\.\d+)?\b)/gm

function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of code.matchAll(TOKEN)) {
    const index = m.index ?? 0
    if (index > last) out.push(code.slice(last, index))
    const [whole, comment, string, variable, flag, keyword, number] = m
    const cls = comment
      ? 'text-code-foreground/45 italic'
      : string
        ? 'text-emerald-300'
        : variable
          ? 'text-amber-300'
          : flag
            ? 'text-sky-300'
            : keyword
              ? 'text-violet-300'
              : number
                ? 'text-orange-300'
                : ''
    out.push(
      <span key={key++} className={cls}>
        {whole}
      </span>,
    )
    last = index + whole.length
  }
  if (last < code.length) out.push(code.slice(last))
  return out
}

/** A dark code block with a copy button; it sits on `bg-code` panels and pages alike. */
export function CodeBlock({ code, title, className }: { code: string; title?: string; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-code-border bg-code text-code-foreground', className)}>
      <div className="flex h-9 items-center gap-2 border-b border-code-border px-3">
        <span className="flex-1 truncate text-[11px] font-semibold tracking-wide text-code-foreground/60 uppercase">{title ?? ''}</span>
        <CopyButton text={code} className="text-code-foreground/70 hover:bg-white/10 hover:text-code-foreground" />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed">
        <code>{highlight(code)}</code>
      </pre>
    </div>
  )
}

/** Tabs over code samples, styled for the dark panel. */
export function CodeTabs({ samples, className }: { samples: readonly { id: string; label: string; code: string }[]; className?: string }) {
  const [active, setActive] = useState(samples[0]?.id ?? '')
  const current = samples.find((s) => s.id === active) ?? samples[0]
  if (!current) return null
  return (
    <div className={cn('overflow-hidden rounded-xl border border-code-border bg-code text-code-foreground', className)}>
      <TabRow className="h-10 items-center gap-1 border-b border-code-border px-2">
        {samples.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActive(s.id)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              s.id === current.id ? 'bg-white/10 text-code-foreground' : 'text-code-foreground/55 hover:text-code-foreground',
            )}
          >
            {s.label}
          </button>
        ))}
        <span className="flex-1" />
        <CopyButton text={current.code} className="text-code-foreground/70 hover:bg-white/10 hover:text-code-foreground" />
      </TabRow>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed">
        <code>{highlight(current.code)}</code>
      </pre>
    </div>
  )
}
