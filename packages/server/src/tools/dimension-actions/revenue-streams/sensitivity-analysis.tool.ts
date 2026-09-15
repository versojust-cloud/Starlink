/**
 * Phase 3.4 Tier 2 · REVENUE_STREAMS · sensitivity_analysis (real LLM).
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage
} from '@starlink/shared'
import { LLMClient } from '../../../services/llm-client.js'

interface VariableRow {
  variable: string
  delta_percent: number
  revenue_delta_percent: number
  elasticity: number
  note?: string
}

export default class SensitivityAnalysisTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: { name: 'revenue-streams.sensitivity_analysis', provider: 'builtin', version: '1.0.0' },
    display: {
      label: '收入敏感性分析',
      description: '对 ±10% / ±25% 变量扰动做敏感性分析',
      icon: '📉',
      category: 'analysis',
      color: '#3b82f6'
    },
    inputSchema: {
      type: 'object',
      properties: {
        baseline_revenue: { type: 'number', description: '基线总收入' },
        pricing_model_type: { type: 'string', description: '定价模型类型' },
        candidate_variables: { type: 'array', description: '关心的变量集（可选）' }
      },
      required: ['baseline_revenue', 'pricing_model_type']
    },
    outputSchema: {
      type: 'object',
      properties: {
        elasticity: { type: 'array' },
        dominant_variable: { type: 'string' },
        reasoning: { type: 'string' }
      }
    },
    inputPorts: [
      { name: 'baseline_revenue', type: 'number', description: '基线收入', required: true },
      { name: 'pricing_model_type', type: 'string', description: '模型类型', required: true },
      { name: 'candidate_variables', type: 'array', description: '候选变量', required: false }
    ],
    outputPorts: [
      { name: 'elasticity', type: 'array', description: '弹性分析' },
      { name: 'dominant_variable', type: 'string', description: '主导变量' },
      { name: 'reasoning', type: 'string', description: '分析推理' }
    ],
    runtime: { timeout: 30000, retries: 1, cacheable: true, streamable: false, parallel: true }
  }

  async *execute(input: Record<string, unknown>, _ctx: ToolContext): AsyncGenerator<ToolMessage> {
    const baseline = (input.baseline_revenue as number) ?? 0
    const modelType = (input.pricing_model_type as string) ?? ''
    const candidates = (input.candidate_variables as string[]) ?? []

    if (baseline <= 0 || !modelType) {
      yield { type: 'json', data: { elasticity: [], dominant_variable: '', reasoning: 'missing inputs' } }
      return
    }
    yield { type: 'progress', percent: 10, message: '推理敏感性...' }

    const prompt =
      `你是收入敏感性分析专家。给出 ±10% 和 ±25% 弹性。\n\n` +
      `## 模型类型\n${modelType}\n## 基线收入\n${baseline}\n` +
      (candidates.length ? `## 用户指定变量\n${candidates.join(', ')}\n` : '## 变量自选\n请按 pricing_model_type 选 4-6 个最相关变量。\n') +
      `\n输出纯 JSON：{ "elasticity": [{ "variable", "delta_percent", "revenue_delta_percent", "elasticity", "note" }],` +
      ` "dominant_variable": "...", "reasoning": "..." }\n` +
      `规则：每个变量必须有 ±10 和 ±25 两档（共 4 行）。`

    try {
      const client = new LLMClient()
      const response = await client.chat({
        messages: [{ role: 'system', content: prompt }, { role: 'user', content: '请输出敏感性分析 JSON。' }]
      })
      const content = response.content ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      const jsonText = match ? match[0] : '{}'
      let parsed: { elasticity?: VariableRow[]; dominant_variable?: string; reasoning?: string }
      try { parsed = JSON.parse(jsonText) as typeof parsed } catch (err) {
        yield { type: 'error', error: `JSON parse failed: ${(err as Error).message}`, retryable: true }
        return
      }
      const rows = (parsed.elasticity ?? []).filter(
        (r) => r && typeof r.variable === 'string' && typeof r.delta_percent === 'number'
      )
      yield {
        type: 'json',
        data: {
          elasticity: rows,
          dominant_variable: parsed.dominant_variable ?? '',
          reasoning: parsed.reasoning ?? ''
        }
      }
    } catch (err) {
      yield { type: 'error', error: `sensitivity_analysis failed: ${(err as Error).message}`, retryable: true }
    }
  }
}
