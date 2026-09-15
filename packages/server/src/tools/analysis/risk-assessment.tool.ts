import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage,
} from '@starlink/shared'
import { LLMClient } from '../../services/llm-client.js'
import { parseLlmJson } from '../shared/llm-json.js'

export default class RiskAssessmentTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'risk_assessment',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: '风险评估',
      description: '评估商业模式的潜在风险，按类别和等级输出风险清单',
      icon: '⚠️',
      category: 'analysis',
      color: '#10b981',
    },
    inputSchema: {
      type: 'object',
      properties: {
        businessModel: {
          type: 'string',
          description: '商业模式描述',
          required: true,
        },
      },
      required: ['businessModel'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        risks: { type: 'array', description: '风险列表，包含 category / level / description' },
      },
    },
    inputPorts: [
      { name: 'businessModel', type: 'string', description: '商业模式描述', required: true },
    ],
    outputPorts: [
      { name: 'risks', type: 'array', description: '风险列表' },
    ],
    runtime: {
      timeout: 30000,
      retries: 1,
      cacheable: true,
      streamable: false,
      parallel: true,
    },
  }

  async *execute(
    input: Record<string, unknown>,
    _context: ToolContext,
  ): AsyncGenerator<ToolMessage> {
    const businessModel = input.businessModel as string
    const llm = new LLMClient()

    yield { type: 'progress', percent: 0, message: '开始风险评估…' }

    try {
      const response = await llm.chat({
        messages: [
          {
            role: 'system',
            content:
              'You are a risk assessment assistant. Analyze the given business model and identify potential risks. Respond ONLY with a JSON object: {"risks": [{"category": "<string>", "level": "<high|medium|low>", "description": "<string>"}, ...]}. No extra text.',
          },
          { role: 'user', content: businessModel },
        ],
        temperature: 0.3,
        maxTokens: 2048,
      })

      const parsed = parseLlmJson<{
        risks: Array<{ category: string; level: string; description: string }>
      }>(response.content, { risks: [] })

      yield { type: 'progress', percent: 100, message: '风险评估完成' }
      yield { type: 'json', data: { risks: parsed.risks } }
    } catch (err) {
      yield {
        type: 'error',
        error: `风险评估失败: ${(err as Error).message}`,
        retryable: true,
      }
    }
  }
}
