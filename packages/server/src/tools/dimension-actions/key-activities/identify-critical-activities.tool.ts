/**
 * KEY_ACTIVITIES · identify_critical_activities (T1.C Tier B).
 *
 * Lists the activities essential to value delivery, with criticality +
 * uniqueness scoring. LLM-driven — replaces the deleted stub.
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage
} from '@starlink/shared'
import { LLMClient } from '../../../services/llm-client.js'

export default class IdentifyCriticalActivitiesTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: { name: 'key-activities.identify_critical_activities', provider: 'builtin', version: '1.0.0' },
    display: {
      label: '关键活动识别',
      description: '识别为客户创造价值必不可少的核心活动，按 criticality + uniqueness 评分',
      icon: '⚙️',
      category: 'analysis',
      color: '#f59e0b'
    },
    inputSchema: {
      type: 'object',
      properties: {
        product_summary: { type: 'string', description: '产品 / 服务概述' },
        value_proposition: { type: 'string', description: '价值主张（一句话）' },
        operating_model: { type: 'string', description: 'in-house / outsourced / hybrid', default: 'hybrid' }
      },
      required: ['product_summary', 'value_proposition']
    },
    outputSchema: {
      type: 'object',
      properties: { activities: { type: 'array', description: 'Activity[] with criticality + uniqueness' } }
    },
    inputPorts: [
      { name: 'product_summary', type: 'string', description: '产品概述', required: true },
      { name: 'value_proposition', type: 'string', description: '价值主张', required: true },
      { name: 'operating_model', type: 'string', description: '运营模式', default: 'hybrid' }
    ],
    outputPorts: [{ name: 'activities', type: 'array', description: '关键活动列表' }],
    runtime: { timeout: 30000, retries: 1, cacheable: true, streamable: false, parallel: true }
  }

  async *execute(input: Record<string, unknown>, _ctx: ToolContext): AsyncGenerator<ToolMessage> {
    const product = (input.product_summary as string) ?? ''
    const valueProp = (input.value_proposition as string) ?? ''
    const ops = (input.operating_model as string) ?? 'hybrid'

    if (!product || !valueProp) {
      yield { type: 'error', error: 'product_summary and value_proposition are required', retryable: false }
      return
    }

    yield { type: 'progress', percent: 10, message: '识别关键活动...' }

    const prompt =
      `你是运营战略专家。给定产品 + 价值主张 + 运营模式，列出 3-6 个对**兑现价值主张** ` +
      `必不可少的关键活动。每项给两个评分：criticality（去掉它价值主张是否崩塌） + ` +
      `uniqueness（其他公司能否轻易复制）。两者都用 high/mid/low 三档。\n\n` +
      `产品：${product}\n价值主张：${valueProp}\n运营模式：${ops}\n\n` +
      `输出纯 JSON：{ "activities": [{ "name": "活动名", "criticality": "high|mid|low", ` +
      `"uniqueness": "high|mid|low", "rationale": "≤30字" }] }`

    try {
      const client = new LLMClient()
      const response = await client.chat({
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: '请识别关键活动。' }
        ]
      })
      const content = response.content ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      const json = match ? match[0] : '{"activities":[]}'
      try {
        const parsed = JSON.parse(json) as { activities?: unknown[] }
        yield { type: 'json', data: { activities: parsed.activities ?? [] } }
      } catch {
        yield { type: 'error', error: 'JSON parse failed', retryable: true }
      }
    } catch (err) {
      yield {
        type: 'error',
        error: `identify_critical_activities failed: ${(err as Error).message}`,
        retryable: true
      }
    }
  }
}
