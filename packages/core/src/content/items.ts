/** Questions, modèles, métriques et tableaux de bord : création, lecture, modification, archivage. */
import type {
  Aggregation,
  BuilderQuery,
  Dashboard,
  DashboardCard,
  DashboardInput,
  DashboardParameter,
  DashboardTab,
  Filter,
  ItemKind,
  Question,
  QuestionInput,
  QuestionQuery,
  ResultColumnMeta,
  SourceRef,
  Visualization,
} from '@eodia/contracts'
import { DASHBOARD_LIMITS } from '@eodia/contracts'
import { audit } from '../audit'
import { summaryOf } from '../auth/users'
import type { Actor, Core } from '../context'
import { AppError, forbidden, invalid, notFound } from '../errors'
import { atLeastAccess, contentIndex } from './access'
import { assertItemAccess, itemsWhere } from './folders'

interface QuestionRow {
  id: string
  folder_id: string | null
  type: Question['type']
  kind: QuestionQuery['kind']
  name: string
  description: string | null
  query: QuestionQuery
  visualization: Visualization
  columns_meta: Record<string, Partial<ResultColumnMeta>> | null
  cache_ttl: number | null
  archived: boolean
  created_by: string | null
  updated_by: string | null
  created_at: Date
  updated_at: Date
}

const kindOfItem = (type: Question['type']): ItemKind => (type === 'question' ? 'question' : type)

async function questionDto(core: Core, r: QuestionRow, access: Question['access']): Promise<Question> {
  const users = await summaryOf(core, [r.created_by, r.updated_by])
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    description: r.description,
    folder: r.folder_id,
    query: r.query,
    visualization: r.visualization,
    columns_meta: r.columns_meta,
    cache_ttl: r.cache_ttl,
    created_by: (r.created_by && users.get(r.created_by)) || null,
    updated_by: (r.updated_by && users.get(r.updated_by)) || null,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
    access,
    archived: r.archived,
  }
}

export async function getQuestion(core: Core, actor: Actor, id: string): Promise<Question> {
  const r = await core.db.one<QuestionRow>('SELECT * FROM question WHERE id = $1', [id])
  if (!r) throw notFound('Question introuvable.')
  const idx = await contentIndex(core, actor.userId)
  const access = idx.item(kindOfItem(r.type), r.id, r.folder_id, r.created_by)
  if (access === 'none') throw notFound('Question introuvable.')
  return questionDto(core, r, access)
}

function checkMetric(input: QuestionInput): void {
  if (input.type !== 'metric') return
  const q = input.query
  if (q.kind !== 'builder') throw invalid('Une métrique se construit avec l’éditeur visuel.')
  if ((q.aggregations ?? []).length !== 1 || q.aggregations?.[0]?.fn === 'metric') {
    throw invalid('Une métrique porte exactement une agrégation.')
  }
  if ((q.aggregations?.[0]?.fn ?? '').startsWith('cum_')) throw invalid('Une métrique ne peut pas être cumulée.')
  if ((q.joins ?? []).length > 0) throw invalid('Une métrique porte sur une seule table ou un seul modèle.')
}

async function checkFolder(core: Core, actor: Actor, folder: string | null | undefined): Promise<string> {
  const idx = await contentIndex(core, actor.userId)
  const target = folder ?? (await core.db.one<{ id: string }>('SELECT id FROM folder WHERE personal_owner_id = $1', [actor.userId]))?.id
  if (!target) throw invalid('Choisissez un dossier.')
  if (!atLeastAccess(idx.folder(target), 'edit')) throw forbidden('Vous ne pouvez pas enregistrer dans ce dossier.')
  return target
}

export async function createQuestion(core: Core, actor: Actor, input: QuestionInput): Promise<Question> {
  checkMetric(input)
  const folder = await checkFolder(core, actor, input.folder)
  const row = await core.db.one<{ id: string }>(
    `INSERT INTO question (folder_id, type, kind, name, description, query, visualization, columns_meta, cache_ttl, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) RETURNING id`,
    [
      folder,
      input.type ?? 'question',
      input.query.kind,
      input.name.trim(),
      input.description ?? null,
      input.query,
      input.visualization,
      input.columns_meta ?? null,
      input.cache_ttl ?? null,
      actor.userId,
    ],
  )
  const id = row?.id as string
  await audit(core, actor, `${input.type ?? 'question'}.create`, { kind: input.type ?? 'question', id }, { name: input.name })
  return getQuestion(core, actor, id)
}

export async function updateQuestion(core: Core, actor: Actor, id: string, input: Partial<QuestionInput> & { archived?: boolean }): Promise<Question> {
  const current = await getQuestion(core, actor, id)
  if (!atLeastAccess(current.access, 'edit')) throw forbidden('Vous ne pouvez pas modifier cette question.')
  const merged = { ...current, ...input } as QuestionInput
  checkMetric(merged)
  const folder = input.folder !== undefined && input.folder !== current.folder ? await checkFolder(core, actor, input.folder) : current.folder
  await core.db.exec(
    `UPDATE question SET folder_id = $2, type = $3, kind = $4, name = $5, description = $6, query = $7, visualization = $8,
       columns_meta = $9, cache_ttl = $10, archived = $11, updated_by = $12, updated_at = now() WHERE id = $1`,
    [
      id,
      folder,
      merged.type ?? 'question',
      merged.query.kind,
      merged.name.trim(),
      merged.description ?? null,
      merged.query,
      merged.visualization,
      merged.columns_meta ?? null,
      merged.cache_ttl ?? null,
      input.archived ?? current.archived,
      actor.userId,
    ],
  )
  await audit(core, actor, `${merged.type ?? 'question'}.update`, { kind: merged.type ?? 'question', id }, { fields: Object.keys(input) })
  return getQuestion(core, actor, id)
}

export async function deleteQuestion(core: Core, actor: Actor, id: string): Promise<void> {
  const q = await getQuestion(core, actor, id)
  if (!atLeastAccess(q.access, 'edit')) throw forbidden()
  const used = await core.db.one<{ n: number }>(
    `SELECT count(*)::int AS n FROM question WHERE id <> $1 AND NOT archived AND (query::text LIKE '%' || $1 || '%')`,
    [id],
  )
  if ((used?.n ?? 0) > 0) throw new AppError('CONFLICT', `${used?.n} question(s) s'appuient dessus : archivez-la plutôt.`)
  await core.db.exec('DELETE FROM question WHERE id = $1', [id])
  await audit(core, actor, `${q.type}.delete`, { kind: q.type, id }, { name: q.name })
}

/** Models and metrics the person can see — sources for the builder, context for the copilot. */
export async function listByType(core: Core, actor: Actor, type: Question['type']) {
  const idx = await contentIndex(core, actor.userId)
  return itemsWhere(core, actor, idx, `kind = $1`, [type])
}

export interface MetricDefinition {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly source: SourceRef
  readonly aggregation: Aggregation
  readonly filters: readonly Filter[]
  readonly time_dimension: BuilderQuery['breakouts']
}

export async function metricDefinition(core: Core, actor: Actor, id: string): Promise<MetricDefinition | undefined> {
  const q = await getQuestion(core, actor, id).catch(() => undefined)
  if (!q || q.type !== 'metric' || q.query.kind !== 'builder') return undefined
  const agg = q.query.aggregations?.[0]
  if (!agg) return undefined
  return {
    id: q.id,
    name: q.name,
    description: q.description,
    source: q.query.source,
    aggregation: agg,
    filters: q.query.filters ?? [],
    time_dimension: q.query.breakouts,
  }
}

// ── Tableaux de bord ─────────────────────────────────────────────────────────

interface DashboardRow {
  id: string
  folder_id: string | null
  name: string
  description: string | null
  tabs: DashboardTab[]
  cards: DashboardCard[]
  parameters: DashboardParameter[]
  auto_refresh: number | null
  cache_ttl: number | null
  preload: boolean
  archived: boolean
  created_by: string | null
  created_at: Date
  updated_at: Date
}

export async function getDashboard(core: Core, actor: Actor, id: string): Promise<Dashboard> {
  const r = await core.db.one<DashboardRow>('SELECT * FROM dashboard WHERE id = $1', [id])
  if (!r) throw notFound('Tableau de bord introuvable.')
  const idx = await contentIndex(core, actor.userId)
  const access = idx.item('dashboard', r.id, r.folder_id, r.created_by)
  if (access === 'none') throw notFound('Tableau de bord introuvable.')
  const users = await summaryOf(core, [r.created_by])
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    folder: r.folder_id,
    tabs: r.tabs,
    cards: r.cards,
    parameters: r.parameters,
    auto_refresh: r.auto_refresh,
    cache_ttl: r.cache_ttl,
    preload: r.preload,
    created_by: (r.created_by && users.get(r.created_by)) || null,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
    access,
    archived: r.archived,
  }
}

function checkDashboard(input: Partial<DashboardInput>): void {
  for (const card of (input.cards ?? []) as unknown as DashboardCard[]) {
    if (typeof card.id !== 'string' || typeof card.kind !== 'string') throw invalid('Carte invalide.')
    if ((card.text ?? '').length > DASHBOARD_LIMITS.html) throw invalid('Texte de carte trop long.')
  }
}

export async function createDashboard(core: Core, actor: Actor, input: DashboardInput): Promise<Dashboard> {
  checkDashboard(input)
  const folder = await checkFolder(core, actor, input.folder)
  const row = await core.db.one<{ id: string }>(
    `INSERT INTO dashboard (folder_id, name, description, tabs, cards, parameters, auto_refresh, cache_ttl, preload, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) RETURNING id`,
    [
      folder,
      input.name.trim(),
      input.description ?? null,
      JSON.stringify(input.tabs ?? []),
      JSON.stringify(input.cards ?? []),
      JSON.stringify(input.parameters ?? []),
      input.auto_refresh ?? null,
      input.cache_ttl ?? null,
      input.preload ?? false,
      actor.userId,
    ],
  )
  const id = row?.id as string
  await audit(core, actor, 'dashboard.create', { kind: 'dashboard', id }, { name: input.name })
  return getDashboard(core, actor, id)
}

export async function updateDashboard(core: Core, actor: Actor, id: string, input: Partial<DashboardInput> & { archived?: boolean }): Promise<Dashboard> {
  const current = await getDashboard(core, actor, id)
  if (!atLeastAccess(current.access, 'edit')) throw forbidden('Vous ne pouvez pas modifier ce tableau de bord.')
  checkDashboard(input)
  const folder = input.folder !== undefined && input.folder !== current.folder ? await checkFolder(core, actor, input.folder) : current.folder
  await core.db.exec(
    `UPDATE dashboard SET folder_id = $2, name = $3, description = $4, tabs = $5, cards = $6, parameters = $7, auto_refresh = $8,
       cache_ttl = $9, preload = $10, archived = $11, updated_by = $12, updated_at = now() WHERE id = $1`,
    [
      id,
      folder,
      (input.name ?? current.name).trim(),
      input.description !== undefined ? input.description : current.description,
      JSON.stringify(input.tabs ?? current.tabs),
      JSON.stringify(input.cards ?? current.cards),
      JSON.stringify(input.parameters ?? current.parameters),
      input.auto_refresh !== undefined ? input.auto_refresh : current.auto_refresh,
      input.cache_ttl !== undefined ? input.cache_ttl : current.cache_ttl,
      input.preload ?? current.preload,
      input.archived ?? current.archived,
      actor.userId,
    ],
  )
  await audit(core, actor, 'dashboard.update', { kind: 'dashboard', id }, { fields: Object.keys(input) })
  return getDashboard(core, actor, id)
}

export async function duplicateDashboard(core: Core, actor: Actor, id: string, folder?: string | null): Promise<Dashboard> {
  const d = await getDashboard(core, actor, id)
  return createDashboard(core, actor, {
    name: `${d.name} (copie)`,
    description: d.description,
    folder: folder ?? d.folder,
    tabs: [...d.tabs],
    cards: d.cards as unknown as Record<string, unknown>[],
    parameters: d.parameters as unknown as Record<string, unknown>[],
    auto_refresh: d.auto_refresh,
    cache_ttl: d.cache_ttl,
    preload: d.preload,
  })
}

export async function deleteDashboard(core: Core, actor: Actor, id: string): Promise<void> {
  await assertItemAccess(core, actor, 'dashboard', id, 'edit')
  await core.db.exec('DELETE FROM dashboard WHERE id = $1', [id])
  await audit(core, actor, 'dashboard.delete', { kind: 'dashboard', id })
}

export async function duplicateQuestion(core: Core, actor: Actor, id: string, folder?: string | null): Promise<Question> {
  const q = await getQuestion(core, actor, id)
  return createQuestion(core, actor, {
    name: `${q.name} (copie)`,
    type: q.type,
    description: q.description,
    folder: folder ?? q.folder,
    query: q.query as QuestionInput['query'],
    visualization: q.visualization as QuestionInput['visualization'],
    columns_meta: q.columns_meta as QuestionInput['columns_meta'],
    cache_ttl: q.cache_ttl,
  })
}
