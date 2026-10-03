// The messages of the API meant for people — the `AppError`s of packages/core and apps/api.
//
//   node tooling/i18n/extract-api.mjs
//
// Writes tooling/i18n/api-source.json: each French message, `${…}` written as `{1}`, `{2}`…
// The translations are packages/core/src/i18n/<code>.json (`localizeMessage`).
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const require = createRequire(path.join(root, 'apps/web/package.json'))
const ts = require('typescript')

const CALLS = new Set(['AppError', 'notFound', 'forbidden', 'invalid'])
const found = new Map()

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(p)
  }
  return out
}

function text(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    let s = node.head.text
    node.templateSpans.forEach((span, i) => {
      s += `{${i + 1}}${span.literal.text}`
    })
    return s
  }
  return null
}

const french = (s) => /[a-zà-ÿ]{2,}/i.test(s) && /\s/.test(s)

for (const file of [...walk(path.join(root, 'packages/core/src')), ...walk(path.join(root, 'apps/api/src'))]) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true)
  const rel = path.relative(root, file)
  const visit = (node) => {
    const callee = ts.isNewExpression(node) || ts.isCallExpression(node) ? node.expression : null
    if (callee && ts.isIdentifier(callee) && CALLS.has(callee.text)) {
      const args = node.arguments ?? []
      const arg = callee.text === 'AppError' ? args[1] : args[0]
      const candidates = arg && ts.isConditionalExpression(arg) ? [arg.whenTrue, arg.whenFalse] : [arg]
      for (const c of candidates) {
        const t = c && text(c)
        if (t && french(t) && !found.has(t)) found.set(t, rel)
      }
    }
    // `{ code: '…', message: '…' }` written by hand (apps/api/src/http.ts), the copilot's tool
    // summaries, and the summaries and descriptions of the OpenAPI document (apps/api/src).
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && (node.name.text === 'message' || (node.name.text === 'summary' && (rel.endsWith('copilot.ts') || rel.startsWith('apps/api'))) || (node.name.text === 'description' && rel.startsWith('apps/api')))) {
      const t = text(node.initializer)
      if (t && french(t) && !found.has(t)) found.set(t, rel)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}
// The defaults of `notFound()` and `forbidden()`.
for (const m of fs.readFileSync(path.join(root, 'packages/core/src/errors.ts'), 'utf8').matchAll(/what = (['"])(.*?)\1/g))
  found.set(m[2], 'packages/core/src/errors.ts')

const sorted = Object.fromEntries([...found.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr')))
fs.writeFileSync(path.join(root, 'tooling/i18n/api-source.json'), `${JSON.stringify(sorted, null, 2)}\n`)
console.log(`${found.size} API messages`)
