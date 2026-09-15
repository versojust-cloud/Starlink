import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage,
} from '@starlink/shared'
import { ConversationMemoryStore } from '../../application/conversation-memory-store.js'

const memoryStore = new ConversationMemoryStore()

export default class MemorySearchTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'memory-search',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: '长期记忆检索',
      description: '检索当前工作区长期记忆，返回与查询最相关的决策、洞察、约束和画布摘要',
      icon: '🧠',
      category: 'data_source',
      color: '#0f766e',
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '记忆检索查询',
          required: true,
        },
        scope: {
          type: 'string',
          description: '记忆范围，可选 workspace/user',
          enum: ['workspace', 'user'],
        },
        kind: {
          type: 'string',
          description: '记忆类型，可选 summary/decision/canvas/user-skill',
          enum: ['summary', 'decision', 'canvas', 'user-skill'],
        },
        topK: {
          type: 'number',
          description: '返回结果数量',
          default: 8,
        },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        memories: { type: 'array', description: '长期记忆结果列表' },
      },
    },
    inputPorts: [
      { name: 'query', type: 'string', description: '记忆检索查询', required: true },
      { name: 'scope', type: 'string', description: '记忆范围' },
      { name: 'kind', type: 'string', description: '记忆类型' },
      { name: 'topK', type: 'number', description: '返回结果数量', default: 8 },
    ],
    outputPorts: [
      { name: 'memories', type: 'array', description: '长期记忆结果列表' },
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
    context: ToolContext,
  ): AsyncGenerator<ToolMessage> {
    const query = String(input.query ?? '').trim()
    const topK = Math.max(1, Math.min(30, Math.floor(Number(input.topK ?? 8))))
    const scope = typeof input.scope === 'string' ? input.scope : undefined
    const kind = typeof input.kind === 'string' ? input.kind : undefined

    if (!query) {
      yield { type: 'error', error: 'query is required', retryable: false }
      return
    }

    yield { type: 'progress', percent: 0, message: '正在检索长期记忆…' }

    const memories = await memoryStore.searchMemories(context.workspaceId, query, topK, {
      scope: parseScope(scope),
      kind: parseKind(kind)
    })

    yield { type: 'progress', percent: 100, message: '记忆检索完成' }
    yield {
      type: 'json',
      data: {
        memories: memories.map((memory) => ({
          id: memory.id,
          title: memory.title,
          content: memory.content,
          scope: memory.scope,
          kind: memory.kind,
          sourceType: memory.sourceType,
          sourceId: memory.sourceId,
          importance: memory.importance,
          confidence: memory.confidence,
          tags: memory.tags,
          updatedAt: memory.updatedAt,
        }))
      }
    }
  }
}

function parseScope(scope: string | undefined) {
  if (scope === 'workspace' || scope === 'user') return scope
  // P14 P2 · `agent` was a dead enum value; coerce silently for any
  // legacy LLM tool-call input that still emits it.
  if (scope === 'agent') return 'workspace'
  return undefined
}

function parseKind(kind: string | undefined) {
  if (kind === 'decision' || kind === 'summary' || kind === 'canvas' || kind === 'user-skill') {
    return kind
  }
  // P14 P2 · `preference` / `insight` / `constraint` dropped from live
  // enum. Coerce to closest equivalent so tool calls degrade gracefully.
  if (kind === 'preference' || kind === 'constraint') return 'user-skill'
  if (kind === 'insight') return 'summary'
  return undefined
}
