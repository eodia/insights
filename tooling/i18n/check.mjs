// The catalogs of apps/web against the French source
//
//   node tooling/i18n/check.mjs [locale…] [--strict]
//
// For each language: how many sentences are translated, which are missing, and every
// translation that would break at display — a `{placeholder}` renamed or lost, a plural
// without the categories its language needs. Missing sentences read in French; broken
// ones are errors. `--strict` fails on errors (exit 1).
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '../..',
)
export const LOCALES = ['en', 'es']

const placeholders = (text) =>
  [...String(text).matchAll(/(?<!\{)\{(\w+)\}(?!\})/g)].map((m) => m[1]).sort()
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

export function source() {
  return JSON.parse(fs.readFileSync(path.join(root, 'tooling/i18n/app-source.json'), 'utf8'))
}

/** The problems of one catalog: `{ translated, missing: [], errors: [], stale: [] }`. */
export function checkCatalog(locale, catalog, src = source()) {
  const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories
  const result = { translated: 0, missing: [], errors: [], stale: [] }
  for (const [key, entry] of Object.entries(src)) {
    const value = catalog[key]
    if (value === undefined) {
      result.missing.push(key)
      continue
    }
    result.translated++
    const plural = entry.one !== undefined
    if (plural) {
      if (typeof value === 'string') {
        if (categories.length > 1)
          result.errors.push(`${key}: a plural needs its forms (${categories.join(', ')})`)
        continue
      }
      for (const c of categories)
        if (typeof value[c] !== 'string') result.errors.push(`${key}: plural form « ${c} » missing`)
      const expected = placeholders(entry.other).filter((p) => p !== 'count')
      for (const [c, text] of Object.entries(value)) {
        const found = placeholders(text).filter((p) => p !== 'count')
        if (!same(found, [...new Set(expected)]))
          result.errors.push(`${key} [${c}]: placeholders ${found} ≠ ${expected}`)
      }
    } else {
      if (typeof value !== 'string') {
        result.errors.push(`${key}: a sentence, not a plural`)
        continue
      }
      const expected = [...new Set(placeholders(key))]
      const found = [...new Set(placeholders(value))]
      if (!same(found.sort(), expected.sort()))
        result.errors.push(`${key}: placeholders {${found}} ≠ {${expected}}`)
      if (value.trim() === '' && key.trim() !== '') result.errors.push(`${key}: empty translation`)
      // What follows `||` in a key tells the translator the sense; it is never displayed.
      if (value.includes('||'))
        result.errors.push(`${key}: the context after « || » was translated too`)
    }
  }
  for (const key of Object.keys(catalog)) if (!(key in src)) result.stale.push(key)
  return result
}

if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/').split('/').pop() ?? '')) {
  const args = process.argv.slice(2)
  const strict = args.includes('--strict')
  const wanted = args.filter((a) => !a.startsWith('--'))
  const src = source()
  let failed = false
  for (const locale of wanted.length > 0 ? wanted : LOCALES) {
    const file = path.join(root, 'apps/web/src/locales', `${locale}.json`)
    const catalog = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
    const r = checkCatalog(locale, catalog, src)
    const total = Object.keys(src).length
    console.log(
      `${locale.padEnd(6)} ${String(r.translated).padStart(5)}/${total} translated, ${r.missing.length} missing, ${r.errors.length} errors, ${r.stale.length} stale`,
    )
    for (const e of r.errors.slice(0, 20)) console.log(`   ✗ ${e}`)
    if (r.errors.length > 0) failed = true
  }
  if (strict && failed) process.exit(1)
}
