import assert from 'node:assert/strict'
import test from 'node:test'
import type { CanvasGraph, CanvasNode, SeminarPhase } from '@starlink/shared'
import { applyGraphDelta } from '../application/graph-delta.js'
import { BusinessLangGraphService } from './business-langgraph.js'

type IntentResult = {
  intent: 'generate_bmc' | 'analyze' | 'detect_conflicts' | 'general' | 'deep_research'
  reasoning: string
}

type ConflictResult = {
  conflicts: Array<{
    label: string
    description: string
    severity: 'high' | 'medium' | 'low'
    conflictType: 'resource-goal' | 'compliance-business' | 'channel-product' | 'other'
    relatedAgents: string[]
  }>
}

class FakeBusinessModel {
  constructor(
    private readonly responses: {
      intents: IntentResult[]
      conflicts: ConflictResult[]
      market: unknown[][]
      product: unknown[][]
      finance: unknown[][]
      guidance?: string[]
      general?: string[]
      deepResearch?: string[]
    }
  ) {}

  async invoke(messages: Array<{ content: unknown }>) {
    const prompt = stringifyMessage(messages[0]?.content)
    if (prompt.includes('你是 Market_Agent')) {
      return { content: JSON.stringify(shiftOrThrow(this.responses.market, 'market')) }
    }
    if (prompt.includes('你是 Product_Agent')) {
      return { content: JSON.stringify(shiftOrThrow(this.responses.product, 'product')) }
    }
    if (prompt.includes('你是 Finance_Agent')) {
      return { content: JSON.stringify(shiftOrThrow(this.responses.finance, 'finance')) }
    }
    if (prompt.includes('你是研讨会主持人')) {
      return { content: shiftOrDefault(this.responses.guidance, '请根据冲突结果修正分析。') }
    }
    if (prompt.includes('你是 Orchestrator，负责直接回答用户的问题')) {
      return { content: shiftOrDefault(this.responses.general, '这是通用答复。') }
    }
    if (prompt.includes('你是 Deep Research 研究员')) {
      return {
        content: shiftOrDefault(
          this.responses.deepResearch,
          '研究综述：行业概览。\n\n第一段[[no-ref]]。'
        )
      }
    }
    throw new Error(`Unexpected invoke prompt: ${prompt.slice(0, 80)}`)
  }

  withStructuredOutput<T>(
    _schema: unknown,
    options: {
      name: string
      strict?: boolean
      method?: 'functionCalling' | 'jsonMode' | 'jsonSchema'
    }
  ) {
    return {
      invoke: async () => {
        if (options.name === 'IntentClassification') {
          return shiftOrThrow(this.responses.intents, 'intent') as T
        }
        if (options.name === 'ConflictAnalysis') {
          return shiftOrThrow(this.responses.conflicts, 'conflict') as T
        }
        throw new Error(`Unexpected structured output request: ${options.name}`)
      }
    }
  }
}

test('general intent reuses workspace graph and emits a direct answer', async () => {
  const service = new BusinessLangGraphService(new FakeBusinessModel({
    intents: [{ intent: 'general', reasoning: '通用问答' }],
    conflicts: [],
    market: [],
    product: [],
    finance: [],
    general: ['这是一个直接回答用户问题的总结。']
  }))

  const baseGraph = createWorkspaceGraph('workspace-general', [
    createMacraCanvasNode({
      id: 'market-customer-segments',
      label: '已有客户',
      content: '当前画布已经有客户细分。',
      domain: '客户细分',
      agentSignature: 'Market_Agent'
    }, 120)
  ])

  const result = await executeConversation(service, {
    workspaceId: 'workspace-general',
    userId: 'tester',
    question: '请直接总结一下这个工作区现在的重点',
    traceId: 'conv-general',
    baseGraph
  })

  assert.equal(result.initialGraph.nodes.length, 1)
  assert.ok(result.finalGraph.nodes.some((node) => node.id === 'market-customer-segments'))
  const generalNode = result.finalGraph.nodes.find((node) => node.id === 'general-response-conv-general')
  assert.ok(generalNode)
  assert.match(readNodeContent(generalNode), /直接回答/)
  assert.deepEqual(result.statuses, ['completed'])
})

test('deep_research intent routes to deepResearchAgent and emits summary + detail cards (no critic)', async () => {
  const service = new BusinessLangGraphService(new FakeBusinessModel({
    intents: [{ intent: 'deep_research', reasoning: '用户希望对新能源汽车赛道做深度调研' }],
    conflicts: [],
    market: [],
    product: [],
    finance: [],
    deepResearch: [
      `## 核心结论
头部集中[[no-ref]]。

## 详细分析
2023-2025 销量翻倍，前五厂商占据七成份额[[no-ref]]，行业从"百花齐放"过渡到"寡头主导"阶段。

电池成本相比 2020 年下降 40%[[no-ref]]，规模效应推动整车售价进入与传统燃油车贴近的区间，但单车毛利持续承压。

竞争格局向技术、补能网络、品牌三个维度延伸[[no-ref]]，新进入者获取份额的窗口正在快速关闭。`
    ]
  }))

  const baseGraph = createWorkspaceGraph('workspace-deep-research', [])

  const result = await executeConversation(service, {
    workspaceId: 'workspace-deep-research',
    userId: 'tester',
    question: '请对新能源汽车赛道做一份深度调研',
    traceId: 'conv-deep-research',
    baseGraph
  })

  const summaryNode = result.finalGraph.nodes.find(
    (n) => n.id === 'deep-research-summary-conv-deep-research'
  )
  const detailNode = result.finalGraph.nodes.find(
    (n) => n.id === 'deep-research-detail-conv-deep-research'
  )
  assert.ok(summaryNode, 'expected a deep-research SUMMARY card')
  assert.ok(detailNode, 'expected a deep-research DETAIL card')
  assert.match(readNodeContent(summaryNode), /头部集中/)
  assert.match(readNodeContent(detailNode), /销量翻倍/)
  // Summary must be shorter than detail (TL;DR property).
  assert.ok(
    readNodeContent(summaryNode).length < readNodeContent(detailNode).length,
    'summary should be shorter than detail'
  )

  const conflicts = result.finalGraph.nodes.filter((n) => readMacraType(n) === 'conflict-alert')
  assert.equal(conflicts.length, 0, 'critic must not run for deep_research intent')

  // Citation pipeline ran on both cards (cleanText has [[no-ref]] stripped).
  assert.ok(!readNodeContent(summaryNode).includes('[[no-ref]]'))
  assert.ok(!readNodeContent(detailNode).includes('[[no-ref]]'))

  assert.deepEqual(result.statuses, ['completed'])
  assert.equal(result.interrupts.length, 0)
})

test('detect_conflicts inspects the existing canvas instead of an empty state', async () => {
  const service = new BusinessLangGraphService(new FakeBusinessModel({
    intents: [{ intent: 'detect_conflicts', reasoning: '用户要求检测冲突' }],
    conflicts: [{
      conflicts: [
        {
          label: '定价策略冲突',
          description: '高端定位与低价策略不一致',
          severity: 'high',
          conflictType: 'channel-product',
          relatedAgents: ['Market_Agent', 'Finance_Agent']
        }
      ]
    }],
    market: [],
    product: [],
    finance: []
  }))

  const baseGraph = createWorkspaceGraph('workspace-conflict', [
    createMacraCanvasNode({
      id: 'market-customer-segments',
      label: '高端中产',
      content: '目标客户是高端中产家庭。',
      domain: '客户细分',
      agentSignature: 'Market_Agent'
    }, 120),
    createMacraCanvasNode({
      id: 'finance-revenue-streams',
      label: '低价走量',
      content: '依赖低价快速铺量。',
      domain: '收入来源',
      agentSignature: 'Finance_Agent'
    }, 340)
  ])

  const result = await executeConversation(service, {
    workspaceId: 'workspace-conflict',
    userId: 'tester',
    question: '请帮我检查当前画布有没有冲突',
    traceId: 'conv-conflict',
    baseGraph
  })

  assert.equal(result.initialGraph.nodes.length, 2)
  const conflicts = result.finalGraph.nodes.filter((node) => readMacraType(node) === 'conflict-alert')
  assert.equal(conflicts.length, 1)
  assert.match(readNodeContent(conflicts[0]), /高端定位与低价策略不一致/)
  assert.equal(result.interrupts.length, 1)
  assert.deepEqual(result.statuses, ['completed'])
})

test('generate_bmc covers all nine CC-BMC dimensions including key partnerships', async () => {
  const service = new BusinessLangGraphService(new FakeBusinessModel({
    intents: [{ intent: 'generate_bmc', reasoning: '生成完整画布' }],
    conflicts: [{ conflicts: [] }],
    market: [[
      makeDomainPayload('客户细分', '目标客户', '面向高端中产用户'),
      makeDomainPayload('渠道通路', '直营渠道', '线上官网与线下体验店结合'),
      makeDomainPayload('客户关系', '会员服务', '通过会员体系提升粘性')
    ]],
    product: [[
      makeDomainPayload('价值主张', '智能体验', '提供智能驾驶与高品质体验'),
      makeDomainPayload('核心资源', '研发团队', '依赖算法与整车研发团队'),
      makeDomainPayload('关键业务', '持续迭代', '通过 OTA 和产品迭代维持优势'),
      makeDomainPayload('重要合作', '电池伙伴', '与电池和渠道伙伴建立战略合作')
    ]],
    finance: [[
      makeDomainPayload('收入来源', '整车销售', '整车销售加软件订阅'),
      makeDomainPayload('成本结构', '研发制造', '研发、制造和渠道建设是主要成本')
    ]]
  }))

  const result = await executeConversation(service, {
    workspaceId: 'workspace-bmc',
    userId: 'tester',
    question: '帮我生成一个新能源汽车商业模式画布',
    traceId: 'conv-bmc'
  })

  const domains = result.finalGraph.nodes
    .filter((node) => readMacraType(node) === 'cc-bmc-card')
    .map((node) => readNodeDomain(node))
    .filter((domain): domain is string => Boolean(domain))

  assert.equal(domains.length, 9)
  assert.ok(domains.includes('重要合作'))
  assert.equal(new Set(domains).size, 9)

  // Phase 2.6 · synthesizer emits a TL;DR card alongside the 9 BMC cards
  // (no rule-based consistency conflict here, so the detail/一致性 card is
  // skipped — only TL;DR is present).
  const tldr = result.finalGraph.nodes.find(
    (n) => readMacraType(n) === 'insight-note' && /核心结论/.test(readNodeLabel(n))
  )
  assert.ok(tldr, 'expected a 核心结论 TL;DR insight-note')
  assert.match(readNodeContent(tldr), /9 张卡片|完成商业画布/)
})

test('synthesizer emits TL;DR + detail cards when rule-based conflict triggers', async () => {
  const service = new BusinessLangGraphService(new FakeBusinessModel({
    intents: [{ intent: 'generate_bmc', reasoning: '生成画布' }],
    conflicts: [{ conflicts: [] }],
    market: [[
      makeDomainPayload('客户细分', '高端中产', '面向高端中产家庭'),
      makeDomainPayload('渠道通路', '直营', '线下直营'),
      makeDomainPayload('客户关系', '会员', '高端会员服务')
    ]],
    product: [[
      makeDomainPayload('价值主张', '高品质', '高品质体验'),
      makeDomainPayload('核心资源', '团队', '研发团队'),
      makeDomainPayload('关键业务', '迭代', 'OTA 迭代'),
      makeDomainPayload('重要合作', '伙伴', '战略合作')
    ]],
    finance: [[
      makeDomainPayload('收入来源', '低价走量', '依赖低价快速铺量'),
      makeDomainPayload('成本结构', '研发', '研发为主')
    ]]
  }))

  const result = await executeConversation(service, {
    workspaceId: 'workspace-tldr-detail',
    userId: 'tester',
    question: '生成画布',
    traceId: 'conv-tldr-detail'
  })

  const insightLabels = result.finalGraph.nodes
    .filter((n) => readMacraType(n) === 'insight-note')
    .map((n) => readNodeLabel(n))

  assert.ok(insightLabels.some((l) => /核心结论/.test(l)), 'expected TL;DR card')
  assert.ok(insightLabels.some((l) => /详细分析/.test(l)), 'expected detail card')

  const tldr = result.finalGraph.nodes.find(
    (n) => readMacraType(n) === 'insight-note' && /核心结论/.test(readNodeLabel(n))
  )!
  const detail = result.finalGraph.nodes.find(
    (n) => readMacraType(n) === 'insight-note' && /详细分析/.test(readNodeLabel(n))
  )!
  // TL;DR must be shorter than detail (the whole point of the split).
  assert.ok(
    readNodeContent(tldr).length < readNodeContent(detail).length,
    'TL;DR must be shorter than detail'
  )
  // TL;DR must mention the conflict count (rule-based detector fired).
  assert.match(readNodeContent(tldr), /矛盾|张力/)
})

test('revision rounds replace prior domain cards and clear resolved conflicts', async () => {
  const service = new BusinessLangGraphService(new FakeBusinessModel({
    intents: [{ intent: 'generate_bmc', reasoning: '生成并修正完整画布' }],
    conflicts: [
      {
        conflicts: [
          {
            label: '定价策略冲突',
            description: '高端定位与低价策略不一致',
            severity: 'high',
            conflictType: 'channel-product',
            relatedAgents: ['Market_Agent', 'Finance_Agent']
          }
        ]
      },
      { conflicts: [] }
    ],
    market: [
      [
        makeDomainPayload('客户细分', '高端用户', '面向高端中产家庭'),
        makeDomainPayload('渠道通路', '直营渠道', '直营门店与线上预约'),
        makeDomainPayload('客户关系', '高端服务', '提供专属顾问服务')
      ],
      [
        makeDomainPayload('客户细分', '高端用户', '面向高端中产家庭，坚持高端定位'),
        makeDomainPayload('渠道通路', '直营渠道', '保持高端直营体验'),
        makeDomainPayload('客户关系', '高端服务', '强化会员与专属交付服务')
      ]
    ],
    product: [[
      makeDomainPayload('价值主张', '智能体验', '提供智能驾驶与高品质体验'),
      makeDomainPayload('核心资源', '研发团队', '依赖算法与整车研发团队'),
      makeDomainPayload('关键业务', '持续迭代', '通过 OTA 和产品迭代维持优势'),
      makeDomainPayload('重要合作', '电池伙伴', '与电池和渠道伙伴建立战略合作')
    ]],
    finance: [
      [
        makeDomainPayload('收入来源', '低价走量', '通过低价策略快速铺量'),
        makeDomainPayload('成本结构', '研发制造', '研发和制造是主要成本')
      ],
      [
        makeDomainPayload('收入来源', '高端定价', '采用高端定价并叠加软件订阅'),
        makeDomainPayload('成本结构', '研发制造', '研发、制造和服务体系是主要成本')
      ]
    ],
    guidance: ['请调整市场定位与收入模型，避免高端定位和低价策略冲突。']
  }))

  const result = await executeConversation(service, {
    workspaceId: 'workspace-revision',
    userId: 'tester',
    question: '帮我生成一个新能源汽车商业模式画布，并自动修正冲突',
    traceId: 'conv-revision'
  })

  const bmcCards = result.finalGraph.nodes.filter((node) => readMacraType(node) === 'cc-bmc-card')
  assert.equal(bmcCards.length, 9)
  assert.equal(new Set(bmcCards.map((node) => node.id)).size, 9)
  assert.equal(result.finalGraph.nodes.filter((node) => readMacraType(node) === 'conflict-alert').length, 0)

  const marketNode = result.finalGraph.nodes.find((node) => node.id === 'market-customer-segments')
  const financeNode = result.finalGraph.nodes.find((node) => node.id === 'finance-revenue-streams')
  assert.ok(marketNode)
  assert.ok(financeNode)
  assert.match(readNodeContent(marketNode), /坚持高端定位/)
  assert.match(readNodeContent(financeNode), /高端定价/)
  assert.deepEqual(result.statuses, ['completed'])
})

async function executeConversation(
  service: BusinessLangGraphService,
  context: {
    workspaceId: string
    userId: string
    question: string
    traceId: string
    baseGraph?: CanvasGraph
  }
) {
  const stream = service.streamConversation(context)
  const init = await stream.next()
  assert.equal(init.done, false)
  assert.equal(init.value.type, 'init')

  let graph = init.value.graph
  const statuses: string[] = []
  const interrupts: Array<{ decision: string }> = []

  for await (const update of stream) {
    if (update.type === 'delta') {
      graph = applyGraphDelta(graph, update.delta)
      continue
    }
    if (update.type === 'status') {
      statuses.push(update.status)
      continue
    }
    if (update.type === 'interrupt') {
      interrupts.push({ decision: update.decision })
    }
  }

  return {
    initialGraph: init.value.graph,
    finalGraph: graph,
    statuses,
    interrupts
  }
}

function createWorkspaceGraph(workspaceId: string, nodes: CanvasNode[]): CanvasGraph {
  return {
    workspaceId,
    nodes,
    edges: []
  }
}

function createMacraCanvasNode(
  input: {
    id: string
    label: string
    content: string
    domain?: string
    type?: string
    agentSignature?: string
    stage?: SeminarPhase
  },
  y: number
): CanvasNode {
  return {
    id: input.id,
    type: 'note',
    position: { x: 160, y },
    data: {
      type: 'note',
      title: input.label,
      content: input.content,
      variant: 'insight',
      meta: {
        macraType: input.type ?? 'cc-bmc-card',
        domain: input.domain,
        metadata: {
          agent_signature: input.agentSignature,
          stage: input.stage ?? 'execution',
          confidence: 'high'
        }
      }
    }
  }
}

function makeDomainPayload(domain: string, label: string, content: string) {
  return {
    id: `${domain}-${label}`,
    type: 'cc-bmc-card',
    domain,
    label,
    content,
    metadata: {
      confidence: 'high',
      source: 'test-fixture',
      tags: ['fixture']
    }
  }
}

function readMacraType(node: CanvasNode) {
  const data = node.data as { meta?: { macraType?: string } } | undefined
  return data?.meta?.macraType ?? null
}

function readNodeDomain(node: CanvasNode) {
  const data = node.data as { meta?: { domain?: string } } | undefined
  return data?.meta?.domain ?? null
}

function readNodeContent(node: CanvasNode) {
  const data = node.data as { content?: string } | undefined
  return data?.content ?? ''
}

function readNodeLabel(node: CanvasNode) {
  // Canvas nodes carry the human label in `title` (set by addMacraNode /
  // addInsightNode in the canvas builder), not `label`.
  const data = node.data as { title?: string; label?: string } | undefined
  return data?.title ?? data?.label ?? ''
}

function stringifyMessage(content: unknown) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
          return item.text
        }
        return ''
      })
      .join('')
  }
  return ''
}

function shiftOrThrow<T>(items: T[], label: string): T {
  const value = items.shift()
  if (value === undefined) {
    throw new Error(`Missing fake response for ${label}`)
  }
  return value
}

function shiftOrDefault<T>(items: T[] | undefined, fallback: T): T {
  if (!items || items.length === 0) return fallback
  return shiftOrThrow(items, 'default')
}
