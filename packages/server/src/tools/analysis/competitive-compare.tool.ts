import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage,
} from '@starlink/shared'
import { LLMClient } from '../../services/llm-client.js'
import { parseLlmJson } from '../shared/llm-json.js'

export default class CompetitiveCompareTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'competitive_compare',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: '竞品对比',
      description: '根据指定维度对多个竞品进行对比分析，生成对比矩阵',
      icon: '⚔️',
      category: 'analysis',
      color: '#10b981',
    },
    inputSchema: {
      type: 'object',
      properties: {
        companies: {
          type: 'array',
          description: '待对比的公司/产品列表',
          required: true,
        },
        dimensions: {
          type: 'array',
          description: '对比维度列表（如价格、功能、市场份额等）',
          required: true,
        },
      },
      required: ['companies', 'dimensions'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        matrix: { type: 'object', description: '竞品对比矩阵' },
      },
    },
    inputPorts: [
      { name: 'companies', type: 'array', description: '待对比的公司/产品列表', required: true },
      { name: 'dimensions', type: 'array', description: '对比维度列表', required: true },
    ],
    outputPorts: [
      { name: 'matrix', type: 'object', description: '竞品对比矩阵' },
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
    const companies = input.companies as string[]
    const dimensions = input.dimensions as string[]
    const llm = new LLMClient()

    yield { type: 'progress', percent: 0, message: '开始竞品对比分析…' }

    try {
      const response = await llm.chat({
        messages: [
          {
            role: 'system',
            content:
              'You are a competitive analysis assistant. Compare the given companies across the specified dimensions. Respond ONLY with a JSON object: {"matrix": {"<company>": {"<dimension>": "<assessment>", ...}, ...}}. No extra text.',
          },
          {
            role: 'user',
            content: `Companies: ${companies.join(', ')}\nDimensions: ${dimensions.join(', ')}`,
          },
        ],
        temperature: 0.3,
        maxTokens: 2048,
      })

      const parsed = parseLlmJson<{ matrix: object }>(
        response.content,
        { matrix: {} }
      )

      yield { type: 'progress', percent: 100, message: '对比分析完成' }
      yield { type: 'json', data: { matrix: parsed.matrix } }
    } catch (err) {
      yield {
        type: 'error',
        error: `竞品对比失败: ${(err as Error).message}`,
        retryable: true,
      }
    }
  }
}
