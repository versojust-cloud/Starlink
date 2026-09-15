/**
 * Regression test for `parseHumanDecision` from agents/critic/graph.ts.
 *
 * The HITL flow takes a raw resume value (delivered via LangGraph's
 * `Command({ resume: '...' })` API) and parses it into a typed
 * CriticHumanDecision. The smoke test (smoke-hitl-langgraph.ts) caught a
 * delimiter-stripping bug in the EDIT_PLAN path on first run; this file
 * locks the fix in place + covers the other paths.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
// Import from parser.js directly (NOT graph.js). graph.js triggers the
// `ready` IIFE on import, which loads agent.yaml + builds an LLM model —
// neither is available in the dist/-based test runner. parser.js has no
// module-level side effects.
import { parseHumanDecision } from './parser.js'

test('parseHumanDecision: ACCEPTED → kind=accepted', () => {
  const r = parseHumanDecision('[ACCEPTED]')
  assert.deepEqual(r, { kind: 'accepted' })
})

test('parseHumanDecision: ACCEPTED with trailing text → still accepted', () => {
  const r = parseHumanDecision('[ACCEPTED] with optional comment')
  assert.equal(r.kind, 'accepted')
})

test('parseHumanDecision: EDIT_PLAN strips delimiter colon', () => {
  // Bug fixed in commit be7ef9d — the leading ':' delimiter must not
  // appear in the parsed plan.
  const r = parseHumanDecision('[EDIT_PLAN]:plan content here')
  assert.equal(r.kind, 'edit_plan')
  if (r.kind === 'edit_plan') {
    assert.equal(r.plan, 'plan content here')
  }
})

test('parseHumanDecision: EDIT_PLAN with fullwidth colon (Chinese IME) handled', () => {
  // Chinese input methods commonly produce '：' (fullwidth) instead of ':'.
  // The regex strips both forms.
  const r = parseHumanDecision('[EDIT_PLAN]：改用中端定价')
  assert.equal(r.kind, 'edit_plan')
  if (r.kind === 'edit_plan') {
    assert.equal(r.plan, '改用中端定价')
  }
})

test('parseHumanDecision: EDIT_PLAN with no colon (just whitespace)', () => {
  const r = parseHumanDecision('[EDIT_PLAN] freeform plan')
  assert.equal(r.kind, 'edit_plan')
  if (r.kind === 'edit_plan') {
    assert.equal(r.plan, 'freeform plan')
  }
})

test('parseHumanDecision: unknown marker → rejected', () => {
  const r = parseHumanDecision('something random')
  assert.deepEqual(r, { kind: 'rejected' })
})

test('parseHumanDecision: non-string input → none', () => {
  assert.deepEqual(parseHumanDecision(undefined), { kind: 'none' })
  assert.deepEqual(parseHumanDecision(null), { kind: 'none' })
  assert.deepEqual(parseHumanDecision(42), { kind: 'none' })
  assert.deepEqual(parseHumanDecision({}), { kind: 'none' })
})
