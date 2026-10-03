'use client'

/**
 * L'éditeur SQL — repris de BaseDB, passé au dialecte Trino : l'autocomplétion connaît
 * `catalogue.schéma.table` et les colonnes de chaque table lisible, `Ctrl+Entrée` exécute la
 * sélection quand il y en a une, `Maj+Alt+F` met en forme, et l'erreur de Trino se place sur
 * la ligne et la colonne qu'il désigne.
 */
import type { SchemaTree } from '@/lib/queries'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { type SQLNamespace, StandardSQL, sql } from '@codemirror/lang-sql'
import { HighlightStyle, bracketMatching, foldGutter, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { type Diagnostic, lintGutter, linter } from '@codemirror/lint'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorSelection, EditorState } from '@codemirror/state'
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder as placeholderExtension } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { useEffect, useRef } from 'react'

export interface SqlError {
  readonly message: string
  readonly line?: number
  readonly column?: number
}

interface Props {
  readonly value: string
  readonly tree?: SchemaTree
  readonly placeholder?: string
  readonly onChange: (value: string) => void
  readonly onRun: (statement: string) => void
  readonly error?: SqlError | null
  readonly onReady?: (api: { format: () => void; insert: (text: string) => void; focus: () => void }) => void
  readonly className?: string
}

/** The completion namespace: catalogs → schemas → tables → columns, and bare table names. */
function namespaceOf(tree: SchemaTree | undefined): SQLNamespace {
  const out: Record<string, SQLNamespace> = {}
  for (const ds of tree?.datasources ?? []) {
    const schemas: Record<string, Record<string, SQLNamespace>> = {}
    for (const t of ds.tables) {
      const cols = t.columns.map((c) => ({ label: c.name, type: 'property', detail: `${c.label} · ${c.type}` }))
      schemas[t.schema] ??= {}
      ;(schemas[t.schema] as Record<string, SQLNamespace>)[t.name] = { self: { label: t.name, type: 'table', detail: t.label }, children: cols }
    }
    out[ds.catalog] = {
      self: { label: ds.catalog, type: 'namespace', detail: ds.name },
      children: Object.fromEntries(Object.entries(schemas).map(([s, tables]) => [s, { self: { label: s, type: 'type' }, children: tables }])),
    }
  }
  return out
}

const TRINO_KEYWORDS =
  'approx_distinct approx_percentile date_trunc date_add date_diff date_format format_datetime from_iso8601_timestamp at time zone interval unnest cross join lateral try_cast try coalesce nullif array_agg map_agg count_if bool_and bool_or arbitrary any_value max_by min_by histogram regexp_like regexp_extract split_part strpos json_extract_scalar json_extract greatest least row_number rank dense_rank lag lead ntile over partition rows range preceding following unbounded current row tablesample bernoulli system table query'

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--primary)', fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string)], color: 'oklch(0.55 0.14 35)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'oklch(0.52 0.15 265)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.standard(tags.variableName)], color: 'oklch(0.55 0.13 300)' },
  { tag: tags.operator, color: 'var(--muted-foreground)' },
  { tag: tags.typeName, color: 'oklch(0.55 0.10 200)' },
  { tag: tags.special(tags.name), color: 'oklch(0.6 0.15 50)' },
])

const theme = EditorView.theme({
  '&': { fontSize: '13px', backgroundColor: 'transparent', height: '100%' },
  '.cm-content': { padding: '10px 0', caretColor: 'var(--foreground)' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'color-mix(in oklab, var(--muted-foreground) 55%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--foreground)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in oklab, var(--primary) 22%, transparent)' },
  '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-completionLabel': { fontFamily: 'var(--font-mono, ui-monospace, monospace)' },
  '.cm-completionDetail': { fontStyle: 'normal', opacity: 0.6, marginLeft: '0.75rem' },
})

export function statementOf(view: EditorView): string {
  const { from, to } = view.state.selection.main
  return from !== to ? view.state.sliceDoc(from, to) : view.state.doc.toString()
}

const dialect = (tree: SchemaTree | undefined) =>
  sql({
    dialect: { ...StandardSQL, spec: { ...StandardSQL.spec, keywords: `${StandardSQL.spec.keywords ?? ''} ${TRINO_KEYWORDS}`, identifierQuotes: '"' } } as typeof StandardSQL,
    schema: namespaceOf(tree),
    upperCaseKeywords: true,
  })

function diagnosticsFor(view: EditorView, error: SqlError | null | undefined): Diagnostic[] {
  if (!error) return []
  const doc = view.state.doc
  if (error.line && error.line <= doc.lines) {
    const line = doc.line(error.line)
    const from = Math.min(line.from + Math.max((error.column ?? 1) - 1, 0), line.to)
    return [{ from, to: Math.min(from + 1, doc.length), severity: 'error', message: error.message, source: 'Trino' }]
  }
  return [{ from: 0, to: Math.min(1, doc.length), severity: 'error', message: error.message, source: 'Trino' }]
}

async function formatInto(view: EditorView): Promise<void> {
  const { from, to } = view.state.selection.main
  const whole = from === to
  const source = whole ? view.state.doc.toString() : view.state.sliceDoc(from, to)
  if (source.trim() === '') return
  try {
    const { format } = await import('sql-formatter')
    // {{variables}} and [[sections]] survive the formatter as placeholders.
    const formatted = format(source, { language: 'trino', tabWidth: 2, keywordCase: 'upper', paramTypes: { custom: [{ regex: String.raw`\{\{[^}]+\}\}|\[\[|\]\]` }] } })
    if (formatted === source) return
    view.dispatch({ changes: { from: whole ? 0 : from, to: whole ? view.state.doc.length : to, insert: formatted }, selection: EditorSelection.cursor((whole ? 0 : from) + formatted.length) })
  } catch {
    // Left as typed: reformatting on a guess would be worse.
  }
}

export function SqlEditor({ value, tree, placeholder, onChange, onRun, error, onReady, className }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const language = useRef(new Compartment())
  const lint = useRef(new Compartment())
  const latest = useRef({ onChange, onRun, error })
  latest.current = { onChange, onRun, error }
  const ready = useRef(onReady)
  ready.current = onReady

  // biome-ignore lint/correctness/useExhaustiveDependencies: mounted once; schema, callbacks and document travel separately
  useEffect(() => {
    if (!host.current) return
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          foldGutter(),
          history(),
          closeBrackets(),
          bracketMatching(),
          indentOnInput(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          highlightSelectionMatches(),
          search({ top: true }),
          syntaxHighlighting(highlight),
          theme,
          lintGutter(),
          EditorView.lineWrapping,
          placeholderExtension(placeholder ?? 'SELECT * FROM catalogue.schema.table'),
          language.current.of([dialect(tree), autocompletion({ activateOnTyping: true, icons: true })]),
          lint.current.of(linter((v) => diagnosticsFor(v, latest.current.error))),
          keymap.of([
            { key: 'Mod-Enter', preventDefault: true, run: (v) => (latest.current.onRun(statementOf(v)), true) },
            { key: 'Shift-Alt-f', preventDefault: true, run: (v) => (void formatInto(v), true) },
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...searchKeymap,
            ...historyKeymap,
            indentWithTab,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) latest.current.onChange(u.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = editor
    ready.current?.({
      format: () => void formatInto(editor),
      insert: (text) => {
        const { from, to } = editor.state.selection.main
        editor.dispatch({ changes: { from, to, insert: text }, selection: EditorSelection.cursor(from + text.length) })
        editor.focus()
      },
      focus: () => editor.focus(),
    })
    return () => {
      editor.destroy()
      view.current = null
    }
  }, [])

  useEffect(() => {
    view.current?.dispatch({ effects: language.current.reconfigure([dialect(tree), autocompletion({ activateOnTyping: true, icons: true })]) })
  }, [tree])

  useEffect(() => {
    view.current?.dispatch({ effects: lint.current.reconfigure(linter((v) => diagnosticsFor(v, error), { delay: 0 })) })
  }, [error])

  useEffect(() => {
    const editor = view.current
    if (!editor) return
    const current = editor.state.doc.toString()
    if (current !== value) editor.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  return <div ref={host} className={className ?? 'min-h-0 flex-1 overflow-auto'} />
}
