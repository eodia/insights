// One translated batch against its source: `node tooling/i18n/check-part.mjs <locale> <batch> <translated>`.
// Prints missing keys and broken translations of that batch only.
import fs from 'node:fs'
import { checkCatalog, source } from './check.mjs'

const [locale, batchFile, partFile] = process.argv.slice(2)
const batch = JSON.parse(fs.readFileSync(batchFile, 'utf8'))
const part = JSON.parse(fs.readFileSync(partFile, 'utf8'))
const all = source()
const src = Object.fromEntries(Object.keys(batch).map((k) => [k, all[k]]))
const r = checkCatalog(locale, part, src)
console.log(`${locale}: ${r.translated}/${Object.keys(src).length} translated, ${r.missing.length} missing, ${r.errors.length} errors, ${r.stale.length} unknown keys`)
for (const m of r.missing.slice(0, 30)) console.log(`  … missing: ${m}`)
for (const e of r.errors.slice(0, 30)) console.log(`  ✗ ${e}`)
for (const s of r.stale.slice(0, 30)) console.log(`  ? unknown key: ${s}`)
