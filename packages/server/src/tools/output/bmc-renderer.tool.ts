import {
  BaseTool,
  type CanvasEdge,
  type CanvasGraph,
  type CanvasNode,
  type ToolContext,
  type ToolDefinition,
  type ToolMessage
} from '@starlink/shared'

type BmcRendererCard = {
  domain?: string
  /** One-line conclusion (≤60 chars). Issue-C fix: separate summary from content. */
  summary?: string
  /** Detailed body (3-6 paragraphs). May be empty if the agent only has 1 line. */
  content?: string
  confidence?: number
}

const AGENT_TYPES = {
  MARKET: 'Market_Agent',
  PRODUCT: 'Product_Agent',
  FINANCE: 'Finance_Agent'
} as const

type AgentType = (typeof AGENT_TYPES)[keyof typeof AGENT_TYPES]

const DOMAIN_LAYOUT: Record<string, { id: string; x: number; y: number }> = {
  客户细分: { id: 'customer-segments', x: 80, y: 120 },
  价值主张: { id: 'value-propositions', x: 360, y: 120 },
  渠道通路: { id: 'channels', x: 640, y: 120 },
  客户关系: { id: 'customer-relationships', x: 920, y: 120 },
  收入来源: { id: 'revenue-streams', x: 80, y: 360 },
  核心资源: { id: 'key-resources', x: 360, y: 360 },
  关键业务: { id: 'key-activities', x: 640, y: 360 },
  重要合作: { id: 'key-partnerships', x: 920, y: 360 },
  成本结构: { id: 'cost-structure', x: 80, y: 600 }
}

const DOMAIN_AGENT: Record<string, AgentType> = {
  客户细分: AGENT_TYPES.MARKET,
  渠道通路: AGENT_TYPES.MARKET,
  客户关系: AGENT_TYPES.MARKET,
  价值主张: AGENT_TYPES.PRODUCT,
  核心资源: AGENT_TYPES.PRODUCT,
  关键业务: AGENT_TYPES.PRODUCT,
  重要合作: AGENT_TYPES.PRODUCT,
  收入来源: AGENT_TYPES.FINANCE,
  成本结构: AGENT_TYPES.FINANCE
}

export default class BmcRendererTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'bmc_renderer',
      provider: 'builtin',
      version: '1.0.0'
    },
    display: {
      label: 'BMC 渲染',
      description: '将 BMC 卡片数组转换为 CanvasGraph',
      icon: '🧩',
      category: 'output',
      color: '#0ea5e9'
    },
    inputSchema: {
      type: 'object',
      properties: {
        nodes: {
          type: 'array',
          description: 'BMC 卡片数组',
          required: true
        }
      },
      required: ['nodes']
    },
    outputSchema: {
      type: 'object',
      properties: {
        canvas: { type: 'object', description: '渲染后的画布图' }
      }
    },
    inputPorts: [
      { name: 'nodes', type: 'array', description: 'BMC 卡片数组', required: true }
    ],
    outputPorts: [
      { name: 'canvas', type: 'object', description: '渲染后的画布图' }
    ],
    runtime: {
      timeout: 30000,
      retries: 1,
      cacheable: true,
      streamable: false,
      parallel: true
    }
  }

  async *execute(
    input: Record<string, unknown>,
    context: ToolContext
  ): AsyncGenerator<ToolMessage> {
    const cards = Array.isArray(input.nodes) ? input.nodes as BmcRendererCard[] : []
    const cardNodes = cards.flatMap((card, index) => renderCardNode(card, index))
    const canvas: CanvasGraph = {
      workspaceId: context.workspaceId,
      nodes: [
        ...cardNodes,
        ...renderAgentAvatars(cards)
      ],
      edges: renderBmcEdges(cardNodes)
    }

    yield { type: 'json', data: { canvas } }
  }
}

function renderCardNode(card: BmcRendererCard, index: number): CanvasNode[] {
  const domain = typeof card.domain === 'string' ? card.domain : ''
  const layout = DOMAIN_LAYOUT[domain]
  if (!layout) return []

  // Issue C fix · pass through summary/fullContent so the BMC drawer
  // can render two distinct sections (摘要 vs 详细分析) instead of
  // collapsing them into a single repeated paragraph.
  // Back-compat: if agent only emits content, drawer derives summary
  // from first sentence client-side.
  const cardSummary = typeof card.summary === 'string' ? card.summary : ''
  const cardContent = typeof card.content === 'string' ? card.content : ''
  return [{
    id: `bmc-${layout.id}`,
    type: 'note',
    position: { x: layout.x, y: layout.y + Math.floor(index / 9) * 220 },
    data: {
      type: 'note',
      title: domain,
      // The visible card body should show whichever is richer. Prefer
      // content (the detailed body) when present, else fall back to
      // summary (the one-liner).
      content: cardContent || cardSummary,
      variant: 'insight',
      meta: {
        macraType: 'cc-bmc-card',
        domain,
        agentType: DOMAIN_AGENT[domain],
        // Drawer reads summary + fullContent off meta. Both populated
        // makes the two-section layout work correctly.
        summary: cardSummary,
        fullContent: cardContent,
        metadata: {
          agent_signature: DOMAIN_AGENT[domain],
          confidence: normalizeConfidence(card.confidence)
        }
      }
    }
  }]
}

function renderAgentAvatars(cards: BmcRendererCard[]): CanvasNode[] {
  const byAgent = new Map<AgentType, BmcRendererCard[]>()
  for (const card of cards) {
    const domain = typeof card.domain === 'string' ? card.domain : ''
    const agent = DOMAIN_AGENT[domain]
    if (!agent) continue
    byAgent.set(agent, [...(byAgent.get(agent) ?? []), card])
  }

  return [
    renderAgentAvatar(
      byAgent.get(AGENT_TYPES.MARKET),
      'avatar-market',
      '市场分析专家',
      AGENT_TYPES.MARKET,
      '我已为你分析了目标客户、渠道通路和客户关系三个维度。',
      { x: 80, y: 860 }
    ),
    renderAgentAvatar(
      byAgent.get(AGENT_TYPES.PRODUCT),
      'avatar-product',
      '产品策略专家',
      AGENT_TYPES.PRODUCT,
      '我已为你分析了价值主张、核心资源、关键业务和重要合作。',
      { x: 360, y: 860 }
    ),
    renderAgentAvatar(
      byAgent.get(AGENT_TYPES.FINANCE),
      'avatar-finance',
      '财务分析专家',
      AGENT_TYPES.FINANCE,
      '我已为你分析了收入来源和成本结构。',
      { x: 640, y: 860 }
    )
  ].filter((node): node is CanvasNode => Boolean(node))
}

function renderAgentAvatar(
  cards: BmcRendererCard[] | undefined,
  id: string,
  label: string,
  agentType: AgentType,
  summary: string,
  position: { x: number; y: number }
): CanvasNode | null {
  if (!cards || cards.length === 0) return null
  const firstDomain = typeof cards[0]?.domain === 'string' ? cards[0].domain : label

  return {
    id,
    type: 'note',
    position,
    data: {
      type: 'note',
      title: label,
      content: `${summary}\n\n**核心洞察**：${firstDomain}`,
      variant: 'insight',
      meta: {
        macraType: 'agent-avatar',
        agentType,
        isInteractive: true,
        metadata: {
          agent_signature: agentType,
          confidence: 'high',
          stage: 'execution'
        }
      }
    }
  }
}

function renderBmcEdges(cardNodes: CanvasNode[]): CanvasEdge[] {
  const findNode = (domain: string) => cardNodes.find((node) => {
    const meta = node.data.type === 'note' ? node.data.meta as { domain?: unknown } | undefined : undefined
    return meta?.domain === domain
  })
  const edges: CanvasEdge[] = []
  const addEdge = (sourceDomain: string, targetDomain: string, label: string) => {
    const source = findNode(sourceDomain)
    const target = findNode(targetDomain)
    if (source && target) {
      edges.push({ id: `${source.id}->${target.id}`, source: source.id, target: target.id, label })
    }
  }

  addEdge('价值主张', '客户细分', '服务于')
  addEdge('渠道通路', '客户细分', '触达')
  addEdge('客户关系', '客户细分', '维系')
  addEdge('核心资源', '价值主张', '支撑')
  addEdge('关键业务', '价值主张', '创造')
  addEdge('客户细分', '收入来源', '带来')
  addEdge('核心资源', '成本结构', '产生')
  addEdge('关键业务', '成本结构', '产生')
  addEdge('重要合作', '核心资源', '提供')

  return edges
}

function normalizeConfidence(confidence: unknown) {
  if (typeof confidence !== 'number') return 'medium'
  if (confidence >= 0.75) return 'high'
  if (confidence >= 0.45) return 'medium'
  return 'low'
}
