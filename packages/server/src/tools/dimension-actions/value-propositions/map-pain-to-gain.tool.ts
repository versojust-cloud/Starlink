/**
 * Phase 3.4 Tier 2 · VALUE_PROPOSITIONS · map_pain_to_gain (real LLM).
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage
} from '@starlink/shared'
import { LLMClient } from '../../../services/llm-client.js'

interface Mapping {
  pain: string
  pain_reliever: string
  gain_creator: string
  priority: 'high' | 'medium' | 'low'
  priority_rationale?: string
}

export default class MapPainToGainTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: { name: 'value-propositions.map_pain_to_gain', provider: 'builtin', version: '1.0.0' },
    display: {
      label: 'Pain→Gain 映射',
      description: '对客户痛点列表生成 Gain Creator + Pain Reliever（VPC 框架）',
      icon: '🔀',
      category: 'analysis',
      color: '#10b981'
    },
    inputSchema: {
      type: 'object',
      properties: {
        pain_points: { type: 'array', description: '客户痛点字符串数组' },
        product_context: { type: 'string', description: '产品/服务描述' },
        segment_hint: { type: 'string', description: '目标客群（可选）' }
      },
      required: ['pain_points', 'product_context']
    },
    outputSchema: { type: 'object', properties: { mappings: { type: 'array' }, notes: { type: 'string' } } },
    inputPorts: [
      { name: 'pain_points', type: 'array', description: '痛点', required: true },
      { name: 'product_context', type: 'string', description: '产品', required: true },
      { name: 'segment_hint', type: 'string', description: '客群', required: false }
    ],
    outputPorts: [
      { name: 'mappings', type: 'array', description: 'Pain→Gain 映射' },
      { name: 'notes', type: 'string', description: '观察' }
    ],
    runtime: { timeout: 30000, retries: 1, cacheable: true, streamable: false, parallel: true }
  }

  async *execute(input: Record<string, unknown>, _ctx: ToolContext): AsyncGenerator<ToolMessage> {
    const pains = (input.pain_points as string[]) ?? []
    const productCtx = (input.product_context as string) ?? ''
    const segmentHint = (input.segment_hint as string) ?? ''

    if (pains.length === 0 || !productCtx) { yield { type: 'json', data: { mappings: [] } }; return }
    yield { type: 'progress', percent: 10, message: 'Pain→Gain 映射中...' }

    const prompt =
      `你是产品策略顾问，应用 Value Proposition Canvas（Osterwalder）做 Pain Reliever + Gain Creator 双向映射。\n\n` +
      `## 产品/服务\n${productCtx}\n\n` +
      (segmentHint ? `## 目标客群\n${segmentHint}\n\n` : '') +
      `## 痛点\n${pains.map((p, i) => `[${i + 1}] ${p}`).join('\n')}\n\n` +
      `每条 pain 输出 pain_reliever（具体描述，不空话）+ gain_creator + priority(high/medium/low) + priority_rationale。\n` +
      `输出纯 JSON：{ "mappings": [...], "notes": "..." }\n\n` +
      `规则：本产品做不到的 pain，priority 必为 low + 在 rationale 里说明。`

    try {
      const client = new LLMClient()
      const response = await client.chat({
        messages: [{ role: 'system', content: prompt }, { role: 'user', content: `请逐条映射 ${pains.length} 个痛点。` }]
      })
      const content = response.content ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      const jsonText = match ? match[0] : '{"mappings":[]}'
      let parsed: { mappings?: Mapping[]; notes?: string }
      try { parsed = JSON.parse(jsonText) as { mappings?: Mapping[]; notes?: string } } catch (err) {
        yield { type: 'error', error: `JSON parse failed: ${(err as Error).message}`, retryable: true }
        return
      }
      const normalised = (parsed.mappings ?? [])
        .filter((m) => m && m.pain && m.pain_reliever)
        .map((m) => ({
          ...m,
          priority: (['high', 'medium', 'low'] as const).includes(m.priority as never)
            ? m.priority : ('medium' as const)
        }))
      yield { type: 'json', data: { mappings: normalised, notes: parsed.notes ?? '' } }
    } catch (err) {
      yield { type: 'error', error: `map_pain_to_gain failed: ${(err as Error).message}`, retryable: true }
    }
  }
}
