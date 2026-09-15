import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage,
} from '@starlink/shared'
import { searchKnowledgeBase } from '../../services/kb-task-service.js'

export default class KnowledgeBaseTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'knowledge-base',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: '知识库检索',
      description: '从知识库中检索与查询最相关的文档片段',
      icon: '📚',
      category: 'data_source',
      color: '#3b82f6',
    },
    inputSchema: {
      type: 'object',
      properties: {
        kbId: {
          type: 'string',
          description: '知识库ID',
          required: true,
        },
        query: {
          type: 'string',
          description: '检索查询文本',
          required: true,
        },
        topK: {
          type: 'number',
          description: '返回最相关的结果数量',
          default: 5,
        },
      },
      required: ['kbId', 'query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        results: { type: 'array', description: '检索结果列表' },
        kbId: { type: 'string', description: '知识库ID' },
      },
    },
    inputPorts: [
      { name: 'kbId', type: 'string', description: '知识库ID', required: true },
      { name: 'query', type: 'string', description: '检索查询文本', required: true },
      { name: 'topK', type: 'number', description: '返回结果数量', default: 5 },
    ],
    outputPorts: [
      { name: 'results', type: 'array', description: '检索结果列表' },
      { name: 'kbId', type: 'string', description: '知识库ID' },
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
    let kbId = input.kbId as string
    const query = input.query as string
    const topK = (input.topK as number) ?? 5

    yield { type: 'progress', percent: 0, message: '正在检索知识库…' }

    // P11.18 fix · agent often passes kbId='default' or '*' when it
    // doesn't know the actual KB id. Previous code searched a literal
    // 'default' KB which doesn't exist → empty result every time.
    // Fix: when kbId is a placeholder, fan-out to ALL workspace KBs
    // and merge results sorted by score. Empty workspace returns []
    // gracefully (no error).
    const isPlaceholder = !kbId || kbId === 'default' || kbId === '*' || kbId === 'all'
    let results: Awaited<ReturnType<typeof searchKnowledgeBase>> = []

    if (isPlaceholder) {
      // Lazy import to avoid module-load cycle.
      const { listKnowledgeBases } = await import('../../services/kb-task-service.js')
      const kbs = await listKnowledgeBases(_context.workspaceId).catch(() => [])
      if (kbs.length === 0) {
        yield { type: 'progress', percent: 100, message: '工作区无知识库' }
        yield {
          type: 'json',
          data: {
            results: [],
            kbId: 'none',
            note: 'workspace has no KBs; agent should rely on context / memory / web-search'
          }
        }
        return
      }
      // Fan-out across all KBs. Per-KB topK 3, then pick best topK overall.
      const perKb = Math.max(1, Math.min(5, Math.floor(topK / Math.max(kbs.length, 1)) + 1))
      const fanout = await Promise.all(
        kbs.map((kb) =>
          searchKnowledgeBase(_context.workspaceId, kb.id, query, perKb).catch(() => [])
        )
      )
      results = fanout
        .flat()
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, Math.max(1, Math.min(20, Math.floor(topK))))
      kbId = `union(${kbs.map((kb) => kb.id).join(',')})`
    } else {
      results = await searchKnowledgeBase(
        _context.workspaceId,
        kbId,
        query,
        Math.max(1, Math.min(20, Math.floor(topK)))
      )
    }

    yield { type: 'progress', percent: 100, message: '检索完成' }
    yield {
      type: 'json',
      data: {
        results: results.map((result) => ({
          docId: result.docId,
          snippet: result.snippet,
          score: result.score,
          metadata: result.metadata ?? {}
        })),
        kbId
      }
    }
  }
}
