/**
 * Phase 3.4 Tier 2 · REVENUE_STREAMS · simulate_revenue (HYBRID — LLM
 * assumes parameters, deterministic post-processor rolls up P&L).
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage
} from '@starlink/shared'
import { LLMClient } from '../../../services/llm-client.js'

interface PnLRow {
  year: number
  new_customers: number
  retained_customers: number
  total_active: number
  recurring_revenue: number
  one_time_revenue: number
  total_revenue: number
}

interface LlmAssumptions {
  annual_new_customer_growth_rate: number
  annual_retention_rate: number
  expansion_revenue_multiplier: number
  one_time_per_customer: number
  recurring_per_customer_per_year: number
  horizon_years: number
  reasoning: string
}

export default class SimulateRevenueTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: { name: 'revenue-streams.simulate_revenue', provider: 'builtin', version: '1.0.0' },
    display: {
      label: '收入仿真',
      description: 'LLM 推理假设 + 确定性 P&L 算术，仿真 1/3/5 年收入轨迹',
      icon: '📈',
      category: 'analysis',
      color: '#3b82f6'
    },
    inputSchema: {
      type: 'object',
      properties: {
        pricing_model: { type: 'object', description: '定价模型对象' },
        customer_volume: { type: 'number', description: '起始客户量' },
        horizon_years: { type: 'number', description: '仿真年限', default: 3 },
        market_context: { type: 'string', description: '市场上下文' }
      },
      required: ['pricing_model', 'customer_volume']
    },
    outputSchema: {
      type: 'object',
      properties: { pnl: { type: 'array' }, assumptions: { type: 'object' } }
    },
    inputPorts: [
      { name: 'pricing_model', type: 'object', description: '模型', required: true },
      { name: 'customer_volume', type: 'number', description: '起始量', required: true },
      { name: 'horizon_years', type: 'number', description: '年限', default: 3 },
      { name: 'market_context', type: 'string', description: '市场', required: false }
    ],
    outputPorts: [
      { name: 'pnl', type: 'array', description: '收入轨迹' },
      { name: 'assumptions', type: 'object', description: '假设' }
    ],
    runtime: { timeout: 30000, retries: 1, cacheable: true, streamable: false, parallel: true }
  }

  async *execute(input: Record<string, unknown>, _ctx: ToolContext): AsyncGenerator<ToolMessage> {
    const pricingModel = input.pricing_model as Record<string, unknown>
    const startVolume = (input.customer_volume as number) ?? 0
    const horizon = Math.max(1, Math.min(10, (input.horizon_years as number) ?? 3))
    const marketCtx = (input.market_context as string) ?? ''

    if (!pricingModel || startVolume <= 0) {
      yield { type: 'json', data: { pnl: [], assumptions: null } }
      return
    }
    yield { type: 'progress', percent: 10, message: 'LLM 推理参数...' }

    const prompt =
      `你是收入仿真分析师。根据定价模型 + 起始客户量 + 市场上下文，推理 ${horizon} 年仿真所需关键参数。\n\n` +
      `## 定价模型\n${JSON.stringify(pricingModel, null, 2)}\n## 起始量\n${startVolume}\n` +
      (marketCtx ? `## 市场\n${marketCtx}\n` : '') +
      `\n输出纯 JSON：{ "annual_new_customer_growth_rate": 0.3, "annual_retention_rate": 0.85,` +
      ` "expansion_revenue_multiplier": 1.12, "one_time_per_customer": 0,` +
      ` "recurring_per_customer_per_year": 1200, "horizon_years": ${horizon}, "reasoning": "..." }\n` +
      `规则：数值必须合理，不要 retention 99%+growth 300% 这种童话。`

    try {
      const client = new LLMClient()
      const response = await client.chat({
        messages: [{ role: 'system', content: prompt }, { role: 'user', content: '请输出 JSON 假设。' }]
      })
      const content = response.content ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      const jsonText = match ? match[0] : '{}'
      let assumptions: LlmAssumptions
      try { assumptions = JSON.parse(jsonText) as LlmAssumptions } catch (err) {
        yield { type: 'error', error: `JSON parse failed: ${(err as Error).message}`, retryable: true }
        return
      }
      const pnl: PnLRow[] = []
      let retainedBase = startVolume
      let newLastYear = startVolume
      for (let y = 1; y <= horizon; y++) {
        const newCustomers = y === 1 ? 0 : Math.round(newLastYear * assumptions.annual_new_customer_growth_rate)
        const retained = Math.round(retainedBase * assumptions.annual_retention_rate)
        const totalActive = retained + newCustomers
        const recurring =
          retained * assumptions.recurring_per_customer_per_year * assumptions.expansion_revenue_multiplier +
          newCustomers * assumptions.recurring_per_customer_per_year
        const oneTime = newCustomers * assumptions.one_time_per_customer
        pnl.push({
          year: y,
          new_customers: newCustomers,
          retained_customers: retained,
          total_active: totalActive,
          recurring_revenue: Math.round(recurring),
          one_time_revenue: Math.round(oneTime),
          total_revenue: Math.round(recurring + oneTime)
        })
        retainedBase = totalActive
        newLastYear = y === 1 ? startVolume : newCustomers
      }
      yield { type: 'json', data: { pnl, assumptions } }
    } catch (err) {
      yield { type: 'error', error: `simulate_revenue failed: ${(err as Error).message}`, retryable: true }
    }
  }
}
