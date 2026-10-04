/**
 * Instance de démonstration : Maison Arvor, une boutique en ligne. Deux sources — PostgreSQL
 * « boutique » et MongoDB « support » (docker/demo) —, des tables décrites comme une équipe
 * data le ferait, six tableaux de bord qui racontent les histoires cachées dans les données
 * (la grève du transporteur, le rappel des Kerys Air 2, le bug de paiement mobile, l'entrepôt
 * de Rennes…), et des droits qui filtrent les lignes et masquent les e-mails d'une analyste.
 *
 * Le contenu est créé par « Équipe data », un compte sans mot de passe : une démo publique
 * protège ce qu'il a créé (voir `demoGuard` côté API).
 */
import type { BuilderQuery, DashboardCard, DashboardParameter, QuestionQuery, ResultColumnMeta, Visualization } from '@eodia/contracts'
import { createUser, needsSetup } from './auth/users'
import type { Actor, Core } from './context'
import { createDashboard, createQuestion } from './content/items'
import { createFolder, setBookmark } from './content/folders'
import { enqueue } from './jobs'
import { saveGroup, saveRowPolicy, setColumnRule, setDataPermission, setMembers, setQueryPermission } from './admin/permissions'
import { createDatasource, shareDatasource } from './sources/datasources'
import { addMember, createWorkspace, defaultWorkspace } from './workspaces'

export const DEMO_ADMIN = { email: 'admin@eodia.local', password: 'eodia-insights', name: 'Marc Jamain' }
export const DEMO_ANALYST = { email: 'analyste@eodia.local', password: 'eodia-insights', name: 'Camille Durand' }
/** The author of the demo's content: no password, nobody signs in as it. */
export const DEMO_AUTHOR_EMAIL = 'equipe-data@eodia.local'

export async function seedDemo(core: Core): Promise<boolean> {
  if (!(await needsSetup(core))) return false
  // Two spaces: the shop's, and its customer service's — each its own source, shared with the other.
  const arvor = await defaultWorkspace(core)
  await core.db.exec(
    `UPDATE workspace SET name = 'Maison Arvor', description = 'La boutique en ligne : ventes, marketing, catalogue, logistique.', color = 'green', icon = 'store'
     WHERE id = $1`,
    [arvor],
  )
  const admin = await createUser(core, { ...DEMO_ADMIN, admin: true })
  const analyst = await createUser(core, { ...DEMO_ANALYST, attributes: { region: 'Bretagne' } })
  const author = await createUser(core, { email: DEMO_AUTHOR_EMAIL, name: 'Équipe data', admin: true })
  const actor: Actor = { userId: author, workspaceId: arvor, via: 'system' }
  const care = (
    await createWorkspace(core, actor, {
      name: 'Service client',
      description: 'Les tickets du support, la satisfaction et les agents.',
      color: 'violet',
      icon: 'headset',
    })
  ).id
  await addMember(core, care, admin, 'admin')
  core.changed()
  const careActor: Actor = { ...actor, workspaceId: care }
  const { postgres, mongoUrl } = core.config.demoSources
  try {
    const boutique = await createDatasource(core, actor, {
      name: 'Boutique',
      engine: 'postgresql',
      catalog: 'boutique',
      description: 'Base transactionnelle de la boutique en ligne : catalogue, clients, commandes, avis, objectifs et dépenses marketing.',
      config: { host: postgres.host, port: postgres.port, database: 'boutique', user: 'lecteur', password: 'lecteur', ssl: false },
      schedule: 'daily',
    })
    const support = await createDatasource(core, careActor, {
      name: 'Support client',
      engine: 'mongodb',
      catalog: 'support',
      description: 'Tickets du service client et parcours des visiteurs du site (MongoDB).',
      config: { connection_url: mongoUrl },
      schedule: 'daily',
    })
    // The shop reads the tickets and the visits; the customer service, the customers and orders.
    await shareDatasource(core, actor, boutique.id, [care])
    await shareDatasource(core, careActor, support.id, [arvor])
  } catch (err) {
    console.warn(`[demo] sources non créées : ${err instanceof Error ? err.message : String(err)}`)
    return true
  }
  // The content needs the synced structure: queued after both syncs.
  await enqueue(core, 'demo_content', { user: author, admin, analyst, arvor, care })
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

// ── Dates of the story ───────────────────────────────────────────────────────
// The sample databases date everything from the day they were created — the same day as this
// content: the bands drawn over the charts fall on the same days as the incidents.

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return new Date(d.getTime() - n * DAY)
}
const dayKey = (n: number) => iso(daysAgo(n))
/** The Monday of the week, as Trino's `date_trunc('week', …)`. */
const weekKey = (n: number) => {
  const d = daysAgo(n)
  return iso(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY))
}
const monthKey = (n: number) => {
  const d = daysAgo(n)
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))
}
/** Days before today, as `docker/demo/boutique.sql` and `mongo-init.js` set them. */
const STORY = { appli: 560, tv: 520, tvEnd: 499, rennes: 380, defect: 170, recall: 128, strike: 68, strikeEnd: 48, bug: 35, bugEnd: 31 }

// ── How result columns read ──────────────────────────────────────────────────

type Meta = Record<string, Partial<ResultColumnMeta>>
const fmt = {
  money: (label: string, decimals = 0): Partial<ResultColumnMeta> => ({ label, semantic: 'amount', format: { number_style: 'currency', currency: 'EUR', decimals } }),
  pct: (label: string): Partial<ResultColumnMeta> => ({ label, semantic: 'percentage', format: { number_style: 'percent', percent_ratio: true, decimals: 1 } }),
  int: (label: string): Partial<ResultColumnMeta> => ({ label, format: { number_style: 'integer' } }),
  dec: (label: string, decimals = 1, suffix?: string): Partial<ResultColumnMeta> => ({ label, format: { number_style: 'decimal', decimals, ...(suffix ? { suffix } : {}) } }),
  text: (label: string): Partial<ResultColumnMeta> => ({ label }),
}

const PAID = `statut NOT IN ('annulée', 'remboursée')`
const B = 'boutique.public'
const S = 'support.support'

export async function demoContent(core: Core, payload: Record<string, unknown>): Promise<unknown> {
  const actor: Actor = { userId: String(payload.user), workspaceId: String(payload.arvor), via: 'system' }
  // The customer service's folder and dashboard live in its own space.
  const careActor: Actor = { ...actor, workspaceId: String(payload.care ?? payload.arvor) }
  const spaceOf = new Map<string, Actor>()
  const t = {
    commandes: await tableId(core, 'boutique', 'public', 'commandes'),
    clients: await tableId(core, 'boutique', 'public', 'clients'),
    produits: await tableId(core, 'boutique', 'public', 'produits'),
    lignes: await tableId(core, 'boutique', 'public', 'lignes_commande'),
    categories: await tableId(core, 'boutique', 'public', 'categories'),
    avis: await tableId(core, 'boutique', 'public', 'avis'),
    evenements: await tableId(core, 'boutique', 'public', 'evenements'),
    objectifs: await tableId(core, 'boutique', 'public', 'objectifs'),
    depenses: await tableId(core, 'boutique', 'public', 'depenses_marketing'),
    entrepots: await tableId(core, 'boutique', 'public', 'entrepots'),
    tickets: await tableId(core, 'support', 'support', 'tickets').catch(() => null),
    web: await tableId(core, 'support', 'support', 'evenements_web').catch(() => null),
  }

  await describeTables(core, t)

  // ── Folders ────────────────────────────────────────────────────────────────
  const folder = async (name: string, description: string, color: string, icon: string, who = actor) => {
    const id = (await createFolder(core, who, { name, description, color: color as never, icon })).id
    spaceOf.set(id, who)
    return id
  }
  /** Who creates in a folder: the author, in the folder's space. */
  const by = (folderId: string) => spaceOf.get(folderId) ?? actor
  const fDirection = await folder('Direction', 'Le pilotage de Maison Arvor : chiffre d’affaires, objectifs, prévisions.', 'indigo', 'landmark')
  const fVentes = await folder('Ventes', 'Le suivi commercial de la boutique.', 'green', 'shopping-bag')
  const fMarketing = await folder('Marketing', 'Acquisition, fidélité, parcours sur le site.', 'pink', 'megaphone')
  const fCatalogue = await folder('Catalogue', 'Produits, marges et avis.', 'amber', 'package')
  const fLogistique = await folder('Logistique', 'Entrepôts, délais et annulations.', 'sky', 'truck')
  const fSupport = await folder('Service client', 'Tickets, satisfaction et agents (MongoDB, joint aux clients PostgreSQL).', 'violet', 'headset', careActor)

  const q = async (
    folderId: string,
    name: string,
    query: QuestionQuery,
    visualization: Visualization,
    opts: { description?: string; meta?: Meta; type?: 'question' | 'metric' | 'model' } = {},
  ) =>
    (
      await createQuestion(core, by(folderId), {
        name,
        folder: folderId,
        query: query as never,
        visualization: visualization as never,
        ...(opts.type ? { type: opts.type } : {}),
        ...(opts.description ? { description: opts.description } : {}),
        ...(opts.meta ? { columns_meta: opts.meta as never } : {}),
      })
    ).id
  const sql = (text: string): QuestionQuery => ({ kind: 'sql', sql: text.trim() })

  // ── Ventes : the builder, without a line of SQL ─────────────────────────────
  const src = { kind: 'table' as const, id: t.commandes }
  const paid: BuilderQuery['filters'] = [{ column: { field: 'statut' }, op: 'is', values: ['livrée', 'expédiée', 'payée'] }]
  const ca = await q(
    fVentes,
    "Chiffre d'affaires",
    { kind: 'builder', source: src, aggregations: [{ fn: 'sum', column: { field: 'montant_total' } }], filters: paid },
    { type: 'scalar' },
    { type: 'metric', description: 'Somme des montants TTC des commandes payées, expédiées ou livrées, avant remise.' },
  )
  await q(
    fVentes,
    'Commandes enrichies',
    sql(`SELECT o.id, o.passee_le, o.statut, o.canal, o.montant_total, o.remise, o.montant_total - o.remise AS montant_net,
  o.mode_livraison, o.entrepot, c.segment, c.region, c.ville, c.canal_acquisition
FROM ${B}.commandes o
JOIN ${B}.clients c ON c.id = o.client_id`),
    { type: 'table' },
    { type: 'model', description: 'Chaque commande avec la région, la ville, le segment et le canal d’acquisition de son client.' },
  )
  const caMonth = await q(
    fVentes,
    "Chiffre d'affaires par mois",
    { kind: 'builder', source: src, aggregations: [{ fn: 'metric', metric: ca }], breakouts: [{ field: 'passee_le', unit: 'month' }] },
    { type: 'area', settings: { metrics: ['metric'], legend: false } },
  )
  const byChannel = await q(
    fVentes,
    'Commandes par canal',
    { kind: 'builder', source: src, aggregations: [{ fn: 'count' }], breakouts: [{ field: 'canal' }], sort: [{ target: { kind: 'aggregation', index: 0 }, desc: true }] },
    { type: 'pie', settings: { donut: true } },
  )
  const byRegion = await q(
    fVentes,
    "Chiffre d'affaires par région",
    {
      kind: 'builder',
      source: src,
      // Inner: under a row rule on the clients, the orders of the hidden ones drop out with them.
      joins: [{ alias: 'client', source: { kind: 'table', id: t.clients }, kind: 'inner', left: { field: 'client_id' }, right: 'id' }],
      aggregations: [{ fn: 'metric', metric: ca }],
      breakouts: [{ join: 'client', field: 'region' }],
      sort: [{ target: { kind: 'aggregation', index: 0 }, desc: true }],
    },
    { type: 'row' },
  )
  const basket = await q(fVentes, 'Panier moyen', { kind: 'builder', source: src, aggregations: [{ fn: 'avg', column: { field: 'montant_total' } }], filters: paid }, { type: 'scalar' })
  const orders = await q(fVentes, 'Nombre de commandes', { kind: 'builder', source: src, aggregations: [{ fn: 'count' }] }, { type: 'scalar' })
  const ordersTrend = await q(
    fVentes,
    'Commandes par semaine',
    { kind: 'builder', source: src, aggregations: [{ fn: 'count' }], breakouts: [{ field: 'passee_le', unit: 'week' }] },
    { type: 'trend' },
  )
  const status = await q(
    fVentes,
    'Commandes par statut',
    { kind: 'builder', source: src, aggregations: [{ fn: 'count' }], breakouts: [{ field: 'statut' }], sort: [{ target: { kind: 'aggregation', index: 0 }, desc: true }] },
    { type: 'bar' },
  )
  const topRated = await q(
    fVentes,
    'Produits les mieux notés',
    {
      kind: 'builder',
      source: { kind: 'table', id: t.produits },
      fields: [{ field: 'image_url' }, { field: 'nom' }, { field: 'marque' }, { field: 'prix' }, { field: 'note_moyenne' }],
      filters: [{ column: { field: 'actif' }, op: 'true', values: [] }],
      sort: [{ target: { kind: 'column', column: { field: 'note_moyenne' } }, desc: true }],
      limit: 10,
    },
    { type: 'table' },
  )
  const calendar = await q(
    fVentes,
    'Commandes par jour',
    sql(`SELECT CAST(passee_le AS date) AS jour, count(*) AS commandes
FROM ${B}.commandes
WHERE CAST(passee_le AS date) >= date_add('day', -364, current_date)
GROUP BY 1
ORDER BY 1`),
    { type: 'calendar', settings: { calendar_style: 'heatmap' } },
    { description: 'Le Black Friday, Noël, les soldes et le creux d’août sautent aux yeux.', meta: { jour: fmt.text('Jour'), commandes: fmt.int('Commandes') } },
  )
  const channelMix = await q(
    fVentes,
    'Part des canaux de vente',
    sql(`SELECT CAST(date_trunc('month', passee_le) AS date) AS mois, canal, count(*) AS commandes
FROM ${B}.commandes
WHERE CAST(passee_le AS date) < date_trunc('month', current_date)
GROUP BY 1, 2
ORDER BY 1, 2`),
    {
      type: 'area',
      settings: {
        dimensions: ['mois', 'canal'],
        metrics: ['commandes'],
        stack: 'percent',
        pieces: [{ from: monthKey(STORY.appli), to: monthKey(STORY.appli - 92), label: 'Lancement de l’appli' }],
      },
    },
    { description: 'L’application mobile prend près de la moitié des commandes en six mois.', meta: { mois: fmt.text('Mois'), canal: fmt.text('Canal'), commandes: fmt.int('Commandes') } },
  )
  const race = await q(
    fVentes,
    'La course des catégories',
    sql(`SELECT CAST(date_trunc('month', o.passee_le) AS date) AS mois, cat.nom AS categorie, sum(l.quantite * l.prix_unitaire) AS ca
FROM ${B}.lignes_commande l
JOIN ${B}.commandes o ON o.id = l.commande_id
JOIN ${B}.produits p ON p.id = l.produit_id
JOIN ${B}.categories cat ON cat.id = p.categorie_id
WHERE o.${PAID} AND CAST(o.passee_le AS date) >= date_add('month', -24, date_trunc('month', current_date))
GROUP BY 1, 2
ORDER BY 1, 2`),
    { type: 'bar_race', settings: { dimensions: ['mois', 'categorie'], metrics: ['ca'], race_cumulative: true, race_speed: 700 } },
    { description: 'Le chiffre d’affaires cumulé de chaque catégorie, mois après mois, sur deux ans.', meta: { mois: fmt.text('Mois'), categorie: fmt.text('Catégorie'), ca: fmt.money('Chiffre d’affaires') } },
  )
  const pivot = await q(
    fVentes,
    'Ventes par région et par rayon',
    sql(`SELECT c.region, cat.rayon, sum(l.quantite * l.prix_unitaire) AS ca
FROM ${B}.lignes_commande l
JOIN ${B}.commandes o ON o.id = l.commande_id
JOIN ${B}.clients c ON c.id = o.client_id
JOIN ${B}.produits p ON p.id = l.produit_id
JOIN ${B}.categories cat ON cat.id = p.categorie_id
WHERE o.${PAID} AND CAST(o.passee_le AS date) >= date_add('month', -12, current_date)
GROUP BY 1, 2
ORDER BY 1, 2`),
    { type: 'pivot', settings: { pivot_rows: ['region'], pivot_columns: ['rayon'], pivot_values: ['ca'], totals: true } },
    { description: 'Douze derniers mois.', meta: { region: fmt.text('Région'), rayon: fmt.text('Rayon'), ca: fmt.money('Chiffre d’affaires') } },
  )

  const parameters: DashboardParameter[] = [
    { id: 'periode', label: 'Période', type: 'date', default: 'last12months' },
    { id: 'canal', label: 'Canal', type: 'category', multiple: true },
    { id: 'granularite', label: 'Granularité', type: 'temporal_unit', default: 'month', units: ['week', 'month', 'quarter'] },
  ]
  const onOrders = (extra: { granularity?: boolean } = {}) => [
    { parameter: 'periode', target: { column: { field: 'passee_le' } } },
    { parameter: 'canal', target: { column: { field: 'canal' } } },
    ...(extra.granularity ? [{ parameter: 'granularite', target: { column: { field: 'passee_le' } } }] : []),
  ]
  const card = (id: string, question: string, tab: string | null, x: number, y: number, w: number, h: number, mappings: DashboardCard['mappings'] = [], title?: string): DashboardCard => ({
    id,
    tab,
    x,
    y,
    w,
    h,
    kind: 'question',
    question,
    mappings,
    ...(title ? { title } : {}),
  })
  const ventes = await createDashboard(core, actor, {
    name: 'Ventes de la boutique',
    description: "Chiffre d'affaires, commandes et clients — filtrable par période et canal.",
    folder: fVentes,
    tabs: [
      { id: 'ventes', label: 'Ventes' },
      { id: 'tendances', label: 'Tendances' },
    ],
    parameters: parameters as never,
    auto_refresh: null,
    cards: [
      { id: 'titre', tab: 'ventes', x: 0, y: 0, w: 24, h: 2, kind: 'heading', text: 'Vue d’ensemble' },
      card('ca', ca, 'ventes', 0, 2, 6, 4, onOrders()),
      card('commandes', orders, 'ventes', 6, 2, 6, 4, onOrders()),
      card('panier', basket, 'ventes', 12, 2, 6, 4, onOrders()),
      card('tendance', ordersTrend, 'ventes', 18, 2, 6, 4, onOrders()),
      card('ca-mois', caMonth, 'ventes', 0, 6, 16, 8, onOrders({ granularity: true })),
      card('canaux', byChannel, 'ventes', 16, 6, 8, 8, [{ parameter: 'periode', target: { column: { field: 'passee_le' } } }]),
      card('regions', byRegion, 'ventes', 0, 14, 12, 9, onOrders()),
      card('statuts', status, 'ventes', 12, 14, 12, 9, onOrders()),
      card('produits', topRated, 'ventes', 0, 23, 24, 8),
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
      card('calendrier', calendar, 'tendances', 0, 0, 24, 8),
      card('mix', channelMix, 'tendances', 0, 8, 14, 9),
      card('course', race, 'tendances', 14, 8, 10, 9),
      card('pivot', pivot, 'tendances', 0, 17, 24, 10),
    ] as never,
  })

  // ── Direction ──────────────────────────────────────────────────────────────
  const closedMonths = `CAST(passee_le AS date) < date_trunc('month', current_date)`
  const caTrend = await q(
    fDirection,
    'CA net du dernier mois',
    sql(`SELECT CAST(date_trunc('month', passee_le) AS date) AS mois, sum(montant_total - remise) AS ca_net
FROM ${B}.commandes
WHERE ${PAID} AND ${closedMonths}
GROUP BY 1
ORDER BY 1`),
    { type: 'trend', settings: { comparison: 'both', spark: 'area' } },
    { description: 'Le dernier mois complet, comparé au précédent et au même mois l’an passé. Net : remises déduites.', meta: { mois: fmt.text('Mois'), ca_net: fmt.money('CA net') } },
  )
  const ordersMonth = await q(
    fDirection,
    'Commandes du dernier mois',
    sql(`SELECT CAST(date_trunc('month', passee_le) AS date) AS mois, count(*) AS commandes
FROM ${B}.commandes
WHERE statut <> 'annulée' AND ${closedMonths}
GROUP BY 1
ORDER BY 1`),
    { type: 'trend', settings: { comparison: 'both', spark: 'bars' } },
    { meta: { mois: fmt.text('Mois'), commandes: fmt.int('Commandes') } },
  )
  const basketMonth = await q(
    fDirection,
    'Panier moyen du dernier mois',
    sql(`SELECT CAST(date_trunc('month', passee_le) AS date) AS mois, avg(montant_total - remise) AS panier_moyen
FROM ${B}.commandes
WHERE ${PAID} AND ${closedMonths}
GROUP BY 1
ORDER BY 1`),
    { type: 'trend', settings: { comparison: 'both', spark: 'line' } },
    { meta: { mois: fmt.text('Mois'), panier_moyen: fmt.money('Panier moyen', 2) } },
  )
  const marginMonth = await q(
    fDirection,
    'Taux de marge du dernier mois',
    sql(`SELECT CAST(date_trunc('month', o.passee_le) AS date) AS mois,
  CAST(sum(l.quantite * (l.prix_unitaire / 1.2 - l.cout_unitaire)) AS double) / CAST(sum(l.quantite * l.prix_unitaire / 1.2) AS double) AS taux_marge
FROM ${B}.lignes_commande l
JOIN ${B}.commandes o ON o.id = l.commande_id
WHERE o.${PAID} AND CAST(o.passee_le AS date) < date_trunc('month', current_date)
GROUP BY 1
ORDER BY 1`),
    { type: 'trend', settings: { comparison: 'both', spark: 'line' } },
    { description: 'Marge brute hors taxes rapportée au chiffre d’affaires hors taxes.', meta: { mois: fmt.text('Mois'), taux_marge: fmt.pct('Taux de marge') } },
  )
  const goal = await q(
    fDirection,
    'Atteinte de l’objectif annuel',
    sql(`WITH reel AS (
  SELECT sum(montant_total - remise) AS ca
  FROM ${B}.commandes
  WHERE ${PAID} AND year(passee_le) = year(current_date)
), cible AS (
  SELECT sum(CASE
    WHEN mois < date_trunc('month', current_date) THEN CAST(objectif_ca AS double)
    WHEN mois = date_trunc('month', current_date) THEN CAST(objectif_ca AS double) * day(current_date) / day(last_day_of_month(current_date))
  END) AS objectif
  FROM ${B}.objectifs
  WHERE year(mois) = year(current_date)
)
SELECT CAST(reel.ca AS double) / cible.objectif AS atteinte
FROM reel, cible`),
    { type: 'gauge', settings: { min: 0, max: 1.2 } },
    { description: 'Le chiffre d’affaires net depuis le 1er janvier, rapporté à l’objectif de la même période.', meta: { atteinte: fmt.pct('Atteinte de l’objectif') } },
  )
  const vsGoal = await q(
    fDirection,
    'CA net et objectif par mois',
    sql(`SELECT ob.mois, r.ca_net, ob.objectif_ca AS objectif
FROM ${B}.objectifs ob
LEFT JOIN (
  SELECT CAST(date_trunc('month', passee_le) AS date) AS mois, sum(montant_total - remise) AS ca_net
  FROM ${B}.commandes
  WHERE ${PAID} AND ${closedMonths}
  GROUP BY 1
) r ON r.mois = ob.mois
WHERE ob.mois >= date_add('month', -14, date_trunc('month', current_date))
ORDER BY 1`),
    { type: 'combo', settings: { dimensions: ['mois'], metrics: ['ca_net', 'objectif'], series: { ca_net: { display: 'bar' }, objectif: { display: 'line' } } } },
    { description: 'Les objectifs visent 30 % de plus que l’an passé ; les trois prochains mois sont déjà fixés.', meta: { mois: fmt.text('Mois'), ca_net: fmt.money('CA net'), objectif: fmt.money('Objectif') } },
  )
  const forecast = await q(
    fDirection,
    'Prévision du CA net',
    sql(`SELECT CAST(date_trunc('month', passee_le) AS date) AS mois, sum(montant_total - remise) AS ca_net
FROM ${B}.commandes
WHERE ${PAID}
  AND CAST(passee_le AS date) >= date_add('month', -35, date_trunc('month', current_date))
  AND ${closedMonths}
GROUP BY 1
ORDER BY 1`),
    { type: 'line', settings: { forecast: 6, forecast_method: 'seasonal', forecast_band: true, legend: false } },
    { description: 'Trois ans d’historique, une tendance et sa saison : les six prochains mois, avec leur intervalle à 80 %.', meta: { mois: fmt.text('Mois'), ca_net: fmt.money('CA net') } },
  )
  const growth = await q(
    fDirection,
    'Croissance par région sur un an',
    sql(`SELECT c.region,
  CAST(sum(CASE WHEN CAST(o.passee_le AS date) >= date_add('day', -365, current_date) THEN o.montant_total - o.remise END) AS double)
    / CAST(sum(CASE WHEN CAST(o.passee_le AS date) < date_add('day', -365, current_date) THEN o.montant_total - o.remise END) AS double) - 1 AS croissance
FROM ${B}.commandes o
JOIN ${B}.clients c ON c.id = o.client_id
WHERE o.${PAID} AND CAST(o.passee_le AS date) >= date_add('day', -730, current_date)
GROUP BY 1
ORDER BY 2 DESC`),
    { type: 'row', settings: { highlight: 'max' } },
    { description: 'Les douze derniers mois contre les douze précédents. L’Ouest s’envole depuis l’ouverture de l’entrepôt de Rennes.', meta: { region: fmt.text('Région'), croissance: fmt.pct('Croissance') } },
  )
  const regionCa = await q(
    fDirection,
    'CA net par région (12 mois)',
    sql(`SELECT c.region, sum(o.montant_total - o.remise) AS ca_net
FROM ${B}.commandes o
JOIN ${B}.clients c ON c.id = o.client_id
WHERE o.${PAID} AND CAST(o.passee_le AS date) >= date_add('day', -365, current_date)
GROUP BY 1
ORDER BY 2 DESC`),
    { type: 'treemap' },
    { meta: { region: fmt.text('Région'), ca_net: fmt.money('CA net') } },
  )
  const events = await q(
    fDirection,
    'Le calendrier de la boutique',
    {
      kind: 'builder',
      source: { kind: 'table', id: t.evenements },
      fields: [{ field: 'nom' }, { field: 'categorie' }, { field: 'debut' }, { field: 'fin' }, { field: 'description' }],
      sort: [{ target: { kind: 'column', column: { field: 'debut' } }, desc: true }],
    },
    { type: 'table' },
  )

  // ── Marketing ──────────────────────────────────────────────────────────────
  const spend = await q(
    fMarketing,
    'Dépenses marketing par canal',
    sql(`SELECT mois, canal, sum(montant) AS depenses
FROM ${B}.depenses_marketing
WHERE mois >= date_add('month', -24, date_trunc('month', current_date)) AND mois < date_trunc('month', current_date)
GROUP BY 1, 2
ORDER BY 1, 2`),
    { type: 'bar', settings: { dimensions: ['mois', 'canal'], metrics: ['depenses'], stack: 'stacked' } },
    { description: 'Le pic, c’est la campagne TV : regardez les inscriptions en accès direct la suivre, juste en dessous.', meta: { mois: fmt.text('Mois'), canal: fmt.text('Canal'), depenses: fmt.money('Dépenses') } },
  )
  const cac = await q(
    fMarketing,
    'Coût d’acquisition et valeur à 12 mois',
    sql(`WITH c AS (
  SELECT id, canal_acquisition AS canal, inscrit_le
  FROM ${B}.clients
  WHERE CAST(inscrit_le AS date) BETWEEN date_add('day', -730, current_date) AND date_add('day', -366, current_date)
), v AS (
  SELECT c.canal, c.id, coalesce(sum(o.montant_total - o.remise), 0) AS valeur
  FROM c
  LEFT JOIN ${B}.commandes o ON o.client_id = c.id AND o.${PAID} AND o.passee_le < c.inscrit_le + INTERVAL '365' DAY
  GROUP BY 1, 2
), d AS (
  SELECT canal, sum(montant) AS depenses
  FROM ${B}.depenses_marketing
  WHERE mois BETWEEN date_trunc('month', date_add('day', -730, current_date)) AND date_add('day', -366, current_date)
  GROUP BY 1
)
SELECT v.canal, CAST(max(d.depenses) AS double) / count(*) AS cout_acquisition, avg(v.valeur) AS valeur_12_mois, count(*) AS clients
FROM v JOIN d ON d.canal = v.canal
GROUP BY v.canal
ORDER BY 3 DESC`),
    { type: 'bubble', settings: { bubble_style: 'axes', dimensions: ['canal'], metrics: ['cout_acquisition', 'valeur_12_mois', 'clients'] } },
    {
      description: 'Pour les clients inscrits il y a un à deux ans : ce qu’ils ont coûté, ce qu’ils ont rapporté la première année. Le parrainage rapporte le plus pour presque rien.',
      meta: { canal: fmt.text('Canal'), cout_acquisition: fmt.money('Coût d’acquisition', 2), valeur_12_mois: fmt.money('Valeur à 12 mois'), clients: fmt.int('Clients') },
    },
  )
  const newByChannel = await q(
    fMarketing,
    'Nouveaux clients par canal',
    sql(`SELECT CAST(date_trunc('month', inscrit_le) AS date) AS mois, canal_acquisition AS canal, count(*) AS nouveaux_clients
FROM ${B}.clients
WHERE CAST(inscrit_le AS date) >= date_add('month', -24, date_trunc('month', current_date))
  AND CAST(inscrit_le AS date) < date_trunc('month', current_date)
GROUP BY 1, 2
ORDER BY 1, 2`),
    {
      type: 'area',
      settings: {
        dimensions: ['mois', 'canal'],
        metrics: ['nouveaux_clients'],
        stack: 'stacked',
        pieces: [{ from: monthKey(STORY.tv), to: monthKey(STORY.tvEnd), label: 'Campagne TV' }],
      },
    },
    { meta: { mois: fmt.text('Mois'), canal: fmt.text('Canal'), nouveaux_clients: fmt.int('Nouveaux clients') } },
  )
  const cohorts = await q(
    fMarketing,
    'Rétention par cohorte',
    sql(`WITH premieres AS (
  SELECT client_id, CAST(date_trunc('month', min(passee_le)) AS date) AS cohorte
  FROM ${B}.commandes
  WHERE statut <> 'annulée'
  GROUP BY 1
), recentes AS (
  SELECT * FROM premieres WHERE cohorte >= date_add('month', -12, date_trunc('month', current_date))
), tailles AS (
  SELECT cohorte, count(*) AS taille FROM recentes GROUP BY 1
)
SELECT r.cohorte,
  format('M+%02d', date_diff('month', r.cohorte, CAST(date_trunc('month', o.passee_le) AS date))) AS mois_depuis,
  CAST(count(DISTINCT o.client_id) AS double) / max(t.taille) AS retention
FROM recentes r
JOIN ${B}.commandes o ON o.client_id = r.client_id AND o.statut <> 'annulée'
JOIN tailles t ON t.cohorte = r.cohorte
WHERE date_diff('month', r.cohorte, CAST(date_trunc('month', o.passee_le) AS date)) BETWEEN 1 AND 11
  AND CAST(o.passee_le AS date) < date_trunc('month', current_date)
GROUP BY 1, 2
ORDER BY 1, 2`),
    {
      type: 'pivot',
      settings: {
        pivot_rows: ['cohorte'],
        pivot_columns: ['mois_depuis'],
        pivot_values: ['retention'],
        rules: [
          { op: 'gte', value: 0.2, color: '#16a34a' },
          { op: 'between', value: 0.12, value2: 0.2, color: '#65a30d' },
          { op: 'lt', value: 0.08, color: '#dc2626' },
        ],
      },
    },
    { description: 'La part des clients d’une cohorte (mois de leur première commande) qui commandent à nouveau, mois après mois.', meta: { cohorte: fmt.text('Cohorte'), mois_depuis: fmt.text('Mois après'), retention: fmt.pct('Rétention') } },
  )
  const funnel = t.web
    ? await q(
        fMarketing,
        'Tunnel de conversion (30 jours)',
        sql(`SELECT etape, count(DISTINCT session_id) AS sessions
FROM ${S}.evenements_web
WHERE etape_ordre BETWEEN 1 AND 5 AND survenu_le >= date_add('day', -30, current_date)
GROUP BY etape, etape_ordre
ORDER BY etape_ordre`),
        { type: 'funnel', settings: { funnel_style: 'bars' } },
        { description: 'Les sessions du site et de l’application, étape par étape (MongoDB).', meta: { etape: fmt.text('Étape'), sessions: fmt.int('Sessions') } },
      )
    : null
  const conversion = t.web
    ? await q(
        fMarketing,
        'Conversion au paiement : mobile et ordinateur',
        sql(`SELECT CAST(survenu_le AS date) AS jour, appareil,
  CAST(count(DISTINCT CASE WHEN etape = 'Confirmation' THEN session_id END) AS double)
    / nullif(count(DISTINCT CASE WHEN etape = 'Paiement' THEN session_id END), 0) AS conversion
FROM ${S}.evenements_web
WHERE appareil IN ('mobile', 'ordinateur') AND survenu_le >= date_add('day', -90, current_date)
GROUP BY 1, 2
ORDER BY 1, 2`),
        {
          type: 'line',
          settings: {
            dimensions: ['jour', 'appareil'],
            metrics: ['conversion'],
            pieces: [{ from: dayKey(STORY.bug), to: dayKey(STORY.bugEnd), label: 'Bug de paiement', color: '#dc2626' }],
          },
        },
        { description: 'La part des sessions arrivées au paiement qui vont jusqu’à la confirmation. Cinq jours noirs sur mobile.', meta: { jour: fmt.text('Jour'), appareil: fmt.text('Appareil'), conversion: fmt.pct('Conversion') } },
      )
    : null
  const sources = t.web
    ? await q(
        fMarketing,
        'Sessions par source (30 jours)',
        sql(`SELECT source, count(DISTINCT session_id) AS sessions
FROM ${S}.evenements_web
WHERE survenu_le >= date_add('day', -30, current_date)
GROUP BY 1
ORDER BY 2 DESC`),
        { type: 'pie', settings: { donut: true } },
        { meta: { source: fmt.text('Source'), sessions: fmt.int('Sessions') } },
      )
    : null

  // ── Catalogue ──────────────────────────────────────────────────────────────
  const treemap = await q(
    fCatalogue,
    'Chiffre d’affaires par rayon et catégorie',
    sql(`SELECT cat.rayon, cat.nom AS categorie, sum(l.quantite * l.prix_unitaire) AS ca
FROM ${B}.lignes_commande l
JOIN ${B}.commandes o ON o.id = l.commande_id
JOIN ${B}.produits p ON p.id = l.produit_id
JOIN ${B}.categories cat ON cat.id = p.categorie_id
WHERE o.${PAID} AND CAST(o.passee_le AS date) >= date_add('month', -12, current_date)
GROUP BY 1, 2
ORDER BY 3 DESC`),
    { type: 'treemap', settings: { dimensions: ['rayon', 'categorie'], metrics: ['ca'] } },
    { description: 'Douze derniers mois.', meta: { rayon: fmt.text('Rayon'), categorie: fmt.text('Catégorie'), ca: fmt.money('Chiffre d’affaires') } },
  )
  const priceRating = await q(
    fCatalogue,
    'Prix, note et ventes des produits',
    sql(`WITH v AS (
  SELECT p.nom AS produit, p.prix, p.note_moyenne, sum(l.quantite * l.prix_unitaire) AS ca
  FROM ${B}.produits p
  JOIN ${B}.lignes_commande l ON l.produit_id = p.id
  JOIN ${B}.commandes o ON o.id = l.commande_id
  WHERE o.${PAID} AND CAST(o.passee_le AS date) >= date_add('month', -12, current_date) AND p.note_moyenne IS NOT NULL
  GROUP BY 1, 2, 3
)
SELECT produit, prix, note_moyenne, ca
FROM (SELECT v.*, row_number() OVER (ORDER BY ca DESC) AS rang FROM v)
WHERE rang <= 7 OR produit = 'Écouteurs Kerys Air 2'
ORDER BY ca DESC`),
    { type: 'bubble', settings: { bubble_style: 'axes', dimensions: ['produit'], metrics: ['prix', 'note_moyenne', 'ca'], x_label: 'Prix', y_label: 'Note moyenne' } },
    { description: 'Les meilleures ventes de l’année : leur prix, leur note, leur chiffre d’affaires. La bulle tombée tout en bas, ce sont les Kerys Air 2.', meta: { produit: fmt.text('Produit'), prix: fmt.money('Prix', 2), note_moyenne: fmt.dec('Note moyenne', 2), ca: fmt.money('Chiffre d’affaires') } },
  )
  const marginByCategory = await q(
    fCatalogue,
    'Taux de marge par catégorie',
    sql(`SELECT cat.nom AS categorie,
  CAST(sum(l.quantite * (l.prix_unitaire / 1.2 - l.cout_unitaire)) AS double) / CAST(sum(l.quantite * l.prix_unitaire / 1.2) AS double) AS taux_marge
FROM ${B}.lignes_commande l
JOIN ${B}.commandes o ON o.id = l.commande_id
JOIN ${B}.produits p ON p.id = l.produit_id
JOIN ${B}.categories cat ON cat.id = p.categorie_id
WHERE o.${PAID} AND CAST(o.passee_le AS date) >= date_add('month', -12, current_date)
GROUP BY 1
ORDER BY 2 DESC`),
    { type: 'row', settings: { highlight: 'min' } },
    { description: 'Hors taxes, soldes comprises. La high-tech vend beaucoup mais marge peu.', meta: { categorie: fmt.text('Catégorie'), taux_marge: fmt.pct('Taux de marge') } },
  )
  const defectBand = [{ from: weekKey(STORY.defect), to: weekKey(STORY.recall), label: 'Défaut de batterie', color: '#dc2626' }]
  const kerys = await q(
    fCatalogue,
    'Kerys Air 2 : ventes par semaine',
    sql(`SELECT CAST(date_trunc('week', o.passee_le) AS date) AS semaine, sum(l.quantite) AS ventes
FROM ${B}.lignes_commande l
JOIN ${B}.commandes o ON o.id = l.commande_id
JOIN ${B}.produits p ON p.id = l.produit_id
WHERE p.nom = 'Écouteurs Kerys Air 2'
GROUP BY 1
ORDER BY 1`),
    { type: 'area', settings: { pieces: defectBand } },
    { description: 'Un lancement fracassant, un lot défectueux, le rappel.', meta: { semaine: fmt.text('Semaine'), ventes: fmt.int('Ventes') } },
  )
  const kerysRating = await q(
    fCatalogue,
    'Kerys Air 2 : note moyenne par semaine',
    sql(`SELECT CAST(date_trunc('week', a.publie_le) AS date) AS semaine, avg(a.note) AS note_moyenne
FROM ${B}.avis a
JOIN ${B}.produits p ON p.id = a.produit_id
WHERE p.nom = 'Écouteurs Kerys Air 2'
GROUP BY 1
ORDER BY 1`),
    { type: 'line', settings: { pieces: defectBand, y_min: 1, y_max: 5 } },
    { description: 'Les avis arrivent après la livraison : la note plonge quelques semaines après le défaut.', meta: { semaine: fmt.text('Semaine'), note_moyenne: fmt.dec('Note moyenne', 2) } },
  )
  const kerysReviews = await q(
    fCatalogue,
    'Ce que disent les clients des Kerys Air 2',
    sql(`SELECT a.publie_le, a.note, a.commentaire
FROM ${B}.avis a
JOIN ${B}.produits p ON p.id = a.produit_id
WHERE p.nom = 'Écouteurs Kerys Air 2' AND a.commentaire IS NOT NULL
ORDER BY a.publie_le DESC
LIMIT 60`),
    { type: 'table', settings: { rules: [{ column: 'note', op: 'lte', value: 2, color: '#dc2626', row: false }, { column: 'note', op: 'gte', value: 4, color: '#16a34a' }] } },
    { meta: { publie_le: fmt.text('Publié le'), note: fmt.int('Note'), commentaire: fmt.text('Commentaire') } },
  )
  const topProducts = await q(
    fCatalogue,
    'Les 15 meilleures ventes (12 mois)',
    sql(`SELECT p.image_url, p.nom AS produit, cat.nom AS categorie, sum(l.quantite) AS ventes,
  sum(l.quantite * l.prix_unitaire) AS ca, sum(l.quantite * (l.prix_unitaire / 1.2 - l.cout_unitaire)) AS marge, p.note_moyenne
FROM ${B}.lignes_commande l
JOIN ${B}.commandes o ON o.id = l.commande_id
JOIN ${B}.produits p ON p.id = l.produit_id
JOIN ${B}.categories cat ON cat.id = p.categorie_id
WHERE o.${PAID} AND CAST(o.passee_le AS date) >= date_add('month', -12, current_date)
GROUP BY 1, 2, 3, 7
ORDER BY 5 DESC
LIMIT 15`),
    { type: 'table', settings: { rules: [{ column: 'note_moyenne', op: 'lt', value: 3.5, color: '#dc2626' }] } },
    {
      meta: {
        image_url: { label: 'Photo', semantic: 'image_url' },
        produit: fmt.text('Produit'),
        categorie: fmt.text('Catégorie'),
        ventes: fmt.int('Ventes'),
        ca: fmt.money('Chiffre d’affaires'),
        marge: fmt.money('Marge HT'),
        note_moyenne: fmt.dec('Note', 2),
      },
    },
  )

  // ── Logistique ─────────────────────────────────────────────────────────────
  const delay = await q(
    fLogistique,
    'Délai de livraison : l’Ouest et le reste',
    sql(`SELECT CAST(date_trunc('week', o.passee_le) AS date) AS semaine,
  CASE WHEN c.region IN ('Bretagne', 'Pays de la Loire', 'Normandie') THEN 'Ouest' ELSE 'Reste de la France' END AS zone,
  avg(date_diff('hour', o.passee_le, o.livree_le)) / 24.0 AS delai_jours
FROM ${B}.commandes o
JOIN ${B}.clients c ON c.id = o.client_id
WHERE o.livree_le IS NOT NULL
  AND CAST(o.passee_le AS date) >= date_add('week', -80, current_date)
  AND CAST(o.passee_le AS date) < date_trunc('week', current_date)
GROUP BY 1, 2
ORDER BY 1, 2`),
    {
      type: 'line',
      settings: {
        dimensions: ['semaine', 'zone'],
        metrics: ['delai_jours'],
        pieces: [
          { from: weekKey(STORY.rennes), to: weekKey(STORY.rennes - 7), label: 'Entrepôt de Rennes', color: '#16a34a' },
          { from: weekKey(STORY.strike), to: weekKey(STORY.strikeEnd), label: 'Grève', color: '#dc2626' },
        ],
      },
    },
    { description: 'Le délai moyen entre la commande et la livraison, en jours.', meta: { semaine: fmt.text('Semaine'), zone: fmt.text('Zone'), delai_jours: fmt.dec('Délai', 1, ' j') } },
  )
  const delayByRegion = await q(
    fLogistique,
    'Délai moyen par région (90 jours)',
    sql(`SELECT c.region, avg(date_diff('hour', o.passee_le, o.livree_le)) / 24.0 AS delai_jours
FROM ${B}.commandes o
JOIN ${B}.clients c ON c.id = o.client_id
WHERE o.livree_le IS NOT NULL AND CAST(o.passee_le AS date) >= date_add('day', -90, current_date)
GROUP BY 1
ORDER BY 2`),
    { type: 'row', settings: { highlight: 'min' } },
    { meta: { region: fmt.text('Région'), delai_jours: fmt.dec('Délai', 1, ' j') } },
  )
  const clientsMap = await q(
    fLogistique,
    'Où sont nos clients',
    {
      kind: 'builder',
      source: { kind: 'table', id: t.clients },
      aggregations: [{ fn: 'count' }],
      breakouts: [{ field: 'ville' }],
      sort: [{ target: { kind: 'aggregation', index: 0 }, desc: true }],
      limit: 30,
    },
    { type: 'bubble', settings: { bubble_style: 'packed', bubble_labels: 'name' } },
    { description: 'Une bulle par ville, aussi grosse que sa clientèle.' },
  )
  const cancellations = await q(
    fLogistique,
    'Taux d’annulation par semaine',
    sql(`SELECT CAST(date_trunc('week', passee_le) AS date) AS semaine, avg(CASE WHEN statut = 'annulée' THEN 1e0 ELSE 0e0 END) AS taux_annulation
FROM ${B}.commandes
WHERE CAST(passee_le AS date) >= date_add('week', -40, current_date) AND CAST(passee_le AS date) < date_trunc('week', current_date)
GROUP BY 1
ORDER BY 1`),
    { type: 'area', settings: { pieces: [{ from: weekKey(STORY.strike), to: weekKey(STORY.strikeEnd), label: 'Grève', color: '#dc2626' }] } },
    { meta: { semaine: fmt.text('Semaine'), taux_annulation: fmt.pct('Annulations') } },
  )
  const warehouses = await q(
    fLogistique,
    'Commandes par entrepôt et mode de livraison',
    sql(`SELECT entrepot, mode_livraison, count(*) AS commandes
FROM ${B}.commandes
WHERE CAST(passee_le AS date) >= date_add('month', -12, current_date)
GROUP BY 1, 2
ORDER BY 1, 2`),
    { type: 'bar', settings: { dimensions: ['entrepot', 'mode_livraison'], metrics: ['commandes'], stack: 'stacked' } },
    { description: 'Douze derniers mois.', meta: { entrepot: fmt.text('Entrepôt'), mode_livraison: fmt.text('Mode de livraison'), commandes: fmt.int('Commandes') } },
  )

  // ── Service client (MongoDB, joined to PostgreSQL) ─────────────────────────
  const supportCards: DashboardCard[] = []
  if (t.tickets) {
    const perDay = await q(
      fSupport,
      'Tickets par jour',
      sql(`SELECT CAST(cree_le AS date) AS jour, count(*) AS tickets
FROM ${S}.tickets
WHERE cree_le >= date_add('day', -120, current_date)
GROUP BY 1
ORDER BY 1`),
      {
        type: 'area',
        settings: {
          pieces: [
            { from: dayKey(STORY.strike), to: dayKey(STORY.strikeEnd), label: 'Grève du transporteur', color: '#dc2626' },
            { from: dayKey(STORY.bug), to: dayKey(STORY.bugEnd), label: 'Bug de paiement', color: '#d97706' },
          ],
        },
      },
      { meta: { jour: fmt.text('Jour'), tickets: fmt.int('Tickets') } },
    )
    const satisfaction = await q(
      fSupport,
      'Satisfaction (30 jours)',
      sql(`SELECT avg(satisfaction) AS satisfaction
FROM ${S}.tickets
WHERE satisfaction IS NOT NULL AND cree_le >= date_add('day', -30, current_date)`),
      { type: 'gauge', settings: { min: 1, max: 5 } },
      { description: 'Note moyenne laissée après résolution, sur 5.', meta: { satisfaction: fmt.dec('Satisfaction', 2, ' / 5') } },
    )
    const reasons = await q(
      fSupport,
      'Tickets par motif',
      sql(`SELECT CAST(date_trunc('month', cree_le) AS date) AS mois, motif, count(*) AS tickets
FROM ${S}.tickets
WHERE cree_le >= date_add('month', -12, date_trunc('month', current_date)) AND cree_le < date_trunc('month', current_date)
GROUP BY 1, 2
ORDER BY 1, 2`),
      { type: 'bar', settings: { dimensions: ['mois', 'motif'], metrics: ['tickets'], stack: 'stacked' } },
      { meta: { mois: fmt.text('Mois'), motif: fmt.text('Motif'), tickets: fmt.int('Tickets') } },
    )
    const channels = await q(
      fSupport,
      'Tickets par canal (12 mois)',
      sql(`SELECT canal, count(*) AS tickets
FROM ${S}.tickets
WHERE cree_le >= date_add('month', -12, current_date)
GROUP BY 1
ORDER BY 2 DESC`),
      { type: 'pie', settings: { donut: true } },
      { meta: { canal: fmt.text('Canal'), tickets: fmt.int('Tickets') } },
    )
    const agents = await q(
      fSupport,
      'Classement des agents (90 jours)',
      sql(`SELECT agent, count(*) AS tickets,
  approx_percentile(delai_resolution_h, 0.5) AS delai_median_h,
  avg(satisfaction) AS satisfaction,
  avg(CASE WHEN premier_contact_resolu THEN 1e0 ELSE 0e0 END) AS premier_contact
FROM ${S}.tickets
WHERE cree_le >= date_add('day', -90, current_date)
GROUP BY 1
ORDER BY 4 DESC`),
      {
        type: 'table',
        settings: {
          rules: [
            { column: 'satisfaction', op: 'gte', value: 4.2, color: '#16a34a' },
            { column: 'satisfaction', op: 'lt', value: 3.8, color: '#dc2626' },
          ],
        },
      },
      {
        meta: {
          agent: fmt.text('Agent'),
          tickets: fmt.int('Tickets'),
          delai_median_h: fmt.dec('Délai médian', 1, ' h'),
          satisfaction: fmt.dec('Satisfaction', 2),
          premier_contact: fmt.pct('Résolus au premier contact'),
        },
      },
    )
    const flagged = await q(
      fSupport,
      'Produits les plus signalés',
      sql(`SELECT produit, count(*) AS tickets
FROM ${S}.tickets
WHERE produit IS NOT NULL AND motif IN ('Produit défectueux', 'Retour') AND cree_le >= date_add('month', -12, current_date)
GROUP BY 1
ORDER BY 2 DESC
LIMIT 8`),
      { type: 'row', settings: { highlight: 'max' } },
      { meta: { produit: fmt.text('Produit'), tickets: fmt.int('Tickets') } },
    )
    const crossDb = await q(
      fSupport,
      'Satisfaction du support par segment client',
      sql(`SELECT c.segment, t.motif, avg(t.satisfaction) AS satisfaction_moyenne, count(*) AS tickets
FROM ${S}.tickets t
JOIN ${B}.clients c ON c.id = t.client_id
WHERE t.satisfaction IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2`),
      { type: 'bar', settings: { dimensions: ['motif', 'segment'], metrics: ['satisfaction_moyenne'] } },
      {
        description: 'Requête inter-bases : les tickets MongoDB joints aux clients PostgreSQL, dans une seule requête Trino.',
        meta: { segment: fmt.text('Segment'), motif: fmt.text('Motif'), satisfaction_moyenne: fmt.dec('Satisfaction', 2), tickets: fmt.int('Tickets') },
      },
    )
    const premium = await q(
      fSupport,
      'Tickets en attente, clients Premium d’abord',
      sql(`SELECT c.segment, t.cree_le, t.motif, t.priorite, t.agent, c.prenom, c.nom, c.email, c.ville
FROM ${S}.tickets t
JOIN ${B}.clients c ON c.id = t.client_id
WHERE t.statut IN ('ouvert', 'en cours')
ORDER BY CASE c.segment WHEN 'Premium' THEN 0 WHEN 'Professionnel' THEN 1 ELSE 2 END, t.cree_le`),
      { type: 'table' },
      {
        description: 'Inter-bases, et sous vos droits : l’analyste régionale n’y voit que sa région, et les e-mails masqués.',
        meta: { segment: fmt.text('Segment'), cree_le: fmt.text('Ouvert le'), motif: fmt.text('Motif'), priorite: fmt.text('Priorité'), agent: fmt.text('Agent'), prenom: fmt.text('Prénom'), nom: fmt.text('Nom'), email: { label: 'E-mail', semantic: 'email' }, ville: fmt.text('Ville') },
      },
    )
    supportCards.push(
      card('jour', perDay, null, 0, 0, 16, 8),
      card('satisfaction', satisfaction, null, 16, 0, 8, 8),
      card('motifs', reasons, null, 0, 8, 14, 9),
      card('canaux', channels, null, 14, 8, 10, 9),
      card('agents', agents, null, 0, 17, 14, 9),
      card('signales', flagged, null, 14, 17, 10, 9),
      card('segments', crossDb, null, 0, 26, 12, 9),
      card('premium', premium, null, 12, 26, 12, 9),
    )
  }

  // ── Dashboards ─────────────────────────────────────────────────────────────
  const dash = async (folderId: string, name: string, description: string, cards: DashboardCard[]) =>
    (await createDashboard(core, by(folderId), { name, description, folder: folderId, tabs: [], parameters: [], auto_refresh: null, cards: cards as never })).id

  const marketing = await dash(fMarketing, 'Acquisition et fidélité', 'D’où viennent les clients, combien ils coûtent, s’ils reviennent — et où ils décrochent sur le site.', [
    card('depenses', spend, null, 0, 0, 14, 9),
    card('cac', cac, null, 14, 0, 10, 9),
    card('nouveaux', newByChannel, null, 0, 9, 24, 8),
    card('cohortes', cohorts, null, 0, 17, 15, 10),
    ...(sources ? [card('sources', sources, null, 15, 17, 9, 10)] : []),
    ...(funnel ? [card('tunnel', funnel, null, 0, 27, 10, 9)] : []),
    ...(conversion ? [card('conversion', conversion, null, 10, 27, 14, 9)] : []),
  ])
  const catalogue = await dash(fCatalogue, 'Produits et marges', 'Ce qui se vend, ce qui rapporte, ce que les clients en pensent.', [
    card('treemap', treemap, null, 0, 0, 12, 10),
    card('bulles', priceRating, null, 12, 0, 12, 10),
    { id: 'kerys-titre', tab: null, x: 0, y: 10, w: 24, h: 2, kind: 'heading', text: 'L’affaire Kerys Air 2' },
    card('kerys', kerys, null, 0, 12, 8, 9),
    card('kerys-note', kerysRating, null, 8, 12, 8, 9),
    card('kerys-avis', kerysReviews, null, 16, 12, 8, 9),
    card('marge', marginByCategory, null, 0, 21, 9, 10),
    card('top', topProducts, null, 9, 21, 15, 10),
  ])
  const logistique = await dash(fLogistique, 'Livraisons', 'Trois entrepôts, trois modes de livraison — et une grève.', [
    card('delai', delay, null, 0, 0, 24, 9),
    card('carte', clientsMap, null, 0, 9, 12, 11),
    card('regions', delayByRegion, null, 12, 9, 12, 11),
    card('annulations', cancellations, null, 0, 20, 12, 8),
    card('entrepots', warehouses, null, 12, 20, 12, 8),
  ])
  const support = supportCards.length
    ? await dash(fSupport, 'Service client', 'Les tickets MongoDB, joints aux clients PostgreSQL dans les mêmes requêtes.', supportCards)
    : null

  const stories = [
    `### Trois histoires à explorer`,
    `- **La grève du transporteur** : délais, annulations, tickets et satisfaction — [Livraisons](/dashboard/${logistique})${support ? `, [Service client](/dashboard/${support})` : ''}.`,
    `- **L’affaire Kerys Air 2** : un succès, un défaut de batterie, le rappel — [Produits et marges](/dashboard/${catalogue}).`,
    `- **Le bug de paiement mobile** : cinq jours noirs dans le tunnel — [Acquisition et fidélité](/dashboard/${marketing}).`,
    '',
    `Ou demandez à l’assistant : *« Pourquoi les tickets ont-ils explosé cet été ? »*`,
  ].join('\n')
  const pilotage = await dash(fDirection, 'Pilotage de Maison Arvor', 'Le dernier mois clos, l’objectif de l’année, la prévision — et ce qui se passe dans les régions.', [
    { id: 'titre', tab: null, x: 0, y: 0, w: 24, h: 2, kind: 'heading', text: 'Le dernier mois en un coup d’œil' },
    card('ca', caTrend, null, 0, 2, 6, 5),
    card('commandes', ordersMonth, null, 6, 2, 6, 5),
    card('panier', basketMonth, null, 12, 2, 6, 5),
    card('marge', marginMonth, null, 18, 2, 6, 5),
    card('objectif-mois', vsGoal, null, 0, 7, 16, 9),
    card('objectif', goal, null, 16, 7, 8, 9),
    card('prevision', forecast, null, 0, 16, 16, 9),
    { id: 'histoires', tab: null, x: 16, y: 16, w: 8, h: 9, kind: 'text', text: stories },
    card('croissance', growth, null, 0, 25, 12, 10),
    card('regions', regionCa, null, 12, 25, 12, 10),
    card('calendrier', events, null, 0, 35, 24, 8),
  ])

  // The admin finds the steering dashboard among their favourites on the home page.
  if (payload.admin) {
    const admin: Actor = { userId: String(payload.admin), workspaceId: actor.workspaceId, via: 'system' }
    await setBookmark(core, admin, 'dashboard', pilotage, true)
    await setBookmark(core, admin, 'dashboard', ventes.id, true)
  }

  await demoPermissions(core, actor, t, String(payload.analyst))
  return { ok: true }
}

// ── Tables and columns, described as a data team would ──────────────────────

/** The demo's tables, by name: `null` when a source could not be synced. */
type Tables = Readonly<Record<string, string | null | undefined>>

type ColumnPatch = { label?: string; description?: string; semantic?: string; format?: Record<string, unknown>; unit?: string }

async function describeTables(core: Core, t: Tables) {
  const table = async (id: string | null | undefined, patch: { label?: string; description: string; entity?: string; icon?: string; color?: string }) => {
    if (!id) return
    await core.db.exec(
      `UPDATE db_table SET label = coalesce($2, label), description = $3, entity = coalesce($4, entity), icon = coalesce($5, icon), color = coalesce($6, color) WHERE id = $1`,
      [id, patch.label ?? null, patch.description, patch.entity ?? null, patch.icon ?? null, patch.color ?? null],
    )
  }
  const columns = async (id: string | null | undefined, patches: Record<string, ColumnPatch>) => {
    if (!id) return
    for (const [name, p] of Object.entries(patches)) {
      await core.db.exec(
        `UPDATE db_column SET
           label = coalesce($3, label),
           description = coalesce($4, description),
           semantic_type = coalesce($5, semantic_type),
           semantic_source = CASE WHEN $5::text IS NULL THEN semantic_source ELSE 'user' END,
           format = CASE WHEN $6::jsonb IS NULL THEN format ELSE $6::jsonb END,
           unit = coalesce($7, unit)
         WHERE table_id = $1 AND name = $2`,
        [id, name, p.label ?? null, p.description ?? null, p.semantic ?? null, p.format ? JSON.stringify(p.format) : null, p.unit ?? null],
      )
    }
  }
  const eur = { number_style: 'currency', currency: 'EUR' }

  await table(t.commandes, { description: 'Une ligne par commande passée sur le site, l’application ou une marketplace.', entity: 'Commande', icon: 'shopping-cart', color: 'green' })
  await columns(t.commandes, {
    passee_le: { label: 'Passée le', semantic: 'created_at' },
    livree_le: { label: 'Livrée le', description: 'Vide tant que la commande n’est pas livrée.' },
    statut: { semantic: 'status' },
    canal: { description: 'Web (site), Mobile (application, et site mobile avant elle) ou Marketplace.' },
    montant_total: { label: 'Montant total', description: 'Montant TTC des articles, hors frais de port, avant remise.', semantic: 'amount', format: eur },
    remise: { description: 'Remise accordée par le code promo.', semantic: 'discount', format: eur },
    frais_port: { label: 'Frais de port', format: eur },
    code_promo: { label: 'Code promo' },
    mode_livraison: { label: 'Mode de livraison' },
    entrepot: { label: 'Entrepôt', description: 'Paris-Nord, Lyon, ou Rennes pour l’Ouest depuis son ouverture.' },
  })
  await table(t.clients, { description: 'Personnes inscrites sur la boutique.', entity: 'Client', icon: 'users', color: 'blue' })
  await columns(t.clients, {
    prenom: { label: 'Prénom' },
    inscrit_le: { label: 'Inscrit le', semantic: 'created_at' },
    region: { label: 'Région', semantic: 'region' },
    ville: { semantic: 'city' },
    pays: { semantic: 'country' },
    latitude: { semantic: 'latitude' },
    longitude: { semantic: 'longitude' },
    email: { label: 'E-mail', semantic: 'email' },
    segment: { semantic: 'category', description: 'Particulier, Premium (les 10 % qui dépensent le plus) ou Professionnel.' },
    canal_acquisition: { label: 'Canal d’acquisition', semantic: 'category' },
    date_naissance: { label: 'Date de naissance', semantic: 'birth_date' },
  })
  await table(t.produits, { description: 'Le catalogue : 96 produits, de la coque de téléphone au vélo électrique.', entity: 'Produit', icon: 'package', color: 'amber' })
  await columns(t.produits, {
    nom: { semantic: 'entity_name' },
    categorie_id: { label: 'Catégorie' },
    prix: { description: 'Prix public TTC.', semantic: 'price', format: eur },
    cout: { label: 'Coût', description: 'Coût d’achat unitaire hors taxes.', semantic: 'cost', format: eur },
    note_moyenne: { label: 'Note moyenne', semantic: 'rating', format: { number_style: 'decimal', decimals: 2, rating_max: 5 } },
    actif: { description: 'Faux pour un produit retiré de la vente — les Kerys Air 2 depuis leur rappel.' },
    image_url: { label: 'Image', semantic: 'image_url' },
    cree_le: { label: 'Mis en vente le', semantic: 'created_at' },
  })
  await table(t.lignes, { label: 'Lignes de commande', description: 'Les articles de chaque commande, au prix payé.', entity: 'Ligne', icon: 'list', color: 'green' })
  await columns(t.lignes, {
    quantite: { label: 'Quantité', semantic: 'quantity' },
    prix_unitaire: { label: 'Prix unitaire', description: 'Prix payé TTC, soldes comprises.', semantic: 'price', format: eur },
    cout_unitaire: { label: 'Coût unitaire', description: 'Coût d’achat HT au moment de la vente.', semantic: 'cost', format: eur },
  })
  await table(t.categories, { label: 'Catégories', description: 'Seize catégories en quatre rayons : High-tech, Maison, Sport, Culture.', icon: 'tags', color: 'amber' })
  await table(t.avis, { description: 'Les avis laissés après livraison.', entity: 'Avis', icon: 'star', color: 'yellow' })
  await columns(t.avis, {
    note: { semantic: 'rating', format: { number_style: 'integer', rating_max: 5 } },
    commentaire: { semantic: 'comment' },
    publie_le: { label: 'Publié le', semantic: 'created_at' },
  })
  await table(t.evenements, { label: 'Événements', description: 'Le calendrier de la boutique : temps forts commerciaux et incidents. Utile pour expliquer une courbe.', icon: 'calendar', color: 'rose' })
  await columns(t.evenements, { debut: { label: 'Début', semantic: 'event_at' }, categorie: { label: 'Catégorie' } })
  await table(t.objectifs, { description: 'Les objectifs mensuels fixés par la direction.', icon: 'target', color: 'indigo' })
  await columns(t.objectifs, {
    objectif_ca: { label: 'Objectif de CA', description: 'Chiffre d’affaires net visé (TTC, remises déduites).', semantic: 'amount', format: eur },
    objectif_commandes: { label: 'Objectif de commandes', semantic: 'quantity' },
  })
  await table(t.depenses, { label: 'Dépenses marketing', description: 'Ce que coûte chaque canal d’acquisition, mois par mois.', icon: 'megaphone', color: 'pink' })
  await columns(t.depenses, { montant: { semantic: 'amount', format: eur }, impressions: { semantic: 'quantity' }, clics: { semantic: 'quantity' } })
  await table(t.entrepots, { label: 'Entrepôts', description: 'D’où partent les colis.', icon: 'warehouse', color: 'sky' })
  await columns(t.entrepots, { latitude: { semantic: 'latitude' }, longitude: { semantic: 'longitude' }, ouvert_le: { label: 'Ouvert le' } })
  await table(t.tickets, { description: 'Les demandes adressées au service client (MongoDB).', entity: 'Ticket', icon: 'life-buoy', color: 'violet' })
  await columns(t.tickets, {
    cree_le: { label: 'Créé le', semantic: 'created_at' },
    resolu_le: { label: 'Résolu le' },
    statut: { semantic: 'status' },
    satisfaction: { description: 'Note laissée après résolution, de 1 à 5.', semantic: 'rating', format: { number_style: 'decimal', decimals: 1, rating_max: 5 } },
    delai_resolution_h: { label: 'Délai de résolution', semantic: 'duration', format: { number_style: 'duration', duration_unit: 'h' } },
    premier_contact_resolu: { label: 'Résolu au premier contact', semantic: 'business_boolean' },
    priorite: { label: 'Priorité' },
    client_id: { label: 'Client', description: 'L’identifiant du client dans la base boutique (PostgreSQL).' },
  })
  await table(t.web, { label: 'Événements web', description: 'Le parcours des visiteurs du site et de l’application, page par page, sur les 90 derniers jours (MongoDB).', entity: 'Visite', icon: 'mouse-pointer-click', color: 'cyan' })
  await columns(t.web, {
    survenu_le: { label: 'Survenu le', semantic: 'event_at' },
    duree_s: { label: 'Durée', semantic: 'duration', format: { number_style: 'duration', duration_unit: 's' } },
    etape: { label: 'Étape' },
    etape_ordre: { label: 'Ordre de l’étape' },
    session_id: { label: 'Session' },
    client_id: { label: 'Client' },
  })

  // Colours and pictograms of the values people filter on.
  const looks = async (id: string | null | undefined, column: string, values: Record<string, [string, string]>) => {
    if (!id) return
    const col = await core.db.one<{ id: string }>(`SELECT id FROM db_column WHERE table_id = $1 AND name = $2`, [id, column])
    if (!col) return
    for (const [value, [color, icon]] of Object.entries(values)) {
      await core.db.exec(
        `INSERT INTO column_value (column_id, value, label, color, icon) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (column_id, value) DO UPDATE SET label = EXCLUDED.label, color = EXCLUDED.color, icon = EXCLUDED.icon`,
        [col.id, value, value.charAt(0).toUpperCase() + value.slice(1), color, icon],
      )
    }
  }
  await looks(t.commandes, 'statut', { livrée: ['green', 'package-check'], expédiée: ['sky', 'truck'], payée: ['indigo', 'credit-card'], annulée: ['red', 'circle-x'], remboursée: ['amber', 'undo-2'] })
  await looks(t.commandes, 'canal', { Web: ['blue', 'globe'], Mobile: ['violet', 'smartphone'], Marketplace: ['orange', 'store'] })
  await looks(t.clients, 'segment', { Particulier: ['gray', 'user'], Premium: ['amber', 'crown'], Professionnel: ['teal', 'briefcase'] })
  await looks(t.tickets, 'statut', { ouvert: ['red', 'circle-dot'], 'en cours': ['amber', 'loader'], résolu: ['green', 'check'], fermé: ['gray', 'archive'] })
  await looks(t.tickets, 'priorite', { haute: ['red', 'flame'], normale: ['gray', 'minus'], basse: ['sky', 'arrow-down'] })

  // The two MongoDB collections point at the clients of PostgreSQL: the builder joins them.
  const clientId = t.clients ? await core.db.one<{ id: string }>(`SELECT id FROM db_column WHERE table_id = $1 AND name = 'id'`, [t.clients]) : null
  for (const from of [t.tickets, t.web]) {
    if (!from || !clientId) continue
    const col = await core.db.one<{ id: string }>(`SELECT id FROM db_column WHERE table_id = $1 AND name = 'client_id'`, [from])
    if (col) await core.db.exec(`INSERT INTO db_relation (from_column_id, to_column_id, origin) VALUES ($1, $2, 'manual') ON CONFLICT DO NOTHING`, [col.id, clientId.id])
  }
}

// ── Rights: a regional team reads the boutique under row and column rules ────

async function demoPermissions(core: Core, actor: Actor, t: Tables, analyst: string) {
  const boutique = await core.db.one<{ id: string }>(`SELECT id FROM datasource WHERE catalog = 'boutique'`)
  const all = await core.db.one<{ id: string }>(`SELECT id FROM user_group WHERE kind = 'all' AND workspace_id = $1`, [actor.workspaceId])
  if (!boutique || !all || !t.clients || !t.commandes) return
  const team = await saveGroup(core, actor, { name: 'Équipe régionale', description: 'Voit les clients de sa région et les commandes de son canal ; e-mails masqués.' })
  await setMembers(core, actor, team, [analyst])
  await core.db.exec(`UPDATE user_attribute SET value = 'Bretagne' WHERE user_id = $1 AND key = 'region'`, [analyst])
  await core.db.exec(`INSERT INTO user_attribute (user_id, key, value) VALUES ($1, 'canal', 'Web') ON CONFLICT DO NOTHING`, [analyst])
  await setDataPermission(core, actor, { group: all.id, datasource: boutique.id, schema: null, table: null, access: 'none' })
  await setDataPermission(core, actor, { group: team, datasource: boutique.id, schema: null, table: null, access: 'restricted' })
  await setQueryPermission(core, actor, { group: team, datasource: boutique.id, level: 'sql' })
  await saveRowPolicy(core, actor, { group: team, table: t.clients, match: 'all', conditions: [{ column: 'region', op: 'eq', values: ['{{user.region}}'] }], description: 'Clients de la région de la personne' })
  await saveRowPolicy(core, actor, { group: team, table: t.commandes, match: 'all', conditions: [{ column: 'canal', op: 'eq', values: ['{{user.canal}}'] }], description: 'Commandes du canal de la personne' })
  const email = await core.db.one<{ id: string }>(`SELECT id FROM db_column WHERE table_id = $1 AND name = 'email'`, [t.clients])
  if (email) await setColumnRule(core, actor, { group: team, column: email.id, access: 'masked' })
  const direction = await saveGroup(core, actor, { name: 'Direction', description: 'Lecture complète de toutes les sources.' })
  await setDataPermission(core, actor, { group: direction, datasource: boutique.id, schema: null, table: null, access: 'read' })
  await setQueryPermission(core, actor, { group: direction, datasource: boutique.id, level: 'sql' })
}
