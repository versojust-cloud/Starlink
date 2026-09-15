import assert from 'node:assert/strict'
import test from 'node:test'
import type { CanvasGraph, ConversationMessage, MemoryItem } from '@starlink/shared'
import { WorkspaceContextBuilder } from './workspace-context-builder.js'
import type { ConversationMemoryStore } from './conversation-memory-store.js'

test('WorkspaceContextBuilder combines canvas, session messages and long-term memory', async () => {
  const graph: CanvasGraph = {
    workspaceId: 'ws-memory',
    nodes: [
      {
        id: 'node-1',
        type: 'note',
        position: { x: 0, y: 0 },
        data: {
          type: 'note',
          title: '目标用户',
          content: '已确认优先服务跨文化研究团队。'
        }
      }
    ],
    edges: []
  }

  const message: ConversationMessage = {
    id: 'msg-1',
    conversationId: 'conv-1',
    workspaceId: 'ws-memory',
    userId: 'user-1',
    role: 'user',
    content: '后续工具应该作为 canvas 的唤起能力。',
    metadata: {},
    createdAt: new Date('2026-04-20T00:00:00.000Z').toISOString()
  }

  const memory: MemoryItem = {
    id: 'mem-1',
    workspaceId: 'ws-memory',
    userId: 'user-1',
    scope: 'workspace',
    kind: 'user-skill',  // P14 P2 · was 'preference' (dead enum); fixture updated
    title: 'Canvas 优先',
    content: '用户希望 canvas 是主载体，@ 命令只负责唤起工具。',
    sourceType: 'manual',
    sourceId: null,
    importance: 0.9,
    confidence: 0.8,
    tags: ['canvas'],
    metadata: {},
    createdAt: new Date('2026-04-20T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-04-20T00:00:00.000Z').toISOString(),
    lastUsedAt: null,
    archivedAt: null
  }

  const memoryStore = {
    listMessages: async () => [message],
    searchMemories: async () => [memory]
  } as unknown as ConversationMemoryStore
  const builder = new WorkspaceContextBuilder(memoryStore)

  const snapshot = await builder.build({
    workspaceId: 'ws-memory',
    userId: 'user-1',
    conversationId: 'conv-1',
    query: '当前系统记住了什么？',
    graph
  })

  assert.equal(snapshot.workspaceId, 'ws-memory')
  assert.equal(snapshot.recentMessages.length, 1)
  assert.equal(snapshot.memories.length, 1)
  assert.equal(snapshot.canvasSummary.nodeCount, 1)
  assert.match(snapshot.promptBlock, /Canvas 优先/)
  assert.match(snapshot.promptBlock, /目标用户/)
  assert.match(snapshot.promptBlock, /后续工具应该作为 canvas/)
})
