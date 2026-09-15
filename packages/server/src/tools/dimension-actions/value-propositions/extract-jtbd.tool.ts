/**
 * Phase 3.4 · VALUE_PROPOSITIONS · extract_jtbd (real LLM impl).
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage
} from '@starlink/shared'
import { LLMClient } from '../../../services/llm-client.js'

interface Job {
  main_job: string
  dimensions: { functional: string; emotional?: string; social?: string }
  trigger_context: string
  success_criteria: string[]
  frequency?: string
}

export default class ExtractJtbdTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: { name: 'value-propositions.extract_jtbd', provider: 'builtin', version: '1.0.0' },
    display: {
      label: 'Jobs-to-be-Done 提取',
      description: 'Christensen JTBD 框架：从客户访谈/评论提取核心 Job',
      icon: '🎯',
      category: 'analysis',
      color: '#10b981'
    },
    inputSchema: {
      type: 'object',
      properties: {
        raw_interviews: { type: 'array', description: '访谈/评论/工单等文本片段数组' },
        segment_hint: { type: 'string', description: '目标客群提示' },
        max_jobs: { type: 'number', description: '返回的 job 数量上限', default: 5 }
      },
      required: ['raw_interviews']
    },
    outputSchema: { type: 'object', properties: { jobs: { type: 'array' } } },
    inputPorts: [
      { name: 'raw_interviews', type: 'array', description: '访谈片段', required: true },
      { name: 'segment_hint', type: 'string', description: '客群', required: false },
      { name: 'max_jobs', type: 'number', description: '上限', default: 5 }
    ],
    outputPorts: [{ name: 'jobs', type: 'array', description: 'JTBD 列表' }],
    runtime: { timeout: 30000, retries: 1, cacheable: true, streamable: false, parallel: true }
  }

  async *execute(input: Record<string, unknown>, _ctx: ToolContext): AsyncGenerator<ToolMessage> {
    const interviews = (input.raw_interviews as string[]) ?? []
    const segmentHint = (input.segment_hint as string) ?? ''
    const maxJobs = Math.max(1, Math.min(10, (input.max_jobs as number) ?? 5))

    if (interviews.length === 0) { yield { type: 'json', data: { jobs: [] } }; return }
    yield { type: 'progress', percent: 10, message: '提取 JTBD...' }

    const prompt =
      `你是 Jobs-to-be-Done 分析师（Christensen 框架）。\n\n` +
      `从以下 ${interviews.length} 条原始客户反馈中提取最多 ${maxJobs} 个独立 Job。\n` +
      (segmentHint ? `目标客群：${segmentHint}\n` : '') +
      `\n反馈：\n${interviews.map((s, i) => `[${i + 1}] ${s}`).join('\n\n')}\n\n` +
      `每个 Job：main_job ('when X, I want to Y, so I can Z')，dimensions{functional, emotional?, social?}，` +
      `trigger_context，success_criteria[]，frequency。\n\n输出纯 JSON：{ "jobs": [...] }`

    try {
      const client = new LLMClient()
      const response = await client.chat({
        messages: [{ role: 'system', content: prompt }, { role: 'user', content: `请抽取最多 ${maxJobs} 个 Job。` }]
      })
      const content = response.content ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      const jsonText = match ? match[0] : '{"jobs":[]}'
      let parsed: { jobs?: Job[] }
      try { parsed = JSON.parse(jsonText) as { jobs?: Job[] } } catch (err) {
        yield { type: 'error', error: `JSON parse failed: ${(err as Error).message}`, retryable: true }
        return
      }
      const normalised = (parsed.jobs ?? [])
        .filter((j) => j && j.main_job)
        .slice(0, maxJobs)
        .map((j) => ({
          ...j,
          success_criteria: Array.isArray(j.success_criteria) ? j.success_criteria : [],
          dimensions: j.dimensions ?? { functional: '' }
        }))
      yield { type: 'json', data: { jobs: normalised } }
    } catch (err) {
      yield { type: 'error', error: `extract_jtbd failed: ${(err as Error).message}`, retryable: true }
    }
  }
}
