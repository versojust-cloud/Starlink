/**
 * COST_STRUCTURE · breakdown_cost_categories (T1.C Tier B).
 *
 * Decomposes a business model into ranked cost line items split by
 * fixed vs variable, with rough share-of-revenue bands. LLM-driven —
 * replaces the deleted stub that fabricated cost numbers without
 * basis.
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage
} from '@starlink/shared'
import { LLMClient } from '../../../services/llm-client.js'

export default class BreakdownCostCategoriesTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: { name: 'cost-structure.breakdown_cost_categories', provider: 'builtin', version: '1.0.0' },
    display: {
      label: '成本结构拆解',
      description: '把商业模式拆成 fixed / variable / one-time 成本项，估算 share-of-revenue 区间',
      icon: '💰',
      category: 'analysis',
      color: '#f59e0b'
    },
    inputSchema: {
      type: 'object',
      properties: {
        business_summary: { type: 'string', description: '商业模式概述（含产品 + 渠道 + 客群）' },
        revenue_model: { type: 'string', description: 'subscription / transaction / one-time / hybrid' },
        scale_band: { type: 'string', description: 'pre-revenue | early | mid | scaled', default: 'early' }
      },
      required: ['business_summary', 'revenue_model']
    },
    outputSchema: {
      type: 'object',
      properties: { cost_items: { type: 'array', description: 'CostItem[] with type + share_band' } }
    },
    inputPorts: [
      { name: 'business_summary', type: 'string', description: '商业概述', required: true },
      { name: 'revenue_model', type: 'string', description: '收入模式', required: true },
      { name: 'scale_band', type: 'string', description: '规模档位', default: 'early' }
    ],
    outputPorts: [{ name: 'cost_items', type: 'array', description: '成本明细' }],
    runtime: { timeout: 30000, retries: 1, cacheable: true, streamable: false, parallel: true }
  }

  async *execute(input: Record<string, unknown>, _ctx: ToolContext): AsyncGenerator<ToolMessage> {
    const summary = (input.business_summary as string) ?? ''
    const revenue = (input.revenue_model as string) ?? ''
    const scale = (input.scale_band as string) ?? 'early'

    if (!summary || !revenue) {
      yield { type: 'error', error: 'business_summary and revenue_model are required', retryable: false }
      return
    }

    yield { type: 'progress', percent: 10, message: '拆解成本结构...' }

    const prompt =
      `你是单位经济学专家。给定商业模式 + 收入模式 + 当前规模档位，列出 4-7 个最重要的成本项，` +
      `每项标注 fixed / variable / one-time，并给出 share-of-revenue 区间（band：dominant >40% / ` +
      `large 20-40% / mid 5-20% / small <5%）。**不准编造具体百分比数字**——用 band 表达。\n\n` +
      `商业概述：${summary}\n收入模式：${revenue}\n规模档位：${scale}\n\n` +
      `输出纯 JSON：{ "cost_items": [{ "name": "项名", "type": "fixed|variable|one-time", ` +
      `"share_band": "dominant|large|mid|small", "rationale": "≤30字为何这条最关键" }] }`

    try {
      const client = new LLMClient()
      const response = await client.chat({
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: '请拆解成本项。' }
        ]
      })
      const content = response.content ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      const json = match ? match[0] : '{"cost_items":[]}'
      try {
        const parsed = JSON.parse(json) as { cost_items?: unknown[] }
        yield { type: 'json', data: { cost_items: parsed.cost_items ?? [] } }
      } catch {
        yield { type: 'error', error: 'JSON parse failed', retryable: true }
      }
    } catch (err) {
      yield {
        type: 'error',
        error: `breakdown_cost_categories failed: ${(err as Error).message}`,
        retryable: true
      }
    }
  }
}
