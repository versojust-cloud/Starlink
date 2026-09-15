'use client'

import {
  type Dispatch,
  type SetStateAction,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import 'reactflow/dist/style.css'
import {
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type NodeTypes,
  type Connection,
  type Edge,
  type OnSelectionChangeParams,
  type Node,
  useEdgesState,
  useNodesState,
  useReactFlow
} from 'reactflow'
import type { UseMutationResult } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'

import { useWorkspaceGraph } from '../hooks'
import { fetchWorkspaceGraphSnapshot } from '../hooks/use-workspace-graph'
import { useCanvasStore } from '../store'
import { NoteNode } from './nodes/note-node'
import { DocumentNode } from './nodes/document-node'
import { TaskNode } from './nodes/task-node'
import { ReferenceNode } from './nodes/reference-node'
import type { CanvasEdge, CanvasNode, CanvasNodeData, WorkspaceGraphResponse } from '@/types/graph'
import { REACT_FLOW_DRAG_TYPE } from '@/shared/lib/drag-constants'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import { useCanvasMutations } from '../hooks'
import { DashedEdge } from './edges/dashed-edge'
import { TimelineEdge } from './edges/timeline-edge'
import type { TimelineIteration, TimelineNode as TimelineNodeData, TimelineEdge as TimelineEdgeData } from '@/types/timeline'
import clsx from 'clsx'
import { saveTimelineIteration } from '../lib/timeline-history-storage'
import { watchConversation } from '@/shared/lib/conversation-sync-engine'

export type CanvasViewportHandle = {
  generateAnalysis: (question: string) => Promise<void>
  createMainNode: (title?: string, content?: string) => Promise<CanvasNode | null>
  loadTimeline: (payload: { nodes: TimelineNodeData[]; edges: TimelineEdgeData[] }) => void
}

type CanvasViewportProps = {
  workspaceId: string
}

type StartConversationResult = {
  startConversation: {
    metadata: {
      id: string
    }
    graph: WorkspaceGraphResponse
  }
}

type GraphDeltaPayload = {
  nodes?: CanvasNode[]
  edges?: CanvasEdge[]
  removedNodeIds?: string[]
  removedEdgeIds?: string[]
}

const START_CONVERSATION_MUTATION = /* GraphQL */ `
  mutation StartConversation($workspaceId: ID!, $question: String!) {
    startConversation(workspaceId: $workspaceId, question: $question) {
      metadata {
        id
      }
      graph {
        workspaceId
        nodes {
          id
          type
          position {
            x
            y
          }
          data
        }
        edges {
          id
          source
          target
          label
        }
      }
    }
  }
`

function mergeById<T extends { id: string }>(current: T[], updates?: T[]): T[] {
  if (!updates || updates.length === 0) return current
  const merged = new Map(current.map((item) => [item.id, item]))
  for (const item of updates) {
    merged.set(item.id, item)
  }
  return [...merged.values()]
}

function toTimelinePayload(graph: WorkspaceGraphResponse): { nodes: TimelineNodeData[]; edges: TimelineEdgeData[] } {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data as Record<string, unknown>
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label ?? null
    }))
  }
}

function removeById<T extends { id: string }>(current: T[], removedIds?: string[]) {
  if (!removedIds || removedIds.length === 0) return current
  const removed = new Set(removedIds)
  return current.filter((item) => !removed.has(item.id))
}

function applyGraphDelta(graph: WorkspaceGraphResponse, delta: GraphDeltaPayload): WorkspaceGraphResponse {
  return {
    workspaceId: graph.workspaceId,
    nodes: mergeById(removeById(graph.nodes, delta.removedNodeIds), delta.nodes),
    edges: mergeById(removeById(graph.edges, delta.removedEdgeIds), delta.edges)
  }
}

export const CanvasViewport = forwardRef<CanvasViewportHandle, CanvasViewportProps>(function CanvasViewport(
  { workspaceId },
  ref
) {
  return (
    <ReactFlowProvider>
      <CanvasViewportInner workspaceId={workspaceId} ref={ref} />
    </ReactFlowProvider>
  )
})

type CanvasViewportInnerProps = {
  workspaceId: string
}

const CanvasViewportInner = forwardRef<CanvasViewportHandle, CanvasViewportInnerProps>(function CanvasViewportInner(
  { workspaceId },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { data, isSuccess, isLoading, isError, refetch } = useWorkspaceGraph(workspaceId)
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const reactFlow = useReactFlow()
  const setZoom = useCanvasStore((state) => state.setZoom)
  const taskId = useCanvasStore((state) => state.taskId)
  const setTaskId = useCanvasStore((state) => state.setTaskId)
  const iterations = useCanvasStore((state) => state.iterations)
  const addIterationToStore = useCanvasStore((state) => state.addIteration)
  const { addNode, connectNodes } = useCanvasMutations(workspaceId)
  const searchParams = useSearchParams()
  const focusNodeId = searchParams.get('focusNodeId')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const selectedNodeIdRef = useRef<string | null>(null)
  const mainNodeIdRef = useRef<string | null>(null)
  const focusedNodeIdRef = useRef<string | null>(null)
  const [pendingNodes, setPendingNodes] = useState<Node<CanvasNodeData>[]>([])
  const [pendingEdges, setPendingEdges] = useState<Edge[]>([])
  const nodesRef = useRef<Node<CanvasNodeData>[]>([])
  const edgesRef = useRef<Edge[]>([])

  const mapNodesForState = useCallback(
    (nodesData: TimelineNodeData[]): Node<CanvasNodeData>[] =>
      nodesData.map((node) => ({
        id: node.id,
        type: node.type as CanvasNode['type'],
        position: node.position,
        data: node.data as CanvasNodeData,
        className: 'canvas-node'
      })),
    []
  )

  const mapEdgesForState = useCallback(
    (edgesData: TimelineEdgeData[]) =>
      edgesData.map((edge) => {
        const label = edge.label ?? undefined
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label,
          type: label ? ('timeline' as const) : ('dashed' as const),
          className: 'canvas-edge'
        }
      }),
    []
  )

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId
  }, [selectedNodeId])

  useEffect(() => {
    if (!focusNodeId) {
      focusedNodeIdRef.current = null
      return
    }
    if (focusedNodeIdRef.current === focusNodeId) return

    const targetNode = nodesRef.current.find((node) => node.id === focusNodeId)
    if (!targetNode) return

    focusedNodeIdRef.current = focusNodeId
    setSelectedNodeId(focusNodeId)
    reactFlow.fitView({
      nodes: [targetNode],
      padding: 0.35,
      duration: 450
    })
  }, [focusNodeId, reactFlow, setSelectedNodeId])

  const syncTimeline = useCallback(
    (
      payload: { nodes: TimelineNodeData[]; edges: TimelineEdgeData[] },
      options?: { progressive?: boolean }
    ) => {
      const { progressive = true } = options ?? {}
      const targetNodes = mapNodesForState(payload.nodes)
      const targetEdges = mapEdgesForState(payload.edges)
      const shouldAnimate = progressive

      if (!shouldAnimate) {
        setNodes(targetNodes)
        setPendingNodes([])
        setEdges(targetEdges)
        setPendingEdges([])
      } else {
        const nodeMap = new Map(targetNodes.map((node) => [node.id, node]))
        const retainedNodes: Node<CanvasNodeData>[] = []

        nodesRef.current.forEach((node) => {
          const updated = nodeMap.get(node.id)
          if (updated) {
            retainedNodes.push({ ...updated, className: 'canvas-node' })
            nodeMap.delete(node.id)
          }
        })

        setNodes(retainedNodes)
        setPendingNodes(Array.from(nodeMap.values()))

        const edgeMap = new Map(targetEdges.map((edge) => [edge.id, edge]))
        const retainedEdges: Edge[] = []
        edgesRef.current.forEach((edge) => {
          const updated = edgeMap.get(edge.id)
          if (updated) {
            retainedEdges.push({ ...updated, className: 'canvas-edge' })
            edgeMap.delete(edge.id)
          }
        })
        setEdges(retainedEdges)
        setPendingEdges(Array.from(edgeMap.values()))
      }

      const primaryNode = targetNodes.find((node) => {
        const data = node.data as CanvasNodeData | undefined
        return data?.type === 'note' && data.variant === 'primary'
      })

      if (primaryNode) {
        mainNodeIdRef.current = primaryNode.id
      } else if (mainNodeIdRef.current && !targetNodes.some((node) => node.id === mainNodeIdRef.current)) {
        mainNodeIdRef.current = null
      }

      const selectedId = selectedNodeIdRef.current
      const selectedExists = selectedId
        ? targetNodes.some((node) => node.id === selectedId)
        : false
      if (!selectedExists) {
        const fallback = primaryNode ?? targetNodes[0] ?? null
        setSelectedNodeId((current) => {
          if (fallback && current !== fallback.id) {
            return fallback.id
          }
          if (!fallback) {
            return null
          }
          return current
        })
      } else if (!selectedId && primaryNode) {
        setSelectedNodeId(primaryNode.id)
      }
    },
    [
      mapEdgesForState,
      mapNodesForState,
      nodesRef,
      edgesRef,
      setEdges,
      setNodes,
      setSelectedNodeId,
      setPendingEdges,
      setPendingNodes
    ]
  )

  useEffect(() => {
    if (!isSuccess || !data) return
    syncTimeline(
      {
        nodes: data.nodes as TimelineNodeData[],
        edges: data.edges as TimelineEdgeData[]
      },
      { progressive: false }
    )
  }, [data, isSuccess, syncTimeline])

  useEffect(() => {
    if (pendingNodes.length === 0) return
    const queue = [...pendingNodes]
    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const addNext = () => {
      if (cancelled) return
      const node = queue.shift()
      if (!node) {
        setPendingNodes([])
        return
      }
      setNodes((current) => {
        if (current.some((existing) => existing.id === node.id)) {
          return current
        }
        return current.concat({
          ...node,
          className: clsx('canvas-node', node.className, 'animate-canvas-node')
        })
      })
      if (queue.length > 0) {
        timer = (globalThis.setTimeout ?? setTimeout)(addNext, 180)
      } else {
        timer = (globalThis.setTimeout ?? setTimeout)(() => {
          setPendingNodes([])
        }, 200)
      }
    }

    timer = (globalThis.setTimeout ?? setTimeout)(addNext, 120)

    return () => {
      cancelled = true
      if (timer) {
        ;(globalThis.clearTimeout ?? clearTimeout)(timer)
      }
    }
  }, [pendingNodes, setNodes, setPendingNodes])

  useEffect(() => {
    if (pendingEdges.length === 0 || pendingNodes.length > 0) return
    const queue = [...pendingEdges]
    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const addNextEdge = () => {
      if (cancelled) return
      const edge = queue.shift()
      if (!edge) {
        setPendingEdges([])
        return
      }
      setEdges((current) => {
        if (current.some((existing) => existing.id === edge.id)) {
          return current
        }
        return current.concat({
          ...edge,
          className: clsx('canvas-edge', edge.className, 'animate-canvas-edge')
        })
      })
      if (queue.length > 0) {
        timer = (globalThis.setTimeout ?? setTimeout)(addNextEdge, 140)
      } else {
        timer = (globalThis.setTimeout ?? setTimeout)(() => {
          setPendingEdges([])
        }, 180)
      }
    }

    timer = (globalThis.setTimeout ?? setTimeout)(addNextEdge, 120)

    return () => {
      cancelled = true
      if (timer) {
        ;(globalThis.clearTimeout ?? clearTimeout)(timer)
      }
    }
  }, [pendingEdges, pendingNodes.length, setEdges, setPendingEdges])

  const nodeTypes = useMemo<NodeTypes>(() => {
    return {
      note: NoteNode,
      document: DocumentNode,
      task: TaskNode,
      reference: ReferenceNode
    }
  }, [])

  const edgeTypes = useMemo(() => ({ dashed: DashedEdge, timeline: TimelineEdge }), [])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const nodeType = event.dataTransfer.getData(REACT_FLOW_DRAG_TYPE)
      if (!nodeType) return
      const canvasNodeType = nodeType as CanvasNode['type']

      const bounds = event.currentTarget.getBoundingClientRect()
      const position = reactFlow.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top
      })

      const nodeData = createDefaultNodeData(canvasNodeType)
      const tempNode: Node<CanvasNodeData> = {
        id: `temp-${Date.now()}`,
        type: canvasNodeType,
        position,
        data: nodeData,
        className: 'canvas-node animate-canvas-node'
      }

      setNodes((current) => current.concat(tempNode))
      addNode.mutate(
        {
          type: canvasNodeType,
          position,
          data: nodeData
        },
        {
          onError: () => {
            setNodes((current) => current.filter((node) => node.id !== tempNode.id))
          }
        }
      )
    },
    [addNode, reactFlow, setNodes]
  )

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const tempEdge: Edge = {
        id: `temp-edge-${Date.now()}`,
        source: connection.source,
        target: connection.target
      }

      setEdges((curr) => curr.concat(tempEdge))
      connectNodes.mutate(
        {
          source: connection.source,
          target: connection.target,
          label: null
        },
        {
          onError: () => {
            setEdges((curr) => curr.filter((edge) => edge.id !== tempEdge.id))
          }
        }
      )
    },
    [connectNodes, setEdges]
  )

  const getCanvasCenter = useCallback(() => {
    const bounds = containerRef.current?.getBoundingClientRect()
    return reactFlow.project({
      x: (bounds?.width ?? 800) / 2,
      y: (bounds?.height ?? 600) / 2
    })
  }, [reactFlow])

  const createMainNode = useCallback(
    async (title = '任务规划', content = '请描述你的任务…'): Promise<CanvasNode | null> => {
      const centerPosition = getCanvasCenter()
      const created = await createNodeWithOptimistic(
        {
          type: 'note',
          position: centerPosition,
          data: {
            type: 'note',
            title,
            content,
            variant: 'primary',
            footerText: '复杂的办公任务，从规划开始'
          }
        },
        setNodes,
        addNode
      )

      mainNodeIdRef.current = created.id
      setSelectedNodeId(created.id)

      return {
        id: created.id,
        type: 'note' as const,
        position: centerPosition,
        data: created.data
      }
    },
    [addNode, getCanvasCenter, setNodes]
  )

  const generateAnalysis = useCallback(
    async (question: string) => {
      const activeTaskId = taskId ?? `${workspaceId}-default`
      if (!taskId) {
        setTaskId(activeTaskId)
      }

      const client = getGraphQLClient()
      const response = await client.request<StartConversationResult>(START_CONVERSATION_MUTATION, {
        workspaceId,
        question
      })

      const conversationId = response.startConversation.metadata.id
      let latestGraph = response.startConversation.graph

      syncTimeline(toTimelinePayload(latestGraph), { progressive: false })

      const watcher = watchConversation({
        workspaceId,
        conversationId,
        onGraphAppended: (payload) => {
          latestGraph = payload as WorkspaceGraphResponse
          syncTimeline(toTimelinePayload(latestGraph))
        },
        onGraphDiff: (payload) => {
          latestGraph = applyGraphDelta(
            latestGraph,
            payload as GraphDeltaPayload
          )
          syncTimeline(toTimelinePayload(latestGraph))
        },
        loadLatestGraph: async () => fetchWorkspaceGraphSnapshot(workspaceId)
      })

      await watcher.done

      const nextVersion = iterations.reduce((max, item) => Math.max(max, item.version), 0) + 1
      const timeline = toTimelinePayload(latestGraph)
      const iteration: TimelineIteration = {
        id: conversationId,
        version: nextVersion,
        summary: question,
        createdAt: new Date().toISOString(),
        nodes: timeline.nodes,
        edges: timeline.edges
      }
      addIterationToStore(iteration)
      saveTimelineIteration(workspaceId, activeTaskId, iteration)
    },
    [
      addIterationToStore,
      iterations,
      setTaskId,
      syncTimeline,
      taskId,
      workspaceId
    ]
  )

  const loadTimeline = useCallback(
    (payload: { nodes: TimelineNodeData[]; edges: TimelineEdgeData[] }) => {
      syncTimeline(payload, { progressive: false })
    },
    [syncTimeline]
  )

  useImperativeHandle(ref, () => ({ generateAnalysis, createMainNode, loadTimeline }), [createMainNode, generateAnalysis, loadTimeline])

  return (
    <div className="canvas-grid relative h-full w-full" data-testid="canvas-area" ref={containerRef}>
      {(isLoading || isError) && (
        <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-canvas-bg/80">
          <div className="pointer-events-auto rounded-2xl border border-canvas-border bg-canvas-surface/95 px-6 py-4 text-center text-sm text-canvas-text shadow-lg">
            {isLoading ? (
              <p data-testid="canvas-loading">画布加载中…</p>
            ) : (
              <div className="space-y-3" data-testid="canvas-error">
                <p>画布数据加载失败。</p>
                <button
                  type="button"
                  onClick={() => {
                    void refetch()
                  }}
                  className="rounded-full border border-canvas-border px-4 py-1 text-xs text-canvas-text transition hover:bg-canvas-panel"
                >
                  重试
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onMoveEnd={(_, viewport) => setZoom(viewport.zoom)}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onSelectionChange={({ nodes }: OnSelectionChangeParams) => {
          const node = nodes[0]
          if (!node) {
            setSelectedNodeId(null)
            return
          }
          const data = node.data as CanvasNodeData | undefined
          if (data?.type === 'note' && data.variant === 'primary') {
            mainNodeIdRef.current = node.id
            setSelectedNodeId(node.id)
          } else {
            setSelectedNodeId(node.id)
          }
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls className="border border-canvas-border bg-canvas-surface/80 text-canvas-muted" showInteractive={false} />
      </ReactFlow>
    </div>
  )
})

type OptimisticNodeInput = {
  type: CanvasNode['type']
  position: { x: number; y: number }
  data: CanvasNodeData
}

const createNodeWithOptimistic = async (
  input: OptimisticNodeInput,
  setNodes: Dispatch<SetStateAction<Node<CanvasNodeData>[]>>,
  addNode: UseMutationResult<CanvasNode, unknown, OptimisticNodeInput, unknown>
) => {
  const tempNode: Node<CanvasNodeData> = {
    id: `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: input.type,
    position: input.position,
    data: input.data,
    className: 'canvas-node animate-canvas-node'
  }

  setNodes((current) => current.concat(tempNode))
  try {
    const created = await addNode.mutateAsync({
      type: input.type,
      position: input.position,
      data: input.data
    })
    setNodes((current) =>
      current.map((node) =>
        node.id === tempNode.id
          ? {
              id: created.id,
              type: created.type,
              position: created.position,
              data: created.data as CanvasNodeData,
              className: 'canvas-node'
            }
          : node
      )
    )
    return {
      id: created.id,
      type: created.type,
      position: created.position,
      data: created.data
    }
  } catch (error) {
    setNodes((current) => current.filter((node) => node.id !== tempNode.id))
    throw error
  }
}

const createDefaultNodeData = (type: CanvasNode['type']): CanvasNodeData => {
  switch (type) {
    case 'note':
      return {
        type: 'note',
        title: '新建笔记',
        content: '从这里开始记录要点…'
      }
    case 'document':
      return {
        type: 'document',
        title: '新建文档节点',
        summary: '连接已有资料或拖入新文档。',
        references: 0
      }
    case 'task':
      return {
        type: 'task',
        title: '新建任务',
        status: 'todo'
      }
    case 'reference':
      return {
        type: 'reference',
        title: '引用片段',
        source: '待绑定文档',
        location: 'N/A'
      }
    case 'image':
      return {
        type: 'image',
        title: '图像节点',
        url: ''
      }
    case 'web':
      return {
        type: 'web',
        title: '网页卡片',
        url: 'https://'
      }
    default:
      return {
        type: 'note',
        title: '新建节点',
        content: '补充内容…'
      }
  }
}
