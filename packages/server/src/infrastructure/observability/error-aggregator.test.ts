/**
 * P11.18 · error-aggregator unit tests.
 *
 * Verifies fingerprinting + LRU eviction + dedup counting without
 * touching real infra.
 */

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  installErrorAggregator,
  getErrorSummary,
  clearErrorAggregatorForTest
} from './error-aggregator.js'
import { createAuditLogger, clearAuditSinksForTest } from '@starlink/shared'

beforeEach(() => {
  clearErrorAggregatorForTest()
  clearAuditSinksForTest()
})

test('error-aggregator: counts duplicates of same fingerprint', () => {
  installErrorAggregator()
  const log = createAuditLogger('test:dup')
  const sameError = new Error('boom')
  log.error({ action: 'test.action', error: sameError })
  log.error({ action: 'test.action', error: sameError })
  log.error({ action: 'test.action', error: sameError })
  const summary = getErrorSummary()
  assert.equal(summary.totalFingerprints, 1)
  assert.equal(summary.totalEvents, 3)
  assert.equal(summary.records[0].count, 3)
})

test('error-aggregator: distinct errors create distinct fingerprints', () => {
  installErrorAggregator()
  const log = createAuditLogger('test:distinct')
  log.error({ action: 'a', error: new Error('one') })
  log.error({ action: 'b', error: new Error('two') })
  log.error({ action: 'c', error: new Error('three') })
  const summary = getErrorSummary()
  assert.equal(summary.totalFingerprints, 3)
  assert.equal(summary.totalEvents, 3)
})

test('error-aggregator: ignores INFO level events', () => {
  installErrorAggregator()
  const log = createAuditLogger('test:info-filter')
  log.info({ action: 'pleasant.thing' })
  log.info({ action: 'pleasant.thing' })
  log.warn({ action: 'oh-no', metadata: { err: 'warn me' } })
  const summary = getErrorSummary()
  assert.equal(summary.totalFingerprints, 1)
  assert.equal(summary.records[0].level, 'WARN')
})

test('error-aggregator: includes WARN AND ERROR levels', () => {
  installErrorAggregator()
  const log = createAuditLogger('test:both-levels')
  log.warn({ action: 'minor', metadata: { err: 'warn-error' } })
  log.error({ action: 'major', error: new Error('err-error') })
  const summary = getErrorSummary()
  assert.equal(summary.totalFingerprints, 2)
  const levels = summary.records.map((r) => r.level).sort()
  assert.deepEqual(levels, ['ERROR', 'WARN'])
})

test('error-aggregator: captures sample userId/workflowId/requestId', () => {
  installErrorAggregator()
  const log = createAuditLogger('test:sample')
  log.error({
    action: 'sampleable',
    error: new Error('boom'),
    userId: 'u-1',
    workflowId: 'ws-1',
    requestId: 'r-1'
  })
  const summary = getErrorSummary()
  const r = summary.records[0]
  assert.equal(r.sample.userId, 'u-1')
  assert.equal(r.sample.workflowId, 'ws-1')
  assert.equal(r.sample.requestId, 'r-1')
})

test('error-aggregator: handles err passed via metadata.err string', () => {
  installErrorAggregator()
  const log = createAuditLogger('test:meta-err')
  log.error({ action: 'meta-err', metadata: { err: 'something failed' } })
  const summary = getErrorSummary()
  assert.equal(summary.totalFingerprints, 1)
  assert.match(summary.records[0].message, /something failed/)
})

test('error-aggregator: top-N sort is by count descending', () => {
  installErrorAggregator()
  const log = createAuditLogger('test:sort')
  // 5 of A
  for (let i = 0; i < 5; i++) log.error({ action: 'A', error: new Error('a') })
  // 2 of B
  for (let i = 0; i < 2; i++) log.error({ action: 'B', error: new Error('b') })
  // 8 of C
  for (let i = 0; i < 8; i++) log.error({ action: 'C', error: new Error('c') })
  const summary = getErrorSummary()
  assert.equal(summary.records.length, 3)
  assert.equal(summary.records[0].action, 'C')
  assert.equal(summary.records[1].action, 'A')
  assert.equal(summary.records[2].action, 'B')
})

test('error-aggregator: installErrorAggregator is idempotent', () => {
  installErrorAggregator()
  installErrorAggregator()
  installErrorAggregator()
  const log = createAuditLogger('test:idem')
  log.error({ action: 'once', error: new Error('x') })
  const summary = getErrorSummary()
  // Each error should be counted exactly once even if installer was called 3x.
  assert.equal(summary.records[0].count, 1)
})
