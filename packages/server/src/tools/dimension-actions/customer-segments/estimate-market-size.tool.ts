/**
 * Phase 3.4 · CUSTOMER_SEGMENTS · estimate_market_size (real LLM impl).
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage
} from '@starlink/shared'
import { LLMClient } from '../../../services/llm-client.js'

interface SizeScenario {
  label: 'optimistic' | 'base' | 'pessimistic' | string
  tam: number
  sam: number
  som: number
  assumption_chain: string[]
}

interface MarketSizeOutput {
  region: string
  segment: string
  unit: string
  scenarios: SizeScenario[]
  confidence_notes: string
}

export default class EstimateMarketSizeTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: { name: 'customer-segments.estimate_market_size', provider: 'builtin', version: '1.0.0' },
    display: {
      label: '市场规模估计',
      description: '产出 TAM/SAM/SOM 三档（optimistic/base/pessimistic）+ 假设链',
      icon: '📊',
      category: 'analysis',
      color: '#f59e0b'
    },
    inputSchema: {
      type: 'object',
      properties: {
        region: { type: 'string', description: '目标区域' },
        segment: { type: 'string', description: '细分客群描述' },
        unit: { type: 'string', description: '度量单位', default: 'CNY' },
        reference_knowledge: { type: 'array', description: '参考资料片段' }
      },
      required: ['region', 'segment']
    },
    outputSchema: {
      type: 'object',
      properties: {
        scenarios: { type: 'array' },
        confidence_notes: { type: 'string' }
      }
    },
    inputPorts: [
      { name: 'region', type: 'string', description: '区域', required: true },
      { name: 'segment', type: 'string', description: '客群', required: true },
      { name: 'unit', type: 'string', description: '单位', default: 'CNY' },
      { name: 'reference_knowledge', type: 'array', description: '参考', required: false }
    ],
    outputPorts: [
      { name: 'scenarios', type: 'array', description: '三档场景' },
      { name: 'confidence_notes', type: 'string', description: '置信度' }
    ],
    runtime: { timeout: 30000, retries: 1, cacheable: true, streamable: false, parallel: true }
  }

  async *execute(input: Record<string, unknown>, _ctx: ToolContext): AsyncGenerator<ToolMessage> {
    const region = (input.region as string) ?? ''
    const segment = (input.segment as string) ?? ''
    const unit = (input.unit as string) ?? 'CNY'
    const references = (input.reference_knowledge as string[]) ?? []

    if (!region || !segment) {
      yield { type: 'json', data: { region, segment, unit, scenarios: [], confidence_notes: 'missing inputs' } }
      return
    }
    yield { type: 'progress', percent: 10, message: '估算市场规模...' }

    const prompt =
      `你是市场规模估算专家。产出三档（optimistic/base/pessimistic）TAM/SAM/SOM 估计。\n\n` +
      `## 区域\n${region}\n## 细分客群\n${segment}\n## 单位\n${unit}\n` +
      (references.length > 0 ? `## 参考\n${references.slice(0, 6).map((r, i) => `[${i + 1}] ${r}`).join('\n')}\n` : '') +
      `\n输出纯 JSON：{ "region", "segment", "unit", "scenarios": [{ "label", "tam", "sam", "som", "assumption_chain": [...] }], "confidence_notes" }`

    try {
      const client = new LLMClient()
      const response = await client.chat({
        messages: [{ role: 'system', content: prompt }, { role: 'user', content: '请输出三档场景。' }]
      })
      const content = response.content ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      const json = match ? match[0] : '{"scenarios":[]}'
      let parsed: MarketSizeOutput
      try {
        parsed = JSON.parse(json) as MarketSizeOutput
      } catch (err) {
        yield { type: 'error', error: `JSON parse failed: ${(err as Error).message}`, retryable: true }
        return
      }
      const scenarios = (parsed.scenarios ?? []).filter(
        (s) => s && typeof s.tam === 'number' && typeof s.sam === 'number' && typeof s.som === 'number'
      )
      const violations: string[] = []
      for (const s of scenarios) {
        if (s.sam > s.tam) violations.push(`${s.label}: SAM > TAM`)
        if (s.som > s.sam) violations.push(`${s.label}: SOM > SAM`)
      }
      yield {
        type: 'json',
        data: {
          region, segment, unit, scenarios,
          confidence_notes: (parsed.confidence_notes ?? '') +
            (violations.length > 0 ? `\n[invariant-violation] ${violations.join('; ')}` : '')
        }
      }
    } catch (err) {
      yield { type: 'error', error: `estimate_market_size failed: ${(err as Error).message}`, retryable: true }
    }
  }
}
