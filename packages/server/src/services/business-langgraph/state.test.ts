/**
 * Unit tests for the BusinessState contract (P15 S1).
 *
 * Pins the contract to the runtime Annotation.spec — guards against
 * silent drift when slots are added without contract entries.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BusinessState,
  BUSINESS_STATE_CONTRACT,
  assertBusinessStateContractInSync
} from './state.js'

test('BUSINESS_STATE_CONTRACT covers every Annotation slot exactly once', () => {
  const annotationKeys = new Set(Object.keys(BusinessState.spec))
  const contractKeys = new Set(BUSINESS_STATE_CONTRACT.map((f) => f.slot))

  // Every annotation slot must appear in the contract.
  for (const k of annotationKeys) {
    assert.ok(
      contractKeys.has(k),
      `Annotation slot "${k}" is missing from BUSINESS_STATE_CONTRACT`
    )
  }
  // Every contract entry must reference a real annotation slot.
  for (const k of contractKeys) {
    assert.ok(
      annotationKeys.has(k),
      `Contract slot "${k}" doesn't exist in BusinessState`
    )
  }
  // Each contract entry must be unique (no duplicate slot keys).
  const slotsArr = BUSINESS_STATE_CONTRACT.map((f) => f.slot)
  assert.equal(
    new Set(slotsArr).size,
    slotsArr.length,
    'duplicate slot in BUSINESS_STATE_CONTRACT'
  )
})

test('assertBusinessStateContractInSync does not throw on current contract', () => {
  assert.doesNotThrow(() => assertBusinessStateContractInSync())
})

test('every contract entry has non-empty writers and readers arrays', () => {
  for (const field of BUSINESS_STATE_CONTRACT) {
    assert.ok(
      field.writers.length > 0,
      `${field.slot} has no writers documented`
    )
    assert.ok(
      field.readers.length > 0,
      `${field.slot} has no readers documented`
    )
  }
})

test('every contract entry has a description ≥ 20 chars', () => {
  for (const field of BUSINESS_STATE_CONTRACT) {
    assert.ok(
      field.description.length >= 20,
      `${field.slot} description too short: "${field.description}"`
    )
  }
})

test('reducer values are constrained to known set', () => {
  const allowed = new Set(['last-write-wins', 'merge-by-id'])
  for (const field of BUSINESS_STATE_CONTRACT) {
    assert.ok(
      allowed.has(field.reducer),
      `${field.slot} has unknown reducer "${field.reducer}"`
    )
  }
})

test('cell-array slots use merge-by-id reducer', () => {
  const expectMergeById = ['marketNodes', 'productNodes', 'financeNodes', 'agentAvatars', 'edges']
  for (const slot of expectMergeById) {
    const field = BUSINESS_STATE_CONTRACT.find((f) => f.slot === slot)
    assert.ok(field, `expected contract entry for ${slot}`)
    assert.equal(
      field.reducer,
      'merge-by-id',
      `${slot} should use merge-by-id reducer (silently losing prior round's nodes is the bug we fixed in P11.13/T4.4)`
    )
  }
})
