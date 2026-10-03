/**
 * Superviseur minimal du mode `all` : lance l'API, le web et le worker (et le serveur MCP si
 * EODIA_WITH_MCP=1) dans un seul conteneur, préfixe leurs journaux, relaie SIGTERM, et
 * s'arrête dès que l'un d'eux meurt — l'orchestrateur redémarre alors le conteneur entier,
 * plutôt que de laisser tourner une instance à moitié vivante.
 */
import { spawn } from 'node:child_process'

const roles = ['api', 'web', 'worker', ...(process.env.EODIA_WITH_MCP === '1' ? ['mcp'] : [])]

// The worker runs on its own here: the API must not run the jobs a second time.
const env = { ...process.env, EODIA_INPROCESS_WORKER: '0' }

const children = new Map()
let stopping = false

function prefix(role, stream, target) {
  let buffer = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) target.write(`[${role}] ${line}\n`)
  })
  stream.on('end', () => {
    if (buffer) target.write(`[${role}] ${buffer}\n`)
  })
}

function stop(code) {
  if (stopping) return
  stopping = true
  for (const child of children.values()) child.kill('SIGTERM')
  // Whoever ignores SIGTERM is killed after ten seconds.
  setTimeout(() => {
    for (const child of children.values()) child.kill('SIGKILL')
    process.exit(code)
  }, 10_000).unref()
  const wait = setInterval(() => {
    if ([...children.values()].every((c) => c.exitCode !== null || c.signalCode !== null)) {
      clearInterval(wait)
      process.exit(code)
    }
  }, 200)
}

for (const role of roles) {
  const child = spawn('/bin/sh', ['/app/docker/entrypoint.sh', role], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.set(role, child)
  prefix(role, child.stdout, process.stdout)
  prefix(role, child.stderr, process.stderr)
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[supervisor] ${role} s'est arrêté (${signal ?? code}) : arrêt du conteneur.`)
      stop(code || 1)
    }
  })
}

console.log(`[supervisor] démarré : ${roles.join(', ')}`)
process.on('SIGTERM', () => stop(0))
process.on('SIGINT', () => stop(0))
