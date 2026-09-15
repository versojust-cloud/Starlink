/**
 * Execution Cache — caches node outputs in Redis, falls back to in-memory Map.
 */

import type { Redis as RedisClient } from 'ioredis'

const DEFAULT_TTL = 3600 // 1 hour

export class ExecutionCache {
  private redis: RedisClient | null = null
  private memory = new Map<string, string>()

  constructor(redis?: RedisClient) {
    this.redis = redis ?? null
  }

  private key(executionId: string, nodeId: string): string {
    return `exec:${executionId}:node:${nodeId}`
  }

  async get(executionId: string, nodeId: string): Promise<unknown | null> {
    const k = this.key(executionId, nodeId)

    if (this.redis) {
      try {
        const val = await this.redis.get(k)
        return val ? JSON.parse(val) : null
      } catch {
        // fall through to memory
      }
    }

    const val = this.memory.get(k)
    return val ? JSON.parse(val) : null
  }

  async set(executionId: string, nodeId: string, output: unknown, ttl = DEFAULT_TTL): Promise<void> {
    const k = this.key(executionId, nodeId)
    const serialized = JSON.stringify(output)

    if (this.redis) {
      try {
        await this.redis.setex(k, ttl, serialized)
        return
      } catch {
        // fall through to memory
      }
    }

    this.memory.set(k, serialized)
  }

  async invalidate(executionId: string): Promise<void> {
    const prefix = `exec:${executionId}:`

    if (this.redis) {
      try {
        const keys = await this.redis.keys(`${prefix}*`)
        if (keys.length > 0) await this.redis.del(...keys)
        return
      } catch {
        // fall through
      }
    }

    for (const key of this.memory.keys()) {
      if (key.startsWith(prefix)) this.memory.delete(key)
    }
  }
}
