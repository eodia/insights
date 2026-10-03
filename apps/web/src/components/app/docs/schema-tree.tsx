'use client'

import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { type JsonSchema, type OpenApiDoc, constraintsOf, isNullable, resolve, typeLabel, variantLabel, variantsOf } from './openapi'

const MAX_DEPTH = 8

/** The fields a schema opens on: an object's properties, or those of an array's items. */
function childrenOf(schema: JsonSchema, doc: OpenApiDoc): { props: [string, JsonSchema][]; required: Set<string>; variants: JsonSchema[] } {
  let s = resolve(schema, doc).schema
  if (s.items && (s.type === 'array' || (Array.isArray(s.type) && s.type.includes('array')))) s = resolve(s.items, doc).schema
  return {
    props: Object.entries(s.properties ?? {}),
    required: new Set(s.required ?? []),
    variants: variantsOf(s),
  }
}

function Field({ name, schema, required, doc, depth }: { name: string; schema: JsonSchema; required: boolean; doc: OpenApiDoc; depth: number }) {
  const s = resolve(schema, doc).schema
  const kids = childrenOf(schema, doc)
  const nested = depth < MAX_DEPTH && (kids.props.length > 0 || kids.variants.length > 0)
  // Top-level fields show their inside at once; deeper ones on demand.
  const [open, setOpen] = useState(depth < 1)
  const values = s.enum && s.enum.length > 1 ? s.enum : null
  const rules = constraintsOf(s)
  return (
    <li className="border-b last:border-b-0">
      <div className="py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {nested ? (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="-ml-1 inline-flex items-center rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={open ? $t('Replier') : $t('Déplier')}
            >
              <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
            </button>
          ) : null}
          <code className="font-mono text-[13px] font-semibold">{name}</code>
          <span className="font-mono text-xs text-muted-foreground">{typeLabel(schema, doc)}</span>
          {isNullable(s) ? <span className="text-xs text-muted-foreground">{$t('ou null')}</span> : null}
          {required ? (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">{$t('requis')}</span>
          ) : null}
          {rules.map((r) => (
            <span key={r} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {r}
            </span>
          ))}
        </div>
        {s.description ? <p className="mt-1 text-sm text-muted-foreground">{s.description}</p> : null}
        {values ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {values.slice(0, 40).map((v) => (
              <code key={String(v)} className="rounded border bg-background px-1.5 py-0.5 font-mono text-[11px]">
                {String(v)}
              </code>
            ))}
            {values.length > 40 ? <span className="text-xs text-muted-foreground">…</span> : null}
          </div>
        ) : null}
      </div>
      {nested && open ? (
        <div className="mb-3 ml-1.5 border-l pl-4">
          <SchemaBody schema={schema} doc={doc} depth={depth + 1} />
        </div>
      ) : null}
    </li>
  )
}

/** The inside of a schema: its fields, or the forms it may take. */
function SchemaBody({ schema, doc, depth }: { schema: JsonSchema; doc: OpenApiDoc; depth: number }) {
  const { props, required, variants } = childrenOf(schema, doc)
  const [variant, setVariant] = useState(0)
  if (variants.length) {
    const current = variants[Math.min(variant, variants.length - 1)] as JsonSchema
    return (
      <div className="py-2">
        <div className="mb-1 text-xs text-muted-foreground">{$t('Une des formes suivantes :')}</div>
        <div className="flex flex-wrap gap-1">
          {variants.map((v, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: variants have no identity but their place
              key={i}
              type="button"
              onClick={() => setVariant(i)}
              className={cn(
                'rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors',
                i === variant ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {variantLabel(v, doc, i)}
            </button>
          ))}
        </div>
        {childrenOf(current, doc).props.length ? (
          <ul className="mt-1">
            <SchemaFields schema={current} doc={doc} depth={depth} />
          </ul>
        ) : (
          <p className="mt-2 font-mono text-xs text-muted-foreground">{typeLabel(current, doc)}</p>
        )}
      </div>
    )
  }
  if (!props.length) return <p className="py-2 font-mono text-xs text-muted-foreground">{typeLabel(schema, doc)}</p>
  return (
    <ul>
      {props.map(([name, p]) => (
        <Field key={name} name={name} schema={p} required={required.has(name)} doc={doc} depth={depth} />
      ))}
    </ul>
  )
}

function SchemaFields({ schema, doc, depth }: { schema: JsonSchema; doc: OpenApiDoc; depth: number }) {
  const { props, required } = childrenOf(schema, doc)
  return (
    <>
      {props.map(([name, p]) => (
        <Field key={name} name={name} schema={p} required={required.has(name)} doc={doc} depth={depth} />
      ))}
    </>
  )
}

/** A JSON schema as a readable tree: names, types, constraints, nested objects and unions. */
export function SchemaTree({ schema, doc }: { schema: JsonSchema; doc: OpenApiDoc }) {
  return (
    <div className="rounded-xl border px-4">
      <SchemaBody schema={schema} doc={doc} depth={0} />
    </div>
  )
}
