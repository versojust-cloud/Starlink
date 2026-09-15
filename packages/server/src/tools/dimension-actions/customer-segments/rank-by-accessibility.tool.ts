/**
 * Phase 3.4 Tier 2 · CUSTOMER_SEGMENTS · rank_by_accessibility (real LLM).
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage
} from '@starlink/shared'
import { LLMClient } from '../../../services/llm-client.js'

interface RankRow {
  segment: string
  reach_cost_score: number
  decision_simplicity_score: number
  purchase_frequency_score: number
  willingness_to_pay_score: number
  composite: number
  rank: number
  rationale: string
}

interface Weights {
  reach_cost?: number
  decision_simplicity?: number
  purchase_frequency?: number
  willingness_to_pay?: number
}

const DEFAULT_WEIGHTS: Required<Weights> = {
  reach_cost: 0.25,
  decision_simplicity: 0.25,
  purchase_frequency: 0.25,
  willingness_to_pay: 0.25
}

export default class RankByAccessibilityTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: { name: 'customer-segments.rank_by_accessibility', provider: 'builtin', version: '1.0.0' },
    display: {
      label: '客群可及性排序',
      description: '按 4 维度对细分客群评分 + 排序，给出 GTM 优先级',
      icon: '🏁',
      category: 'analysis',
      color: '#f59e0b'
    },
    inputSchema: {
      type: 'object',
      properties: {
        segments: { type: 'array', description: '候选细分客群数组（字符串）' },
        weights: { type: 'object', description: '可选维度权重' },
        product_context: { type: 'string', description: '产品描述' }
      },
      required: ['segments']
    },
    outputSchema: {
      type: 'object',
      properties: {
        ranked: { type: 'array' },
        go_to_market_advice: { type: 'string' }
      }
    },
    inputPorts: [
      { name: 'segments', type: 'array', description: '客群', required: true },
      { name: 'weights', type: 'object', description: '权重', required: false },
      { name: 'product_context', type: 'string', description: '产品', required: false }
    ],
    outputPorts: [
      { name: 'ranked', type: 'array', description: '排序结果' },
      { name: 'go_to_market_advice', type: 'string', description: 'GTM 建议' }
    ],
    runtime: { timeout: 30000, retries: 1, cacheable: true, streamable: false, parallel: true }
  }

  async *execute(input: Record<string, unknown>, _ctx: ToolContext): AsyncGenerator<ToolMessage> {
    const segments = (input.segments as string[]) ?? []
    const productCtx = (input.product_context as string) ?? ''
    const weights = { ...DEFAULT_WEIGHTS, ...((input.weights as Weights) ?? {}) }

    if (segments.length === 0) { yield { type: 'json', data: { ranked: [] } }; return }
    yield { type: 'progress', percent: 10, message: '评分客群可及性...' }

    const prompt =
      `你是 GTM 策略分析师。对以下每个细分客群沿 4 个维度评分（0-1）：\n` +
      `- reach_cost: 触达成本（1=低成本）\n- decision_simplicity: 决策简单度（1=自助）\n` +
      `- purchase_frequency: 购买频率（1=高频复购）\n- willingness_to_pay: 付费意愿\n\n` +
      (productCtx ? `## 产品\n${productCtx}\n\n` : '') +
      `## 候选\n${segments.map((s, i) => `[${i + 1}] ${s}`).join('\n')}\n\n` +
      `输出纯 JSON：{ "segments": [{ "segment", "reach_cost_score", "decision_simplicity_score",` +
      ` "purchase_frequency_score", "willingness_to_pay_score", "rationale" }], "go_to_market_advice" }`

    try {
      const client = new LLMClient()
      const response = await client.chat({
        messages: [{ role: 'system', content: prompt }, { role: 'user', content: `请评分 ${segments.length} 个客群。` }]
      })
      const content = response.content ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      const jsonText = match ? match[0] : '{"segments":[]}'
      let parsed: { segments?: Array<RankRow & { rationale: string }>; go_to_market_advice?: string }
      try { parsed = JSON.parse(jsonText) as typeof parsed } catch (err) {
        yield { type: 'error', error: `JSON parse failed: ${(err as Error).message}`, retryable: true }
        return
      }
      const clamp = (n: number): number => Math.max(0, Math.min(1, n))
      const scored: RankRow[] = (parsed.segments ?? [])
        .filter((s) => s && s.segment)
        .map((s) => {
          const r = clamp(s.reach_cost_score ?? 0.5)
          const d = clamp(s.decision_simplicity_score ?? 0.5)
          const p = clamp(s.purchase_frequency_score ?? 0.5)
          const w = clamp(s.willingness_to_pay_score ?? 0.5)
          const composite =
            r * weights.reach_cost +
            d * weights.decision_simplicity +
            p * weights.purchase_frequency +
            w * weights.willingness_to_pay
          return {
            segment: s.segment,
            reach_cost_score: r,
            decision_simplicity_score: d,
            purchase_frequency_score: p,
            willingness_to_pay_score: w,
            composite,
            rank: 0,
            rationale: s.rationale ?? ''
          }
        })
      scored.sort((a, b) => b.composite - a.composite)
      scored.forEach((row, i) => { row.rank = i + 1 })
      yield {
        type: 'json',
        data: { ranked: scored, go_to_market_advice: parsed.go_to_market_advice ?? '' }
      }
    } catch (err) {
      yield { type: 'error', error: `rank_by_accessibility failed: ${(err as Error).message}`, retryable: true }
    }
  }
}
