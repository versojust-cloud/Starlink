/**
 * Phase 3.3 · CUSTOMER_SEGMENTS · cluster_personas (Tier 1 real LLM exemplar).
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage
} from '@starlink/shared'
import { LLMClient } from '../../../services/llm-client.js'

export default class ClusterPersonasTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: { name: 'customer-segments.cluster_personas', provider: 'builtin', version: '1.0.0' },
    display: {
      label: '客户画像聚类',
      description: '将原始客户反馈/调研文本按人口统计 + 行为模式聚类为若干 Persona',
      icon: '👥',
      category: 'analysis',
      color: '#f59e0b'
    },
    inputSchema: {
      type: 'object',
      properties: {
        notes: { type: 'array', description: '原始客户笔记数组（字符串）' },
        expected_clusters: { type: 'number', description: '期望 Persona 数量（2-5）', default: 3 },
        region: { type: 'string', description: '目标市场区域', default: 'china' }
      },
      required: ['notes']
    },
    outputSchema: {
      type: 'object',
      properties: { personas: { type: 'array', description: 'Persona[]' } }
    },
    inputPorts: [
      { name: 'notes', type: 'array', description: '原始客户笔记', required: true },
      { name: 'expected_clusters', type: 'number', description: 'Persona 数量', default: 3 },
      { name: 'region', type: 'string', description: '目标区域', default: 'china' }
    ],
    outputPorts: [{ name: 'personas', type: 'array', description: 'Persona 列表' }],
    runtime: { timeout: 30000, retries: 1, cacheable: true, streamable: false, parallel: true }
  }

  async *execute(input: Record<string, unknown>, _ctx: ToolContext): AsyncGenerator<ToolMessage> {
    const notes = (input.notes as string[]) ?? []
    const expected = (input.expected_clusters as number) ?? 3
    const region = (input.region as string) ?? 'china'

    if (notes.length === 0) { yield { type: 'json', data: { personas: [] } }; return }

    yield { type: 'progress', percent: 10, message: '聚类客户画像...' }

    const prompt =
      `你是客户画像聚类专家。给定以下 ${notes.length} 条原始客户笔记，将其聚类为 ${expected} 个 Persona。\n` +
      `目标市场：${region}\n\n输入笔记：\n${notes.map((n, i) => `[${i + 1}] ${n}`).join('\n')}\n\n` +
      `输出纯 JSON：{ "personas": [{ "archetype": "短标签", "demographic": "年龄/职业/收入",` +
      ` "pain_points": ["..."], "size_band": "small|medium|large", "distinguishing_traits": ["..."] }] }`

    try {
      const client = new LLMClient()
      const response = await client.chat({
        messages: [{ role: 'system', content: prompt }, { role: 'user', content: `请聚类为 ${expected} 个 persona。` }]
      })
      const content = response.content ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      const json = match ? match[0] : '{"personas":[]}'
      try {
        const parsed = JSON.parse(json) as { personas?: unknown[] }
        yield { type: 'json', data: { personas: parsed.personas ?? [] } }
      } catch {
        yield { type: 'error', error: `JSON parse failed`, retryable: true }
      }
    } catch (err) {
      yield { type: 'error', error: `cluster_personas failed: ${(err as Error).message}`, retryable: true }
    }
  }
}
