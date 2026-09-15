/**
 * Summarizer Tool — condenses text into a concise summary.
 */

import { BaseTool } from '@starlink/shared'
import type { ToolDefinition, ToolContext, ToolMessage } from '@starlink/shared'
import { LLMClient } from '../../services/llm-client.js'
import { parseLlmJson } from '../shared/llm-json.js'

const SYSTEM_PROMPT =
  '你是一个文本摘要专家。请将用户提供的文本压缩为简洁、准确的摘要，保留核心要点。' +
  '如果用户指定了最大长度，请确保摘要不超过该字数限制。以 JSON 格式输出 { "summary": "..." }。'

export default class SummarizerTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'summarizer',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: '文本摘要',
      description: '将长文本压缩为简洁的摘要',
      icon: '📝',
      category: 'llm_agent',
      color: '#f59e0b',
    },
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: '需要摘要的原始文本',
          required: true,
        },
        maxLength: {
          type: 'number',
          description: '摘要的最大字数限制',
        },
      },
      required: ['text'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '生成的摘要文本' },
      },
    },
    inputPorts: [
      { name: 'text', type: 'string', description: '原始文本' },
      { name: 'maxLength', type: 'number', description: '最大字数', required: false },
    ],
    outputPorts: [
      { name: 'summary', type: 'string', description: '摘要文本' },
    ],
    runtime: {
      timeout: 60000,
      retries: 1,
      cacheable: false,
      streamable: true,
      parallel: true,
    },
  }

  async *execute(
    input: Record<string, unknown>,
    _context: ToolContext,
  ): AsyncGenerator<ToolMessage> {
    const text = input.text as string
    const maxLength = input.maxLength as number | undefined

    let userContent = `请对以下文本进行摘要：\n\n${text}`
    if (maxLength) {
      userContent += `\n\n要求：摘要不超过 ${maxLength} 字。`
    }

    const llm = new LLMClient()
    const response = await llm.chat({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    })

    let summary: string
    try {
      const parsed = parseLlmJson<{ summary?: string }>(
        response.content,
        { summary: response.content ?? '' }
      )
      summary = parsed.summary ?? response.content ?? ''
    } catch {
      summary = response.content ?? ''
    }

    yield { type: 'json', data: { summary } }
  }
}
