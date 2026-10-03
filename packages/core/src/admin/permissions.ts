/**
 * Groupes et permissions. Toute écriture invalide l'instantané (l'endpoint OPA voit le
 * changement à la requête suivante) et vide le cache de résultats.
 */
import type {
  AdminRight,
  ColumnAccess,
  DataAccess,
  Group,
  QueryLevel,
  RowCondition,
  RowPolicy,
  RowPolicyInput,
} from '@eodia/contracts'
import { rowPolicySql } from '@eodia/compiler'
import { audit } from '../audit'
import type { Actor, Core } from '../context'
import { AppError, invalid, notFound } from '../errors'
import { cacheClear } from '../query/cache'

async function changed(core: Core): Promise<void> {
  core.changed()
  await cacheClear(core)
}

export async function listGroups(core: Core): Promise<Group[]> {
  return core.db.many<Group & Record<string, unknown>>(`
    SELECT g.id, g.name, g.kind, g.description,
      CASE WHEN g.kind = 'all' THEN (SELECT count(*) FROM app_user WHERE active)
           ELSE (SELECT count(*) FROM group_member m JOIN app_user u ON u.id = m.user_id WHERE m.group_id = g.id AND u.active) END::int AS members
    FROM user_group g ORDER BY CASE g.kind WHEN 'admin' THEN 0 WHEN 'all' THEN 1 ELSE 2 END, g.name`)
}

export async function saveGroup(core: Core, actor: Actor, input: { id?: string; name: string; description?: string | null }): Promise<string> {
  const name = input.name.trim()
  if (!name) throw invalid('Le nom du groupe est obligatoire.')
  try {
    const row = input.id
      ? await core.db.one<{ id: string }>(`UPDATE user_group SET name = $2, description = $3 WHERE id = $1 AND kind = 'custom' RETURNING id`, [input.id, name, input.description ?? null])
      : await core.db.one<{ id: string }>('INSERT INTO user_group (name, description) VALUES ($1, $2) RETURNING id', [name, input.description ?? null])
    if (!row) throw notFound('Groupe introuvable (les groupes système ne se renomment pas).')
    await audit(core, actor, input.id ? 'group.update' : 'group.create', { kind: 'group', id: row.id }, { name })
    await changed(core)
    return row.id
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new AppError('CONFLICT', 'Un groupe porte déjà ce nom.')
    throw err
  }
}

export async function deleteGroup(core: Core, actor: Actor, id: string): Promise<void> {
  const n = await core.db.exec(`DELETE FROM user_group WHERE id = $1 AND kind = 'custom'`, [id])
  if (n === 0) throw invalid('Les groupes système ne se suppriment pas.')
  await audit(core, actor, 'group.delete', { kind: 'group', id })
  await changed(core)
}

export async function groupMembers(core: Core, id: string) {
  return core.db.many(
    `SELECT u.id, u.name, u.email, u.color FROM app_user u
     WHERE u.active AND ((SELECT kind FROM user_group WHERE id = $1) = 'all' OR u.id IN (SELECT user_id FROM group_member WHERE group_id = $1))
     ORDER BY u.name`,
    [id],
  )
}

export async function setMembers(core: Core, actor: Actor, id: string, users: readonly string[]): Promise<void> {
  const g = await core.db.one<{ kind: string }>('SELECT kind FROM user_group WHERE id = $1', [id])
  if (!g) throw notFound('Groupe introuvable.')
  if (g.kind === 'all') throw invalid('Tout le monde fait partie de « Tous les utilisateurs ».')
  if (g.kind === 'admin' && !users.includes(actor.userId)) throw invalid('Vous ne pouvez pas vous retirer vous-même des administrateurs.')
  await core.db.tx(async (c) => {
    await core.db.exec('DELETE FROM group_member WHERE group_id = $1', [id], c)
    for (const u of users) await core.db.exec('INSERT INTO group_member (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, u], c)
  })
  await audit(core, actor, 'group.members', { kind: 'group', id }, { count: users.length })
  await changed(core)
}

// ── Lecture d'ensemble, pour l'écran Permissions ─────────────────────────────

export async function permissionsOverview(core: Core) {
  const [data, query, columns, rows, rights] = await Promise.all([
    core.db.many('SELECT group_id AS group, datasource_id AS datasource, schema_name AS schema, table_id AS table, access FROM data_permission'),
    core.db.many('SELECT group_id AS group, datasource_id AS datasource, level FROM query_permission'),
    core.db.many('SELECT group_id AS group, column_id AS column, access, mask FROM column_permission'),
    core.db.many('SELECT id, group_id AS group, table_id AS table, match, conditions, description FROM row_policy'),
    core.db.many('SELECT group_id AS group, right_name AS right FROM admin_right'),
  ])
  return { data, query, columns, rows, rights }
}

export async function setDataPermission(
  core: Core,
  actor: Actor,
  input: { group: string; datasource: string; schema: string | null; table: string | null; access: DataAccess | 'inherit' },
): Promise<void> {
  const admin = await core.db.one<{ kind: string }>('SELECT kind FROM user_group WHERE id = $1', [input.group])
  if (admin?.kind === 'admin') throw invalid('Les administrateurs lisent toujours tout.')
  await core.db.tx(async (c) => {
    await core.db.exec(
      `DELETE FROM data_permission WHERE group_id = $1 AND datasource_id = $2 AND schema_name IS NOT DISTINCT FROM $3 AND table_id IS NOT DISTINCT FROM $4`,
      [input.group, input.datasource, input.table ? null : input.schema, input.table],
      c,
    )
    if (input.access !== 'inherit') {
      await core.db.exec(
        'INSERT INTO data_permission (group_id, datasource_id, schema_name, table_id, access) VALUES ($1, $2, $3, $4, $5)',
        [input.group, input.datasource, input.table ? null : input.schema, input.table, input.access],
        c,
      )
    }
    // A whole source closed: its narrower grants go with it, so « Aucun » means none.
    if (input.access === 'none' && input.schema === null && input.table === null) {
      await core.db.exec('DELETE FROM data_permission WHERE group_id = $1 AND datasource_id = $2 AND (schema_name IS NOT NULL OR table_id IS NOT NULL)', [input.group, input.datasource], c)
      await core.db.exec(`UPDATE query_permission SET level = 'none' WHERE group_id = $1 AND datasource_id = $2`, [input.group, input.datasource], c)
    }
  })
  await audit(core, actor, 'permission.data', { kind: 'datasource', id: input.datasource }, { ...input })
  await changed(core)
}

export async function setQueryPermission(core: Core, actor: Actor, input: { group: string; datasource: string; level: QueryLevel | 'inherit' }): Promise<void> {
  if (input.level === 'inherit') {
    await core.db.exec('DELETE FROM query_permission WHERE group_id = $1 AND datasource_id = $2', [input.group, input.datasource])
    await audit(core, actor, 'permission.query', { kind: 'datasource', id: input.datasource }, { ...input })
    await changed(core)
    return
  }
  await core.db.exec(
    `INSERT INTO query_permission (group_id, datasource_id, level) VALUES ($1, $2, $3)
     ON CONFLICT (group_id, datasource_id) DO UPDATE SET level = EXCLUDED.level`,
    [input.group, input.datasource, input.level],
  )
  await audit(core, actor, 'permission.query', { kind: 'datasource', id: input.datasource }, { ...input })
  await changed(core)
}

export async function setColumnRule(core: Core, actor: Actor, input: { group: string; column: string; access: ColumnAccess | 'inherit'; mask?: string | null }): Promise<void> {
  if (input.access === 'inherit' || input.access === 'read') {
    await core.db.exec('DELETE FROM column_permission WHERE group_id = $1 AND column_id = $2', [input.group, input.column])
  } else {
    if (input.mask && /;|--|\/\*/.test(input.mask)) throw invalid('Expression de masque invalide.')
    await core.db.exec(
      `INSERT INTO column_permission (group_id, column_id, access, mask) VALUES ($1, $2, $3, $4)
       ON CONFLICT (group_id, column_id) DO UPDATE SET access = EXCLUDED.access, mask = EXCLUDED.mask`,
      [input.group, input.column, input.access, input.mask ?? null],
    )
  }
  await audit(core, actor, 'permission.column', { kind: 'column', id: input.column }, { group: input.group, access: input.access })
  await changed(core)
}

export async function saveRowPolicy(core: Core, actor: Actor, input: RowPolicyInput): Promise<RowPolicy> {
  const cols = await core.db.many<{ name: string; data_type: string }>(`SELECT name, data_type FROM db_column WHERE table_id = $1 AND status = 'active'`, [input.table])
  if (cols.length === 0) throw notFound('Table introuvable.')
  const types = new Map(cols.map((c) => [c.name.toLowerCase(), c.data_type]))
  // Compiled once with placeholder attributes: a rule that cannot compile is refused now.
  try {
    rowPolicySql(input, (n) => types.get(n.toLowerCase()), new Proxy({}, { get: () => '0' }) as Record<string, string>)
  } catch (err) {
    throw invalid(err instanceof Error ? err.message : String(err))
  }
  const row = await core.db.one<{ id: string }>(
    `INSERT INTO row_policy (group_id, table_id, match, conditions, description) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (group_id, table_id) DO UPDATE SET match = EXCLUDED.match, conditions = EXCLUDED.conditions, description = EXCLUDED.description
     RETURNING id`,
    [input.group, input.table, input.match, JSON.stringify(input.conditions), input.description ?? null],
  )
  // A rule only applies to a restricted access: put the table there if the group read it fully.
  await audit(core, actor, 'permission.rows', { kind: 'table', id: input.table }, { group: input.group })
  await changed(core)
  return {
    id: row?.id as string,
    group: input.group,
    table: input.table,
    match: input.match,
    conditions: input.conditions as RowCondition[],
    description: input.description ?? null,
  }
}

export async function deleteRowPolicy(core: Core, actor: Actor, id: string): Promise<void> {
  await core.db.exec('DELETE FROM row_policy WHERE id = $1', [id])
  await audit(core, actor, 'permission.rows_delete', { kind: 'row_policy', id })
  await changed(core)
}

export async function setAdminRight(core: Core, actor: Actor, group: string, right: AdminRight, on: boolean): Promise<void> {
  if (on) await core.db.exec('INSERT INTO admin_right (group_id, right_name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [group, right])
  else await core.db.exec('DELETE FROM admin_right WHERE group_id = $1 AND right_name = $2', [group, right])
  await audit(core, actor, 'permission.admin', { kind: 'group', id: group }, { right, on })
  await changed(core)
}

/** What a person would see, for the « Voir en tant que » check of the Permissions screen. */
export async function attributeKeys(core: Core): Promise<string[]> {
  return (await core.db.many<{ key: string }>('SELECT DISTINCT key FROM user_attribute ORDER BY key')).map((r) => r.key)
}

export async function getSetting<T>(core: Core, key: string, fallback: T): Promise<T> {
  const row = await core.db.one<{ value: T }>('SELECT value FROM instance_setting WHERE key = $1', [key])
  return row?.value ?? fallback
}

export async function putSetting(core: Core, actor: Actor, key: string, value: unknown): Promise<void> {
  await core.db.exec(
    `INSERT INTO instance_setting (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  )
  await audit(core, actor, 'setting.update', { kind: 'setting', id: key })
}
