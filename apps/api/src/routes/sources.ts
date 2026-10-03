import { z } from '@hono/zod-openapi'
import {
  ColumnPatchSchema,
  ColumnValueSchema,
  DatasourceInputSchema,
  ENGINE_SPECS,
  TablePatchSchema,
} from '@eodia/contracts'
import {
  AppError,
  columnValues,
  createDatasource,
  deleteDatasource,
  exportColumnConfig,
  exportTableConfig,
  getDatasource,
  getTable,
  importConfig,
  jobState,
  listDatasources,
  listRelations,
  linkedValues,
  scopedColumnValues,
  listTables,
  patchColumn,
  patchTable,
  putColumnValues,
  requestSync,
  schemaTree,
  testDatasource,
  updateDatasource,
} from '@eodia/core'
import { streamSSE } from 'hono/streaming'
import { actorOf, bodyOf, type newApp, ok, param, queryOf, requireRight, route } from '../http'

const SyncInput = z.object({ passes: z.array(z.enum(['schema', 'fingerprint', 'values'])).min(1).optional() })
const TablesQuery = z.object({ datasource: z.string().optional(), columns: z.enum(['0', '1']).optional(), removed: z.enum(['0', '1']).optional() })
const ValuesQuery = z.object({ search: z.string().max(200).optional() })
const ValuesInput = z.object({ values: z.array(ColumnValueSchema).max(1000) })
const ImportInput = z.object({ table: z.string().optional(), column: z.string().optional(), config: z.record(z.string(), z.unknown()) })
const TestInput = DatasourceInputSchema.extend({ id: z.string().optional() })

export function sourceRoutes(app: ReturnType<typeof newApp>) {
  const tags = ['Sources']

  route(app, { method: 'get', path: '/api/v1/engines', tags, summary: 'Moteurs disponibles et leurs champs de connexion' }, (c) => ok(c, Object.values(ENGINE_SPECS)))

  route(app, { method: 'get', path: '/api/v1/datasources', tags, summary: 'Lister les sources' }, async (c) => {
    actorOf(c)
    return ok(c, await listDatasources(c.get('core')))
  })

  route(app, { method: 'get', path: '/api/v1/datasources/:id', tags, summary: 'Lire une source' }, async (c) => {
    actorOf(c)
    return ok(c, await getDatasource(c.get('core'), param(c, 'id')))
  })

  route(app, { method: 'post', path: '/api/v1/datasources/test', tags, summary: 'Tester une connexion avec le pilote natif', body: TestInput }, async (c) => {
    await requireRight(c, 'manage_sources')
    const { id, ...input } = bodyOf(c, TestInput)
    return ok(c, await testDatasource(c.get('core'), input, id))
  })

  route(app, {
    method: 'post',
    path: '/api/v1/datasources',
    tags,
    summary: 'Ajouter une source',
    description: 'Teste la connexion, crée le catalogue Trino (`CREATE CATALOG`), enregistre la source et lance la synchronisation.',
    body: DatasourceInputSchema,
  }, async (c) => {
    const actor = await requireRight(c, 'manage_sources')
    return ok(c, await createDatasource(c.get('core'), actor, bodyOf(c, DatasourceInputSchema)))
  })

  route(app, { method: 'put', path: '/api/v1/datasources/:id', tags, summary: 'Modifier une source', body: DatasourceInputSchema }, async (c) => {
    const actor = await requireRight(c, 'manage_sources')
    return ok(c, await updateDatasource(c.get('core'), actor, param(c, 'id'), bodyOf(c, DatasourceInputSchema)))
  })

  route(app, { method: 'delete', path: '/api/v1/datasources/:id', tags, summary: 'Supprimer une source et son catalogue' }, async (c) => {
    const actor = await requireRight(c, 'manage_sources')
    await deleteDatasource(c.get('core'), actor, param(c, 'id'))
    return ok(c)
  })

  route(app, { method: 'post', path: '/api/v1/datasources/:id/sync', tags, summary: 'Synchroniser le schéma de la base de données', body: SyncInput }, async (c) => {
    const actor = await requireRight(c, 'manage_metadata')
    const job = await requestSync(c.get('core'), param(c, 'id'), actor.userId, bodyOf(c, SyncInput).passes)
    return ok(c, { job })
  })

  route(app, { method: 'get', path: '/api/v1/jobs/:id', tags, summary: "État d'un job (synchronisation…)" }, async (c) => {
    actorOf(c)
    const state = await jobState(c.get('core'), param(c, 'id'))
    if (!state) throw new AppError('NOT_FOUND', 'Job introuvable.')
    return ok(c, state)
  })

  // Progress as server-sent events, until the job ends.
  app.get('/api/v1/jobs/:id/events', async (c) => {
    actorOf(c)
    const core = c.get('core')
    const id = c.req.param('id')
    return streamSSE(c, async (stream) => {
      let last = ''
      for (let i = 0; i < 2400 && !stream.aborted; i++) {
        const state = await jobState(core, id)
        if (!state) break
        const payload = JSON.stringify(state)
        if (payload !== last) {
          await stream.writeSSE({ event: 'progress', data: payload })
          last = payload
        }
        if (state.status === 'done' || state.status === 'failed') break
        await stream.sleep(500)
      }
    })
  })

  // ── Structure ──
  const stags = ['Structure']

  route(app, { method: 'get', path: '/api/v1/schema-tree', tags: stags, summary: 'Sources, tables et colonnes lisibles (autocomplétion)' }, async (c) =>
    ok(c, await schemaTree(c.get('core'), actorOf(c))),
  )

  route(app, { method: 'get', path: '/api/v1/tables', tags: stags, summary: 'Tables lisibles', query: TablesQuery }, async (c) => {
    const q = queryOf(c, TablesQuery)
    return ok(
      c,
      await listTables(c.get('core'), actorOf(c), {
        ...(q.datasource ? { datasource: q.datasource } : {}),
        withColumns: q.columns === '1',
        includeRemoved: q.removed === '1',
      }),
    )
  })

  route(app, { method: 'get', path: '/api/v1/tables/:id', tags: stags, summary: 'Une table et ses colonnes', query: z.object({ removed: z.enum(['0', '1']).optional() }) }, async (c) =>
    ok(c, await getTable(c.get('core'), actorOf(c), param(c, 'id'), { includeRemoved: c.req.query('removed') === '1' })),
  )

  route(app, { method: 'patch', path: '/api/v1/tables/:id', tags: stags, summary: "Métadonnées d'une table", body: TablePatchSchema }, async (c) => {
    const actor = await requireRight(c, 'manage_metadata')
    return ok(c, await patchTable(c.get('core'), actor, param(c, 'id'), bodyOf(c, TablePatchSchema)))
  })

  route(app, { method: 'patch', path: '/api/v1/columns/:id', tags: stags, summary: "Métadonnées d'une colonne", body: ColumnPatchSchema }, async (c) => {
    const actor = await requireRight(c, 'manage_metadata')
    return ok(c, await patchColumn(c.get('core'), actor, param(c, 'id'), bodyOf(c, ColumnPatchSchema) as never))
  })

  route(app, { method: 'get', path: '/api/v1/columns/:id/values', tags: stags, summary: "Valeurs d'une colonne (sous les droits du lecteur)", query: ValuesQuery }, async (c) =>
    ok(c, await columnValues(c.get('core'), actorOf(c), param(c, 'id'), queryOf(c, ValuesQuery).search ?? '')),
  )

  const Linked = z.object({ filters: z.array(z.object({ column: z.string(), values: z.array(z.string()).max(500) })).max(16), search: z.string().max(200).optional() })
  route(app, {
    method: 'post',
    path: '/api/v1/columns/:id/values/linked',
    tags: stags,
    summary: 'Valeurs d’une colonne restreintes par d’autres filtres (filtres liés)',
    body: Linked,
  }, async (c) => {
    const input = bodyOf(c, Linked)
    return ok(c, { values: (await linkedValues(c.get('core'), actorOf(c).dataUser ?? actorOf(c).userId, param(c, 'id'), input.filters, input.search ?? '')).map((value) => ({ value })) })
  })

  route(app, {
    method: 'post',
    path: '/api/v1/columns/:id/values/scope',
    tags: stags,
    summary: 'Valeurs d’une colonne avec leurs effectifs, dans et hors du périmètre des autres filtres',
    description: 'Lu en direct sous les droits du lecteur. `scoped` compte les lignes que retiennent les autres filtres de la même table : 0 = valeur exclue.',
    body: Linked,
  }, async (c) => {
    const input = bodyOf(c, Linked)
    return ok(c, await scopedColumnValues(c.get('core'), actorOf(c), param(c, 'id'), input.filters, input.search ?? ''))
  })

  route(app, { method: 'put', path: '/api/v1/columns/:id/values', tags: stags, summary: 'Libellés, couleurs et pictos des valeurs', body: ValuesInput }, async (c) => {
    const actor = await requireRight(c, 'manage_metadata')
    await putColumnValues(c.get('core'), actor, param(c, 'id'), bodyOf(c, ValuesInput).values as never)
    return ok(c)
  })

  route(app, { method: 'get', path: '/api/v1/tables/:id/config', tags: stags, summary: "Configuration d'une table en JSON (copier)" }, async (c) =>
    ok(c, await exportTableConfig(c.get('core'), actorOf(c), param(c, 'id'))),
  )

  route(app, { method: 'get', path: '/api/v1/columns/:id/config', tags: stags, summary: "Configuration d'une colonne en JSON (copier)" }, async (c) =>
    ok(c, await exportColumnConfig(c.get('core'), actorOf(c), param(c, 'id'))),
  )

  route(app, { method: 'post', path: '/api/v1/metadata/import', tags: stags, summary: 'Coller une configuration JSON', body: ImportInput }, async (c) => {
    const actor = await requireRight(c, 'manage_metadata')
    const input = bodyOf(c, ImportInput)
    return ok(c, await importConfig(c.get('core'), actor, { ...(input.table ? { table: input.table } : {}), ...(input.column ? { column: input.column } : {}) }, input.config))
  })

  route(app, { method: 'get', path: '/api/v1/datasources/:id/relations', tags: stags, summary: "Relations d'une source (diagramme)" }, async (c) =>
    ok(c, await listRelations(c.get('core'), actorOf(c), param(c, 'id'))),
  )
}
