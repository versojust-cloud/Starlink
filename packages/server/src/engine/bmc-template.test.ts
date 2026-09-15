import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BaseTool,
  type ToolContext,
  type ToolDefinition,
  type ToolMessage
} from '@starlink/shared'
import { ToolRegistry } from '../tool-registry/registry.js'
import AggregatorTool from '../tools/control-flow/aggregator.tool.js'
import BmcRendererTool from '../tools/output/bmc-renderer.tool.js'
import { BmcFlowAdapter, BmcFlowExecutionError } from './bmc-flow-adapter.js'

test('BMC_TEMPLATE executes through GraphExecutor and renders nine canvas cards', async () => {
  const result = await new BmcFlowAdapter(createCompleteRegistry()).execute({
    workspaceId: 'workspace-bmc-flow',
    userId: 'tester',
    executionId: 'exec-bmc-flow',
    question: '生成一个 AI 学习助手的商业模式'
  })

  assert.ok(result.events.some((event) => event.type === 'node_complete' && event.nodeId === 'input-1'))
  assert.equal(readAggregatedCards(result.finalState['agg-1']).length, 9)

  const domains = result.graph.nodes
    .map((node) => node.data)
    .filter((data): data is Extract<typeof data, { type: 'note' }> => data.type === 'note')
    .map((data) => data.meta)
    .map((meta) => (meta as { domain?: string } | undefined)?.domain)
    .filter((domain): domain is string => Boolean(domain))

  assert.equal(domains.length, 9)
  assert.equal(new Set(domains).size, 9)
  assert.ok(domains.includes('重要合作'))
  assert.equal(result.graph.nodes.length, 12)
  assert.equal(result.graph.edges.length, 9)
})

test('BmcFlowAdapter reports node errors with node id context', async () => {
  const brokenRegistry = new ToolRegistry()
  brokenRegistry.register(new StaticBmcAgentTool('market_agent', [card('客户细分')]))
  brokenRegistry.register(new AggregatorTool())
  brokenRegistry.register(new BmcRendererTool())

  await assert.rejects(
    () => new BmcFlowAdapter(brokenRegistry).execute({
      workspaceId: 'workspace-bmc-flow',
      userId: 'tester',
      executionId: 'exec-bmc-flow',
      question: '生成一个 AI 学习助手的商业模式'
    }),
    (error: unknown) => {
      assert.ok(error instanceof BmcFlowExecutionError)
      assert.ok(error.message.includes('product-1'))
      assert.ok(error.message.includes('finance-1'))
      return true
    }
  )
})

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

function card(domain: string) {
  return {
    domain,
    content: `${domain} 的测试分析`,
    confidence: 0.8
  }
}

function readAggregatedCards(output: unknown) {
  const payload = output as { result?: unknown }
  assert.ok(Array.isArray(payload.result))
  return payload.result
}
