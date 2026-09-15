import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertOperationRateLimit,
  __resetOperationRateLimitForTests
} from './operation-rate-limit.js'

test.beforeEach(() => __resetOperationRateLimitForTests())

test('operation-rate-limit: under min-interval throws RATE_LIMITED', () => {
  assertOperationRateLimit('user-A', 'refresh', { minIntervalMs: 10_000 })
  // Second call immediately should throw
  assert.throws(() => {
    assertOperationRateLimit('user-A', 'refresh', { minIntervalMs: 10_000 })
  }, /rate-limited/)
})

test('operation-rate-limit: different users have independent buckets', () => {
  assertOperationRateLimit('user-A', 'refresh', { minIntervalMs: 10_000 })
  // user-B should not be blocked by user-A's call
  assertOperationRateLimit('user-B', 'refresh', { minIntervalMs: 10_000 })
})

test('operation-rate-limit: different operations have independent buckets', () => {
  assertOperationRateLimit('user-A', 'opX', { minIntervalMs: 10_000 })
  // Same user, different operation → not blocked
  assertOperationRateLimit('user-A', 'opY', { minIntervalMs: 10_000 })
})

test('operation-rate-limit: window cap enforces maxInWindow', () => {
  for (let i = 0; i < 3; i++) {
    assertOperationRateLimit('user-A', 'corr', {
      maxInWindow: 3,
      windowMs: 60_000
    })
  }
  assert.throws(() => {
    assertOperationRateLimit('user-A', 'corr', {
      maxInWindow: 3,
      windowMs: 60_000
    })
  }, /max 3 calls/)
})

test('operation-rate-limit: error carries extensions code RATE_LIMITED + retryAfterSec', () => {
  assertOperationRateLimit('user-A', 'op', { minIntervalMs: 5_000 })
  try {
    assertOperationRateLimit('user-A', 'op', { minIntervalMs: 5_000 })
    assert.fail('should have thrown')
  } catch (err: unknown) {
    const ext = (err as { extensions: Record<string, unknown> }).extensions
    assert.equal(ext.code, 'RATE_LIMITED')
    assert.equal(typeof ext.retryAfterSec, 'number')
    assert.ok((ext.retryAfterSec as number) >= 1)
  }
})

test('operation-rate-limit: empty options is no-op', () => {
  // No minInterval, no window → unlimited
  for (let i = 0; i < 100; i++) {
    assertOperationRateLimit('user-A', 'free', {})
  }
})
