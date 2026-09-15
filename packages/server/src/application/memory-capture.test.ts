/**
 * Unit tests for the canonical-axes derivation in MemoryCaptureService /
 * ConversationMemoryStore.
 *
 * Run via: pnpm --filter @starlink/server test
 *
 * Exercises the legacy → canonical mapping rules from migration 016
 * backfill: every legacy (scope, kind) pair MUST map to a unique
 * (layer, facet, category) triple.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveCanonicalAxes } from './conversation-memory-store.js'

test('deriveCanonicalAxes: passthrough when caller supplies all 3 axes', () => {
  const result = deriveCanonicalAxes({
    layer: 'session',
    facet: 'episodic',
    category: 'chat-message'
  })
  assert.deepEqual(result, {
    layer: 'session',
    facet: 'episodic',
    category: 'chat-message'
  })
})

test('deriveCanonicalAxes: kind=summary → episodic / bmc-summary', () => {
  const r = deriveCanonicalAxes({ scope: 'workspace', kind: 'summary' })
  assert.equal(r.layer, 'workspace')
  assert.equal(r.facet, 'episodic')
  assert.equal(r.category, 'bmc-summary')
})

test('deriveCanonicalAxes: kind=canvas → episodic / canvas-snapshot', () => {
  const r = deriveCanonicalAxes({ scope: 'workspace', kind: 'canvas' })
  assert.equal(r.facet, 'episodic')
  assert.equal(r.category, 'canvas-snapshot')
})

test('deriveCanonicalAxes: kind=decision → episodic / decision', () => {
  const r = deriveCanonicalAxes({ scope: 'workspace', kind: 'decision' })
  assert.equal(r.facet, 'episodic')
  assert.equal(r.category, 'decision')
})

test('deriveCanonicalAxes: kind=user-skill, scope=user → user / semantic / user-skill', () => {
  const r = deriveCanonicalAxes({ scope: 'user', kind: 'user-skill' })
  assert.equal(r.layer, 'user')
  assert.equal(r.facet, 'semantic')
  assert.equal(r.category, 'user-skill')
})

test('deriveCanonicalAxes: scope=workspace → layer=workspace', () => {
  const r = deriveCanonicalAxes({ scope: 'workspace', kind: 'summary' })
  assert.equal(r.layer, 'workspace')
})

test('deriveCanonicalAxes: scope=user → layer=user', () => {
  const r = deriveCanonicalAxes({ scope: 'user', kind: 'user-skill' })
  assert.equal(r.layer, 'user')
})

test('deriveCanonicalAxes: defaults applied when both scope+kind missing', () => {
  const r = deriveCanonicalAxes({})
  // Defaults to scope='workspace' + kind='summary'
  assert.equal(r.layer, 'workspace')
  assert.equal(r.facet, 'episodic')
  assert.equal(r.category, 'bmc-summary')
})

test('deriveCanonicalAxes: explicit layer overrides scope-derived layer', () => {
  const r = deriveCanonicalAxes({
    layer: 'session',
    scope: 'workspace',
    kind: 'summary'
  })
  // Even when caller supplies explicit `layer` alongside legacy
  // `scope`+`kind`, the explicit value wins — the fallback path uses
  // `input.layer ?? scope-derived`, so non-null input.layer always
  // takes precedence. facet+category are derived from kind.
  assert.equal(r.layer, 'session')
  assert.equal(r.facet, 'episodic')   // from kind=summary
  assert.equal(r.category, 'bmc-summary')
})

test('deriveCanonicalAxes: bidirectional mapping is consistent for live values', () => {
  // For each currently-used (kind, scope) combination, the derivation
  // should produce a non-empty (facet, category) and the layer should
  // match the scope mapping.
  const cases: Array<{
    scope: 'user' | 'workspace'
    kind: 'summary' | 'canvas' | 'decision' | 'user-skill'
    expectLayer: 'user' | 'workspace'
    expectFacet: 'episodic' | 'semantic'
    expectCategory: string
  }> = [
    { scope: 'workspace', kind: 'summary', expectLayer: 'workspace', expectFacet: 'episodic', expectCategory: 'bmc-summary' },
    { scope: 'workspace', kind: 'canvas',  expectLayer: 'workspace', expectFacet: 'episodic', expectCategory: 'canvas-snapshot' },
    { scope: 'workspace', kind: 'decision', expectLayer: 'workspace', expectFacet: 'episodic', expectCategory: 'decision' },
    { scope: 'user', kind: 'user-skill',   expectLayer: 'user',      expectFacet: 'semantic', expectCategory: 'user-skill' }
  ]
  for (const c of cases) {
    const r = deriveCanonicalAxes({ scope: c.scope, kind: c.kind })
    assert.equal(r.layer, c.expectLayer, `scope=${c.scope} layer mismatch`)
    assert.equal(r.facet, c.expectFacet, `kind=${c.kind} facet mismatch`)
    assert.equal(r.category, c.expectCategory, `kind=${c.kind} category mismatch`)
  }
})
