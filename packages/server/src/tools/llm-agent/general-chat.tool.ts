/**
 * General Chat Tool — simple LLM wrapper for free-form conversation.
 */

import { BaseTool } from '@starlink/shared'
import type { ToolDefinition, ToolContext, ToolMessage } from '@starlink/shared'
import { LLMClient } from '../../services/llm-client.js'
import type { LLMMessage } from '../../services/llm-client.js'

const DEFAULT_SYSTEM_PROMPT = '你是一个通用 AI 助手，请根据用户的问题提供有帮助的回答。'

export default class GeneralChatTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'general_chat',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: '通用对话',
      description: '通用 LLM 对话工具，支持自定义系统提示词',
      icon: '💬',
      category: 'llm_agent',
      color: '#f59e0b',
    },
    inputSchema: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          description: '对话消息列表，每项含 role 和 content',
          required: true,
        },
        systemPrompt: {
          type: 'string',
          description: '可选的系统提示词',
        },
      },
      required: ['messages'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        reply: { type: 'string', description: 'LLM 回复内容' },
      },
    },
    inputPorts: [
      { name: 'messages', type: 'array', description: '对话消息列表' },
      { name: 'systemPrompt', type: 'string', description: '系统提示词', required: false },
    ],
    outputPorts: [
      { name: 'reply', type: 'string', description: 'LLM 回复' },
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
    const inputMessages = input.messages as Array<{ role: string; content: string }>
    const systemPrompt = (input.systemPrompt as string) ?? DEFAULT_SYSTEM_PROMPT

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...inputMessages.map(
        (m) => ({ role: m.role, content: m.content }) as LLMMessage,
      ),
    ]

    const llm = new LLMClient()
    const response = await llm.chat({ messages })

    yield { type: 'json', data: { reply: response.content ?? '' } }
  }
}
