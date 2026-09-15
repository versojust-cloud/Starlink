/**
 * VALUE_PROPOSITIONS · differentiation_score (T1.C Tier B follow-up).
 *
 * Last of the 7 deleted stubs to be re-implemented (see Stage D commit
 * 4a4ec96). Scores how strongly a value proposition differentiates from
 * named competitors across 4 axes — function / price / experience /
 * brand — using band labels (high/mid/low) rather than fabricated
 * numeric scores. LLM-driven.
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage
} from '@starlink/shared'
import { LLMClient } from '../../../services/llm-client.js'

export default class DifferentiationScoreTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: { name: 'value-propositions.differentiation_score', provider: 'builtin', version: '1.0.0' },
    display: {
      label: '差异化评分',
      description: '把价值主张与命名竞品在 function/price/experience/brand 4 轴对比，按 high/mid/low 评分',
      icon: '🎯',
      category: 'analysis',
      color: '#f59e0b'
    },
    inputSchema: {
      type: 'object',
      properties: {
        value_proposition: { type: 'string', description: '本方价值主张' },
        competitors: {
          type: 'array',
          description: '命名竞品列表（含一句话定位）'
        },
        target_persona: { type: 'string', description: '目标客户描述', default: '' }
      },
      required: ['value_proposition', 'competitors']
    },
    outputSchema: {
      type: 'object',
      properties: {
        differentiation: { type: 'array', description: 'PerCompetitor[] with 4-axis scores' }
      }
    },
    inputPorts: [
      { name: 'value_proposition', type: 'string', description: '本方价值主张', required: true },
      { name: 'competitors', type: 'array', description: '竞品列表', required: true },
      { name: 'target_persona', type: 'string', description: '目标客户', default: '' }
    ],
    outputPorts: [{ name: 'differentiation', type: 'array', description: '差异化评分' }],
    runtime: { timeout: 30000, retries: 1, cacheable: true, streamable: false, parallel: true }
  }

  async *execute(input: Record<string, unknown>, _ctx: ToolContext): AsyncGenerator<ToolMessage> {
    const valueProp = (input.value_proposition as string) ?? ''
    const competitors = Array.isArray(input.competitors) ? (input.competitors as unknown[]) : []
    const persona = (input.target_persona as string) ?? ''

    if (!valueProp || competitors.length === 0) {
      yield {
        type: 'error',
        error: 'value_proposition and at least one competitor are required',
        retryable: false
      }
      return
    }

    yield { type: 'progress', percent: 10, message: '差异化评分中...' }

    const competitorList = competitors
      .map((c, i) => `[${i + 1}] ${typeof c === 'string' ? c : JSON.stringify(c)}`)
      .join('\n')

    const prompt =
      `你是产品差异化分析专家。把本方价值主张与每个竞品在 4 个轴上对比并打分，` +
      `用 band 标签（**stronger / parity / weaker**）— **不要给数字分数**，避免编造。\n\n` +
      `4 个对比轴：\n` +
      `- function：核心功能 / 能力覆盖\n` +
      `- price：定价档位 / 性价比\n` +
      `- experience：使用体验 / 学习成本 / 集成难度\n` +
      `- brand：品牌信任 / 网络效应\n\n` +
      `本方价值主张：${valueProp}\n` +
      (persona ? `目标客户：${persona}\n` : '') +
      `竞品列表：\n${competitorList}\n\n` +
      `输出纯 JSON：{ "differentiation": [{ "competitor": "竞品名/描述", ` +
      `"function": "stronger|parity|weaker", "price": "...", "experience": "...", ` +
      `"brand": "...", "summary": "≤30字 整体差异定性" }] }`

    try {
      const client = new LLMClient()
      const response = await client.chat({
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: '请逐一打分。' }
        ]
      })
      const content = response.content ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      const json = match ? match[0] : '{"differentiation":[]}'
      try {
        const parsed = JSON.parse(json) as { differentiation?: unknown[] }
        yield { type: 'json', data: { differentiation: parsed.differentiation ?? [] } }
      } catch {
        yield { type: 'error', error: 'JSON parse failed', retryable: true }
      }
    } catch (err) {
      yield {
        type: 'error',
        error: `differentiation_score failed: ${(err as Error).message}`,
        retryable: true
      }
    }
  }
}
