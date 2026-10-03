'use client'

import { $t, msg } from '@/lib/i18n'
import { Globe, KeyRound } from 'lucide-react'
import { CopyButton } from './code'
import { MethodChip } from './nav'
import type { Endpoint, OpenApiDoc, OpenApiParameter } from './openapi'
import { constraintsOf, typeLabel } from './openapi'
import { SchemaTree } from './schema-tree'

/** A translated sentence with an element where its `{name}` stands. */
export function around(sentence: string, name: string, element: React.ReactNode): React.ReactNode {
  const [before, after] = sentence.split(`{${name}}`)
  return (
    <>
      {before}
      {element}
      {after}
    </>
  )
}

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

const IN_LABELS: Record<OpenApiParameter['in'], string> = {
  path: msg('Paramètres de chemin'),
  query: msg('Paramètres de requête'),
  header: msg('En-têtes'),
  cookie: msg('Cookies'),
}

function Parameters({ params, doc }: { params: readonly OpenApiParameter[]; doc: OpenApiDoc }) {
  return (
    <ul className="divide-y rounded-xl border px-4">
      {params.map((p) => {
        const rules = p.schema ? constraintsOf(p.schema) : []
        const values = p.schema?.enum && p.schema.enum.length > 1 ? p.schema.enum : null
        return (
          <li key={`${p.in}-${p.name}`} className="py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <code className="font-mono text-[13px] font-semibold">{p.name}</code>
              <span className="font-mono text-xs text-muted-foreground">{p.schema ? typeLabel(p.schema, doc) : 'string'}</span>
              {p.required ? <span className="text-[10px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">{$t('requis')}</span> : null}
              {rules.map((r) => (
                <span key={r} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {r}
                </span>
              ))}
            </div>
            {p.description ? <p className="mt-1 text-sm text-muted-foreground">{p.description}</p> : null}
            {values ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {values.map((v) => (
                  <code key={String(v)} className="rounded border px-1.5 py-0.5 font-mono text-[11px]">
                    {String(v)}
                  </code>
                ))}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

export function EndpointDetail({ endpoint: e, doc }: { endpoint: Endpoint; doc: OpenApiDoc }) {
  const byPlace = (['path', 'query', 'header', 'cookie'] as const)
    .map((place) => ({ place, params: e.parameters.filter((p) => p.in === place) }))
    .filter((g) => g.params.length)
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <div className="text-xs font-semibold tracking-wide text-primary uppercase">{$t(e.tag)}</div>
        <h1 className="text-2xl font-semibold tracking-tight">{e.summary}</h1>
        <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2">
          <MethodChip method={e.method} />
          <code className="min-w-0 flex-1 truncate font-mono text-sm">{e.path}</code>
          <CopyButton text={e.path} className="text-muted-foreground hover:bg-muted hover:text-foreground" />
        </div>
        {e.description ? <p className="text-[15px] leading-relaxed text-muted-foreground">{e.description}</p> : null}
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          {e.public ? (
            <>
              <Globe className="mt-0.5 size-4 shrink-0" />
              <span>{$t('Public : aucun jeton requis.')}</span>
            </>
          ) : (
            <>
              <KeyRound className="mt-0.5 size-4 shrink-0" />
              <span>
                {around($t('Authentification : {header} (jeton avec la surface REST) ou session du navigateur.'), 'header', <code className="font-mono text-xs text-foreground">Authorization: Bearer eoi_…</code>)}
              </span>
            </>
          )}
        </div>
      </header>

      {byPlace.map((g) => (
        <Section key={g.place} title={$t(IN_LABELS[g.place])}>
          <Parameters params={g.params} doc={doc} />
        </Section>
      ))}

      {e.body ? (
        <Section title={$t('Corps de la requête')} aside={<span className="font-mono text-xs text-muted-foreground">application/json{e.bodyRequired ? '' : ` · ${$t('facultatif')}`}</span>}>
          <SchemaTree schema={e.body} doc={doc} />
        </Section>
      ) : null}

      <Section title={$t('Réponses')}>
        <ul className="divide-y rounded-xl border">
          {e.responses.map((r) => (
            <li key={r.status} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span
                className={
                  r.status.startsWith('2')
                    ? 'w-10 font-mono text-xs font-semibold text-green-700 dark:text-primary'
                    : 'w-10 font-mono text-xs font-semibold text-muted-foreground'
                }
              >
                {r.status}
              </span>
              <span className="flex-1">{r.description}</span>
              {r.status.startsWith('2') ? <span className="font-mono text-xs text-muted-foreground">application/json</span> : null}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          {around($t('Une erreur renvoie {body} avec un message en français, prêt à afficher.'), 'body', <code className="font-mono">{'{ "error": { "code": "…", "message": "…" } }'}</code>)}
        </p>
      </Section>
    </article>
  )
}
