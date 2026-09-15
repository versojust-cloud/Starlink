/**
 * Apollo Server 4 plugin: per-user token-bucket rate limit.
 *
 * In-memory Map keyed by userId. Single-instance only — for multi-instance, swap to Redis.
 * Defaults to 60 req/min, refilled continuously. Configurable via env:
 *   RATE_LIMIT_PER_MIN  (default 60)
 *   RATE_LIMIT_BURST    (default = capacity = RATE_LIMIT_PER_MIN)
 *
 * Skips rate limiting for the special "anonymous" user only when AUTH_MODE=disabled (dev mode).
 */

import type { ApolloServerPlugin } from '@apollo/server'
import { GraphQLError } from 'graphql'
import type { GraphQLContext } from '../context/index.js'

type Bucket = {
  tokens: number
  lastRefillMs: number
}

const buckets = new Map<string, Bucket>()

function readEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function rateLimitPlugin(): ApolloServerPlugin<GraphQLContext> {
  const perMinute = readEnvNumber('RATE_LIMIT_PER_MIN', 60)
  const capacity = readEnvNumber('RATE_LIMIT_BURST', perMinute)
  const refillPerMs = perMinute / 60_000
  const authMode = (process.env.AUTH_MODE ?? 'disabled').toLowerCase()

  return {
    async requestDidStart(requestContext) {
      return {
        async didResolveOperation() {
          const userId = requestContext.contextValue?.userId
          if (!userId) return
          if (userId === 'anonymous' && authMode === 'disabled') return // dev convenience

          const now = Date.now()
          let bucket = buckets.get(userId)
          if (!bucket) {
            bucket = { tokens: capacity, lastRefillMs: now }
            buckets.set(userId, bucket)
          }
          // Refill.
          const elapsed = now - bucket.lastRefillMs
          if (elapsed > 0) {
            bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs)
            bucket.lastRefillMs = now
          }
          if (bucket.tokens < 1) {
            const retryAfterSec = Math.ceil((1 - bucket.tokens) / (refillPerMs * 1000))
            throw new GraphQLError(
              `Rate limit exceeded for user ${userId} (>${perMinute} req/min)`,
              {
                extensions: {
                  code: 'RATE_LIMITED',
                  retryAfterSec,
                  limit: perMinute,
                  http: { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
                }
              }
            )
          }
          bucket.tokens -= 1
        }
      }
    }
  }
}

/** Test helper — clears all buckets. Not exported in production code paths. */
export function __resetRateLimitBuckets(): void {
  buckets.clear()
}
