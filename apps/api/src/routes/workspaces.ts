/**
 * Les espaces : ceux où la personne peut entrer, leur création (administrateurs de
 * l'instance), leur nom et leur allure, leurs membres (administrateurs de l'espace) et le
 * changement d'espace. L'espace courant d'une session est celui que l'interface envoie
 * (`x-eodia-workspace`) ; celui d'un jeton, le sien.
 */
import { z } from '@hono/zod-openapi'
import { LOOK_COLORS } from '@eodia/contracts'
import { createWorkspace, listMembers, listWorkspaces, setMember, switchWorkspace, updateWorkspace } from '@eodia/core'
import { actorOf, bodyOf, type newApp, ok, param, requireAdmin, requireRight, route } from '../http'

const WorkspaceInput = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullable().optional(),
  color: z.enum(LOOK_COLORS).nullable().optional(),
  icon: z.string().max(300).nullable().optional(),
})
const WorkspacePatch = WorkspaceInput.partial().extend({ archived: z.boolean().optional() })
const MemberInput = z.object({ role: z.enum(['admin', 'member']).nullable() })

export function workspaceRoutes(app: ReturnType<typeof newApp>) {
  const tags = ['Espaces']

  route(app, { method: 'get', path: '/api/v1/workspaces', tags, summary: 'Les espaces où la personne peut entrer' }, async (c) =>
    ok(c, await listWorkspaces(c.get('core'), actorOf(c).userId)),
  )
  // Every open space, for whoever shares a source: those it may be shared with.
  route(app, { method: 'get', path: '/api/v1/workspaces/all', tags, summary: 'Tous les espaces ouverts (pour partager une source)' }, async (c) => {
    await requireRight(c, 'manage_sources')
    return ok(c, await c.get('core').db.many('SELECT id, name, color, icon FROM workspace WHERE NOT archived ORDER BY lower(name)'))
  })
  route(app, { method: 'post', path: '/api/v1/workspaces', tags, summary: 'Créer un espace (administrateurs de l’instance)', body: WorkspaceInput }, async (c) =>
    ok(c, await createWorkspace(c.get('core'), actorOf(c), bodyOf(c, WorkspaceInput))),
  )
  route(app, { method: 'patch', path: '/api/v1/workspaces/:id', tags, summary: 'Renommer, habiller ou archiver un espace', body: WorkspacePatch }, async (c) =>
    ok(c, await updateWorkspace(c.get('core'), actorOf(c), param(c, 'id'), bodyOf(c, WorkspacePatch))),
  )
  route(app, { method: 'post', path: '/api/v1/workspaces/:id/switch', tags, summary: 'Travailler désormais dans cet espace' }, async (c) =>
    ok(c, await switchWorkspace(c.get('core'), actorOf(c), param(c, 'id'))),
  )

  route(app, { method: 'get', path: '/api/v1/workspace/members', tags, summary: 'Les membres de l’espace courant' }, async (c) =>
    ok(c, await listMembers(c.get('core'), actorOf(c))),
  )
  // Everyone in the instance, with their role in the current space: whom its administrators may add.
  route(app, { method: 'get', path: '/api/v1/workspace/people', tags, summary: 'Les personnes de l’instance, et leur rôle dans l’espace courant' }, async (c) => {
    const actor = await requireAdmin(c)
    return ok(
      c,
      await c.get('core').db.many(
        `SELECT u.id, u.name, u.email, u.color, m.role FROM app_user u
         LEFT JOIN workspace_member m ON m.user_id = u.id AND m.workspace_id = $1
         WHERE u.active ORDER BY u.name`,
        [actor.workspaceId],
      ),
    )
  })
  route(app, { method: 'put', path: '/api/v1/workspace/members/:user', tags, summary: 'Ajouter un membre, changer son rôle, ou le retirer (role: null)', body: MemberInput }, async (c) => {
    await setMember(c.get('core'), actorOf(c), param(c, 'user'), bodyOf(c, MemberInput).role)
    return ok(c)
  })
}
