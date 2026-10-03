/**
 * Instance de démonstration : un administrateur, deux sources (Postgres « boutique » et MongoDB
 * « support »), une métrique, un modèle, des questions et un tableau de bord filtré — de quoi
 * montrer une requête inter-bases dès le premier lancement.
 */
import type { BuilderQuery, DashboardCard, DashboardParameter, QuestionQuery, Visualization } from '@eodia/contracts'
import { createUser, needsSetup } from './auth/users'
import type { Actor, Core } from './context'
import { createDashboard, createQuestion } from './content/items'
import { createFolder } from './content/folders'
import { enqueue } from './jobs'
import { saveGroup, saveRowPolicy, setColumnRule, setDataPermission, setMembers, setQueryPermission } from './admin/permissions'
import { createDatasource } from './sources/datasources'

export const DEMO_ADMIN = { email: 'admin@eodia.local', password: 'eodia-insights', name: 'Marc Jamain' }

export async function seedDemo(core: Core): Promise<boolean> {
  if (!(await needsSetup(core))) return false
  const userId = await createUser(core, { ...DEMO_ADMIN, admin: true })
  const analyst = await createUser(core, { email: 'analyste@eodia.local', name: 'Camille Durand', password: 'eodia-insights', attributes: { region: 'Bretagne' } })
  const actor: Actor = { userId, via: 'system' }
  try {
    await createDatasource(core, actor, {
      name: 'Boutique',
      engine: 'postgresql',
      catalog: 'boutique',
      description: 'Base transactionnelle de la boutique en ligne',
      config: { host: 'localhost', port: 55434, database: 'boutique', user: 'demo', password: 'demo', ssl: false },
      schedule: 'daily',
    })
    await createDatasource(core, actor, {
      name: 'Support client',
      engine: 'mongodb',
      catalog: 'support',
      description: 'Tickets du service client et événements web (MongoDB)',
      config: { connection_url: 'mongodb://localhost:57017/' },
      schedule: 'daily',
    })
  } catch (err) {
    console.warn(`[demo] sources non créées : ${err instanceof Error ? err.message : String(err)}`)
    return true
  }
  // The content needs the synced structure: queued after both syncs.
  await enqueue(core, 'demo_content', { user: userId, analyst })
  return true
}

async function tableId(core: Core, catalog: string, schema: string, name: string): Promise<string> {
  const row = await core.db.one<{ id: string }>(
    `SELECT t.id FROM db_table t JOIN datasource d ON d.id = t.datasource_id WHERE d.catalog = $1 AND t.schema_name = $2 AND t.name = $3`,
    [catalog, schema, name],
  )
  if (!row) throw new Error(`Table de démo absente : ${catalog}.${schema}.${name}`)
  return row.id
}

export async function demoContent(core: Core, payload: Record<string, unknown>): Promise<unknown> {
  const actor: Actor = { userId: String(payload.user), via: 'system' }
  const commandes = await tableId(core, 'boutique', 'public', 'commandes')
  const clients = await tableId(core, 'boutique', 'public', 'clients')
  const produits = await tableId(core, 'boutique', 'public', 'produits')
  const tickets = await tableId(core, 'support', 'support', 'tickets').catch(() => null)

  // Labels with their accents, as the Structure screen would set them.
  const labels: Record<string, string> = {
    passee_le: 'Passée le',
    livree_le: 'Livrée le',
    inscrit_le: 'Inscrit le',
    cree_le: 'Créé le',
    publie_le: 'Publié le',
    region: 'Région',
    prenom: 'Prénom',
    categorie_id: 'Catégorie',
    cout: 'Coût',
    quantite: 'Quantité',
    remise: 'Remise',
    note_moyenne: 'Note moyenne',
    canal_acquisition: "Canal d'acquisition",
    date_naissance: 'Date de naissance',
    delai_resolution_h: 'Délai de résolution',
    duree_s: 'Durée',
    evenements_web: 'Événements web',
    lignes_commande: 'Lignes de commande',
    categories: 'Catégories',
  }
  for (const [name, label] of Object.entries(labels)) {
    await core.db.exec('UPDATE db_column SET label = $2 WHERE name = $1', [name, label])
    await core.db.exec('UPDATE db_table SET label = $2 WHERE name = $1', [name, label])
  }

  // A few descriptions, as a team would write them.
  await core.db.exec(`UPDATE db_table SET description = 'Une ligne par commande passée sur le site, l''application ou une marketplace.', entity = 'Commande', icon = 'shopping-cart', color = 'green' WHERE id = $1`, [commandes])
  await core.db.exec(`UPDATE db_table SET description = 'Personnes inscrites sur la boutique.', entity = 'Client', icon = 'users', color = 'blue' WHERE id = $1`, [clients])
  await core.db.exec(`UPDATE db_column SET description = 'Montant TTC de la commande, hors frais de port, avant remise.' WHERE table_id = $1 AND name = 'montant_total'`, [commandes])
  const statusColors: Record<string, [string, string]> = {
    livrée: ['green', 'package-check'],
    expédiée: ['sky', 'truck'],
    payée: ['indigo', 'credit-card'],
    annulée: ['red', 'circle-x'],
    remboursée: ['amber', 'undo-2'],
  }
  const statut = await core.db.one<{ id: string }>(`SELECT id FROM db_column WHERE table_id = $1 AND name = 'statut'`, [commandes])
  if (statut) {
    for (const [value, [color, icon]] of Object.entries(statusColors)) {
      await core.db.exec(
        `INSERT INTO column_value (column_id, value, label, color, icon) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (column_id, value) DO UPDATE SET label = EXCLUDED.label, color = EXCLUDED.color, icon = EXCLUDED.icon`,
        [statut.id, value, value.charAt(0).toUpperCase() + value.slice(1), color, icon],
      )
    }
  }

  const folder = await createFolder(core, actor, { name: 'Ventes', description: 'Le suivi commercial de la boutique', color: 'green', icon: 'shopping-bag' })
  const support = await createFolder(core, actor, { name: 'Service client', color: 'violet', icon: 'headset' })

  const src = { kind: 'table' as const, id: commandes }
  const paid: BuilderQuery['filters'] = [{ column: { field: 'statut' }, op: 'is', values: ['livrée', 'expédiée', 'payée'] }]
  const ca = await createQuestion(core, actor, {
    name: "Chiffre d'affaires",
    type: 'metric',
    description: 'Somme des montants des commandes payées, expédiées ou livrées.',
    folder: folder.id,
    query: { kind: 'builder', source: src, aggregations: [{ fn: 'sum', column: { field: 'montant_total' } }], filters: [...(paid ?? [])] as never },
    visualization: { type: 'scalar' },
  })
  await createQuestion(core, actor, {
    name: 'Commandes enrichies',
    type: 'model',
    description: 'Chaque commande avec la région, la ville et le segment de son client.',
    folder: folder.id,
    query: {
      kind: 'sql',
      sql: `SELECT o.id, o.passee_le, o.statut, o.canal, o.montant_total, o.remise, c.segment, c.region, c.ville, c.canal_acquisition
FROM boutique.public.commandes o
JOIN boutique.public.clients c ON c.id = o.client_id`,
    },
    visualization: { type: 'table' },
  })

  const q = async (name: string, query: QuestionQuery, visualization: Visualization, f = folder.id, description?: string) =>
    createQuestion(core, actor, { name, query: query as never, visualization: visualization as never, folder: f, ...(description ? { description } : {}) })

  const caMonth = await q(
    "Chiffre d'affaires par mois",
    { kind: 'builder', source: src, aggregations: [{ fn: 'metric', metric: ca.id }], breakouts: [{ field: 'passee_le', unit: 'month' }] },
    { type: 'area', settings: { metrics: ["metric"], legend: false } },
  )
  const byChannel = await q(
    'Commandes par canal',
    { kind: 'builder', source: src, aggregations: [{ fn: 'count' }], breakouts: [{ field: 'canal' }], sort: [{ target: { kind: 'aggregation', index: 0 }, desc: true }] },
    { type: 'pie', settings: { donut: true } },
  )
  const byRegion = await q(
    "Chiffre d'affaires par région",
    {
      kind: 'builder',
      source: src,
      joins: [{ alias: 'client', source: { kind: 'table', id: clients }, kind: 'left', left: { field: 'client_id' }, right: 'id' }],
      aggregations: [{ fn: 'metric', metric: ca.id }],
      breakouts: [{ join: 'client', field: 'region' }],
      sort: [{ target: { kind: 'aggregation', index: 0 }, desc: true }],
    },
    { type: 'row' },
  )
  const basket = await q('Panier moyen', { kind: 'builder', source: src, aggregations: [{ fn: 'avg', column: { field: 'montant_total' } }], filters: paid }, { type: 'scalar' })
  const orders = await q('Nombre de commandes', { kind: 'builder', source: src, aggregations: [{ fn: 'count' }] }, { type: 'trend', settings: { comparison: 'previous' } })
  const ordersTrend = await q(
    'Commandes par semaine',
    { kind: 'builder', source: src, aggregations: [{ fn: 'count' }], breakouts: [{ field: 'passee_le', unit: 'week' }] },
    { type: 'trend' },
  )
  const status = await q(
    'Commandes par statut',
    { kind: 'builder', source: src, aggregations: [{ fn: 'count' }], breakouts: [{ field: 'statut' }], sort: [{ target: { kind: 'aggregation', index: 0 }, desc: true }] },
    { type: 'bar' },
  )
  const topProducts = await q(
    'Produits les mieux notés',
    { kind: 'builder', source: { kind: 'table', id: produits }, fields: [{ field: 'nom' }, { field: 'marque' }, { field: 'prix' }, { field: 'note_moyenne' }], sort: [{ target: { kind: 'column', column: { field: 'note_moyenne' } }, desc: true }], limit: 10 },
    { type: 'table' },
  )
  const crossDb = tickets
    ? await q(
        'Satisfaction du support par segment client',
        {
          kind: 'sql',
          sql: `SELECT c.segment, t.motif, round(avg(t.satisfaction), 2) AS satisfaction_moyenne, count(*) AS tickets
FROM support.support.tickets t
JOIN boutique.public.clients c ON c.id = t.client_id
WHERE t.satisfaction IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2`,
        },
        { type: 'bar', settings: { dimensions: ['motif', 'segment'], metrics: ['satisfaction_moyenne'] } },
        support.id,
        'Requête inter-bases : tickets MongoDB joints aux clients PostgreSQL.',
      )
    : null
  const ticketsByReason = tickets
    ? await q(
        'Tickets par motif',
        { kind: 'builder', source: { kind: 'table', id: tickets }, aggregations: [{ fn: 'count' }], breakouts: [{ field: 'motif' }], sort: [{ target: { kind: 'aggregation', index: 0 }, desc: true }] },
        { type: 'row' },
        support.id,
      )
    : null

  const parameters: DashboardParameter[] = [
    { id: 'periode', label: 'Période', type: 'date', default: 'past12months' },
    { id: 'canal', label: 'Canal', type: 'category', multiple: true },
    { id: 'granularite', label: 'Granularité', type: 'temporal_unit', default: 'month', units: ['week', 'month', 'quarter'] },
  ]
  const onOrders = (extra: { granularity?: boolean } = {}) => [
    { parameter: 'periode', target: { column: { field: 'passee_le' } } },
    { parameter: 'canal', target: { column: { field: 'canal' } } },
    ...(extra.granularity ? [{ parameter: 'granularite', target: { column: { field: 'passee_le' } } }] : []),
  ]
  const card = (id: string, question: string, x: number, y: number, w: number, h: number, mappings: DashboardCard['mappings'] = [], title?: string): DashboardCard => ({
    id,
    tab: 'ventes',
    x,
    y,
    w,
    h,
    kind: 'question',
    question,
    mappings,
    ...(title ? { title } : {}),
  })
  await createDashboard(core, actor, {
    name: 'Ventes de la boutique',
    description: "Chiffre d'affaires, commandes et clients — filtrable par période et canal.",
    folder: folder.id,
    tabs: [
      { id: 'ventes', label: 'Ventes' },
      { id: 'support', label: 'Service client' },
    ],
    parameters: parameters as never,
    auto_refresh: null,
    cards: [
      { id: 'titre', tab: 'ventes', x: 0, y: 0, w: 24, h: 2, kind: 'heading', text: 'Vue d’ensemble' },
      card('ca', ca.id, 0, 2, 6, 4, onOrders()),
      card('commandes', orders.id, 6, 2, 6, 4, onOrders()),
      card('panier', basket.id, 12, 2, 6, 4, onOrders()),
      card('tendance', ordersTrend.id, 18, 2, 6, 4, onOrders()),
      card('ca-mois', caMonth.id, 0, 6, 16, 8, onOrders({ granularity: true })),
      card('canaux', byChannel.id, 16, 6, 8, 8, [{ parameter: 'periode', target: { column: { field: 'passee_le' } } }]),
      card('regions', byRegion.id, 0, 14, 12, 9, onOrders()),
      card('statuts', status.id, 12, 14, 12, 9, onOrders()),
      card('produits', topProducts.id, 0, 23, 24, 8),
      {
        id: 'note',
        tab: 'ventes',
        x: 0,
        y: 31,
        w: 24,
        h: 3,
        kind: 'text',
        text: 'Les montants incluent la TVA. Une commande compte dans le chiffre d’affaires dès qu’elle est **payée**.',
      },
      ...(crossDb ? [{ ...card('satisfaction', crossDb.id, 0, 0, 14, 9), tab: 'support' }] : []),
      ...(ticketsByReason ? [{ ...card('motifs', ticketsByReason.id, 14, 0, 10, 9), tab: 'support' }] : []),
    ] as never,
  })

  // Permissions: a regional team reads the boutique under row and column rules.
  const boutique = await core.db.one<{ id: string }>(`SELECT id FROM datasource WHERE catalog = 'boutique'`)
  const all = await core.db.one<{ id: string }>(`SELECT id FROM user_group WHERE kind = 'all'`)
  if (boutique && all) {
    const team = await saveGroup(core, actor, { name: 'Équipe régionale', description: 'Voit les clients de sa région et les commandes de son canal ; e-mails masqués.' })
    await setMembers(core, actor, team, [String(payload.analyst)])
    await core.db.exec(`UPDATE user_attribute SET value = 'Bretagne' WHERE user_id = $1 AND key = 'region'`, [payload.analyst])
    await core.db.exec(`INSERT INTO user_attribute (user_id, key, value) VALUES ($1, 'canal', 'Web') ON CONFLICT DO NOTHING`, [payload.analyst])
    await setDataPermission(core, actor, { group: all.id, datasource: boutique.id, schema: null, table: null, access: 'none' })
    await setDataPermission(core, actor, { group: team, datasource: boutique.id, schema: null, table: null, access: 'restricted' })
    await setQueryPermission(core, actor, { group: team, datasource: boutique.id, level: 'sql' })
    await saveRowPolicy(core, actor, { group: team, table: clients, match: 'all', conditions: [{ column: 'region', op: 'eq', values: ['{{user.region}}'] }], description: 'Clients de la région de la personne' })
    await saveRowPolicy(core, actor, { group: team, table: commandes, match: 'all', conditions: [{ column: 'canal', op: 'eq', values: ['{{user.canal}}'] }], description: 'Commandes du canal de la personne' })
    const email = await core.db.one<{ id: string }>(`SELECT id FROM db_column WHERE table_id = $1 AND name = 'email'`, [clients])
    if (email) await setColumnRule(core, actor, { group: team, column: email.id, access: 'masked' })
    const direction = await saveGroup(core, actor, { name: 'Direction', description: 'Lecture complète de toutes les sources.' })
    await setDataPermission(core, actor, { group: direction, datasource: boutique.id, schema: null, table: null, access: 'read' })
    await setQueryPermission(core, actor, { group: direction, datasource: boutique.id, level: 'sql' })
  }
  return { ok: true }
}
