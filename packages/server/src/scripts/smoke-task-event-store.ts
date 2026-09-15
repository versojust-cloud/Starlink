import { Redis } from 'ioredis'
import { TaskEventStore } from '../application/task-event-store.js'

async function main() {
  const redisUrl = process.env.TASK_EVENT_STORE_REDIS_URL
    ?? process.env.REDIS_URL
    ?? 'redis://127.0.0.1:6379'

  await runMemoryBaseline()
  await runRedisCrossInstance(redisUrl)
}

async function runMemoryBaseline() {
  process.env.TASK_EVENT_STORE_DRIVER = 'memory'
  const storeA = new TaskEventStore()
  const storeB = new TaskEventStore()

  const event = buildEvent('event-memory-1', 'task-memory-1', 'kb-smoke-memory')
  const result = await storeA.ingest(event)
  if (result.duplicate) {
    throw new Error('memory baseline failed: first ingest unexpectedly duplicate')
  }

  const fromA = await storeA.getTaskStatuses(event.kbId)
  const fromB = await storeB.getTaskStatuses(event.kbId)
  if (fromA.length !== 1) {
    throw new Error(`memory baseline failed: expected storeA size=1, got ${fromA.length}`)
  }
  if (fromB.length !== 0) {
    throw new Error(`memory baseline failed: expected storeB size=0, got ${fromB.length}`)
  }

  await storeA.close()
  await storeB.close()
  console.log('[smoke] memory baseline passed')
}

async function runRedisCrossInstance(redisUrl: string) {
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null
  })
  redis.on('error', () => {
    // keep smoke output clean when redis is unavailable
  })

  try {
    await redis.connect()
    await redis.ping()
  } catch {
    console.warn('[smoke] redis not reachable, skip cross-instance test', { redisUrl })
    redis.disconnect(false)
    await redis.quit().catch(() => {
      // no-op
    })
    return
  }

  await redis.quit().catch(() => {
    // no-op
  })

  process.env.TASK_EVENT_STORE_DRIVER = 'redis'
  process.env.TASK_EVENT_STORE_REDIS_URL = redisUrl
  process.env.TASK_EVENT_STORE_REDIS_PREFIX = `task-event-smoke-${Date.now()}`

  const writer = new TaskEventStore()
  const reader = new TaskEventStore()

  const event = buildEvent('event-redis-1', 'task-redis-1', 'kb-smoke-redis')
  const ingestResult = await writer.ingest(event)
  if (ingestResult.duplicate) {
    throw new Error('redis cross-instance failed: first ingest unexpectedly duplicate')
  }

  const statuses = await reader.getTaskStatuses(event.kbId)
  if (statuses.length === 0) {
    throw new Error('redis cross-instance failed: reader cannot observe writer event')
  }
  if (statuses[0]?.taskId !== event.taskId) {
    throw new Error(`redis cross-instance failed: expected taskId=${event.taskId}, got ${statuses[0]?.taskId}`)
  }

  await writer.close()
  await reader.close()
  console.log('[smoke] redis cross-instance passed')
}

function buildEvent(eventId: string, taskId: string, kbId: string) {
  return {
    eventId,
    eventType: 'kb.task.created' as const,
    version: '1.0' as const,
    occurredAt: new Date().toISOString(),
    taskId,
    kbId,
    status: 'pending' as const,
    payload: {
      taskType: 'seed' as const
    }
  }
}

main().catch((error) => {
  console.error('[smoke] failed', error)
  process.exit(1)
})
