import type { WorkspaceGraphResponse } from '@/types/graph'
import { AGENT_TYPES } from '@/types/macra'

export type AgentContributionStage = 'planning' | 'execution' | 'review' | 'decision'

export type AgentContribution = {
  nodeId: string
  title: string
  content: string
  domain?: string
  confidence?: string
  source?: string
  tags: string[]
  macraType?: string
  stage: AgentContributionStage
  positionY: number
  linkedEdgeCount: number
}

export type AgentRelation = {
  agentId: string
  agentName: string
  interactionCount: number
  labels: string[]
}

export type AgentSnapshot = {
  id: string
  name: string
  role: string
  perspective: string
  accent: string
  contributions: AgentContribution[]
  domains: string[]
  primaryDomain?: string
  stageCounts: Record<AgentContributionStage, number>
  confidenceCounts: Record<string, number>
  sources: string[]
  tags: string[]
  relationCount: number
  relatedAgents: AgentRelation[]
  latestContribution?: AgentContribution
}

export type AgentWorkspaceSnapshot = {
  workspaceId: string
  nodeCount: number
  edgeCount: number
  linkedAgentPairs: number
  reviewNodeCount: number
  agents: AgentSnapshot[]
}

export type SeminarSnapshot = {
  planning: AgentContribution[]
  execution: AgentContribution[]
  review: AgentContribution[]
  decision: AgentContribution[]
  openingStatements: Array<{ agentId: string; agentName: string; summary: string }>
  finalRecommendation: string
}

type AgentProfile = Omit<AgentSnapshot, 'contributions' | 'domains' | 'primaryDomain' | 'stageCounts' | 'confidenceCounts' | 'sources' | 'tags' | 'relationCount' | 'relatedAgents' | 'latestContribution'>

type NodeMeta = {
  macraType?: string
  domain?: string
  metadata?: {
    agent_signature?: string
    confidence?: string
    source?: string
    tags?: string[]
    stage?: AgentContributionStage
  }
  agentType?: string
}

type NodeDataShape = {
  title?: string
  content?: string
  meta?: NodeMeta
}

const AGENT_PROFILES: Record<string, AgentProfile> = {
  [AGENT_TYPES.ORCHESTRATOR]: {
    id: AGENT_TYPES.ORCHESTRATOR,
    name: '总协调 Agent',
    role: '任务规划与收敛',
    perspective: '负责意图路由、阶段收敛、最终决策和跨角色协同',
    accent: '#6366f1'
  },
  [AGENT_TYPES.MARKET]: {
    id: AGENT_TYPES.MARKET,
    name: '市场 Agent',
    role: '市场与客户洞察',
    perspective: '聚焦客户细分、渠道路径、需求变化和竞争格局',
    accent: '#f59e0b'
  },
  [AGENT_TYPES.PRODUCT]: {
    id: AGENT_TYPES.PRODUCT,
    name: '产品 Agent',
    role: '价值主张与交付设计',
    perspective: '聚焦价值主张、关键活动、资源配置和交付方式',
    accent: '#10b981'
  },
  [AGENT_TYPES.FINANCE]: {
    id: AGENT_TYPES.FINANCE,
    name: '财务 Agent',
    role: '收益与成本模型',
    perspective: '聚焦收入来源、成本结构、单位经济与财务可行性',
    accent: '#0ea5e9'
  },
  [AGENT_TYPES.CRITIC]: {
    id: AGENT_TYPES.CRITIC,
    name: '质询 Agent',
    role: '冲突识别与反证',
    perspective: '识别逻辑冲突、证据缺口、结构性风险和薄弱假设',
    accent: '#ef4444'
  }
}

function getProfile(agentId: string): AgentProfile {
  return (
    AGENT_PROFILES[agentId] ?? {
      id: agentId,
      name: agentId,
      role: '专项分析',
      perspective: '围绕其负责维度提供分析结论',
      accent: '#64748b'
    }
  )
}

function readNodeMeta(node: WorkspaceGraphResponse['nodes'][number]): NodeMeta | undefined {
  const data = node.data as NodeDataShape | undefined
  return data?.meta
}

function inferAgentId(node: WorkspaceGraphResponse['nodes'][number]): string | null {
  const meta = readNodeMeta(node)
  if (meta?.metadata?.agent_signature) {
    return meta.metadata.agent_signature
  }
  if (meta?.agentType) {
    return meta.agentType
  }
  return null
}

function classifyStage(agentId: string, macraType?: string, title = '', content = ''): AgentContributionStage {
  const haystack = `${title}\n${content}`
  if (agentId === AGENT_TYPES.CRITIC || macraType === 'conflict-alert') {
    return 'review'
  }
  if (agentId === AGENT_TYPES.ORCHESTRATOR) {
    if (/规划|计划|路线|拆解|阶段|里程碑/.test(haystack)) {
      return 'planning'
    }
    return 'decision'
  }
  return 'execution'
}

function toContribution(
  node: WorkspaceGraphResponse['nodes'][number],
  agentId: string,
  edgeCount: number
): AgentContribution {
  const data = (node.data ?? {}) as NodeDataShape
  const meta = data.meta
  const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : node.id
  const content = typeof data.content === 'string' ? data.content : ''

  return {
    nodeId: node.id,
    title,
    content,
    domain: meta?.domain,
    confidence: meta?.metadata?.confidence,
    source: meta?.metadata?.source,
    tags: meta?.metadata?.tags ?? [],
    macraType: meta?.macraType,
    stage: meta?.metadata?.stage ?? classifyStage(agentId, meta?.macraType, title, content),
    positionY: node.position?.y ?? 0,
    linkedEdgeCount: edgeCount
  }
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1
    return acc
  }, {} as Record<T, number>)
}

function summarizeRelations(options: {
  graph: WorkspaceGraphResponse
  agentId: string
  nodeIds: Set<string>
  nodeAgentMap: Map<string, string>
}): AgentRelation[] {
  const { graph, agentId, nodeIds, nodeAgentMap } = options
  const relationMap = new Map<string, { interactionCount: number; labels: Set<string> }>()

  for (const edge of graph.edges) {
    const ownSide = nodeIds.has(edge.source) ? edge.source : nodeIds.has(edge.target) ? edge.target : null
    if (!ownSide) continue

    const linkedNodeId = ownSide === edge.source ? edge.target : edge.source
    const linkedAgentId = nodeAgentMap.get(linkedNodeId)
    if (!linkedAgentId || linkedAgentId === agentId) continue

    const current = relationMap.get(linkedAgentId) ?? {
      interactionCount: 0,
      labels: new Set<string>()
    }

    current.interactionCount += 1
    if (edge.label) current.labels.add(edge.label)
    relationMap.set(linkedAgentId, current)
  }

  return [...relationMap.entries()]
    .map(([relatedAgentId, info]) => ({
      agentId: relatedAgentId,
      agentName: getProfile(relatedAgentId).name,
      interactionCount: info.interactionCount,
      labels: [...info.labels].slice(0, 4)
    }))
    .sort((a, b) => b.interactionCount - a.interactionCount)
}

export function buildAgentWorkspaceSnapshot(graph: WorkspaceGraphResponse): AgentWorkspaceSnapshot {
  const grouped = new Map<string, AgentContribution[]>()
  const nodeAgentMap = new Map<string, string>()
  const nodeEdgeCount = new Map<string, number>()

  for (const edge of graph.edges) {
    nodeEdgeCount.set(edge.source, (nodeEdgeCount.get(edge.source) ?? 0) + 1)
    nodeEdgeCount.set(edge.target, (nodeEdgeCount.get(edge.target) ?? 0) + 1)
  }

  for (const node of graph.nodes) {
    const agentId = inferAgentId(node)
    if (!agentId) continue
    nodeAgentMap.set(node.id, agentId)
    const contribution = toContribution(node, agentId, nodeEdgeCount.get(node.id) ?? 0)
    const current = grouped.get(agentId) ?? []
    current.push(contribution)
    grouped.set(agentId, current)
  }

  const agents = [...grouped.entries()]
    .map(([agentId, contributions]) => {
      const profile = getProfile(agentId)
      const sorted = [...contributions].sort((a, b) => a.positionY - b.positionY)
      const domains = [...new Set(sorted.map((item) => item.domain).filter(Boolean) as string[])]
      const stageCounts = {
        planning: sorted.filter((item) => item.stage === 'planning').length,
        execution: sorted.filter((item) => item.stage === 'execution').length,
        review: sorted.filter((item) => item.stage === 'review').length,
        decision: sorted.filter((item) => item.stage === 'decision').length
      } satisfies Record<AgentContributionStage, number>
      const confidenceValues = sorted.map((item) => item.confidence ?? 'unknown')
      const confidenceCounts = countBy(confidenceValues)
      const sourceList = [...new Set(sorted.map((item) => item.source).filter(Boolean) as string[])]
      const tagList = [...new Set(sorted.flatMap((item) => item.tags))]
      const primaryDomain = domains[0]
      const nodeIds = new Set(sorted.map((item) => item.nodeId))
      const relatedAgents = summarizeRelations({
        graph,
        agentId,
        nodeIds,
        nodeAgentMap
      })

      return {
        ...profile,
        contributions: sorted,
        domains,
        primaryDomain,
        stageCounts,
        confidenceCounts,
        sources: sourceList,
        tags: tagList,
        relationCount: relatedAgents.reduce((sum, item) => sum + item.interactionCount, 0),
        relatedAgents,
        latestContribution: sorted[sorted.length - 1]
      } satisfies AgentSnapshot
    })
    .sort((a, b) => b.contributions.length - a.contributions.length)

  const linkedAgentPairs = new Set(
    agents.flatMap((agent) =>
      agent.relatedAgents.map((related) => [agent.id, related.agentId].sort().join('::'))
    )
  ).size

  return {
    workspaceId: graph.workspaceId,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    linkedAgentPairs,
    reviewNodeCount: agents.reduce((sum, agent) => sum + agent.stageCounts.review, 0),
    agents
  }
}

export function buildSeminarSnapshot(snapshot: AgentWorkspaceSnapshot): SeminarSnapshot {
  const planning = snapshot.agents.flatMap((agent) => agent.contributions.filter((item) => item.stage === 'planning'))
  const execution = snapshot.agents.flatMap((agent) => agent.contributions.filter((item) => item.stage === 'execution'))
  const review = snapshot.agents.flatMap((agent) => agent.contributions.filter((item) => item.stage === 'review'))
  const decision = snapshot.agents.flatMap((agent) => agent.contributions.filter((item) => item.stage === 'decision'))

  const openingStatements = snapshot.agents
    .map((agent) => {
      const first = agent.contributions.find((item) => item.stage === 'execution') ?? agent.contributions[0]
      if (!first) return null
      return {
        agentId: agent.id,
        agentName: agent.name,
        summary: first.content || first.title
      }
    })
    .filter(Boolean) as Array<{ agentId: string; agentName: string; summary: string }>

  const finalDecision = decision[decision.length - 1]?.content ?? decision[decision.length - 1]?.title
  const fallbackDecision = execution[execution.length - 1]?.content ?? '等待执行阶段产出后生成决策结论。'

  return {
    planning,
    execution,
    review,
    decision,
    openingStatements,
    finalRecommendation: finalDecision || fallbackDecision
  }
}
