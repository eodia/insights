'use client'

import { SQLDialect, StandardSQL, sql } from '@codemirror/lang-sql'
import { highlightCode, tagHighlighter, tags } from '@lezer/highlight'
import { ALL_SQL_KEYWORDS } from '@/lib/trino-sql'
import { cn } from '@/lib/utils'
import { type ReactNode, useEffect, useMemo, useState } from 'react'

/** Trino SQL as the editor reads it: its keywords, its quoted names. */
const parser = sql({
  dialect: SQLDialect.define({ ...StandardSQL.spec, keywords: ALL_SQL_KEYWORDS, identifierQuotes: '"' }),
}).language.parser

/** The editor's colours, as classes (`globals.css`): keywords green, strings warm, numbers blue… */
const highlighter = tagHighlighter([
  { tag: tags.keyword, class: 'sqlh-kw' },
  { tag: [tags.string, tags.special(tags.string)], class: 'sqlh-str' },
  { tag: [tags.number, tags.bool, tags.null], class: 'sqlh-num' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], class: 'sqlh-com' },
  { tag: [tags.function(tags.variableName), tags.standard(tags.variableName)], class: 'sqlh-fn' },
  { tag: tags.operator, class: 'sqlh-op' },
  { tag: tags.typeName, class: 'sqlh-type' },
  { tag: tags.special(tags.name), class: 'sqlh-name' },
])

/** A query's text, coloured. */
function highlighted(code: string): ReactNode[] {
  const out: ReactNode[] = []
  let line: ReactNode[] = []
  let key = 0
  highlightCode(
    code,
    parser.parse(code),
    highlighter,
    (text, classes) => line.push(classes ? <span key={key++} className={classes}>{text}</span> : text),
    () => {
      out.push(<div key={key++}>{line.length ? line : '\u00a0'}</div>)
      line = []
    },
  )
  out.push(<div key={key++}>{line.length ? line : '\u00a0'}</div>)
  return out
}

/**
 * SQL shown in an answer as in the SQL editor: laid out (keywords in capitals, one clause a line)
 * and coloured the same way. A query the formatter cannot read stays as written.
 */
export function SqlCode({ sql: source, className }: { sql: string; className?: string }) {
  const [code, setCode] = useState(source)
  useEffect(() => {
    let live = true
    setCode(source)
    void import('sql-formatter')
      .then(({ format }) => format(source, { language: 'trino', tabWidth: 2, keywordCase: 'upper', paramTypes: { custom: [{ regex: String.raw`\{\{[^}]+\}\}|\[\[|\]\]` }] } }))
      .then((formatted) => {
        if (live) setCode(formatted)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [source])
  const lines = useMemo(() => highlighted(code), [code])
  return <pre className={cn('overflow-x-auto font-mono text-[12.5px] leading-relaxed', className)}>{lines}</pre>
}
