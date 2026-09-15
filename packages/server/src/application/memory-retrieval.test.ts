/**
 * Unit tests for the salience formula in MemoryRetrievalService.
 *
 * Run via: pnpm --filter @starlink/server test
 *
 * These exercise the pure `computeSalience` function (no DB / no LLM).
 * The formula is the canonical citation-ready math from P14 §3.4 / docs
 * `memory-and-session-layered.md` §10.5.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { computeSalience } from './memory-retrieval.js'

test('salience: all components at 1.0 with query → score = 1.0', () => {
  const { score, breakdown } = computeSalience({
    cosine: 1,
    ageDays: 0,        // recency = exp(0) = 1
    layer: 'workspace',
    importance: 1,
    confidence: 1
  })
  assert.equal(breakdown.cosine, 1)
  assert.equal(breakdown.recency, 1)
  assert.equal(breakdown.importance, 1)
  assert.equal(breakdown.confidence, 1)
  // 0.40 + 0.20 + 0.20 + 0.20 = 1.00
  assert.equal(Number(score.toFixed(4)), 1.0000)
})

test('salience: default weights (0.4 / 0.2 / 0.2 / 0.2) sum to 1', () => {
  const { score } = computeSalience({
    cosine: 0.5,
    ageDays: 0,
    layer: 'workspace',
    importance: 0.5,
    confidence: 0.5
  })
  // Expected: 0.4*0.5 + 0.2*1.0 + 0.2*0.5 + 0.2*0.5 = 0.2 + 0.2 + 0.1 + 0.1 = 0.6
  assert.equal(Number(score.toFixed(4)), 0.6)
})

test('salience: when cosine is null, 0.4 weight redistributes to remaining 3', () => {
  const { score, breakdown } = computeSalience({
    cosine: null,        // no queryText
    ageDays: 0,
    layer: 'workspace',
    importance: 1,
    confidence: 1
  })
  // wCosine=0; sumRest=0.6; scale = 1/0.6 = 1.6667
  // wRecency = wImp = wConf = 0.2 * 1.6667 = 0.3333
  // 3 * 0.3333 * 1 = 1.0
  assert.equal(breakdown.cosine, 0)
  assert.equal(Number(score.toFixed(4)), 1.0000)
})

test('salience: layer-specific TAU controls recency decay', () => {
  // session layer: TAU = 1 day → recency at 1 day = exp(-1) ≈ 0.368
  const sessionResult = computeSalience({
    cosine: null, ageDays: 1, layer: 'session',
    importance: 0, confidence: 0
  })
  assert.equal(Number(sessionResult.breakdown.recency.toFixed(3)), 0.368)

  // workspace layer: TAU = 14 days → recency at 14 days = exp(-1) ≈ 0.368
  const wsResult = computeSalience({
    cosine: null, ageDays: 14, layer: 'workspace',
    importance: 0, confidence: 0
  })
  assert.equal(Number(wsResult.breakdown.recency.toFixed(3)), 0.368)

  // user layer: TAU = 90 days → recency at 14 days ≈ exp(-14/90) ≈ 0.856
  const userResult = computeSalience({
    cosine: null, ageDays: 14, layer: 'user',
    importance: 0, confidence: 0
  })
  assert.equal(Number(userResult.breakdown.recency.toFixed(3)), 0.856)

  // global layer: TAU = ∞ → recency always 1
  const globalResult = computeSalience({
    cosine: null, ageDays: 1000, layer: 'global',
    importance: 0, confidence: 0
  })
  assert.equal(globalResult.breakdown.recency, 1)
})

test('salience: importance / confidence clamped to [0, 1]', () => {
  const { breakdown } = computeSalience({
    cosine: 0,
    ageDays: 0,
    layer: 'workspace',
    importance: 1.5,    // out of range
    confidence: -0.3    // out of range
  })
  assert.equal(breakdown.importance, 1)
  assert.equal(breakdown.confidence, 0)
})

test('salience: ageDays < 0 treated as 0 (future timestamps)', () => {
  const { breakdown } = computeSalience({
    cosine: 0,
    ageDays: -100,      // future last_used? clock skew?
    layer: 'workspace',
    importance: 0,
    confidence: 0
  })
  assert.equal(breakdown.recency, 1)   // exp(0) = 1
})

test('salience: custom weights override defaults', () => {
  const { score } = computeSalience({
    cosine: 1,
    ageDays: 0,
    layer: 'workspace',
    importance: 1,
    confidence: 1,
    weights: { cosine: 1, recency: 0, importance: 0, confidence: 0 }
  })
  // Expected: 1 * 1 + 0 + 0 + 0 = 1
  assert.equal(score, 1)
})

test('salience: custom TAU overrides defaults', () => {
  const { breakdown } = computeSalience({
    cosine: null,
    ageDays: 5,
    layer: 'workspace',
    importance: 0,
    confidence: 0,
    tauDaysByLayer: { workspace: 5 }
  })
  // exp(-5/5) = exp(-1) ≈ 0.368
  assert.equal(Number(breakdown.recency.toFixed(3)), 0.368)
})

test('salience: ranking is monotonic in cosine when other components equal', () => {
  const baseInput = {
    ageDays: 0,
    layer: 'workspace' as const,
    importance: 0.5,
    confidence: 0.5
  }
  const low = computeSalience({ ...baseInput, cosine: 0.1 })
  const mid = computeSalience({ ...baseInput, cosine: 0.5 })
  const high = computeSalience({ ...baseInput, cosine: 0.9 })
  assert.ok(low.score < mid.score, `low ${low.score} < mid ${mid.score}`)
  assert.ok(mid.score < high.score, `mid ${mid.score} < high ${high.score}`)
})

test('salience: ranking is monotonic in recency when other components equal', () => {
  const baseInput = {
    cosine: 0.5,
    layer: 'workspace' as const,
    importance: 0.5,
    confidence: 0.5
  }
  const fresh = computeSalience({ ...baseInput, ageDays: 0 })
  const week = computeSalience({ ...baseInput, ageDays: 7 })
  const month = computeSalience({ ...baseInput, ageDays: 30 })
  assert.ok(fresh.score > week.score)
  assert.ok(week.score > month.score)
})

test('salience: zero-input edge case → score = 0 with cosine=0', () => {
  const { score } = computeSalience({
    cosine: 0,
    ageDays: 1e9,        // ancient
    layer: 'workspace',
    importance: 0,
    confidence: 0
  })
  // recency ≈ 0 for huge ageDays; all components ≈ 0
  assert.ok(score < 0.001)
})
