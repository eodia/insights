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
  TableMeta,
} from '@eodia/contracts'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'

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
export const useQuestion = (id: string | null | undefined) =>
  useQuery({ queryKey: keys.question(id ?? ''), queryFn: () => api.get<Question>(`/v1/questions/${id}`), enabled: !!id })
export const useDashboard = (id: string) => useQuery({ queryKey: keys.dashboard(id), queryFn: () => api.get<Dashboard>(`/v1/dashboards/${id}`) })
export const useModels = () => useQuery({ queryKey: ['models'], queryFn: () => api.get<ItemSummary[]>('/v1/models') })
export const useMetrics = () => useQuery({ queryKey: ['metrics'], queryFn: () => api.get<ItemSummary[]>('/v1/metrics') })
export const useDirectory = () =>
  useQuery({
    queryKey: keys.directory,
    queryFn: () => api.get<{ users: { id: string; name: string; email: string; color: string | null }[]; groups: Group[] }>('/v1/directory'),
  })
