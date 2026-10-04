/**
 * La démo publique (`DEMO_PUBLIC=1`) : n'importe qui entre en un clic, sous un compte de
 * démonstration. Ce qui touche à l'instance elle-même est verrouillé — les connexions aux
 * bases, les personnes, les groupes et les droits, le mot de passe —, et le contenu créé par
 * « Équipe data » ne se modifie ni ne se supprime : on le duplique. Tout le reste s'essaie
 * librement ; l'instance est remise à zéro chaque nuit (scripts/demo-reset.sh).
 */
import { AppError, type Core, DEMO_AUTHOR_EMAIL } from '@eodia/core'
import type { MiddlewareHandler } from 'hono'
import type { Env } from './http'

const ITEM = /^\/api\/v1\/(questions|dashboards|folders)\/([0-9a-f-]{36})$/
const TABLES = { questions: 'question', dashboards: 'dashboard', folders: 'folder' } as const

export function demoGuard(core: Core): MiddlewareHandler<Env> {
  return async (c, next) => {
    const method = c.req.method
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()
    const path = c.req.path

    if (/^\/api\/v1\/(admin|permissions)\//.test(path)) {
      throw new AppError('FORBIDDEN', 'Démo publique : les personnes, les groupes et les droits se consultent mais ne se modifient pas.')
    }
    if ((method === 'POST' && /^\/api\/v1\/datasources(\/test)?$/.test(path)) || /^\/api\/v1\/datasources\/[^/]+$/.test(path)) {
      throw new AppError('FORBIDDEN', 'Démo publique : les connexions aux bases de données ne se modifient pas.')
    }
    if (method === 'PATCH' && path === '/api/v1/me') {
      const body = (await c.req.raw
        .clone()
        .json()
        .catch(() => ({}))) as { name?: unknown; password?: unknown }
      if (body.password !== undefined || body.name !== undefined) {
        throw new AppError('FORBIDDEN', 'Démo publique : le compte de démonstration ne se modifie pas.')
      }
    }
    const item = ITEM.exec(path)
    if (item && (method === 'PATCH' || method === 'PUT' || method === 'DELETE')) {
      const table = TABLES[item[1] as keyof typeof TABLES]
      const seeded = await core.db.one(
        `SELECT 1 FROM ${table} x JOIN app_user u ON u.id = x.created_by WHERE x.id = $1 AND u.email = $2`,
        [item[2], DEMO_AUTHOR_EMAIL],
      )
      if (seeded) {
        throw new AppError('FORBIDDEN', 'Démo publique : ce contenu de démonstration est protégé. Dupliquez-le pour le modifier à votre guise.')
      }
    }
    return next()
  }
}
