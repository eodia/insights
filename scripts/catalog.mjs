/**
 * Les migrations du catalogue — `packages/catalog-schema/migrations/NNNN_nom.sql`.
 *
 *   pnpm catalog status          # chaque migration : scellée ou non, appliquée ou non
 *   pnpm catalog new <nom>       # le fichier suivant, prêt à remplir
 *   pnpm catalog seal <version>  # fige celles qui ne le sont pas, à la publication
 *   pnpm catalog check           # une migration scellée a-t-elle été modifiée ?
 *   pnpm catalog check --release # …et aucune ne reste à sceller
 *
 * Une migration publiée ne se modifie plus : les installations l'ont appliquée et ont noté sa
 * somme de contrôle, et refusent de démarrer sur un catalogue dont elles ne peuvent garantir
 * l'histoire. Ce qui change après elle va dans la suivante. `sealed.json` associe chaque
 * version publiée aux fichiers qu'elle a figés : `{ "0.1.0": { "0001_catalogue.sql": "<sha256>" } }`.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE = fileURLToPath(new URL('../packages/catalog-schema/', import.meta.url))
const ROOT = join(PACKAGE, 'migrations')
const SEALED = join(ROOT, 'sealed.json')
const NAME = /^(\d{4})_([a-z0-9_]+)\.sql$/

/** As `listMigrations` in `@eodia/catalog-schema`: SHA-256 hex, line endings brought to LF. */
const checksumOf = (text) => createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex')

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function migrations() {
  return readdirSync(ROOT)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file, index) => {
      const match = NAME.exec(file)
      if (match === null) fail(`${file} : nom attendu NNNN_nom.sql (minuscules, chiffres, _).`)
      const version = Number.parseInt(match[1], 10)
      if (version !== index + 1) fail(`${file} devrait porter le numéro ${String(index + 1).padStart(4, '0')}.`)
      return { version, file, sha256: checksumOf(readFileSync(join(ROOT, file), 'utf8')) }
    })
}

/** Sealed files, flattened: `{ file, sha256, release }`. */
function sealed() {
  let raw
  try {
    raw = JSON.parse(readFileSync(SEALED, 'utf8'))
  } catch (err) {
    fail(`sealed.json illisible : ${err.message}`)
  }
  const out = []
  for (const [release, files] of Object.entries(raw)) {
    for (const [file, sha256] of Object.entries(files)) out.push({ file, sha256, release })
  }
  return { raw, list: out }
}

/** Every sealed migration still exists, under its name, with its text. */
function verify(all, frozen) {
  const problems = []
  for (const s of frozen) {
    const found = all.find((m) => m.file === s.file)
    if (found === undefined) {
      const renamed = all.find((m) => m.file.slice(0, 4) === s.file.slice(0, 4))
      problems.push(renamed ? `${s.file} (scellée en ${s.release}) a été renommée en ${renamed.file}.` : `${s.file} (scellée en ${s.release}) a disparu.`)
    } else if (found.sha256 !== s.sha256) {
      problems.push(
        `${s.file} a été modifiée après sa publication en ${s.release}. Remettez-la telle quelle (git show v${s.release}:packages/catalog-schema/migrations/${s.file}) et écrivez le changement dans une nouvelle migration : pnpm catalog new <nom>`,
      )
    }
  }
  return problems
}

/** What the catalog database recorded, or null when it cannot be reached. */
async function applied() {
  const url = process.env.EODIA_DATABASE_URL || 'postgres://eodia:eodia@localhost:55435/eodia'
  const schema = process.env.EODIA_DATABASE_SCHEMA || 'eodia'
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) fail(`EODIA_DATABASE_SCHEMA invalide : ${schema}`)
  // `pg` is a dependency of the catalog-schema package, not of the repository root.
  const pg = createRequire(join(PACKAGE, 'package.json'))('pg')
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 })
  try {
    await client.connect()
    const exists = await client.query('SELECT to_regclass($1) AS t', [`${schema}.catalog_migration`])
    if (!exists.rows[0]?.t) return { url, rows: new Map() }
    const { rows } = await client.query(`SELECT id, name, checksum, applied_at FROM ${schema}.catalog_migration ORDER BY id`)
    return { url, rows: new Map(rows.map((r) => [`${String(r.id).padStart(4, '0')}_${r.name}.sql`, r])) }
  } catch (err) {
    return { url, error: err.message }
  } finally {
    await client.end().catch(() => undefined)
  }
}

const redact = (url) => url.replace(/\/\/([^:/@]+):[^@]*@/, '//$1:***@')

const [command, argument] = process.argv.slice(2)
const all = migrations()
const { raw, list: frozen } = sealed()

switch (command) {
  case 'status': {
    const db = await applied()
    if (db.error) console.log(`(catalogue injoignable — ${redact(db.url)} : ${db.error})\n`)
    for (const m of all) {
      const s = frozen.find((f) => f.file === m.file)
      const seal = s === undefined ? 'à sceller' : s.sha256 === m.sha256 ? `scellée (${s.release})` : 'MODIFIÉE'
      let state = ''
      if (!db.error) {
        const row = db.rows.get(m.file)
        state = !row
          ? 'non appliquée'
          : row.checksum === m.sha256
            ? `appliquée le ${new Date(row.applied_at).toLocaleString('fr-FR')}`
            : 'APPLIQUÉE AVEC UNE AUTRE SOMME'
      }
      console.log(`${m.file.padEnd(40)} ${seal.padEnd(20)} ${state}`)
    }
    if (!db.error) {
      for (const file of db.rows.keys()) {
        if (!all.some((m) => m.file === file)) console.log(`${file.padEnd(40)} ${'absente du dépôt'.padEnd(20)} appliquée`)
      }
    }
    break
  }

  case 'new': {
    if (argument === undefined || !/^[a-z0-9_]+$/.test(argument)) {
      fail('Donnez un nom en minuscules, chiffres et _ : pnpm catalog new ajout_des_rappels')
    }
    const number = String(all.length + 1).padStart(4, '0')
    const file = `${number}_${argument}.sql`
    writeFileSync(
      join(ROOT, file),
      `-- ────────────────────────────────────────────────────────────────────────
-- ${number} — <ce que cette migration change, et pourquoi>
--
-- Appliquée au démarrage, dans sa propre transaction, après toutes les précédentes.
-- Ni transaction explicite, ni CREATE INDEX CONCURRENTLY : elle s'exécute déjà dans une.
-- Une fois publiée, elle ne change plus : la correction va dans la suivante.
-- ────────────────────────────────────────────────────────────────────────

`,
    )
    console.log(`✓ ${file} créée.`)
    break
  }

  case 'seal': {
    if (argument === undefined || !/^\d+\.\d+\.\d+/.test(argument)) fail('Donnez la version publiée : pnpm catalog seal 0.2.0')
    if (raw[argument]) fail(`La version ${argument} est déjà scellée.`)
    const problems = verify(all, frozen)
    if (problems.length > 0) fail(problems.join('\n  '))
    const fresh = all.filter((m) => !frozen.some((s) => s.file === m.file))
    if (fresh.length === 0) {
      console.log('Rien à sceller.')
      break
    }
    const next = { ...raw, [argument]: Object.fromEntries(fresh.map((m) => [m.file, m.sha256])) }
    writeFileSync(SEALED, `${JSON.stringify(next, null, 2)}\n`)
    for (const m of fresh) console.log(`✓ ${m.file} scellée pour ${argument}.`)
    break
  }

  case 'check': {
    const problems = verify(all, frozen)
    if (argument === '--release') {
      for (const m of all.filter((m) => !frozen.some((s) => s.file === m.file))) {
        problems.push(`${m.file} n'est pas scellée : pnpm catalog seal <version>, puis commit.`)
      }
    }
    if (problems.length > 0) fail(problems.join('\n  '))
    console.log(`✓ ${all.length} migration(s) de catalogue, ${frozen.length} scellée(s), intactes.`)
    break
  }

  default:
    fail('Commandes : status, new <nom>, seal <version>, check [--release]')
}
