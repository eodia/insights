'use client'

import { Input } from '@/components/ui/input'
import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { BookOpen, Bot, Plug, Search, Wrench } from 'lucide-react'
import type { McpTool } from './mcp-tools'
import type { Endpoint, Method } from './openapi'
import { Pane } from '@/components/ui/pane'

export type Selection =
  | { readonly kind: 'overview' }
  | { readonly kind: 'endpoint'; readonly id: string }
  | { readonly kind: 'mcp-setup' }
  | { readonly kind: 'mcp-tool'; readonly name: string }

export const selectionKey = (s: Selection): string =>
  s.kind === 'endpoint' ? `ep/${s.id}` : s.kind === 'mcp-tool' ? `mcp/${s.name}` : s.kind === 'mcp-setup' ? 'mcp' : 'presentation'

export function parseSelection(hash: string): Selection {
  const h = decodeURIComponent(hash.replace(/^#/, ''))
  if (h.startsWith('ep/')) return { kind: 'endpoint', id: h.slice(3) }
  if (h.startsWith('mcp/')) return { kind: 'mcp-tool', name: h.slice(4) }
  if (h === 'mcp') return { kind: 'mcp-setup' }
  return { kind: 'overview' }
}

const METHOD_CLASSES: Record<Method, string> = {
  get: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  post: 'bg-primary/12 text-green-700 dark:text-primary',
  put: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  patch: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  delete: 'bg-red-500/12 text-red-700 dark:text-red-300',
}

export function MethodChip({ method, className }: { method: Method; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center justify-center rounded px-1.5 font-mono text-[10px] font-bold tracking-wide uppercase', METHOD_CLASSES[method], className)}>
      {method === 'delete' ? 'del' : method}
    </span>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 px-3 pt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</div>
}

function NavRow({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'relative flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors',
        active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {active ? <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-primary" /> : null}
      {children}
    </button>
  )
}

export function DocsNav({
  groups,
  tools,
  search,
  onSearch,
  selection,
  onSelect,
}: {
  groups: readonly { tag: string; endpoints: readonly Endpoint[] }[]
  tools: readonly McpTool[]
  search: string
  onSearch: (v: string) => void
  selection: Selection
  onSelect: (s: Selection) => void
}) {
  const key = selectionKey(selection)
  const empty = !groups.length && !tools.length
  return (
    <Pane as="nav" id="docs.nav" side="left" defaultSize={300} min={220} max={560} className="flex flex-col border-r">
      <div className="p-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={$t('Rechercher un endpoint…')} className="h-10 rounded-lg pl-9" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-6">
        {!search ? (
          <>
            <NavRow active={key === 'presentation'} onClick={() => onSelect({ kind: 'overview' })}>
              <BookOpen className="size-4" /> {$t('Présentation')}
            </NavRow>
            <NavRow active={key === 'mcp'} onClick={() => onSelect({ kind: 'mcp-setup' })}>
              <Plug className="size-4" /> {$t('Brancher un assistant (MCP)')}
            </NavRow>
          </>
        ) : null}

        {tools.length ? (
          <>
            <Heading>
              <span className="inline-flex items-center gap-1.5">
                <Bot className="size-3.5" /> {$t('Outils MCP')} <span className="font-normal">{tools.length}</span>
              </span>
            </Heading>
            {tools.map((t) => (
              <NavRow key={t.name} active={key === `mcp/${t.name}`} onClick={() => onSelect({ kind: 'mcp-tool', name: t.name })} title={$t(t.title)}>
                <Wrench className="size-3.5 shrink-0" />
                <span className="truncate font-mono text-[12.5px]">{t.name}</span>
              </NavRow>
            ))}
          </>
        ) : null}

        {groups.map((g) => (
          <div key={g.tag}>
            <Heading>
              {$t(g.tag)} <span className="ml-1 font-normal">{g.endpoints.length}</span>
            </Heading>
            {g.endpoints.map((e) => (
              <NavRow key={e.id} active={key === `ep/${e.id}`} onClick={() => onSelect({ kind: 'endpoint', id: e.id })} title={`${e.method.toUpperCase()} ${e.path}`}>
                <MethodChip method={e.method} className="w-10" />
                <span className="truncate">{e.summary}</span>
              </NavRow>
            ))}
          </div>
        ))}

        {empty ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">{$t('Aucun endpoint ne correspond.')}</p> : null}
      </div>
    </Pane>
  )
}
