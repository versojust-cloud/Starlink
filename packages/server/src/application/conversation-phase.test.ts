import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canTransition,
  assertTransition,
  InvalidPhaseTransitionError,
  isActivePhase,
  isTerminalPhase,
  CONVERSATION_PHASES,
  type ConversationPhase
} from './conversation-phase.js'

test('CONVERSATION_PHASES contains exactly the 10 defined phases', () => {
  const expected: ConversationPhase[] = [
    'idle',
    'initializing',
    'retrieving-evidence',
    'analyzing',
    'critic-review',
    'awaiting-hitl',
    'revising',
    'done',
    'failed',
    'cancelled'
  ]
  assert.deepEqual([...CONVERSATION_PHASES], expected)
})

test('isTerminalPhase returns true only for done / failed / cancelled', () => {
  assert.equal(isTerminalPhase('done'), true)
  assert.equal(isTerminalPhase('failed'), true)
  assert.equal(isTerminalPhase('cancelled'), true)
  assert.equal(isTerminalPhase('idle'), false)
  assert.equal(isTerminalPhase('analyzing'), false)
  assert.equal(isTerminalPhase('awaiting-hitl'), false)
})

test('isActivePhase returns true for in-flight phases only', () => {
  assert.equal(isActivePhase('initializing'), true)
  assert.equal(isActivePhase('retrieving-evidence'), true)
  assert.equal(isActivePhase('analyzing'), true)
  assert.equal(isActivePhase('critic-review'), true)
  assert.equal(isActivePhase('awaiting-hitl'), true)
  assert.equal(isActivePhase('revising'), true)
  assert.equal(isActivePhase('idle'), false)
  assert.equal(isActivePhase('done'), false)
  assert.equal(isActivePhase('failed'), false)
})

test('happy path: idle → initializing → retrieving-evidence → analyzing → critic-review → done', () => {
  const path: ConversationPhase[] = [
    'idle',
    'initializing',
    'retrieving-evidence',
    'analyzing',
    'critic-review',
    'done'
  ]
  for (let i = 0; i < path.length - 1; i++) {
    assert.equal(canTransition(path[i], path[i + 1]), true, `${path[i]} → ${path[i + 1]}`)
  }
})

test('no-KB path: initializing → analyzing (skip retrieving-evidence)', () => {
  assert.equal(canTransition('initializing', 'analyzing'), true)
})

test('HITL revision loop: critic-review → awaiting-hitl → revising → critic-review', () => {
  assert.equal(canTransition('critic-review', 'awaiting-hitl'), true)
  assert.equal(canTransition('awaiting-hitl', 'revising'), true)
  assert.equal(canTransition('revising', 'critic-review'), true)
})

test('HITL skip: awaiting-hitl → done', () => {
  assert.equal(canTransition('awaiting-hitl', 'done'), true)
})

test('HITL cancel: awaiting-hitl → cancelled', () => {
  assert.equal(canTransition('awaiting-hitl', 'cancelled'), true)
})

test('any active phase can transition to failed', () => {
  const active: ConversationPhase[] = [
    'initializing',
    'retrieving-evidence',
    'analyzing',
    'critic-review',
    'awaiting-hitl',
    'revising'
  ]
  for (const p of active) {
    assert.equal(canTransition(p, 'failed'), true, `${p} → failed`)
  }
})

test('any active phase can transition to cancelled', () => {
  const active: ConversationPhase[] = [
    'initializing',
    'retrieving-evidence',
    'analyzing',
    'critic-review',
    'awaiting-hitl',
    'revising'
  ]
  for (const p of active) {
    assert.equal(canTransition(p, 'cancelled'), true, `${p} → cancelled`)
  }
})

test('idle cannot jump directly to analyzing', () => {
  assert.equal(canTransition('idle', 'analyzing'), false)
})

test('done cannot transition to anything', () => {
  for (const to of CONVERSATION_PHASES) {
    if (to === 'done') continue
    assert.equal(canTransition('done', to), false, `done → ${to} should be blocked`)
  }
})

test('failed cannot transition to anything', () => {
  for (const to of CONVERSATION_PHASES) {
    if (to === 'failed') continue
    assert.equal(canTransition('failed', to), false, `failed → ${to} should be blocked`)
  }
})

test('analyzing cannot skip critic-review to go to done', () => {
  assert.equal(canTransition('analyzing', 'done'), false)
})

test('idle cannot be cancelled (no active work to cancel)', () => {
  assert.equal(canTransition('idle', 'cancelled'), false)
})

test('idle cannot fail (no active work to fail)', () => {
  assert.equal(canTransition('idle', 'failed'), false)
})

test('assertTransition throws InvalidPhaseTransitionError on illegal transition', () => {
  assert.throws(
    () => assertTransition('idle', 'done'),
    (err: unknown) => {
      return err instanceof InvalidPhaseTransitionError
        && err.from === 'idle'
        && err.to === 'done'
    }
  )
})

test('assertTransition is silent on legal transition', () => {
  assert.doesNotThrow(() => assertTransition('idle', 'initializing'))
})
