/**
 * CHANNELS · propose_acquisition_channels (T1.C Tier B follow-up).
 *
 * Real LLM tool — replaces the stub that was deleted in T1.C cleanup
 * (it returned canned channel lists which misled the BMC card LLM
 * into citing fake "tool data"). Now anchored on the persona +
 * product class that the caller passes in.
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage
} from '@starlink/shared'
import { LLMClient } from '../../../services/llm-client.js'

export default class ProposeAcquisitionChannelsTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: { name: 'channels.propose_acquisition_channels', provider: 'builtin', version: '1.0.0' },
    display: {
      label: '获客渠道建议',
      description: '基于目标客群 + 产品类型，提出可行的获客渠道组合及优先级',
      icon: '📡',
      category: 'analysis',
      color: '#f59e0b'
    },
    inputSchema: {
      type: 'object',
      properties: {
        persona: { type: 'string', description: '目标客户描述（一段文字）' },
        product_class: { type: 'string', description: 'B2B / B2C / B2B2C / Marketplace 等' },
        budget_band: { type: 'string', description: 'lean | seed | series-a-plus', default: 'lean' }
      },
      required: ['persona', 'product_class']
    },
    outputSchema: {
      type: 'object',
      properties: { channels: { type: 'array', description: 'Channel[] with priority + rationale' } }
    },
    inputPorts: [
      { name: 'persona', type: 'string', description: '目标客户', required: true },
      { name: 'product_class', type: 'string', description: 'B2B/B2C/...', required: true },
      { name: 'budget_band', type: 'string', description: '预算档位', default: 'lean' }
    ],
    outputPorts: [{ name: 'channels', type: 'array', description: '渠道列表' }],
    runtime: { timeout: 30000, retries: 1, cacheable: true, streamable: false, parallel: true }
  }

  async *execute(input: Record<string, unknown>, _ctx: ToolContext): AsyncGenerator<ToolMessage> {
    const persona = (input.persona as string) ?? ''
    const productClass = (input.product_class as string) ?? ''
    const budgetBand = (input.budget_band as string) ?? 'lean'

    if (!persona || !productClass) {
      yield { type: 'error', error: 'persona and product_class are required', retryable: false }
      return
    }

    yield { type: 'progress', percent: 10, message: '生成获客渠道方案...' }

    const prompt =
      `你是获客渠道策略专家。基于以下输入，给出 3-5 个**优先级排序**的渠道方案。\n` +
      `目标客户：${persona}\n产品类型：${productClass}\n预算档位：${budgetBand}\n\n` +
      `输出纯 JSON：{ "channels": [{ "name": "渠道名", "rationale": "为什么对该客群有效（≤30字）",` +
      ` "priority": "primary|secondary|experimental", "ballpark_cac": "约 CAC（带单位或 'unknown'）" }] }`

    try {
      const client = new LLMClient()
      const response = await client.chat({
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `请基于"${persona}"提出可行的获客渠道。` }
        ]
      })
      const content = response.content ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      const json = match ? match[0] : '{"channels":[]}'
      try {
        const parsed = JSON.parse(json) as { channels?: unknown[] }
        yield { type: 'json', data: { channels: parsed.channels ?? [] } }
      } catch {
        yield { type: 'error', error: 'JSON parse failed', retryable: true }
      }
    } catch (err) {
      yield {
        type: 'error',
        error: `propose_acquisition_channels failed: ${(err as Error).message}`,
        retryable: true
      }
    }
  }
}
