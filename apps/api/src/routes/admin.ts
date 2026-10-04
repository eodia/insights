import { z } from '@hono/zod-openapi'
import {
  ADMIN_RIGHTS,
  ColumnRuleSchema,
  DataPermissionSchema,
  FolderPermissionSchema,
  QueryPermissionSchema,
  RowPolicyInputSchema,
} from '@eodia/contracts'
import {
  attributeKeys,
  cacheClear,
  cacheStats,
  createEmbedSecret,
  createInvitation,
  createUser,
  deleteGroup,
  deleteRowPolicy,
  getSetting,
  groupMembers,
  listAudit,
  listEmbedSecrets,
  listGroups,
  listInvitations,
  listUsers,
  mailEnabled,
  permissionsOverview,
  putSetting,
  revokeEmbedSecret,
  revokeInvitation,
  saveGroup,
  saveRowPolicy,
  sendInvitation,
  setAdminRight,
  setColumnRule,
  setDataPermission,
  setFolderPermission,
  setMembers,
  setQueryPermission,
  updateUser,
  folderPermissions,
  isInstanceAdmin,
} from '@eodia/core'
import { actorOf, bodyOf, type newApp, ok, param, queryOf, requireAdmin, requireInstanceAdmin, requireRight, route } from '../http'

const UserInput = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(10).max(500).optional(),
  groups: z.array(z.string()).optional(),
  attributes: z.record(z.string(), z.string().max(500)).optional(),
})
const UserPatch = z.object({
  name: z.string().min(1).max(120).optional(),
  active: z.boolean().optional(),
  groups: z.array(z.string()).optional(),
  attributes: z.record(z.string(), z.string().max(500)).optional(),
})
const InvitationInput = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  groups: z.array(z.string()).optional(),
  role: z.enum(['admin', 'member']).optional(),
  send: z.boolean().optional(),
})
const GroupInput = z.object({ name: z.string().min(1).max(120), description: z.string().max(500).nullable().optional() })
const Members = z.object({ users: z.array(z.string()).max(10_000) })
const DataPerm = DataPermissionSchema.extend({ access: z.enum(['none', 'read', 'restricted', 'inherit']) })
const ColumnPerm = ColumnRuleSchema.extend({ access: z.enum(['hidden', 'masked', 'read', 'inherit']) })
const FolderPerm = FolderPermissionSchema.extend({ access: z.enum(['none', 'view', 'edit', 'manage', 'inherit']) })
const QueryPerm = QueryPermissionSchema.extend({ level: z.enum(['none', 'builder', 'sql', 'native', 'inherit']) })
const RightInput = z.object({ group: z.string(), right: z.enum(ADMIN_RIGHTS), on: z.boolean() })
const AuditQuery = z.object({ before: z.string().optional(), action: z.string().optional(), actor: z.string().optional() })
const EmbedInput = z.object({ name: z.string().min(1).max(120), group: z.string() })
const CacheSetting = z.object({ ttl: z.number().int().min(0).max(31_536_000), adaptive: z.boolean() })

export function adminRoutes(app: ReturnType<typeof newApp>) {
  const tags = ['Administration']

  route(app, { method: 'get', path: '/api/v1/admin/users', tags, summary: 'Personnes' }, async (c) => {
    const actor = await requireAdmin(c)
    return ok(c, await listUsers(c.get('core'), actor))
  })
  // A person created by a space's administrator enters that space, as a member.
  route(app, { method: 'post', path: '/api/v1/admin/users', tags, summary: 'Créer une personne', body: UserInput }, async (c) => {
    const actor = await requireAdmin(c)
    return ok(c, { id: await createUser(c.get('core'), { ...bodyOf(c, UserInput), workspace: { id: actor.workspaceId, role: 'member' } }) })
  })
  route(app, { method: 'patch', path: '/api/v1/admin/users/:id', tags, summary: 'Modifier une personne (groupes, attributs, activation)', body: UserPatch }, async (c) => {
    const actor = await requireAdmin(c)
    await updateUser(c.get('core'), actor, param(c, 'id'), bodyOf(c, UserPatch))
    return ok(c)
  })
  // People and groups, for any signed-in person: what the share dialog offers.
  // The members of the current space and its groups: those its content can be shared with.
  route(app, { method: 'get', path: '/api/v1/directory', tags, summary: 'Annuaire (personnes et groupes) pour le partage' }, async (c) => {
    const actor = actorOf(c)
    const core = c.get('core')
    const users = await core.db.many(
      `SELECT u.id, u.name, u.email, u.color FROM app_user u JOIN workspace_member m ON m.user_id = u.id AND m.workspace_id = $1
       WHERE u.active ORDER BY u.name`,
      [actor.workspaceId],
    )
    return ok(c, { users, groups: await listGroups(core, actor) })
  })

  route(app, { method: 'get', path: '/api/v1/admin/invitations', tags, summary: 'Invitations en attente' }, async (c) => {
    const actor = await requireAdmin(c)
    return ok(c, { invitations: await listInvitations(c.get('core'), actor), mail: mailEnabled(c.get('core')) })
  })
  route(app, { method: 'post', path: '/api/v1/admin/invitations', tags, summary: 'Inviter une personne (lien, et e-mail si SMTP)', body: InvitationInput }, async (c) => {
    const actor = await requireAdmin(c)
    const core = c.get('core')
    const input = bodyOf(c, InvitationInput)
    const inv = await createInvitation(core, actor, input)
    let emailed = false
    if (input.send !== false && mailEnabled(core)) {
      const inviter = await core.db.one<{ name: string }>('SELECT name FROM app_user WHERE id = $1', [actor.userId])
      emailed = await sendInvitation(core, { id: inv.id, email: input.email, url: inv.url, inviter: inviter?.name ?? 'Un administrateur' }).catch(() => false)
    }
    return ok(c, { ...inv, emailed })
  })
  route(app, { method: 'delete', path: '/api/v1/admin/invitations/:id', tags, summary: 'Annuler une invitation' }, async (c) => {
    await revokeInvitation(c.get('core'), await requireAdmin(c), param(c, 'id'))
    return ok(c)
  })

  // ── Groupes ──
  route(app, { method: 'get', path: '/api/v1/admin/groups', tags, summary: 'Groupes' }, async (c) => {
    return ok(c, await listGroups(c.get('core'), actorOf(c)))
  })
  route(app, { method: 'post', path: '/api/v1/admin/groups', tags, summary: 'Créer un groupe', body: GroupInput }, async (c) =>
    ok(c, { id: await saveGroup(c.get('core'), await requireRight(c, 'manage_permissions'), bodyOf(c, GroupInput)) }),
  )
  route(app, { method: 'put', path: '/api/v1/admin/groups/:id', tags, summary: 'Renommer un groupe', body: GroupInput }, async (c) =>
    ok(c, { id: await saveGroup(c.get('core'), await requireRight(c, 'manage_permissions'), { ...bodyOf(c, GroupInput), id: param(c, 'id') }) }),
  )
  route(app, { method: 'delete', path: '/api/v1/admin/groups/:id', tags, summary: 'Supprimer un groupe' }, async (c) => {
    await deleteGroup(c.get('core'), await requireRight(c, 'manage_permissions'), param(c, 'id'))
    return ok(c)
  })
  route(app, { method: 'get', path: '/api/v1/admin/groups/:id/members', tags, summary: "Membres d'un groupe" }, async (c) => {
    return ok(c, await groupMembers(c.get('core'), await requireRight(c, 'manage_permissions'), param(c, 'id')))
  })
  route(app, { method: 'put', path: '/api/v1/admin/groups/:id/members', tags, summary: "Remplacer les membres d'un groupe", body: Members }, async (c) => {
    await setMembers(c.get('core'), await requireRight(c, 'manage_permissions'), param(c, 'id'), bodyOf(c, Members).users)
    return ok(c)
  })

  // ── Permissions ──
  const ptags = ['Permissions']
  route(app, { method: 'get', path: '/api/v1/permissions', tags: ptags, summary: 'Toutes les permissions (données, requêtes, colonnes, lignes, administration)' }, async (c) => {
    const actor = await requireRight(c, 'manage_permissions')
    const core = c.get('core')
    return ok(c, { ...(await permissionsOverview(core, actor)), folders: await folderPermissions(core, actor), attributes: await attributeKeys(core) })
  })
  route(app, { method: 'put', path: '/api/v1/permissions/data', tags: ptags, summary: 'Accès aux données d’un groupe (source, schéma ou table)', body: DataPerm }, async (c) => {
    await setDataPermission(c.get('core'), await requireRight(c, 'manage_permissions'), bodyOf(c, DataPerm))
    return ok(c)
  })
  route(app, { method: 'put', path: '/api/v1/permissions/query', tags: ptags, summary: 'Niveau de requête d’un groupe sur une source', body: QueryPerm }, async (c) => {
    await setQueryPermission(c.get('core'), await requireRight(c, 'manage_permissions'), bodyOf(c, QueryPerm))
    return ok(c)
  })
  route(app, { method: 'put', path: '/api/v1/permissions/column', tags: ptags, summary: 'Colonne cachée ou masquée pour un groupe', body: ColumnPerm }, async (c) => {
    await setColumnRule(c.get('core'), await requireRight(c, 'manage_permissions'), bodyOf(c, ColumnPerm))
    return ok(c)
  })
  route(app, { method: 'put', path: '/api/v1/permissions/rows', tags: ptags, summary: 'Règle de ligne d’un groupe sur une table', body: RowPolicyInputSchema }, async (c) =>
    ok(c, await saveRowPolicy(c.get('core'), await requireRight(c, 'manage_permissions'), bodyOf(c, RowPolicyInputSchema))),
  )
  route(app, { method: 'delete', path: '/api/v1/permissions/rows/:id', tags: ptags, summary: 'Supprimer une règle de ligne' }, async (c) => {
    await deleteRowPolicy(c.get('core'), await requireRight(c, 'manage_permissions'), param(c, 'id'))
    return ok(c)
  })
  route(app, { method: 'put', path: '/api/v1/permissions/folder', tags: ptags, summary: 'Droits d’un groupe sur un dossier', body: FolderPerm }, async (c) => {
    const input = bodyOf(c, FolderPerm)
    await setFolderPermission(c.get('core'), actorOf(c), input.group, input.folder, input.access)
    return ok(c)
  })
  route(app, { method: 'put', path: '/api/v1/permissions/admin', tags: ptags, summary: "Droit d'administration d'un groupe", body: RightInput }, async (c) => {
    const input = bodyOf(c, RightInput)
    await setAdminRight(c.get('core'), await requireAdmin(c), input.group, input.right, input.on)
    return ok(c)
  })

  // ── Journal, cache, intégrations ──
  route(app, { method: 'get', path: '/api/v1/admin/audit', tags, summary: "Journal d'audit", query: AuditQuery }, async (c) => {
    const actor = await requireAdmin(c)
    const q = queryOf(c, AuditQuery)
    // The space's own journal; everything, for an administrator of the instance.
    const all = isInstanceAdmin(await c.get('core').snapshot(), actor.userId)
    return ok(
      c,
      await listAudit(c.get('core'), {
        ...(q.before ? { before: Number(q.before) } : {}),
        ...(q.action ? { action: q.action } : {}),
        ...(q.actor ? { actor: q.actor } : {}),
        ...(all ? {} : { workspace: actor.workspaceId }),
      }),
    )
  })
  route(app, { method: 'get', path: '/api/v1/admin/status', tags, summary: 'État de Trino, du cache et du copilot' }, async (c) => {
    await requireAdmin(c)
    const core = c.get('core')
    const [trino, cache, setting, catalogs] = await Promise.all([
      core.engine.info(),
      cacheStats(core),
      getSetting(core, 'cache', { ttl: core.config.defaultCacheTtl, adaptive: false }),
      core.engine.catalogs().catch(() => [] as string[]),
    ])
    return ok(c, {
      trino: { ...trino, url: core.config.trinoUrl, catalogs },
      cache: { ...cache, ...setting },
      ai: { provider: core.config.ai.provider, model: core.config.ai.model, configured: !!core.config.ai.apiKey, quota: core.config.ai.hourlyQuota },
      oidc: !!core.config.oidc,
      smtp: !!core.config.smtp,
    })
  })
  route(app, { method: 'put', path: '/api/v1/admin/settings/cache', tags, summary: "Durée de cache de l'instance", body: CacheSetting }, async (c) => {
    await putSetting(c.get('core'), await requireInstanceAdmin(c), 'cache', bodyOf(c, CacheSetting))
    return ok(c)
  })
  route(app, { method: 'post', path: '/api/v1/admin/cache/clear', tags, summary: 'Vider le cache de résultats' }, async (c) => {
    await requireInstanceAdmin(c)
    return ok(c, { removed: await cacheClear(c.get('core')) })
  })
  route(app, { method: 'get', path: '/api/v1/admin/embed-secrets', tags, summary: "Secrets d'intégration signée" }, async (c) => {
    return ok(c, await listEmbedSecrets(c.get('core'), await requireAdmin(c)))
  })
  route(app, { method: 'post', path: '/api/v1/admin/embed-secrets', tags, summary: "Créer un secret d'intégration (affiché une seule fois)", body: EmbedInput }, async (c) =>
    ok(c, await createEmbedSecret(c.get('core'), await requireAdmin(c), bodyOf(c, EmbedInput))),
  )
  route(app, { method: 'delete', path: '/api/v1/admin/embed-secrets/:id', tags, summary: "Révoquer un secret d'intégration" }, async (c) => {
    await revokeEmbedSecret(c.get('core'), await requireAdmin(c), param(c, 'id'))
    return ok(c)
  })
}
