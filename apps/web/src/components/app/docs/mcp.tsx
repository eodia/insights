'use client'

import { $t } from '@/lib/i18n'
import { Bot, KeyRound, Plug, ShieldCheck, Terminal } from 'lucide-react'
import { CopyButton } from './code'
import { Section } from './endpoint'
import { MCP_TOOLS, type McpTool, mcpUrl } from './mcp-tools'
import type { Selection } from './nav'

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-green-700 dark:text-primary">{n}</span>
      <div className="min-w-0 flex-1 space-y-1 pt-0.5">
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  )
}

export function McpSetup({ onSelect, onToken }: { onSelect: (s: Selection) => void; onToken: () => void }) {
  const url = mcpUrl()
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <div className="text-xs font-semibold tracking-wide text-primary uppercase">MCP</div>
        <h1 className="text-2xl font-semibold tracking-tight">{$t('Brancher un assistant')}</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {$t(
            "Le serveur MCP d'eodia insights donne à Claude, ou à tout client MCP, les mêmes données que vous : sources, tables, métriques, questions et tableaux de bord. Chaque requête passe par Trino sous les droits du propriétaire du jeton.",
          )}
        </p>
      </header>

      <div className="grid gap-3">
        <div className="rounded-xl border p-4">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{$t('Adresse (Streamable HTTP)')}</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-sm">{url}</code>
            <CopyButton text={url} className="text-muted-foreground hover:bg-muted hover:text-foreground" />
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{$t('En-tête')}</div>
          <code className="mt-2 block truncate font-mono text-sm">Authorization: Bearer eoi_…</code>
        </div>
      </div>

      <Section title={$t('En trois étapes')}>
        <ol className="space-y-5 rounded-xl border p-5">
          <Step n={1} title={$t('Créer un jeton avec la surface MCP')}>
            {$t('Un jeton MCP seul ne sert pas sur l’API REST : il ne vaut que pour les assistants.')}{' '}
            <button type="button" onClick={onToken} className="font-medium text-primary hover:underline">
              {$t('Créer un jeton')}
            </button>
          </Step>
          <Step n={2} title={$t('Déclarer le serveur dans le client')}>
            {$t('En HTTP avec l’en-tête Authorization, ou en stdio : le client lance alors')}{' '}
            <code className="font-mono text-xs text-foreground">npx tsx apps/mcp/src/server.ts --stdio</code>{' '}
            {$t('avec EODIA_URL et EODIA_TOKEN dans son environnement. Les configurations sont à droite.')}
          </Step>
          <Step n={3} title={$t('Poser une question')}>
            {$t('« Quel est le chiffre d’affaires par mois cette année ? » : l’assistant trouve la métrique, l’interroge et répond avec les chiffres que vous verriez dans l’application.')}
          </Step>
        </ol>
      </Section>

      <Section title={$t('Sécurité')}>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            {$t('Le serveur MCP ne détient aucun secret : il relaie le jeton de chaque appel à l’API.')}
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            {$t('run_sql est en lecture seule et s’exécute dans Trino : permissions de tables, colonnes masquées et règles de ligne s’appliquent.')}
          </li>
          <li className="flex gap-2">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" />
            {$t('Révoquez un jeton à tout moment depuis « Créer un jeton » : l’assistant perd l’accès immédiatement.')}
          </li>
        </ul>
      </Section>

      <Section title={$t('Outils')}>
        <div className="grid gap-2 sm:grid-cols-2">
          {MCP_TOOLS.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => onSelect({ kind: 'mcp-tool', name: t.name })}
              className="rounded-xl border p-3 text-left transition-colors hover:bg-muted/60"
            >
              <div className="flex items-center gap-2">
                <Bot className="size-4 text-muted-foreground" />
                <code className="font-mono text-[13px] font-semibold">{t.name}</code>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{$t(t.description)}</p>
            </button>
          ))}
        </div>
      </Section>
    </article>
  )
}

export function McpToolDetail({ tool }: { tool: McpTool }) {
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <div className="text-xs font-semibold tracking-wide text-primary uppercase">{$t('Outil MCP')}</div>
        <h1 className="text-2xl font-semibold tracking-tight">{$t(tool.title)}</h1>
        <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2">
          <Plug className="size-4 text-muted-foreground" />
          <code className="min-w-0 flex-1 truncate font-mono text-sm">{tool.name}</code>
          <CopyButton text={tool.name} className="text-muted-foreground hover:bg-muted hover:text-foreground" />
        </div>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{$t(tool.description)}</p>
      </header>

      <Section title={$t('Arguments')}>
        {tool.params.length ? (
          <ul className="divide-y rounded-xl border px-4">
            {tool.params.map((p) => (
              <li key={p.name} className="py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <code className="font-mono text-[13px] font-semibold">{p.name}</code>
                  <span className="font-mono text-xs text-muted-foreground">{p.type}</span>
                  {p.required ? <span className="text-[10px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">{$t('requis')}</span> : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{$t(p.description)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border px-4 py-3 text-sm text-muted-foreground">{$t('Aucun argument.')}</p>
        )}
      </Section>

      <Section title={$t('Appels à l’API')}>
        <ul className="divide-y rounded-xl border">
          {tool.calls.map((c) => (
            <li key={c} className="flex items-center gap-2 px-4 py-2.5">
              <Terminal className="size-3.5 text-muted-foreground" />
              <code className="font-mono text-xs">{c}</code>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          {$t('Sous le jeton de l’appelant : le résultat est celui que son propriétaire verrait, en tableau markdown de 50 lignes au plus.')}
        </p>
      </Section>
    </article>
  )
}
