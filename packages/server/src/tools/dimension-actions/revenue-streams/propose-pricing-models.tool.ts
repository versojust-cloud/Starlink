/**
 * Phase 3.4 · REVENUE_STREAMS · propose_pricing_models (real LLM impl).
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage
} from '@starlink/shared'
import { LLMClient } from '../../../services/llm-client.js'

interface PricingModel {
  type: string
  rationale: string
  unit_price_range: string
  fit_score: number
}

export default class ProposePricingModelsTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: { name: 'revenue-streams.propose_pricing_models', provider: 'builtin', version: '1.0.0' },
    display: {
      label: '定价模型提案',
      description: '基于 VP + 客群生成 3-5 候选定价模型，含适配性评分',
      icon: '💰',
      category: 'analysis',
      color: '#3b82f6'
    },
    inputSchema: {
      type: 'object',
      properties: {
        vp: { type: 'string', description: '产品 Value Proposition' },
        segment: { type: 'string', description: '目标客群' },
        cost_profile: { type: 'string', description: '成本画像' },
        constraints: { type: 'array', description: '约束（如 PLG-first）' }
      },
      required: ['vp', 'segment']
    },
    outputSchema: { type: 'object', properties: { models: { type: 'array' } } },
    inputPorts: [
      { name: 'vp', type: 'string', description: 'VP', required: true },
      { name: 'segment', type: 'string', description: '客群', required: true },
      { name: 'cost_profile', type: 'string', description: '成本', required: false },
      { name: 'constraints', type: 'array', description: '约束', required: false }
    ],
    outputPorts: [{ name: 'models', type: 'array', description: '定价模型候选' }],
    runtime: { timeout: 30000, retries: 1, cacheable: true, streamable: false, parallel: true }
  }

  async *execute(input: Record<string, unknown>, _ctx: ToolContext): AsyncGenerator<ToolMessage> {
    const vp = (input.vp as string) ?? ''
    const segment = (input.segment as string) ?? ''
    const costProfile = (input.cost_profile as string) ?? ''
    const constraints = (input.constraints as string[]) ?? []

    if (!vp || !segment) { yield { type: 'json', data: { models: [] } }; return }
    yield { type: 'progress', percent: 10, message: '生成定价候选...' }

    const prompt =
      `你是定价策略顾问。给出 3-5 候选定价模型：\n` +
      `## VP\n${vp}\n## 客群\n${segment}\n` +
      (costProfile ? `## 成本\n${costProfile}\n` : '') +
      (constraints.length ? `## 约束\n${constraints.map((c) => `- ${c}`).join('\n')}\n` : '') +
      `\n候选 type 在 subscription-per-seat / usage-based / tiered / transactional / licensing-* / freemium / ad-supported / hybrid 之间。\n` +
      `输出纯 JSON：{ "models": [{ "type", "rationale", "unit_price_range", "fit_score(0-1)" }] }\n` +
      `规则：fit_score 严格评估，至少 1 个 ≤ 0.6 做对照。`

    try {
      const client = new LLMClient()
      const response = await client.chat({
        messages: [{ role: 'system', content: prompt }, { role: 'user', content: '请输出 3-5 候选 JSON。' }]
      })
      const content = response.content ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      const jsonText = match ? match[0] : '{"models":[]}'
      let parsed: { models?: PricingModel[] }
      try { parsed = JSON.parse(jsonText) as { models?: PricingModel[] } } catch (err) {
        yield { type: 'error', error: `JSON parse failed: ${(err as Error).message}`, retryable: true }
        return
      }
      const normalised = (parsed.models ?? []).filter((m) => m && m.type).map((m) => ({
        ...m,
        fit_score: typeof m.fit_score === 'number' ? Math.max(0, Math.min(1, m.fit_score)) : 0.5
      }))
      yield { type: 'json', data: { models: normalised } }
    } catch (err) {
      yield { type: 'error', error: `propose_pricing_models failed: ${(err as Error).message}`, retryable: true }
    }
  }
}
