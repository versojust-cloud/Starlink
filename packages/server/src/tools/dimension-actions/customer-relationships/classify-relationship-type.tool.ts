/**
 * CUSTOMER_RELATIONSHIPS · classify_relationship_type (T1.C Tier B).
 *
 * Categorizes the right relationship model for a given product / persona
 * combination across the standard BMC relationship taxonomy. LLM-driven
 * — replaces the deleted stub that returned canned categories.
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage
} from '@starlink/shared'
import { LLMClient } from '../../../services/llm-client.js'

export default class ClassifyRelationshipTypeTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: { name: 'customer-relationships.classify_relationship_type', provider: 'builtin', version: '1.0.0' },
    display: {
      label: '客户关系分类',
      description: '为给定产品 + 客群推荐合适的客户关系模型（自助 / 个人 / 社区 / 专属客户经理 / 自动化）',
      icon: '🤝',
      category: 'analysis',
      color: '#f59e0b'
    },
    inputSchema: {
      type: 'object',
      properties: {
        persona: { type: 'string', description: '目标客户描述' },
        product_summary: { type: 'string', description: '产品简短描述' },
        unit_economics: { type: 'string', description: 'high-LTV / mid / low-LTV', default: 'mid' }
      },
      required: ['persona', 'product_summary']
    },
    outputSchema: {
      type: 'object',
      properties: { relationships: { type: 'array', description: 'RelationshipType[] with weight' } }
    },
    inputPorts: [
      { name: 'persona', type: 'string', description: '目标客户', required: true },
      { name: 'product_summary', type: 'string', description: '产品概述', required: true },
      { name: 'unit_economics', type: 'string', description: 'LTV 档位', default: 'mid' }
    ],
    outputPorts: [{ name: 'relationships', type: 'array', description: '关系模型列表' }],
    runtime: { timeout: 30000, retries: 1, cacheable: true, streamable: false, parallel: true }
  }

  async *execute(input: Record<string, unknown>, _ctx: ToolContext): AsyncGenerator<ToolMessage> {
    const persona = (input.persona as string) ?? ''
    const product = (input.product_summary as string) ?? ''
    const ltv = (input.unit_economics as string) ?? 'mid'

    if (!persona || !product) {
      yield { type: 'error', error: 'persona and product_summary are required', retryable: false }
      return
    }

    yield { type: 'progress', percent: 10, message: '分类客户关系模型...' }

    const prompt =
      `你是客户关系策略专家。从 BMC 标准类型（self-service / personal-assistance / dedicated / ` +
      `automated-services / community / co-creation）中**加权选择 1-3 个**最适合的，并说明理由。\n\n` +
      `目标客户：${persona}\n产品：${product}\nLTV 档位：${ltv}\n\n` +
      `输出纯 JSON：{ "relationships": [{ "kind": "类型枚举", "weight": 0.0-1.0, "rationale": "≤30字" }] }`

    try {
      const client = new LLMClient()
      const response = await client.chat({
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `请分类合适的客户关系模型。` }
        ]
      })
      const content = response.content ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      const json = match ? match[0] : '{"relationships":[]}'
      try {
        const parsed = JSON.parse(json) as { relationships?: unknown[] }
        yield { type: 'json', data: { relationships: parsed.relationships ?? [] } }
      } catch {
        yield { type: 'error', error: 'JSON parse failed', retryable: true }
      }
    } catch (err) {
      yield {
        type: 'error',
        error: `classify_relationship_type failed: ${(err as Error).message}`,
        retryable: true
      }
    }
  }
}
