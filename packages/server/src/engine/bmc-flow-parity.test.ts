import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BaseTool,
  type CanvasGraph,
  type CanvasNode,
  type SeminarPhase,
  type ToolContext,
  type ToolDefinition,
  type ToolMessage
} from '@starlink/shared'
import { applyGraphDelta } from '../application/graph-delta.js'
import { BusinessLangGraphService } from '../services/business-langgraph.js'
import { ToolRegistry } from '../tool-registry/registry.js'
import AggregatorTool from '../tools/control-flow/aggregator.tool.js'
import BmcRendererTool from '../tools/output/bmc-renderer.tool.js'
import { BmcFlowAdapter } from './bmc-flow-adapter.js'
import { compareBmcGraphs } from './bmc-flow-parity.js'

type IntentResult = {
  intent: 'generate_bmc' | 'analyze' | 'detect_conflicts' | 'general'
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

const BMC_DOMAINS = [
  '客户细分',
  '渠道通路',
  '客户关系',
  '价值主张',
  '核心资源',
  '关键业务',
  '重要合作',
  '收入来源',
  '成本结构'
]

test('compareBmcGraphs reports missing BMC domains', () => {
  const source = graphWithDomains('source', BMC_DOMAINS)
  const target = graphWithDomains('target', BMC_DOMAINS.filter((domain) => domain !== '重要合作'))

  const report = compareBmcGraphs(source, target)

  assert.deepEqual(report.missingDomains, ['重要合作'])
  assert.deepEqual(report.extraDomains, [])
  assert.equal(report.nodeCountMismatch, true)
  assert.equal(report.avatarCountMismatch, false)
  assert.equal(report.edgeCountMismatch, false)
  assert.match(report.warnings.join('\n'), /重要合作/)
})

test('BmcFlowAdapter keeps nine-domain parity with current BusinessLangGraphService', async () => {
  const productionGraph = await executeProductionBmc()
  const adapterGraph = (await new BmcFlowAdapter(createCompleteRegistry()).execute({
    workspaceId: 'workspace-parity',
    userId: 'tester',
    executionId: 'exec-bmc-parity',
    question: '帮我生成一个新能源汽车商业模式画布'
  })).graph

  const report = compareBmcGraphs(productionGraph, adapterGraph)

  assert.deepEqual(report.missingDomains, [])
  assert.deepEqual(report.extraDomains, [])
  assert.equal(report.nodeCountMismatch, false)
  assert.equal(report.avatarCountMismatch, false)
  assert.equal(report.edgeCountMismatch, false)
  assert.equal(report.sourceAvatarCount, 3)
  assert.equal(report.targetAvatarCount, 3)
  assert.deepEqual(report.sourceDomains, report.targetDomains)
  assert.deepEqual(report.warnings, [])
})

async function executeProductionBmc() {
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

  const stream = service.streamConversation({
    workspaceId: 'workspace-parity',
    userId: 'tester',
    question: '帮我生成一个新能源汽车商业模式画布',
    traceId: 'conv-parity'
  })
  const init = await stream.next()
  assert.equal(init.done, false)
  assert.equal(init.value.type, 'init')

  let graph = init.value.graph
  for await (const update of stream) {
    if (update.type === 'delta') {
      graph = applyGraphDelta(graph, update.delta)
    }
  }

  return graph
}

function createCompleteRegistry() {
  const registry = new ToolRegistry()
  registry.register(new StaticBmcAgentTool('market_agent', [
    card('客户细分'),
    card('渠道通路'),
    card('客户关系')
  ]))
  registry.register(new StaticBmcAgentTool('product_agent', [
    card('价值主张'),
    card('核心资源'),
    card('关键业务'),
    card('重要合作')
  ]))
  registry.register(new StaticBmcAgentTool('finance_agent', [
    card('收入来源'),
    card('成本结构')
  ]))
  registry.register(new StaticCriticTool())
  registry.register(new AggregatorTool())
  registry.register(new BmcRendererTool())
  return registry
}

class FakeBusinessModel {
  constructor(
    private readonly responses: {
      intents: IntentResult[]
      conflicts: ConflictResult[]
      market: unknown[][]
      product: unknown[][]
      finance: unknown[][]
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

class StaticBmcAgentTool extends BaseTool {
  readonly definition: ToolDefinition

  constructor(name: string, private readonly cards: Array<{ domain: string; content: string; confidence: number }>) {
    super()
    this.definition = {
      identity: { name, provider: 'builtin', version: 'test' },
      display: {
        label: name,
        description: name,
        icon: 'T',
        category: 'llm_agent',
        color: '#000'
      },
      inputSchema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'question', required: true }
        },
        required: ['question']
      },
      outputSchema: {
        type: 'object',
        properties: {
          bmcCards: { type: 'array', description: 'cards' }
        }
      },
      inputPorts: [
        { name: 'question', type: 'string', description: 'question' }
      ],
      outputPorts: [
        { name: 'bmcCards', type: 'array', description: 'cards' }
      ],
      runtime: {
        timeout: 1000,
        retries: 0,
        cacheable: false,
        streamable: false,
        parallel: true
      }
    }
  }

  async *execute(
    _input: Record<string, unknown>,
    _context: ToolContext
  ): AsyncGenerator<ToolMessage> {
    yield { type: 'json', data: { bmcCards: this.cards } }
  }
}

class StaticCriticTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: { name: 'critic_agent', provider: 'builtin', version: 'test' },
    display: {
      label: 'critic',
      description: 'critic',
      icon: 'T',
      category: 'llm_agent',
      color: '#000'
    },
    inputSchema: {
      type: 'object',
      properties: {
        allNodes: { type: 'array', description: 'nodes', required: true }
      },
      required: ['allNodes']
    },
    outputSchema: {
      type: 'object',
      properties: {
        conflicts: { type: 'array', description: 'conflicts' }
      }
    },
    inputPorts: [
      { name: 'allNodes', type: 'array', description: 'nodes' }
    ],
    outputPorts: [
      { name: 'conflicts', type: 'array', description: 'conflicts' }
    ],
    runtime: {
      timeout: 1000,
      retries: 0,
      cacheable: false,
      streamable: false,
      parallel: true
    }
  }

  async *execute(
    _input: Record<string, unknown>,
    _context: ToolContext
  ): AsyncGenerator<ToolMessage> {
    yield { type: 'json', data: { conflicts: [] } }
  }
}

function graphWithDomains(workspaceId: string, domains: string[]): CanvasGraph {
  return {
    workspaceId,
    nodes: domains.map((domain, index) => createMacraCanvasNode({
      id: `node-${index}`,
      label: domain,
      content: `${domain} 内容`,
      domain
    }, index * 160)),
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

function card(domain: string) {
  return {
    domain,
    content: `${domain} 的测试分析`,
    confidence: 0.8
  }
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
