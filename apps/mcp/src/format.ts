/**
 * Mise en forme des réponses : des tableaux markdown compacts, que l'assistant lit sans mal
 * et qui tiennent dans son contexte (50 lignes au plus).
 */
import type { QueryResult } from '@eodia/contracts'

export const MAX_ROWS = 50

/** A cell on one line: pipes escaped, line breaks flattened, long texts cut. */
export function cell(value: unknown): string {
  if (value === null || value === undefined) return '∅'
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  const flat = text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')
  return flat.length > 120 ? `${flat.slice(0, 117)}…` : flat
}

export function table(headers: readonly string[], rows: ReadonlyArray<readonly unknown[]>, max = MAX_ROWS): string {
  if (headers.length === 0) return '_(aucune colonne)_'
  const lines = [
    `| ${headers.map(cell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.slice(0, max).map((r) => `| ${headers.map((_, i) => cell(r[i])).join(' | ')} |`),
  ]
  return lines.join('\n')
}

/** A query result: its rows, then what was left out and how long it took. */
export function resultMarkdown(result: QueryResult, opts: { sql?: boolean } = {}): string {
  const shown = result.columns.map((c, i) => ({ c, i })).filter(({ c }) => !c.hidden)
  const headers = shown.map(({ c }) => c.label || c.name)
  const rows = result.rows.map((r) => shown.map(({ i }) => r[i]))
  const parts = [rows.length ? table(headers, rows) : '_Aucune ligne._']
  const notes = [`${result.rows.length} ligne(s)`]
  if (result.rows.length > MAX_ROWS) notes.push(`${MAX_ROWS} affichées`)
  if (result.truncated) notes.push('résultat tronqué par la limite de lignes')
  notes.push(`${result.duration_ms} ms`)
  if (result.cached_at) notes.push(`depuis le cache (${result.cached_at})`)
  parts.push(`_${notes.join(' · ')}_`)
  if (opts.sql && result.sql) parts.push(`SQL Trino exécuté :\n\`\`\`sql\n${result.sql}\n\`\`\``)
  return parts.join('\n\n')
}

/** Lower case, without accents: « Région » matches « region ». */
export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
