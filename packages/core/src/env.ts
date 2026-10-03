/**
 * Lit le fichier `.env` de la racine du dépôt (et `.env.local`, qui l'emporte) en développement.
 * Une variable déjà présente dans l'environnement n'est jamais écrasée : Docker, la CI ou
 * `.vscode/launch.json` gardent la main.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseEnv } from 'node:util'

/** The repository root: the first folder up from `from` holding `pnpm-workspace.yaml`. */
function repoRoot(from: string): string | null {
  let dir = from
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

let loaded = false

export function loadEnvFiles(from = process.cwd()): string[] {
  if (loaded) return []
  loaded = true
  const root = repoRoot(from)
  if (!root) return []
  const files: string[] = []
  const fromFiles: Record<string, string> = {}
  // `.env.local` after `.env`: a personal override wins over the shared file.
  for (const name of ['.env', '.env.local']) {
    const path = join(root, name)
    if (!existsSync(path)) continue
    Object.assign(fromFiles, parseEnv(readFileSync(path, 'utf8')))
    files.push(name)
  }
  for (const [key, value] of Object.entries(fromFiles)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
  return files
}
