/**
 * Comments on the cards of a dashboard, and annotations of the dates of a chart: what people
 * say of the figures, beside them. Whoever may open the dashboard (or the question) reads them
 * and adds their own; one changes or removes one's own — an editor of the item, any.
 */
import type { Annotation, AnnotationInput, CardComment } from '@eodia/contracts'
import { summaryOf } from '../auth/users'
import type { Actor, Core } from '../context'
import { forbidden, invalid, notFound } from '../errors'
import { getDashboard, getQuestion } from './items'

// ── Comments ────────────────────────────────────────────────────────────────

export async function listCardComments(core: Core, actor: Actor, dashboardId: string): Promise<CardComment[]> {
  await getDashboard(core, actor, dashboardId)
  const rows = await core.db.many<{ id: string; card_id: string; user_id: string | null; body: string; created_at: Date; edited_at: Date | null }>(
    'SELECT id, card_id, user_id, body, created_at, edited_at FROM card_comment WHERE dashboard_id = $1 ORDER BY created_at',
    [dashboardId],
  )
  const authors = await summaryOf(core, rows.map((r) => r.user_id))
  return rows.map((r) => ({
    id: r.id,
    card: r.card_id,
    body: r.body,
    author: (r.user_id && authors.get(r.user_id)) || null,
    created_at: r.created_at.toISOString(),
    edited_at: r.edited_at?.toISOString() ?? null,
    mine: r.user_id === actor.userId,
  }))
}

export async function addCardComment(core: Core, actor: Actor, dashboardId: string, card: string, body: string): Promise<void> {
  const d = await getDashboard(core, actor, dashboardId)
  if (!d.cards.some((c) => c.id === card)) throw notFound('Carte introuvable.')
  await core.db.exec('INSERT INTO card_comment (dashboard_id, card_id, user_id, body) VALUES ($1, $2, $3, $4)', [dashboardId, card, actor.userId, body.trim()])
}

export async function deleteCardComment(core: Core, actor: Actor, dashboardId: string, id: string): Promise<void> {
  const d = await getDashboard(core, actor, dashboardId)
  const row = await core.db.one<{ user_id: string | null }>('SELECT user_id FROM card_comment WHERE id = $1 AND dashboard_id = $2', [id, dashboardId])
  if (!row) throw notFound('Commentaire introuvable.')
  if (row.user_id !== actor.userId && d.access === 'view') throw forbidden('Ce commentaire est à quelqu’un d’autre.')
  await core.db.exec('DELETE FROM card_comment WHERE id = $1', [id])
}

// ── Annotations ─────────────────────────────────────────────────────────────

interface AnnotationRow {
  id: string
  question_id: string | null
  dashboard_id: string | null
  card_id: string | null
  at: string
  end_at: string | null
  label: string
  color: string | null
  user_id: string | null
}

const SELECT = `SELECT id, question_id, dashboard_id, card_id, to_char(at, 'YYYY-MM-DD') AS at, to_char(end_at, 'YYYY-MM-DD') AS end_at, label, color, user_id FROM annotation`

async function toAnnotations(core: Core, actor: Actor, rows: AnnotationRow[]): Promise<Annotation[]> {
  const authors = await summaryOf(core, rows.map((r) => r.user_id))
  return rows.map((r) => ({
    id: r.id,
    question: r.question_id,
    dashboard: r.dashboard_id,
    card: r.card_id,
    at: r.at,
    end: r.end_at,
    label: r.label,
    color: r.color,
    author: (r.user_id && authors.get(r.user_id)) || null,
    mine: r.user_id === actor.userId,
  }))
}

/** A question's annotations: wherever it shows, they show. */
export async function questionAnnotations(core: Core, actor: Actor, questionId: string): Promise<Annotation[]> {
  await getQuestion(core, actor, questionId)
  return toAnnotations(core, actor, await core.db.many<AnnotationRow>(`${SELECT} WHERE question_id = $1 ORDER BY at`, [questionId]))
}

/** A dashboard's annotations: its cards' own, and those of the questions its cards show. */
export async function dashboardAnnotations(core: Core, actor: Actor, dashboardId: string): Promise<Annotation[]> {
  const d = await getDashboard(core, actor, dashboardId)
  const questions = [...new Set(d.cards.flatMap((c) => (c.question ? [c.question] : [])))]
  return toAnnotations(
    core,
    actor,
    await core.db.many<AnnotationRow>(`${SELECT} WHERE dashboard_id = $1 OR question_id = ANY($2::uuid[]) ORDER BY at`, [dashboardId, questions]),
  )
}

export async function addAnnotation(core: Core, actor: Actor, input: AnnotationInput): Promise<void> {
  if (input.question) await getQuestion(core, actor, input.question)
  else if (input.dashboard && input.card) {
    const d = await getDashboard(core, actor, input.dashboard)
    if (!d.cards.some((c) => c.id === input.card)) throw notFound('Carte introuvable.')
  } else throw invalid('Une annotation porte sur une question, ou sur une carte d’un tableau de bord.')
  if (input.end && input.end < input.at) throw invalid('La fin d’une période vient après son début.')
  await core.db.exec(
    'INSERT INTO annotation (workspace_id, question_id, dashboard_id, card_id, at, end_at, label, color, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [actor.workspaceId, input.question ?? null, input.question ? null : (input.dashboard ?? null), input.question ? null : (input.card ?? null), input.at, input.end ?? null, input.label.trim(), input.color ?? null, actor.userId],
  )
}

export async function deleteAnnotation(core: Core, actor: Actor, id: string): Promise<void> {
  const row = await core.db.one<AnnotationRow>(`${SELECT} WHERE id = $1 AND workspace_id = $2`, [id, actor.workspaceId])
  if (!row) throw notFound('Annotation introuvable.')
  if (row.user_id !== actor.userId) {
    const access = row.question_id ? (await getQuestion(core, actor, row.question_id)).access : (await getDashboard(core, actor, row.dashboard_id as string)).access
    if (access === 'view') throw forbidden('Cette annotation est à quelqu’un d’autre.')
  }
  await core.db.exec('DELETE FROM annotation WHERE id = $1', [id])
}
