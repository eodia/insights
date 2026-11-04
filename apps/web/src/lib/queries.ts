'use client'

import type {
  ColumnMeta,
  Dashboard,
  Datasource,
  EngineSpec,
  Folder,
  Group,
  ItemSummary,
  Me,
  Question,
  TableKind,
  TableMeta,
} from '@eodia/contracts'
import { useQueries, useQuery } from '@tanstack/react-query'
import { type RunResult, api } from './api'

export interface SchemaTree {
  readonly datasources: readonly {
    readonly id: string
    readonly name: string
    readonly engine: string
    readonly catalog: string
    readonly tables: readonly {
      readonly id: string
      readonly schema: string
      readonly name: string
      readonly label: string
      readonly kind?: TableKind
      readonly columns: readonly { readonly name: string; readonly type: string; readonly label: string }[]
    }[]
  }[]
}

export const keys = {
  me: ['me'] as const,
  folders: ['folders'] as const,
  folder: (id: string) => ['folder', id] as const,
  items: (id: string) => ['folder-items', id] as const,
  datasources: ['datasources'] as const,
  tree: ['schema-tree'] as const,
  tables: (ds?: string) => ['tables', ds ?? 'all'] as const,
  table: (id: string) => ['table', id] as const,
  question: (id: string) => ['question', id] as const,
  dashboard: (id: string) => ['dashboard', id] as const,
  home: ['home'] as const,
  directory: ['directory'] as const,
}

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api.get<Me>('/v1/me'), staleTime: 60_000 })
export const useFolders = () => useQuery({ queryKey: keys.folders, queryFn: () => api.get<Folder[]>('/v1/folders') })
export const useFolderItems = (id: string) =>
  useQuery({ queryKey: keys.items(id), queryFn: () => api.get<{ folders: Folder[]; items: ItemSummary[] }>(`/v1/folders/${id}/items`) })
export const useDatasources = () => useQuery({ queryKey: keys.datasources, queryFn: () => api.get<Datasource[]>('/v1/datasources') })
export const useEngines = () => useQuery({ queryKey: ['engines'], queryFn: () => api.get<EngineSpec[]>('/v1/engines'), staleTime: Number.POSITIVE_INFINITY })
export const useSchemaTree = () => useQuery({ queryKey: keys.tree, queryFn: () => api.get<SchemaTree>('/v1/schema-tree') })
export const useTables = (datasource?: string, columns = false) =>
  useQuery({
    queryKey: [...keys.tables(datasource), columns],
    queryFn: () => api.get<TableMeta[]>(`/v1/tables?${new URLSearchParams({ ...(datasource ? { datasource } : {}), ...(columns ? { columns: '1' } : {}) })}`),
  })
export const useTable = (id: string | null | undefined) =>
  useQuery({ queryKey: keys.table(id ?? ''), queryFn: () => api.get<TableMeta & { columns: ColumnMeta[] }>(`/v1/tables/${id}?removed=1`), enabled: !!id })
/**
 * What the columns of a result hold, as described in Sources de données: by result name, read
 * from the tables they come from (each one fetched once, then cached).
 */
/** A page read without a session — a shared link, an embed — where metadata is not to be asked for. */
const publicPage = () => typeof window !== 'undefined' && /^\/(q|d|embed)\//.test(window.location.pathname)

export function useColumnDescriptions(columns: readonly { name: string; source?: { table: string; column?: string; field: string } }[]): Map<string, string> {
  const tables = [...new Set(columns.flatMap((c) => (c.source?.table ? [c.source.table] : [])))]
  const metas = useQueries({
    queries: tables.map((id) => ({ queryKey: keys.table(id), queryFn: () => api.get<TableMeta & { columns: ColumnMeta[] }>(`/v1/tables/${id}?removed=1`), staleTime: 300_000, retry: false, enabled: !publicPage() })),
  })
  const out = new Map<string, string>()
  for (const c of columns) {
    if (!c.source?.table) continue
    const meta = metas[tables.indexOf(c.source.table)]?.data
    const col = meta?.columns.find((x) => (c.source?.column ? x.id === c.source.column : x.name === c.source?.field))
    const text = col?.description?.trim() || col?.native_comment?.trim()
    if (text) out.set(c.name, text)
  }
  return out
}
export const useQuestion = (id: string | null | undefined) =>
  useQuery({ queryKey: keys.question(id ?? ''), queryFn: () => api.get<Question>(`/v1/questions/${id}`), enabled: !!id })
export const useDashboard = (id: string | null) => useQuery({ queryKey: keys.dashboard(id ?? ''), queryFn: () => api.get<Dashboard>(`/v1/dashboards/${id}`), enabled: !!id })
export const useModels = (enabled = true) => useQuery({ queryKey: ['models'], queryFn: () => api.get<ItemSummary[]>('/v1/models'), enabled })
export const useMetrics = () => useQuery({ queryKey: ['metrics'], queryFn: () => api.get<ItemSummary[]>('/v1/metrics') })
export const useDirectory = () =>
  useQuery({
    queryKey: keys.directory,
    queryFn: () => api.get<{ users: { id: string; name: string; email: string; color: string | null }[]; groups: Group[] }>('/v1/directory'),
  })

/** The SQL type a result column's kind stands for: what the builder needs of a model's column. */
const resultType = (type: string) => (type === 'number' ? 'double' : type === 'date' ? 'date' : type === 'datetime' ? 'timestamp' : type === 'boolean' ? 'boolean' : 'varchar')

/** A model's columns, read off one row of it — run as the reader, with their rights. */
export function useModelColumns(id: string | null) {
  return useQuery({
    queryKey: ['model-columns', id],
    queryFn: async () => (await api.post<RunResult>('/v1/query', { query: { kind: 'builder', source: { kind: 'question', id }, limit: 1 } })).columns.filter((c) => !c.hidden).map((c) => ({ name: c.name, type: resultType(c.type), label: c.label, ...(c.source?.column ? { id: c.source.column } : {}) })),
    enabled: !!id,
    staleTime: 5 * 60_000,
  })
}

/** The columns of several models at once — those a question joins. */
export function useModelsColumns(ids: readonly string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ['model-columns', id],
      queryFn: async () => (await api.post<RunResult>('/v1/query', { query: { kind: 'builder', source: { kind: 'question', id }, limit: 1 } })).columns.filter((c) => !c.hidden).map((c) => ({ name: c.name, type: resultType(c.type), label: c.label, ...(c.source?.column ? { id: c.source.column } : {}) })),
      staleTime: 5 * 60_000,
    })),
  })
}
