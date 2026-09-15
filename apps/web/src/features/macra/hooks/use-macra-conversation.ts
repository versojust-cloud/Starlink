'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import {
  type ConversationProgressEvent,
  watchConversation
} from '@/shared/lib/conversation-sync-engine'
import { fetchWorkspaceGraphSnapshot } from '@/features/workspace/hooks/use-workspace-graph'
import {
  AGENT_TYPES,
  type AgentType,
  type CriticRequest,
  type CriticResponse,
  type ConflictDetection,
  type MacraEdgeData,
  type MacraNodeData
} from '@/types/macra'
import type { CanvasEdge, CanvasNode, WorkspaceGraphResponse } from '@/types/graph'
import type { AgentStatus } from '../components/AgentProgressPanel'

export type MacraStage = 'input' | 'thinking' | 'output'
export type MacraPhase = 'idle' | 'planning' | 'execution' | 'review' | 'decision'

type StartAnalysisOptions = {
  knowledgeBaseId?: string
}

type DecisionAction = 'accept' | 'revise' | 'ignore'

type DecisionPayload = {
  decision?: string
  phase?: MacraPhase
}

const START_CONVERSATION_MUTATION = /* GraphQL */ `
  mutation StartConversation($workspaceId: ID!, $question: String!, $kbId: ID) {
    startConversation(workspaceId: $workspaceId, question: $question, kbId: $kbId) {
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

const APPROVE_DECISION_MUTATION = /* GraphQL */ `
  mutation ApproveDecision($conversationId: ID!, $decision: String) {
    approveDecision(conversationId: $conversationId, decision: $decision)
  }
`

const CORE_AGENT_LABELS: Record<AgentType, string> = {
  [AGENT_TYPES.MARKET]: '市场分析',
  [AGENT_TYPES.PRODUCT]: '产品策略',
  [AGENT_TYPES.FINANCE]: '财务分析',
  [AGENT_TYPES.ORCHESTRATOR]: '协调整合',
  [AGENT_TYPES.CRITIC]: '对抗审查',
  [AGENT_TYPES.SEMANTIC_PLAN]: '语义规划',
  [AGENT_TYPES.CUSTOMER_SEGMENTS]: '客户细分',
  [AGENT_TYPES.CUSTOMER_RELATIONSHIPS]: '客户关系',
  [AGENT_TYPES.CHANNELS]: '渠道通路',
  [AGENT_TYPES.VALUE_PROPOSITIONS]: '价值主张',
  [AGENT_TYPES.REVENUE_STREAMS]: '收入来源',
  [AGENT_TYPES.KEY_ACTIVITIES]: '关键业务',
  [AGENT_TYPES.KEY_RESOURCES]: '核心资源',
  [AGENT_TYPES.KEY_PARTNERSHIPS]: '重要合作',
  [AGENT_TYPES.COST_STRUCTURE]: '成本结构',
  [AGENT_TYPES.COMPLIANCE]: '合规审查',
  [AGENT_TYPES.CULTURAL_CONTEXT]: '文化语境',
  [AGENT_TYPES.CULTURAL_SIMULATION]: '文化模拟',
  [AGENT_TYPES.CULTURAL_REPORT]: '文化报告'
}

function createEmptyGraph(workspaceId: string): WorkspaceGraphResponse {
  return {
    workspaceId,
    nodes: [],
    edges: []
  }
}

function mergeById<T extends { id: string }>(current: T[], updates?: T[]) {
  if (!updates || updates.length === 0) return current
  const merged = new Map(current.map((item) => [item.id, item] as const))
  updates.forEach((item) => merged.set(item.id, item))
  return [...merged.values()]
}

function toMacraEdgeData(edge: CanvasEdge): MacraEdgeData {
  return {
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: 'default'
  }
}

function summarizeNode(node: MacraNodeData) {
  const corpus = (node.summary ?? node.content ?? '').trim()
  if (!corpus) return `${node.label} 已生成`
  return corpus.length > 48 ? `${corpus.slice(0, 48)}...` : corpus
}

function extractMacraNodeData(canvasNode: CanvasNode): MacraNodeData | null {
  const data = (canvasNode.data ?? {}) as Record<string, unknown>
  const meta = data.meta as Record<string, unknown> | undefined
  if (!meta) {
    return null
  }

  return {
    id: canvasNode.id,
    type: (meta.macraType || canvasNode.type || 'cc-bmc-card') as MacraNodeData['type'],
    label: typeof data.title === 'string' ? data.title : '未命名',
    content: typeof data.content === 'string' ? data.content : '',
    summary:
      typeof meta.summary === 'string'
        ? meta.summary
        : typeof data.content === 'string'
          ? data.content
          : '',
    fullContent:
      typeof meta.fullContent === 'string'
        ? meta.fullContent
        : typeof data.content === 'string'
          ? data.content
          : '',
    domain: typeof meta.domain === 'string' ? (meta.domain as MacraNodeData['domain']) : undefined,
    metadata: (meta.metadata as MacraNodeData['metadata'] | undefined) ?? {},
    agentType: typeof meta.agentType === 'string' ? (meta.agentType as MacraNodeData['agentType']) : undefined,
    severity: typeof meta.severity === 'string' ? (meta.severity as MacraNodeData['severity']) : undefined,
    conflictType:
      typeof meta.conflictType === 'string' ? (meta.conflictType as MacraNodeData['conflictType']) : undefined,
    isInteractive: typeof meta.isInteractive === 'boolean' ? meta.isInteractive : undefined,
    position: canvasNode.position
  }
}

function buildStatus(
  type: AgentType,
  partial: Partial<AgentStatus> = {}
): AgentStatus {
  return {
    agentType: type,
    label: CORE_AGENT_LABELS[type] ?? type,
    status: 'idle',
    progress: 0,
    ...partial
  }
}

function upsertStatus(
  map: Map<AgentType, AgentStatus>,
  type: AgentType,
  partial: Partial<AgentStatus>
) {
  const current = map.get(type) ?? buildStatus(type)
  map.set(type, {
    ...current,
    ...partial,
    label: partial.label ?? current.label ?? CORE_AGENT_LABELS[type] ?? type
  })
}

function parsePhasePayload(payload: unknown): MacraPhase | null {
  if (!payload || typeof payload !== 'object') return null
  const phase = (payload as { phase?: string }).phase
  if (
    phase === 'idle'
    || phase === 'planning'
    || phase === 'execution'
    || phase === 'review'
    || phase === 'decision'
  ) {
    return phase
  }
  return null
}

function parseDecisionPayload(payload: unknown): DecisionPayload {
  if (!payload || typeof payload !== 'object') return {}
  const source = payload as { decision?: string; phase?: string }
  return {
    decision: typeof source.decision === 'string' ? source.decision : undefined,
    phase: parsePhasePayload(payload) ?? undefined
  }
}

export function useMacraConversation(workspaceId: string) {
  const [stage, setStage] = useState<MacraStage>('input')
  const [phase, setPhase] = useState<MacraPhase>('idle')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [pendingDecision, setPendingDecision] = useState<string | null>(null)
  const [agentStatuses, setAgentStatuses] = useState<Map<AgentType, AgentStatus>>(new Map())
  const [bmcNodes, setBmcNodes] = useState<MacraNodeData[]>([])
  const [conflicts, setConflicts] = useState<ConflictDetection[]>([])
  const [hitlConflicts, setHitlConflicts] = useState<ConflictDetection[]>([])
  const [showHitlModal, setShowHitlModal] = useState(false)
  const [totalDuration, setTotalDuration] = useState<number>()
  /**
   * Latest sub-graph activity breadcrumb (LangGraph subgraphs:true stream).
   * Frontend renders e.g. "market-agent · invoke-agent" while the BMC
   * generator is mid-ReAct; cleared when phase changes or stream ends.
   */
  const [subAgentActivity, setSubAgentActivity] = useState<{
    parentNode: string
    nodeName: string
    payloadKeys: string[]
    at: number
  } | null>(null)

  const stageRef = useRef<MacraStage>('input')
  const phaseRef = useRef<MacraPhase>('idle')
  const watcherCancelRef = useRef<(() => void) | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const graphRef = useRef<WorkspaceGraphResponse>(createEmptyGraph(workspaceId))
  const startedAtRef = useRef<number | null>(null)
  const pendingDecisionRef = useRef<string | null>(null)

  const updateStage = useCallback((nextStage: MacraStage) => {
    stageRef.current = nextStage
    setStage(nextStage)
  }, [])

  const updatePhase = useCallback((nextPhase: MacraPhase) => {
    phaseRef.current = nextPhase
    setPhase(nextPhase)
  }, [])

  const updateConflicts = useCallback(
    (value: ConflictDetection[] | ((current: ConflictDetection[]) => ConflictDetection[])) => {
      setConflicts((current) => {
        const next = typeof value === 'function' ? value(current) : value
        return next
      })
    },
    []
  )

  const syncAgentStatuses = useCallback((nodes: MacraNodeData[], activePhase: MacraPhase) => {
    const next = new Map<AgentType, AgentStatus>()
    const coreAgents: AgentType[] = [
      AGENT_TYPES.MARKET,
      AGENT_TYPES.PRODUCT,
      AGENT_TYPES.FINANCE,
      AGENT_TYPES.ORCHESTRATOR,
      AGENT_TYPES.CRITIC,
      AGENT_TYPES.SEMANTIC_PLAN
    ]

    coreAgents.forEach((agentType) => {
      next.set(agentType, buildStatus(agentType))
    })

    if (activePhase === 'planning') {
      upsertStatus(next, AGENT_TYPES.SEMANTIC_PLAN, {
        status: 'running',
        progress: 24
      })
    }

    if (activePhase === 'execution') {
      upsertStatus(next, AGENT_TYPES.SEMANTIC_PLAN, {
        status: 'completed',
        progress: 100,
        outputSummary: '任务已拆解，开始并行分析。'
      })
      upsertStatus(next, AGENT_TYPES.MARKET, { status: 'running', progress: 32 })
      upsertStatus(next, AGENT_TYPES.PRODUCT, { status: 'running', progress: 32 })
      upsertStatus(next, AGENT_TYPES.FINANCE, { status: 'running', progress: 32 })
    }

    if (activePhase === 'review') {
      upsertStatus(next, AGENT_TYPES.SEMANTIC_PLAN, { status: 'completed', progress: 100 })
      upsertStatus(next, AGENT_TYPES.CRITIC, { status: 'running', progress: 56 })
    }

    if (activePhase === 'decision') {
      upsertStatus(next, AGENT_TYPES.SEMANTIC_PLAN, { status: 'completed', progress: 100 })
      upsertStatus(next, AGENT_TYPES.CRITIC, { status: 'completed', progress: 100 })
      upsertStatus(next, AGENT_TYPES.ORCHESTRATOR, { status: 'running', progress: 72 })
    }

    const grouped = new Map<AgentType, MacraNodeData[]>()
    nodes.forEach((node) => {
      const agentId = (node.metadata.agent_signature ?? node.agentType) as AgentType | undefined
      if (!agentId) return
      if (!grouped.has(agentId)) {
        grouped.set(agentId, [])
      }
      grouped.get(agentId)?.push(node)
    })

    grouped.forEach((items, agentType) => {
      const latest = items[items.length - 1]
      upsertStatus(next, agentType, {
        status: 'completed',
        progress: 100,
        nodeCount: items.length,
        outputSummary: summarizeNode(latest)
      })
    })

    if (
      activePhase === 'idle'
      && grouped.has(AGENT_TYPES.ORCHESTRATOR)
      && next.get(AGENT_TYPES.CRITIC)?.status === 'completed'
    ) {
      upsertStatus(next, AGENT_TYPES.ORCHESTRATOR, {
        status: 'completed',
        progress: 100
      })
    }

    setAgentStatuses(next)
  }, [])

  const syncGraphState = useCallback((graph: WorkspaceGraphResponse) => {
    graphRef.current = graph
    const macraNodes = graph.nodes
      .map((node) => extractMacraNodeData(node))
      .filter((node): node is MacraNodeData => node !== null)

    setBmcNodes(macraNodes)
    syncAgentStatuses(macraNodes, phaseRef.current)
  }, [syncAgentStatuses])

  const runCritic = useCallback(async () => {
    const graph = graphRef.current
    const macraNodes = graph.nodes
      .map((node) => extractMacraNodeData(node))
      .filter((node): node is MacraNodeData => node !== null)

    if (macraNodes.length === 0) {
      updateConflicts([])
      setHitlConflicts([])
      return []
    }

    const request: CriticRequest = {
      canvas_data: {
        nodes: macraNodes,
        edges: graph.edges.map(toMacraEdgeData)
      }
    }

    try {
      const response = await fetch('/api/macra/critic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      })

      if (!response.ok) {
        throw new Error(`Critic API failed: ${response.status}`)
      }

      const data = (await response.json()) as CriticResponse
      const nextConflicts = data.conflicts ?? []
      updateConflicts(nextConflicts)
      setHitlConflicts(nextConflicts.filter((conflict) => conflict.severity === 'high'))
      return nextConflicts
    } catch (error) {
      console.error('[useMacraConversation] critic failed', error)
      updateConflicts([])
      setHitlConflicts([])
      return []
    }
  }, [updateConflicts])

  const applyGraph = useCallback((graph: WorkspaceGraphResponse) => {
    syncGraphState(graph)
  }, [syncGraphState])

  const applyDelta = useCallback((delta: {
    nodes?: CanvasNode[]
    edges?: CanvasEdge[]
    removedNodeIds?: string[]
    removedEdgeIds?: string[]
  }) => {
    const current = graphRef.current
    const nextGraph: WorkspaceGraphResponse = {
      workspaceId: current.workspaceId,
      nodes: mergeById(
        delta.removedNodeIds ? current.nodes.filter((node) => !delta.removedNodeIds?.includes(node.id)) : current.nodes,
        delta.nodes
      ),
      edges: mergeById(
        delta.removedEdgeIds ? current.edges.filter((edge) => !delta.removedEdgeIds?.includes(edge.id)) : current.edges,
        delta.edges
      )
    }

    syncGraphState(nextGraph)
  }, [syncGraphState])

  const handleConversationEvent = useCallback(async (event: ConversationProgressEvent) => {
    if (event.type === 'phase.changed') {
      const nextPhase = parsePhasePayload(event.payload)
      if (!nextPhase) return
      updatePhase(nextPhase)
      syncAgentStatuses(
        graphRef.current.nodes
          .map((node) => extractMacraNodeData(node))
          .filter((node): node is MacraNodeData => node !== null),
        nextPhase
      )
      return
    }

    if (event.type === 'seminar.decision.requested') {
      const payload = parseDecisionPayload(event.payload)
      pendingDecisionRef.current = payload.decision ?? '需要确认最终决策'
      setPendingDecision(pendingDecisionRef.current)
      updateStage('output')
      updatePhase(payload.phase ?? 'decision')

      if (startedAtRef.current) {
        setTotalDuration(Date.now() - startedAtRef.current)
      }

      const nextConflicts = await runCritic()
      const highSeverityConflicts = nextConflicts.filter((conflict) => conflict.severity === 'high')
      setHitlConflicts(highSeverityConflicts)
      setShowHitlModal(highSeverityConflicts.length > 0)
      return
    }

    if (event.type === 'seminar.decision.made') {
      pendingDecisionRef.current = null
      setPendingDecision(null)
      setShowHitlModal(false)
      updatePhase('idle')
      return
    }

    if (event.type === 'status' && event.status === 'failed') {
      updateStage('output')
      updatePhase('idle')
      setSubAgentActivity(null)
      return
    }

    if (event.type === 'agent/subagent-progress') {
      // Lightweight breadcrumb update — server emits these from the
      // BMC ReAct subgraph's internal nodes (call-llm, tools, parse).
      // We capture only the most recent so UI shows current activity
      // without a scrolling log.
      const payload = event.payload as
        | { ns?: string[]; nodeName?: string; payloadKeys?: string[] }
        | undefined
      if (!payload || !Array.isArray(payload.ns) || typeof payload.nodeName !== 'string') {
        return
      }
      // ns[0] format: "<parentNode>:<subgraphCheckpointId>". Take the
      // parent-node prefix as the human-readable agent name.
      const parentNode = (payload.ns[0] ?? '').split(':')[0] || '_unknown_'
      setSubAgentActivity({
        parentNode,
        nodeName: payload.nodeName,
        payloadKeys: Array.isArray(payload.payloadKeys) ? payload.payloadKeys : [],
        at: Date.now()
      })
    }
  }, [runCritic, syncAgentStatuses, updatePhase, updateStage])

  const reset = useCallback(() => {
    watcherCancelRef.current?.()
    watcherCancelRef.current = null
    conversationIdRef.current = null
    pendingDecisionRef.current = null
    graphRef.current = createEmptyGraph(workspaceId)
    startedAtRef.current = null

    setConversationId(null)
    setPendingDecision(null)
    setAgentStatuses(new Map())
    setBmcNodes([])
    updateConflicts([])
    setHitlConflicts([])
    setShowHitlModal(false)
    setTotalDuration(undefined)
    setSubAgentActivity(null)
    updateStage('input')
    updatePhase('idle')
  }, [updateConflicts, updatePhase, updateStage, workspaceId])

  const startAnalysis = useCallback(async (question: string, options: StartAnalysisOptions = {}) => {
    const kbId = options.knowledgeBaseId

    watcherCancelRef.current?.()
    watcherCancelRef.current = null
    conversationIdRef.current = null
    pendingDecisionRef.current = null
    graphRef.current = createEmptyGraph(workspaceId)
    startedAtRef.current = Date.now()

    setConversationId(null)
    setPendingDecision(null)
    setAgentStatuses(new Map())
    setBmcNodes([])
    updateConflicts([])
    setHitlConflicts([])
    setShowHitlModal(false)
    setTotalDuration(undefined)
    updateStage('thinking')
    updatePhase('planning')
    syncAgentStatuses([], 'planning')

    const client = getGraphQLClient()

    try {
      const response = await client.request<{
        startConversation: {
          metadata: { id: string }
          graph: WorkspaceGraphResponse
        }
      }>(START_CONVERSATION_MUTATION, {
        workspaceId,
        question,
        kbId: kbId ?? undefined
      })

      const nextConversationId = response.startConversation.metadata.id
      conversationIdRef.current = nextConversationId
      setConversationId(nextConversationId)

      if (response.startConversation.graph) {
        applyGraph(response.startConversation.graph)
      }

      const watcher = watchConversation({
        workspaceId,
        conversationId: nextConversationId,
        onGraphAppended: (payload) => {
          applyGraph(payload as WorkspaceGraphResponse)
        },
        onGraphDiff: (payload) => {
          applyDelta(payload as {
            nodes?: CanvasNode[]
            edges?: CanvasEdge[]
            removedNodeIds?: string[]
            removedEdgeIds?: string[]
          })
        },
        onEvent: (event) => {
          void handleConversationEvent(event)
        },
        loadLatestGraph: async () => fetchWorkspaceGraphSnapshot(workspaceId)
      })

      watcherCancelRef.current = watcher.cancel

      await watcher.done.finally(() => {
        if (watcherCancelRef.current === watcher.cancel) {
          watcherCancelRef.current = null
        }
      })

      const nextConflicts = await runCritic()
      updateStage('output')
      updatePhase(pendingDecisionRef.current ? 'decision' : 'idle')
      setHitlConflicts(nextConflicts.filter((conflict) => conflict.severity === 'high'))

      if (startedAtRef.current) {
        setTotalDuration(Date.now() - startedAtRef.current)
      }
    } catch (error) {
      console.error('[useMacraConversation] analysis failed', error)
      updateStage('output')
      updatePhase('idle')
      throw error
    }
  }, [
    applyDelta,
    applyGraph,
    handleConversationEvent,
    runCritic,
    syncAgentStatuses,
    updateConflicts,
    updatePhase,
    updateStage,
    workspaceId
  ])

  const approveDecision = useCallback(async (decision: DecisionAction) => {
    const activeConversationId = conversationIdRef.current
    if (!activeConversationId) return

    const nextDecision =
      decision === 'accept'
        ? pendingDecisionRef.current ?? '接受当前结果'
        : decision === 'revise'
          ? '根据 Critic 建议修复'
          : '忽略当前冲突，保留现有方案'

    const client = getGraphQLClient()
    await client.request(APPROVE_DECISION_MUTATION, {
      conversationId: activeConversationId,
      decision: nextDecision
    })

    setShowHitlModal(false)
    pendingDecisionRef.current = null
    setPendingDecision(null)
  }, [])

  const resolveConflict = useCallback((target: ConflictDetection) => {
    updateConflicts((current) => current.filter((conflict) => conflict !== target))
    setHitlConflicts((current) => current.filter((conflict) => conflict !== target))
  }, [updateConflicts])

  const applyConflictSuggestion = useCallback((target: ConflictDetection) => {
    updateConflicts((current) => current.filter((conflict) => conflict !== target))
    setHitlConflicts((current) => current.filter((conflict) => conflict !== target))
  }, [updateConflicts])

  useEffect(() => {
    graphRef.current = createEmptyGraph(workspaceId)
    return () => {
      watcherCancelRef.current?.()
    }
  }, [workspaceId])

  return {
    stage,
    phase,
    conversationId,
    pendingDecision,
    isSubmitting: stage === 'thinking',
    agentStatuses,
    bmcNodes,
    conflicts,
    hitlConflicts,
    showHitlModal,
    totalDuration,
    subAgentActivity,
    startAnalysis,
    approveDecision,
    resolveConflict,
    applyConflictSuggestion,
    reset
  }
}
