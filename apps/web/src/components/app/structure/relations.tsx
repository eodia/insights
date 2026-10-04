'use client'

import '@xyflow/react/dist/style.css'
import type { ColumnMeta, Relation, TableMeta } from '@eodia/contracts'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { useTables } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Background,
  type Connection,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  type ReactFlowInstance,
  type XYPosition,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import { KeyRound, Link2, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { TypeGlyph } from './column-bits'
import { TableGlyph } from './tree'

type TableNodeData = {
  table: TableMeta
  columns: ColumnMeta[]
  keys: Set<string>
  href: string
  active: boolean
}
type TableNode = Node<TableNodeData, 'table'>

const NODE_W = 250
const HEADER_H = 50
const ROW_H = 26

function TableNodeView({ data }: NodeProps<TableNode>) {
  const { table, columns, keys, href, active } = data
  return (
    <div className={cn('w-[250px] overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm', active && 'border-primary ring-2 ring-primary/30')}>
      <Link href={href} className="flex h-[50px] items-center gap-2 border-b bg-muted/50 px-3 hover:bg-muted">
        <TableGlyph table={table} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{table.label}</span>
          <span className="block truncate font-mono text-[10px] text-muted-foreground">
            {table.schema}.{table.name}
          </span>
        </span>
      </Link>
      <div>
        {columns.map((c) => (
          <div key={c.id} className="relative flex h-[26px] items-center gap-1.5 px-3 text-xs">
            <Handle type="target" position={Position.Left} id={`t-${c.id}`} className="!size-2 !border-background !bg-muted-foreground" />
            {c.pk ? <KeyRound className="size-3 shrink-0 text-amber-500" /> : keys.has(c.id) ? <Link2 className="size-3 shrink-0 text-sky-500" /> : <TypeGlyph type={c.type} className="size-3" />}
            <span className={cn('min-w-0 flex-1 truncate', (c.pk || keys.has(c.id)) && 'font-medium')}>{c.label}</span>
            <span className="truncate font-mono text-[10px] text-muted-foreground">{c.type.replace(/\(.*\)/, '')}</span>
            <Handle type="source" position={Position.Right} id={`s-${c.id}`} className="!size-2 !border-background !bg-muted-foreground" />
          </div>
        ))}
        {columns.length === 0 ? <div className="px-3 py-1.5 text-[11px] text-muted-foreground">{$t('Aucune clé')}</div> : null}
      </div>
    </div>
  )
}

const nodeTypes = { table: TableNodeView }

/** The entity-relationship diagram of a source: tables, their keys, the relations between them. */
export function RelationsDiagram({ datasource, current, readOnly }: { datasource: string; current: string | null; readOnly: boolean }) {
  const qc = useQueryClient()
  const { data: tables = [], isLoading } = useTables(datasource, true)
  const { data: relations = [], isLoading: loadingRel } = useQuery({
    queryKey: ['relations', datasource],
    queryFn: () => api.get<Relation[]>(`/v1/datasources/${datasource}/relations`),
  })
  const [all, setAll] = useState(false)
  const [dark, setDark] = useState(false)
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), [])

  const computed = useMemo(() => {
    const linked = new Set<string>()
    const degree = new Map<string, number>()
    for (const r of relations) {
      linked.add(r.from.column)
      linked.add(r.to.column)
      degree.set(r.from.table, (degree.get(r.from.table) ?? 0) + 1)
      degree.set(r.to.table, (degree.get(r.to.table) ?? 0) + 1)
    }
    const sorted = [...tables].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.label.localeCompare(b.label))
    const shown = sorted.map((t) => {
      const cols = (t.columns ?? []).filter((c) => all || c.pk || linked.has(c.id) || c.semantic === 'fk' || c.fk)
      return { t, cols }
    })
    // Layered grid: a table sits left of the tables it references, so arrows run left to right;
    // tables without any relation fill a grid underneath.
    const targets = new Map<string, Set<string>>()
    for (const r of relations) {
      if (r.from.table === r.to.table) continue
      targets.set(r.from.table, (targets.get(r.from.table) ?? new Set()).add(r.to.table))
    }
    const level = new Map<string, number>()
    const levelOf = (id: string, seen: Set<string>): number => {
      const known = level.get(id)
      if (known !== undefined) return known
      if (seen.has(id)) return 0
      seen.add(id)
      let l = 0
      for (const t of targets.get(id) ?? []) l = Math.max(l, levelOf(t, seen) + 1)
      seen.delete(id)
      level.set(id, l)
      return l
    }
    const height = (n: number) => HEADER_H + Math.max(n, 1) * ROW_H + 8
    const connected = shown.filter(({ t }) => degree.has(t.id))
    const isolated = shown.filter(({ t }) => !degree.has(t.id))
    for (const { t } of connected) levelOf(t.id, new Set())
    const maxLevel = Math.max(0, ...connected.map(({ t }) => level.get(t.id) ?? 0))
    const out: TableNode[] = []
    const columnY = new Map<number, number>()
    for (const { t, cols } of connected) {
      const col = maxLevel - (level.get(t.id) ?? 0)
      const y = columnY.get(col) ?? 0
      out.push({
        id: t.id,
        type: 'table',
        position: { x: col * (NODE_W + 140), y },
        data: { table: t, columns: cols, keys: linked, href: `/data/${datasource}/${t.id}`, active: t.id === current },
      })
      columnY.set(col, y + height(cols.length) + 50)
    }
    let y = connected.length ? Math.max(...columnY.values()) + 40 : 0
    const perRow = Math.max(maxLevel + 1, Math.ceil(Math.sqrt(isolated.length * 1.4)), 1)
    for (let i = 0; i < isolated.length; i += perRow) {
      const row = isolated.slice(i, i + perRow)
      let tallest = 0
      row.forEach(({ t, cols }, j) => {
        tallest = Math.max(tallest, height(cols.length))
        out.push({
          id: t.id,
          type: 'table',
          position: { x: j * (NODE_W + 140), y },
          data: { table: t, columns: cols, keys: linked, href: `/data/${datasource}/${t.id}`, active: t.id === current },
        })
      })
      y += tallest + 50
    }
    const visible = new Set(out.flatMap((n) => n.data.columns.map((c) => c.id)))
    const es: Edge[] = relations
      .filter((r) => visible.has(r.from.column) && visible.has(r.to.column))
      .map((r) => {
        const manual = r.origin === 'manual'
        const color = manual ? '#8b5cf6' : '#94a3b8'
        return {
          id: r.id,
          source: r.from.table,
          sourceHandle: `s-${r.from.column}`,
          target: r.to.table,
          targetHandle: `t-${r.to.column}`,
          type: 'smoothstep',
          deletable: manual && !readOnly,
          data: { column: r.from.column },
          style: { stroke: color, strokeWidth: 1.5, ...(manual ? { strokeDasharray: '6 4' } : {}) },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
          animated: false,
        }
      })
    return { nodes: out, edges: es }
  }, [tables, relations, all, datasource, current, readOnly])

  // Laid out from the data; a table the user dragged keeps its place until the layout changes shape.
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const dragged = useRef(new Map<string, XYPosition>())
  const flow = useRef<ReactFlowInstance<TableNode, Edge> | null>(null)
  const lastAll = useRef(all)
  useEffect(() => {
    if (lastAll.current !== all) {
      dragged.current.clear()
      lastAll.current = all
    }
    setNodes(computed.nodes.map((n) => ({ ...n, position: dragged.current.get(n.id) ?? n.position })))
    setEdges(computed.edges)
    const t = setTimeout(() => void flow.current?.fitView({ padding: 0.15, duration: 200 }), 60)
    return () => clearTimeout(t)
  }, [computed, all, setNodes, setEdges])

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['relations', datasource] })
    await qc.invalidateQueries({ queryKey: ['tables'] })
    await qc.invalidateQueries({ queryKey: ['table'] })
  }

  const connect = async (c: Connection) => {
    if (readOnly || !c.sourceHandle || !c.targetHandle) return
    const from = c.sourceHandle.replace(/^s-/, '')
    const to = c.targetHandle.replace(/^t-/, '')
    if (c.source === c.target) return
    try {
      await api.patch(`/v1/columns/${from}`, { fk: to })
      toast.success($t('Relation ajoutée.'))
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const remove = async (list: Edge[]) => {
    for (const e of list) {
      const column = (e.data as { column?: string } | undefined)?.column
      if (!column) continue
      try {
        await api.patch(`/v1/columns/${column}`, { fk: null })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    }
    toast.success($t('Relation retirée.'))
    await refresh()
  }

  if (isLoading || loadingRel) return <Loader2 className="m-auto size-5 animate-spin text-muted-foreground" />

  return (
    <div className="relative h-full min-h-[480px] w-full">
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-background/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-6 rounded bg-slate-400" /> {$t('Détectée')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-6 border-t-2 border-dashed border-violet-500" /> {$t('Déclarée à la main')}
        </span>
        <span className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <Switch id="relations-all" checked={all} onCheckedChange={setAll} />
          <label htmlFor="relations-all">{$t('Toutes les colonnes')}</label>
        </div>
      </div>
      {!readOnly ? (
        <div className="absolute top-3 right-3 z-10 max-w-xs rounded-xl border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur">
          {$t('Tirez d’une colonne vers la clé d’une autre table pour déclarer une relation ; sélectionnez une relation déclarée et appuyez sur Suppr pour la retirer.')}
        </div>
      ) : null}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, node) => dragged.current.set(node.id, node.position)}
        onInit={(instance) => {
          flow.current = instance
        }}
        onEdgesChange={onEdgesChange}
        onConnect={connect}
        onEdgesDelete={remove}
        nodesConnectable={!readOnly}
        edgesFocusable
        deleteKeyCode={readOnly ? null : ['Delete', 'Backspace']}
        colorMode={dark ? 'dark' : 'light'}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!rounded-lg !border" />
      </ReactFlow>
    </div>
  )
}
