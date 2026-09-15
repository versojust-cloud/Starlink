import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage,
} from '@starlink/shared'
import { LLMClient } from '../../services/llm-client.js'
import { parseLlmJson } from '../shared/llm-json.js'

export default class SentimentAnalysisTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'sentiment_analysis',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: '情感分析',
      description: '对输入文本进行情感分析，返回情感得分和标签',
      icon: '💭',
      category: 'analysis',
      color: '#10b981',
    },
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: '待分析的文本内容',
          required: true,
        },
      },
      required: ['text'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        score: { type: 'number', description: '情感得分，范围 -1 到 1' },
        label: { type: 'string', description: '情感标签：positive / negative / neutral' },
      },
    },
    inputPorts: [
      { name: 'text', type: 'string', description: '待分析的文本内容', required: true },
    ],
    outputPorts: [
      { name: 'score', type: 'number', description: '情感得分' },
      { name: 'label', type: 'string', description: '情感标签' },
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
    const llm = new LLMClient()

    yield { type: 'progress', percent: 0, message: '开始情感分析…' }

    try {
      const response = await llm.chat({
        messages: [
          {
            role: 'system',
            content:
              'You are a sentiment analysis assistant. Analyze the sentiment of the given text and respond ONLY with a JSON object: {"score": <number from -1 to 1>, "label": "<positive|negative|neutral>"}. No extra text.',
          },
          { role: 'user', content: text },
        ],
        temperature: 0,
        maxTokens: 128,
      })

      const parsed = parseLlmJson<{ score: number; label: string }>(
        response.content,
        { score: 0, label: 'neutral' }
      )

      yield { type: 'progress', percent: 100, message: '分析完成' }
      yield {
        type: 'json',
        data: {
          score: parsed.score,
          label: parsed.label,
        },
      }
    } catch (err) {
      yield {
        type: 'error',
        error: `情感分析失败: ${(err as Error).message}`,
        retryable: true,
      }
    }
  }
}
