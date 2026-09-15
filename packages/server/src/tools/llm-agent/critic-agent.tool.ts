/**
 * Critic Agent Tool — adversarial reviewer that checks logical consistency
 * across all BMC dimensions produced by other agents.
 */

import { BaseTool } from '@starlink/shared'
import type { ToolDefinition, ToolContext, ToolMessage } from '@starlink/shared'
import { LLMClient } from '../../services/llm-client.js'
import { parseLlmJson } from '../shared/llm-json.js'

const SYSTEM_PROMPT =
  '你是 Critic_Agent（审查专家），负责对 CC-BMC 商业模型画布的所有维度进行逻辑一致性审查。' +
  '你将收到来自多个 Agent 生成的 BMC 节点和连接关系，需要以对抗性视角检查：' +
  '1) 各维度之间是否存在逻辑矛盾；2) 是否有未被覆盖的关键假设；3) 置信度是否合理。' +
  '以 JSON 格式输出 { "conflicts": [...] }，每个元素包含 description（冲突描述）、severity（"high"|"medium"|"low"）、' +
  'relatedAgents（相关 Agent 名称数组）、suggestion（改进建议）。'

export default class CriticAgentTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'critic_agent',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: '审查 Agent',
      description: '对所有 BMC 维度进行逻辑一致性审查，发现矛盾与不足',
      icon: '🔍',
      category: 'llm_agent',
      color: '#ef4444',
    },
    inputSchema: {
      type: 'object',
      properties: {
        allNodes: {
          type: 'array',
          description: '所有 BMC 节点数据',
          required: true,
        },
        edges: {
          type: 'array',
          description: '节点之间的连接关系',
        },
      },
      required: ['allNodes'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        conflicts: {
          type: 'array',
          description: '冲突列表，每项含 description, severity, relatedAgents, suggestion',
        },
      },
    },
    inputPorts: [
      { name: 'allNodes', type: 'array', description: '所有 BMC 节点' },
      { name: 'edges', type: 'array', description: '连接关系', required: false },
    ],
    outputPorts: [
      { name: 'conflicts', type: 'array', description: '审查冲突列表' },
    ],
    runtime: {
      timeout: 60000,
      retries: 1,
      cacheable: false,
      streamable: true,
      parallel: true,
    },
  }

  async *execute(
    input: Record<string, unknown>,
    _context: ToolContext,
  ): AsyncGenerator<ToolMessage> {
    const allNodes = input.allNodes as object[]
    const edges = input.edges as object[] | undefined

    let userContent = `以下是当前 BMC 画布的所有节点：\n${JSON.stringify(allNodes, null, 2)}`
    if (edges && edges.length > 0) {
      userContent += `\n\n节点连接关系：\n${JSON.stringify(edges, null, 2)}`
    }
    userContent += '\n\n请审查以上内容的逻辑一致性，找出矛盾和不足之处。'

    const llm = new LLMClient()
    const response = await llm.chat({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    })

    let conflicts: Array<{
      description: string
      severity: string
      relatedAgents: string[]
      suggestion: string
    }>
    try {
      const parsed = parseLlmJson<{
        conflicts?: Array<{
          description: string
          severity: string
          relatedAgents: string[]
          suggestion: string
        }>
      }>(response.content, { conflicts: [] })
      conflicts = parsed.conflicts ?? []
    } catch {
      conflicts = [
        {
          description: response.content ?? '无法解析审查结果',
          severity: 'medium',
          relatedAgents: [],
          suggestion: '请重新生成审查报告',
        },
      ]
    }

    yield { type: 'json', data: { conflicts } }
  }
}
