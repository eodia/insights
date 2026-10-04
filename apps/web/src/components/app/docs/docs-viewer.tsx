'use client'

import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { $t, $tp } from '@/lib/i18n'
import { useMe } from '@/lib/queries'
import type { Me } from '@eodia/contracts'
import { useQuery } from '@tanstack/react-query'
import { Download, KeyRound, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CodeTabs, CopyButton } from './code'
import { EndpointDetail, Section } from './endpoint'
import { McpSetup, McpToolDetail } from './mcp'
import { MCP_TOOLS, mcpUrl } from './mcp-tools'
import { DocsNav, type Selection, parseSelection, selectionKey } from './nav'
import { type Endpoint, type OpenApiDoc, endpointsOf } from './openapi'
import { type Sample, endpointSamples, mcpSetupSamples, mcpToolSamples, overviewSamples } from './snippets'
import { TokenDialog } from './token-dialog'
import { Pane } from '@/components/ui/pane'

/** What the reader may call: administration endpoints are shown to those who hold the right. */
function allowed(e: Endpoint, me: Me | undefined): boolean {
  if (!me || me.is_admin) return true
  if (e.path.startsWith('/api/v1/permissions')) return me.can.manage_permissions
  if (e.path.startsWith('/api/v1/admin/')) return false
  return true
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

function Overview({ doc, endpoints, onSelect, onToken }: { doc: OpenApiDoc; endpoints: number; onSelect: (s: Selection) => void; onToken: () => void }) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const { data: me } = useMe()
  const cards = [
    { label: $t('Adresse de base'), value: `${origin}/api/v1` },
    { label: $t('Authentification'), value: 'Authorization: Bearer eoi_…' },
    { label: 'MCP', value: mcpUrl() },
  ]
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <div className="text-xs font-semibold tracking-wide text-primary uppercase">
          {$t('Référence')} · v{doc.info.version} · OpenAPI {doc.openapi}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{$t('API et MCP')}</h1>
        {doc.info.description ? <p className="text-[15px] leading-relaxed text-muted-foreground">{doc.info.description}</p> : null}
      </header>

      <div className="grid gap-3">
        {cards.map((c) => (
          <div key={c.label} className="flex items-center gap-3 rounded-xl border px-4 py-3">
            <div className="w-36 shrink-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{c.label}</div>
            <code className="min-w-0 flex-1 truncate font-mono text-sm">{c.value}</code>
            <CopyButton text={c.value} className="text-muted-foreground hover:bg-muted hover:text-foreground" />
          </div>
        ))}
        {me ? (
          <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
            <div className="w-36 shrink-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{$t('Espace')}</div>
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{me.workspace.name}</span>
              <span className="text-muted-foreground"> — {$t('les jetons créés ici agissent dans cet espace.')}</span>
            </div>
          </div>
        ) : null}
      </div>

      <Section title={$t('Premiers pas')}>
        <div className="grid gap-3 sm:grid-cols-3">
          <button type="button" onClick={onToken} className="rounded-xl border p-4 text-left transition-colors hover:bg-muted/60">
            <div className="text-sm font-semibold">{$t('1. Créer un jeton')}</div>
            <p className="mt-1 text-sm text-muted-foreground">{$t('REST, MCP ou les deux. Il agit avec vos droits, dans l’espace courant, et s’affiche une seule fois.')}</p>
          </button>
          <button
            type="button"
            onClick={() => onSelect({ kind: 'endpoint', id: 'post-api-v1-query' })}
            className="rounded-xl border p-4 text-left transition-colors hover:bg-muted/60"
          >
            <div className="text-sm font-semibold">{$t('2. Interroger les données')}</div>
            <p className="mt-1 text-sm text-muted-foreground">{$t('POST /api/v1/query exécute du SQL Trino ou une requête du builder, sous vos permissions.')}</p>
          </button>
          <button type="button" onClick={() => onSelect({ kind: 'mcp-setup' })} className="rounded-xl border p-4 text-left transition-colors hover:bg-muted/60">
            <div className="text-sm font-semibold">{$t('3. Brancher un assistant')}</div>
            <p className="mt-1 text-sm text-muted-foreground">{$t('Claude ou tout client MCP lit vos métriques, questions et tableaux de bord.')}</p>
          </button>
        </div>
      </Section>

      <Section title={$t('Bon à savoir')}>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>{$t('Toute lecture de données passe par Trino sous votre identité : vos règles de ligne et vos colonnes masquées s’appliquent aussi par l’API.')}</li>
          <li>{$t('Un jeton ne vaut que pour les surfaces qu’il déclare : un jeton MCP seul est refusé sur l’API REST.')}</li>
          <li>
            {$t(
              'Un jeton agit dans l’espace où il a été créé : il en voit les sources (et celles qui lui sont partagées), les dossiers, les questions et les tableaux de bord, avec vos droits dans cet espace. Pour travailler dans un autre espace, passez-y puis créez-y un jeton.',
            )}
          </li>
          <li>{$t('GET /api/v1/me dit dans quel espace agit le jeton (workspace) et les espaces où vous pouvez entrer (workspaces).')}</li>
          <li>{$t('Les erreurs portent un code stable et un message dans la langue de l’appelant, prêt à afficher.')}</li>
          <li>
            {$tp(
              endpoints,
              '{count} endpoint documenté, généré depuis les schémas de validation de l’API : cette page est toujours à jour.',
              '{count} endpoints documentés, générés depuis les schémas de validation de l’API : cette page est toujours à jour.',
            )}
          </li>
        </ul>
      </Section>
    </article>
  )
}

export function DocsViewer() {
  const { data: me } = useMe()
  const { data: doc, isLoading, error } = useQuery({
    queryKey: ['openapi'],
    queryFn: () => api.get<OpenApiDoc>('/v1/openapi.json'),
    staleTime: 5 * 60_000,
  })
  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState<Selection>({ kind: 'overview' })
  const [tokenOpen, setTokenOpen] = useState(false)

  // The hash keeps the place: a link to an endpoint opens on it, the back button returns.
  useEffect(() => {
    const read = () => setSelection(parseSelection(window.location.hash))
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  const select = (s: Selection) => {
    setSelection(s)
    const hash = `#${selectionKey(s)}`
    if (window.location.hash !== hash) window.history.pushState(null, '', hash)
    document.getElementById('docs-main')?.scrollTo({ top: 0 })
  }

  const groups = useMemo(() => {
    if (!doc) return []
    const words = fold(search).split(/\s+/).filter(Boolean)
    return endpointsOf(doc)
      .map((g) => ({
        tag: g.tag,
        endpoints: g.endpoints.filter(
          (e) => allowed(e, me) && words.every((w) => fold(`${e.method} ${e.path} ${e.summary} ${e.description ?? ''} ${g.tag} ${$t(g.tag)}`).includes(w)),
        ),
      }))
      .filter((g) => g.endpoints.length)
  }, [doc, me, search])

  const tools = useMemo(() => {
    const words = fold(search).split(/\s+/).filter(Boolean)
    return MCP_TOOLS.filter((t) => words.every((w) => fold(`${t.name} ${$t(t.title)} ${$t(t.description)} mcp`).includes(w)))
  }, [search])

  const all = useMemo(() => (doc ? endpointsOf(doc).flatMap((g) => g.endpoints) : []), [doc])
  const endpoint = selection.kind === 'endpoint' ? all.find((e) => e.id === selection.id) : undefined
  const tool = selection.kind === 'mcp-tool' ? MCP_TOOLS.find((t) => t.name === selection.name) : undefined

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (error || !doc) {
    return <p className="m-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{(error as Error | null)?.message ?? $t('Documentation indisponible.')}</p>
  }

  let samples: Sample[]
  let samplesTitle: string
  let body: React.ReactNode
  if (endpoint) {
    samples = endpointSamples(endpoint, doc)
    samplesTitle = $t('Exemple de requête')
    body = <EndpointDetail endpoint={endpoint} doc={doc} />
  } else if (tool) {
    samples = mcpToolSamples(tool)
    samplesTitle = $t('Appel de l’outil')
    body = <McpToolDetail tool={tool} />
  } else if (selection.kind === 'mcp-setup') {
    samples = mcpSetupSamples()
    samplesTitle = $t('Configuration du client')
    body = <McpSetup onSelect={select} onToken={() => setTokenOpen(true)} />
  } else {
    samples = overviewSamples()
    samplesTitle = $t('Démarrage rapide')
    body = <Overview doc={doc} endpoints={all.length} onSelect={select} onToken={() => setTokenOpen(true)} />
  }

  const code = (
    <div className="space-y-4">
      <div className="text-xs font-semibold tracking-wide text-code-foreground/60 uppercase">{samplesTitle}</div>
      <CodeTabs key={selectionKey(selection)} samples={samples} />
      <div className="rounded-xl border border-code-border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4" /> {$t("Jeton d'intégration")}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-code-foreground/65">
          {$t('Les exemples lisent le jeton dans la variable EODIA_TOKEN. Il porte vos droits : gardez-le secret.')}
        </p>
        <Button size="sm" className="mt-3" onClick={() => setTokenOpen(true)}>
          <KeyRound /> {$t('Créer un jeton')}
        </Button>
      </div>
      <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-code-foreground/65 hover:text-code-foreground">
        <Download className="size-3.5" /> {$t('Télécharger la spécification OpenAPI 3.1')}
      </a>
    </div>
  )

  return (
    <div className="flex h-full">
      <DocsNav groups={groups} tools={tools} search={search} onSearch={setSearch} selection={selection} onSelect={select} />
      <main id="docs-main" className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-8">
          {body}
          <div className="mt-10 rounded-xl bg-code p-4 text-code-foreground lg:hidden">{code}</div>
        </div>
      </main>
      <Pane as="aside" id="docs.code" side="right" defaultSize={460} min={320} max={820} className="hidden overflow-y-auto bg-code p-5 text-code-foreground lg:block">{code}</Pane>
      <TokenDialog open={tokenOpen} onOpenChange={setTokenOpen} />
    </div>
  )
}
