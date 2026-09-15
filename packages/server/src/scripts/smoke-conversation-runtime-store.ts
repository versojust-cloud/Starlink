import { Redis } from 'ioredis'
import type { ConversationMetadata } from '@starlink/shared'
import { createConversationRuntimeRepository } from '../application/conversation-runtime-repository.js'

async function main() {
  const redisUrl = process.env.CONVERSATION_RUNTIME_STORE_REDIS_URL
    ?? process.env.REDIS_URL
    ?? 'redis://127.0.0.1:6379'

  await runMemoryBaseline()
  await runRedisCrossInstance(redisUrl)
}

async function runMemoryBaseline() {
  process.env.CONVERSATION_RUNTIME_STORE_DRIVER = 'memory'
  delete process.env.CONVERSATION_RUNTIME_STORE_REDIS_PREFIX

  const writer = createConversationRuntimeRepository()
  const reader = createConversationRuntimeRepository()

  const conversationId = 'conv-memory-1'
  const workspaceId = 'ws-memory'
  const record = buildRecord(conversationId, workspaceId, 'running')

  await writer.createConversation(conversationId, record)
  await writer.setWorkspaceGraph(workspaceId, record.graph)

  const fromWriter = await writer.getConversation(conversationId)
  const fromReader = await reader.getConversation(conversationId)

  if (!fromWriter) {
    throw new Error('memory baseline failed: writer cannot read own conversation')
  }
  if (fromReader) {
    throw new Error('memory baseline failed: reader unexpectedly observed writer memory data')
  }

  await writer.close()
  await reader.close()
  console.log('[smoke] conversation runtime memory baseline passed')
}

async function runRedisCrossInstance(redisUrl: string) {
  const probe = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null
  })
  probe.on('error', () => {
    // keep smoke output concise when redis is unavailable
  })

  try {
    await probe.connect()
    await probe.ping()
  } catch {
    console.warn('[smoke] redis not reachable, skip conversation runtime cross-instance', {
      redisUrl
    })
    probe.disconnect(false)
    await probe.quit().catch(() => {
      // no-op
    })
    return
  }

  await probe.quit().catch(() => {
    // no-op
  })

  process.env.CONVERSATION_RUNTIME_STORE_DRIVER = 'redis'
  process.env.CONVERSATION_RUNTIME_STORE_REDIS_URL = redisUrl
  process.env.CONVERSATION_RUNTIME_STORE_REDIS_PREFIX = `conversation-smoke-${Date.now()}`

  const writer = createConversationRuntimeRepository()
  const reader = createConversationRuntimeRepository()

  const conversationId = 'conv-redis-1'
  const workspaceId = 'ws-redis'
  const record = buildRecord(conversationId, workspaceId, 'running')

  await writer.createConversation(conversationId, record)
  await writer.setWorkspaceGraph(workspaceId, record.graph)

  const fromReader = await reader.getConversation(conversationId)
  if (!fromReader) {
    throw new Error('redis cross-instance failed: reader cannot observe writer conversation')
  }

  const graphFromReader = await reader.getWorkspaceGraph(workspaceId)
  if (!graphFromReader) {
    throw new Error('redis cross-instance failed: reader cannot observe workspace graph')
  }

  if (graphFromReader.workspaceId !== workspaceId) {
    throw new Error(
      `redis cross-instance failed: expected workspaceId=${workspaceId}, got ${graphFromReader.workspaceId}`
    )
  }

  await writer.close()
  await reader.close()
  console.log('[smoke] conversation runtime redis cross-instance passed')
}

function buildRecord(
  conversationId: string,
  workspaceId: string,
  status: ConversationMetadata['status']
) {
  const now = new Date()

  return {
    metadata: {
      id: conversationId,
      createdAt: now,
      updatedAt: now,
      status,
      latestQuestion: 'smoke question'
    },
    graph: {
      workspaceId,
      nodes: [],
      edges: []
    },
    knowledgeEvidence: [],
    citations: []
  }
}

main().catch((error) => {
  console.error('[smoke] conversation runtime failed', error)
  process.exit(1)
})
