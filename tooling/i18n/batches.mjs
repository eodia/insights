// Splits the French source of apps/web into batches a translator can hold, and merges
// their translations back
//
//   node tooling/i18n/batches.mjs split [size]          → tooling/i18n/batches/app-NN.json
//   node tooling/i18n/batches.mjs merge <locale> <dir>   ← <dir>/app-NN.json, into
//                                                           apps/web/src/locales/<locale>.json
//
// A batch holds, for each sentence, its French text (or its two French forms) and where
// it is used. A translated batch maps the same keys to the translation: a string, or for
// a plural an object of the language's CLDR categories. Merging keeps what the catalog
// already holds for keys the batches don't cover, then checks the result.
import fs from 'node:fs'
import path from 'node:path'
import { checkCatalog, source } from './check.mjs'

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '../..',
)
const [command, ...rest] = process.argv.slice(2)

if (command === 'split') {
  const size = Number(rest[0] ?? 250)
  const entries = Object.entries(source())
  const dir = path.join(root, 'tooling/i18n/batches')
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  let n = 0
  for (let i = 0; i < entries.length; i += size) {
    n++
    const batch = Object.fromEntries(
      entries
        .slice(i, i + size)
        .map(([key, e]) => [
          key,
          e.one === undefined
            ? { fr: key, where: e.where }
            : { one: e.one, other: e.other, where: e.where },
        ]),
    )
    fs.writeFileSync(
      path.join(dir, `app-${String(n).padStart(2, '0')}.json`),
      `${JSON.stringify(batch, null, 2)}\n`,
      'utf8',
    )
  }
  console.log(`${n} batches of at most ${size} sentences in tooling/i18n/batches/`)
} else if (command === 'merge') {
  const [locale, dir] = rest
  if (!locale || !dir) throw new Error('usage: merge <locale> <dir>')
  const file = path.join(root, 'apps/web/src/locales', `${locale}.json`)
  const catalog = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
  for (const name of fs
    .readdirSync(dir)
    .filter((n) => /^app-\d+\.json$/.test(n))
    .sort()) {
    const part = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
    Object.assign(catalog, part)
  }
  const src = source()
  const kept = Object.fromEntries(
    Object.entries(catalog)
      .filter(([k]) => k in src)
      .sort(([a], [b]) => a.localeCompare(b, 'fr')),
  )
  fs.writeFileSync(file, `${JSON.stringify(kept, null, 2)}\n`, 'utf8')
  const r = checkCatalog(locale, kept, src)
  console.log(
    `${locale}: ${r.translated}/${Object.keys(src).length} translated, ${r.missing.length} missing, ${r.errors.length} errors`,
  )
  for (const e of r.errors.slice(0, 40)) console.log(`  ✗ ${e}`)
  for (const m of r.missing.slice(0, 40)) console.log(`  … missing: ${m}`)
} else {
  console.log('usage: batches.mjs split [size] | merge <locale> <dir>')
}
