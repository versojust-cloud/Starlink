import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage,
} from '@starlink/shared'
import { LLMClient } from '../../services/llm-client.js'
import { parseLlmJson } from '../shared/llm-json.js'

export default class KeywordExtractTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'keyword_extract',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: '关键词提取',
      description: '从文本中提取最相关的关键词列表',
      icon: '🔑',
      category: 'analysis',
      color: '#10b981',
    },
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: '待提取关键词的文本',
          required: true,
        },
        topK: {
          type: 'number',
          description: '返回的关键词数量',
          default: 10,
        },
      },
      required: ['text', 'topK'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        keywords: { type: 'array', description: '关键词列表' },
      },
    },
    inputPorts: [
      { name: 'text', type: 'string', description: '待提取关键词的文本', required: true },
      { name: 'topK', type: 'number', description: '返回的关键词数量', default: 10 },
    ],
    outputPorts: [
      { name: 'keywords', type: 'array', description: '关键词列表' },
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
    const text = input.text as string
    const topK = (input.topK as number) ?? 10
    const llm = new LLMClient()

    yield { type: 'progress', percent: 0, message: '开始提取关键词…' }

    try {
      const response = await llm.chat({
        messages: [
          {
            role: 'system',
            content: `You are a keyword extraction assistant. Extract the top ${topK} most relevant keywords from the given text. Respond ONLY with a JSON object: {"keywords": ["keyword1", "keyword2", ...]}. No extra text.`,
          },
          { role: 'user', content: text },
        ],
        temperature: 0,
        maxTokens: 512,
      })

      const parsed = parseLlmJson<{ keywords: string[] }>(
        response.content,
        { keywords: [] }
      )

      yield { type: 'progress', percent: 100, message: '提取完成' }
      yield {
        type: 'json',
        data: { keywords: parsed.keywords.slice(0, topK) },
      }
    } catch (err) {
      yield {
        type: 'error',
        error: `关键词提取失败: ${(err as Error).message}`,
        retryable: true,
      }
    }
  }
}
