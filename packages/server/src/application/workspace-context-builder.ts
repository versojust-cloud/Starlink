import type {
  CanvasGraph,
  ConversationMessage,
  KnowledgeEvidence,
  MemoryItem,
  WorkspaceContextSnapshot
} from '@starlink/shared'
import {
  deriveSnippetId,
  workspaceContextSnapshotSchema
} from '@starlink/shared'
import { searchKnowledgeBase } from '../services/kb-task-service.js'
import type { ConversationMemoryStore } from './conversation-memory-store.js'

type BuildContextInput = {
  workspaceId: string
  userId: string
  query: string
  conversationId?: string | null
  kbId?: string | null
  graph: CanvasGraph
}

export class WorkspaceContextBuilder {
  constructor(private readonly memoryStore: ConversationMemoryStore) {}

  async build(input: BuildContextInput): Promise<WorkspaceContextSnapshot> {
    const [recentMessages, memories, knowledgeEvidence] = await Promise.all([
      input.conversationId
        ? this.memoryStore.listMessages(input.conversationId, 8)
        : Promise.resolve([]),
      this.memoryStore.searchMemories(input.workspaceId, input.query, 8),
      input.kbId
        ? // F1 · pass userId so private KBs are owner-restricted
          searchKnowledgeBase(input.workspaceId, input.kbId, input.query, 5, input.userId)
        : Promise.resolve([])
    ])

    const canvasSummary = summarizeCanvas(input.graph)
    const promptBlock = renderPromptBlock({
      canvasSummary,
      recentMessages,
      memories,
      knowledgeEvidence
    })

    return workspaceContextSnapshotSchema.parse({
      workspaceId: input.workspaceId,
      conversationId: input.conversationId ?? null,
      query: input.query,
      builtAt: new Date().toISOString(),
      canvasSummary,
      recentMessages,
      memories,
      knowledgeEvidence,
      promptBlock
    })
  }
}

function summarizeCanvas(graph: CanvasGraph): WorkspaceContextSnapshot['canvasSummary'] {
  const highlights = graph.nodes
    .map((node) => {
      const data = node.data as { title?: string; content?: string; summary?: string; meta?: Record<string, unknown> }
      const title = data.title ?? node.id
      const content = data.content ?? data.summary ?? ''
      const domain = typeof data.meta?.domain === 'string' ? ` / ${data.meta.domain}` : ''
      const text = content.replace(/\s+/g, ' ').trim()
      return text ? `${title}${domain}: ${truncate(text, 120)}` : title
    })
    .filter(Boolean)
    .slice(0, 10)

  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    highlights
  }
}

function renderPromptBlock(input: {
  canvasSummary: WorkspaceContextSnapshot['canvasSummary']
  recentMessages: ConversationMessage[]
  memories: MemoryItem[]
  knowledgeEvidence: KnowledgeEvidence[]
}) {
  const parts: string[] = []

  if (input.canvasSummary.nodeCount > 0) {
    parts.push([
      '## 当前智慧画布摘要',
      `节点数：${input.canvasSummary.nodeCount}，连线数：${input.canvasSummary.edgeCount}`,
      ...input.canvasSummary.highlights.map((item) => `- ${item}`)
    ].join('\n'))
  }

  if (input.memories.length > 0) {
    parts.push([
      '## 工作区长期记忆',
      ...input.memories.map((memory) => (
        `- [${memory.kind}/${memory.scope}] ${memory.title}: ${truncate(memory.content, 180)}`
      ))
    ].join('\n'))
  }

  if (input.recentMessages.length > 0) {
    parts.push([
      '## 最近会话消息',
      ...input.recentMessages.map((message) => (
        `- ${message.role}: ${truncate(message.content, 160)}`
      ))
    ].join('\n'))
  }

  if (input.knowledgeEvidence.length > 0) {
    parts.push([
      '## 本轮已检索知识库证据',
      ...input.knowledgeEvidence.slice(0, 5).map((evidence) => {
        const snippetId = deriveSnippetId(
          evidence.docId,
          evidence.metadata as { chunkIndex?: number } | undefined,
          evidence.snippet
        )
        return `- ref:${evidence.docId}#${snippetId} ${truncate(evidence.snippet, 160)}`
      })
    ].join('\n'))
  }

  if (parts.length === 0) {
    return '当前没有可复用的工作区上下文。'
  }

  return [
    '以下上下文来自当前工作区的 session、memory、canvas 和知识库。',
    '请优先复用已确认的信息；如果信息不足，明确说明缺口，不要编造。',
    '',
    parts.join('\n\n')
  ].join('\n')
}

function truncate(text: string, max: number) {
  const value = text.trim()
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1))}…`
}
