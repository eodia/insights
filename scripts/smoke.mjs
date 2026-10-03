#!/usr/bin/env node
/**
 * Test de fumée de bout en bout, contre une pile lancée (API + Trino + démo) :
 * connexion, exécution builder et SQL inter-bases, et surtout le modèle de sécurité —
 * l'analyste ne voit que sa région, des e-mails masqués, et ne passe pas en SQL natif.
 *
 *   node scripts/smoke.mjs [http://localhost:4100]
 */
const API = process.argv[2] ?? process.env.EODIA_API ?? 'http://localhost:4100'
let failures = 0

async function session(email, password) {
  const res = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
  if (!res.ok) throw new Error(`connexion ${email} : ${res.status}`)
  const cookie = res.headers.get('set-cookie')?.split(';')[0]
  return async (method, path, body) => {
    const r = await fetch(`${API}/api${path}`, {
      method,
      headers: { cookie, 'x-eodia-csrf': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
}

function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures++
}

const sql = (text) => ({ query: { kind: 'sql', sql: text } })

const admin = await session('admin@eodia.local', 'eodia-insights')
const analyst = await session('analyste@eodia.local', 'eodia-insights')

const me = await admin('GET', '/v1/me')
check('profil administrateur', me.body?.is_admin === true, JSON.stringify(me.body))

const regions = 'SELECT region, count(*) AS n, min(email) AS e FROM boutique.public.clients GROUP BY 1'
const a = await admin('POST', '/v1/query', sql(regions))
check('l’administrateur voit toutes les régions', a.body?.rows?.length > 10, JSON.stringify(a.body).slice(0, 200))
const b = await analyst('POST', '/v1/query', sql(regions))
check('l’analyste ne voit que sa région', b.body?.rows?.length === 1 && b.body.rows[0][0] === 'Bretagne', JSON.stringify(b.body).slice(0, 200))
check('les e-mails sont masqués pour l’analyste', String(b.body?.rows?.[0]?.[2] ?? '').includes('•'), JSON.stringify(b.body?.rows))

const n = await analyst('POST', '/v1/query', { query: { kind: 'native', datasource: '00000000-0000-0000-0000-000000000000', sql: 'select 1' } })
check('le SQL natif est refusé à l’analyste', n.status === 403, `${n.status}`)

const cross = await admin('POST', '/v1/query', sql('SELECT c.segment, count(*) FROM support.support.tickets t JOIN boutique.public.clients c ON c.id = t.client_id GROUP BY 1'))
check('requête inter-bases MongoDB × PostgreSQL', cross.body?.rows?.length >= 3, JSON.stringify(cross.body).slice(0, 200))

const tables = await admin('GET', '/v1/tables')
const orders = tables.body?.find((t) => t.name === 'commandes')
const built = await admin('POST', '/v1/query', {
  query: { kind: 'builder', source: { kind: 'table', id: orders?.id }, aggregations: [{ fn: 'count' }], breakouts: [{ field: 'passee_le', unit: 'month' }], filters: [{ column: { field: 'passee_le' }, op: 'date', values: ['past12months'] }] },
})
check('question construite au builder (par mois, 12 derniers mois)', built.body?.rows?.length >= 12, JSON.stringify(built.body).slice(0, 200))

const err = await admin('POST', '/v1/query', sql('SELECT nope FROM boutique.public.commandes'))
check('une erreur Trino est positionnée', err.status === 400 && err.body?.error?.details?.location?.line === 1, JSON.stringify(err.body))

const openapi = await fetch(`${API}/api/v1/openapi.json`).then((r) => r.json())
check('OpenAPI 3.1 générée', openapi.openapi === '3.1.0' && Object.keys(openapi.paths).length > 50, `${Object.keys(openapi.paths ?? {}).length} chemins`)

console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert.')
process.exit(failures ? 1 : 0)
