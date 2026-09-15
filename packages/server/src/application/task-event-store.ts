import { Redis } from 'ioredis'
import { taskEventSchema, type TaskEvent } from '@starlink/shared'

export type TaskStatusSnapshot = {
  taskId: string
  kbId: string
  status: TaskEvent['status']
  taskType: TaskEvent['payload']['taskType']
  error?: string
  updatedAt: string
  lastEventId: string
}

type IngestResult =
  | { duplicate: true }
  | { duplicate: false; event: TaskEvent }

type TaskEventStoreBackend = {
  ingest: (event: TaskEvent) => Promise<IngestResult>
  getTaskStatuses: (kbId: string) => Promise<TaskStatusSnapshot[]>
  close: () => Promise<void>
}

type TaskEventStoreConfig = {
  maxProcessedEventIds: number
  maxTasksPerKb: number
  snapshotTtlMs: number
}

class InMemoryTaskEventStoreBackend implements TaskEventStoreBackend {
  private readonly maxProcessedEventIds: number
  private readonly maxTasksPerKb: number
  private readonly snapshotTtlMs: number
  private readonly processedEventIds = new Set<string>()
  private readonly processedEventQueue: string[] = []
  private readonly tasksByKb = new Map<string, Map<string, TaskStatusSnapshot>>()

  constructor(config: TaskEventStoreConfig) {
    this.maxProcessedEventIds = config.maxProcessedEventIds
    this.maxTasksPerKb = config.maxTasksPerKb
    this.snapshotTtlMs = config.snapshotTtlMs
  }

  async ingest(event: TaskEvent): Promise<IngestResult> {
    this.cleanupExpired()

    if (this.processedEventIds.has(event.eventId)) {
      return { duplicate: true }
    }

    this.processedEventIds.add(event.eventId)
    this.processedEventQueue.push(event.eventId)
    if (this.processedEventQueue.length > this.maxProcessedEventIds) {
      const removed = this.processedEventQueue.shift()
      if (removed) {
        this.processedEventIds.delete(removed)
      }
    }

    const snapshotsByKb = this.tasksByKb.get(event.kbId) ?? new Map<string, TaskStatusSnapshot>()
    snapshotsByKb.set(event.taskId, toSnapshot(event))
    this.trimByKb(snapshotsByKb)
    this.tasksByKb.set(event.kbId, snapshotsByKb)

    return { duplicate: false, event }
  }

  async getTaskStatuses(kbId: string): Promise<TaskStatusSnapshot[]> {
    this.cleanupExpired()
    const byTask = this.tasksByKb.get(kbId)
    if (!byTask) return []
    return [...byTask.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async close() {}

  private cleanupExpired() {
    const threshold = Date.now() - this.snapshotTtlMs
    for (const [kbId, snapshots] of this.tasksByKb.entries()) {
      for (const [taskId, snapshot] of snapshots.entries()) {
        const updatedAt = new Date(snapshot.updatedAt).getTime()
        if (!Number.isFinite(updatedAt) || updatedAt < threshold) {
          snapshots.delete(taskId)
        }
      }
      if (snapshots.size === 0) {
        this.tasksByKb.delete(kbId)
      }
    }
  }

  private trimByKb(snapshots: Map<string, TaskStatusSnapshot>) {
    if (snapshots.size <= this.maxTasksPerKb) return

    const overflow = snapshots.size - this.maxTasksPerKb
    const ordered = [...snapshots.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    for (let index = 0; index < overflow; index += 1) {
      const item = ordered[index]
      if (!item) break
      snapshots.delete(item.taskId)
    }
  }
}

class RedisTaskEventStoreBackend implements TaskEventStoreBackend {
  private readonly fallback: InMemoryTaskEventStoreBackend
  private readonly redis: Redis
  private readonly keyPrefix: string
  private readonly maxTasksPerKb: number
  private readonly ttlSeconds: number
  private available = true

  constructor(config: TaskEventStoreConfig) {
    this.fallback = new InMemoryTaskEventStoreBackend(config)
    this.maxTasksPerKb = config.maxTasksPerKb
    this.ttlSeconds = Math.max(1, Math.floor(config.snapshotTtlMs / 1000))
    this.keyPrefix = process.env.TASK_EVENT_STORE_REDIS_PREFIX ?? 'task-event'

    const url = process.env.TASK_EVENT_STORE_REDIS_URL
      ?? process.env.REDIS_URL
      ?? 'redis://localhost:6379'
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null
    })

    this.redis.on('error', (error: unknown) => {
      this.available = false
      console.error('[task-event-store] redis error, fallback to memory', {
        error: String(error)
      })
    })
  }

  async ingest(event: TaskEvent): Promise<IngestResult> {
    if (!this.available) {
      return this.fallback.ingest(event)
    }

    const stored = await this.tryWrite(async () => {
      const dedupeResult = await this.redis.set(
        this.eventDedupKey(event.eventId),
        '1',
        'EX',
        this.ttlSeconds,
        'NX'
      )

      if (dedupeResult !== 'OK') {
        return { duplicate: true } as const
      }

      const snapshot = toSnapshot(event)
      const snapshotKey = this.taskSnapshotKey(snapshot.kbId, snapshot.taskId)
      const indexKey = this.kbTaskIndexKey(snapshot.kbId)
      const score = Date.parse(snapshot.updatedAt) || Date.now()

      await this.redis
        .multi()
        .set(snapshotKey, JSON.stringify(snapshot), 'EX', this.ttlSeconds)
        .zadd(indexKey, score, snapshot.taskId)
        .expire(indexKey, this.ttlSeconds)
        .exec()

      await this.trimKbIndex(snapshot.kbId)
      return { duplicate: false, event } as const
    })

    if (stored?.duplicate) {
      return { duplicate: true }
    }

    return await this.fallback.ingest(event)
  }

  async getTaskStatuses(kbId: string): Promise<TaskStatusSnapshot[]> {
    if (!this.available) {
      return this.fallback.getTaskStatuses(kbId)
    }

    const snapshots = await this.tryRead(async () => {
      const indexKey = this.kbTaskIndexKey(kbId)
      const taskIds = await this.redis.zrevrange(indexKey, 0, this.maxTasksPerKb - 1)
      if (taskIds.length === 0) return []

      const pipeline = this.redis.pipeline()
      taskIds.forEach((taskId: string) => {
        pipeline.get(this.taskSnapshotKey(kbId, taskId))
      })

      const responses = await pipeline.exec()
      if (!responses) return []

      const result: TaskStatusSnapshot[] = []
      for (const entry of responses) {
        if (!entry || entry[0]) continue
        const payload = entry[1]
        if (typeof payload !== 'string') continue
        try {
          const parsed = JSON.parse(payload) as TaskStatusSnapshot
          result.push(parsed)
        } catch (error) {
          console.error('[task-event-store] invalid snapshot payload', {
            kbId,
            error: String(error)
          })
        }
      }

      return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    })

    if (!snapshots || snapshots.length === 0) {
      return this.fallback.getTaskStatuses(kbId)
    }

    return snapshots
  }

  async close() {
    await this.fallback.close()
    await this.redis.quit().catch(() => {
      // no-op
    })
  }

  private async ensureConnected() {
    if (this.redis.status === 'ready' || this.redis.status === 'connect') return
    await this.redis.connect()
  }

  private async tryWrite<T>(action: () => Promise<T>): Promise<T | null> {
    if (!this.available) return null
    try {
      await this.ensureConnected()
      return await action()
    } catch (error) {
      this.available = false
      console.error('[task-event-store] redis write failed, fallback to memory', {
        error: String(error)
      })
      return null
    }
  }

  private async tryRead<T>(action: () => Promise<T>): Promise<T | null> {
    if (!this.available) return null
    try {
      await this.ensureConnected()
      return await action()
    } catch (error) {
      this.available = false
      console.error('[task-event-store] redis read failed, fallback to memory', {
        error: String(error)
      })
      return null
    }
  }

  private async trimKbIndex(kbId: string) {
    const indexKey = this.kbTaskIndexKey(kbId)
    const count = await this.redis.zcard(indexKey)
    if (count <= this.maxTasksPerKb) return

    const overflow = count - this.maxTasksPerKb
    const removedTaskIds = await this.redis.zrange(indexKey, 0, overflow - 1)
    const pipeline = this.redis.pipeline()
    pipeline.zremrangebyrank(indexKey, 0, overflow - 1)
    removedTaskIds.forEach((taskId: string) => {
      pipeline.del(this.taskSnapshotKey(kbId, taskId))
    })
    await pipeline.exec()
  }

  private eventDedupKey(eventId: string) {
    return `${this.keyPrefix}:event:${eventId}`
  }

  private kbTaskIndexKey(kbId: string) {
    return `${this.keyPrefix}:kb:${kbId}:tasks`
  }

  private taskSnapshotKey(kbId: string, taskId: string) {
    return `${this.keyPrefix}:kb:${kbId}:task:${taskId}`
  }
}

export class TaskEventStore {
  private readonly backend: TaskEventStoreBackend

  constructor() {
    const config: TaskEventStoreConfig = {
      maxProcessedEventIds: Number(process.env.TASK_EVENT_STORE_MAX_EVENT_IDS ?? '10000'),
      maxTasksPerKb: Number(process.env.TASK_EVENT_STORE_MAX_TASKS_PER_KB ?? '2000'),
      snapshotTtlMs: Number(process.env.TASK_EVENT_STORE_TTL_MS ?? '86400000')
    }

    const driver = process.env.TASK_EVENT_STORE_DRIVER ?? 'memory'
    this.backend = driver === 'redis'
      ? new RedisTaskEventStoreBackend(config)
      : new InMemoryTaskEventStoreBackend(config)
  }

  async ingest(rawEvent: unknown): Promise<IngestResult> {
    const event = taskEventSchema.parse(rawEvent)
    return this.backend.ingest(event)
  }

  async getTaskStatuses(kbId: string): Promise<TaskStatusSnapshot[]> {
    return this.backend.getTaskStatuses(kbId)
  }

  async close() {
    await this.backend.close()
  }
}

function toSnapshot(event: TaskEvent): TaskStatusSnapshot {
  return {
    taskId: event.taskId,
    kbId: event.kbId,
    status: event.status,
    taskType: event.payload.taskType,
    error: event.payload.error,
    updatedAt: event.occurredAt,
    lastEventId: event.eventId
  }
}
