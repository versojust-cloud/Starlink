/**
 * Per-(user, operation) rate limit for high-cost mutations.
 *
 * The general plugin in `rate-limit-plugin.ts` covers all GraphQL ops
 * with a single bucket per user (default 60/min). That's fine for
 * cheap reads but allows abuse on expensive mutations: e.g. a user
 * spamming `refreshUserSkills` could fire 60 DeepSeek extractions per
 * minute = ~$0.30/user/minute in API cost.
 *
 * This module exposes a fine-grained gate: each (userId, opName)
 * pair has its own bucket with caller-supplied limits. Resolvers
 * for expensive ops call `assertOperationRateLimit(...)` at the top
 * to fail-fast before any LLM work.
 *
 * In-memory only — sufficient for single-gateway deployments. For
 * multi-instance, swap the Map for Redis (TTL keys with INCR).
 */

import { GraphQLError } from 'graphql'

interface Bucket {
  /** Earliest timestamp (ms) the next op may run. */
  notBeforeMs: number
  /** Hits within the current window (for sliding-window-style ops). */
  hitsInWindow: number
  /** When the current window started. */
  windowStartMs: number
}

const buckets = new Map<string, Bucket>()

interface OperationLimit {
  /** Minimum gap between consecutive calls (ms). 0 = no min gap. */
  minIntervalMs?: number
  /** Max calls in the rolling window. 0 / undefined = no window cap. */
  maxInWindow?: number
  /** Window length (ms). Required when maxInWindow is set. */
  windowMs?: number
}

/**
 * Throw GraphQLError(RATE_LIMITED, retryAfterSec) when the caller
 * exceeds the configured limit. Side-effect: increments the counter
 * on success.
 *
 * @example
 *   assertOperationRateLimit(userId, 'refreshUserSkills', {
 *     minIntervalMs: 10_000,    // ≥ 10s between calls
 *     maxInWindow: 6,           // ≤ 6 per hour
 *     windowMs: 60 * 60_000
 *   })
 */
export function assertOperationRateLimit(
  userId: string,
  opName: string,
  limit: OperationLimit
): void {
  const key = `${userId}:${opName}`
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { notBeforeMs: 0, hitsInWindow: 0, windowStartMs: now }
    buckets.set(key, bucket)
  }

  // Sliding-window reset
  if (limit.windowMs && now - bucket.windowStartMs > limit.windowMs) {
    bucket.hitsInWindow = 0
    bucket.windowStartMs = now
  }

  // Min-interval check
  if (limit.minIntervalMs && now < bucket.notBeforeMs) {
    const retryAfterMs = bucket.notBeforeMs - now
    throw new GraphQLError(
      `Operation "${opName}" rate-limited: please wait ${Math.ceil(retryAfterMs / 1000)}s before retrying`,
      {
        extensions: {
          code: 'RATE_LIMITED',
          retryAfterSec: Math.ceil(retryAfterMs / 1000),
          operation: opName,
          http: { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
        }
      }
    )
  }

  // Window-cap check
  if (limit.maxInWindow && limit.windowMs && bucket.hitsInWindow >= limit.maxInWindow) {
    const retryAfterMs = limit.windowMs - (now - bucket.windowStartMs)
    throw new GraphQLError(
      `Operation "${opName}" rate-limited: max ${limit.maxInWindow} calls per ${Math.round(limit.windowMs / 1000)}s exceeded`,
      {
        extensions: {
          code: 'RATE_LIMITED',
          retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
          operation: opName,
          http: { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } }
        }
      }
    )
  }

  // Record success
  if (limit.minIntervalMs) {
    bucket.notBeforeMs = now + limit.minIntervalMs
  }
  if (limit.maxInWindow) {
    bucket.hitsInWindow += 1
  }
}

/** Test helper — clear all buckets between tests. */
export function __resetOperationRateLimitForTests(): void {
  buckets.clear()
}
