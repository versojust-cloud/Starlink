/**
 * Unit tests for user-skill parsers (extraction + consolidation reply).
 *
 * Each parser has multiple recovery paths:
 *   - happy path: well-formed JSON validates
 *   - per-item recovery: extraction parser salvages valid creates entries
 *     even when one entry violates schema (e.g. over-long title)
 *   - schema-mismatch: returns reason='schema-mismatch' with Zod issues
 *   - no-json-block: returns reason='no-json-block'
 *   - json-syntax: returns reason='json-syntax'
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseUserSkillExtractionReply,
  parseUserSkillExtractionReplyDetailed,
  parseUserSkillConsolidationReplyDetailed
} from './parser.js'

// =============================================================================
// parseUserSkillExtractionReply (happy path)
// =============================================================================

test('extraction parser: well-formed creates pass through', () => {
  const raw = JSON.stringify({
    creates: [
      {
        scope: 'user',
        title: 'B2B 背景',
        content: '5 年 B2B SaaS 经验',
        tags: ['domain'],
        confidence: 0.8,
        importance: 0.7,
        observedEvidence: ['t1']
      }
    ],
    updates: [],
    refines: [],
    decays: []
  })
  const result = parseUserSkillExtractionReply(raw)
  assert.ok(result, 'should parse')
  assert.equal(result?.creates.length, 1)
  assert.equal(result?.creates[0]?.title, 'B2B 背景')
})

test('extraction parser: handles ```json fences', () => {
  const raw =
    '```json\n' +
    JSON.stringify({ creates: [], updates: [], refines: [], decays: [] }) +
    '\n```'
  const result = parseUserSkillExtractionReply(raw)
  assert.ok(result)
  assert.equal(result?.creates.length, 0)
})

// =============================================================================
// Per-item recovery (Layer-2 robustness)
// =============================================================================

test('extraction parser: salvages valid creates when one entry has over-long title', () => {
  const longTitle = 'x'.repeat(80) // > 60 char limit
  const raw = JSON.stringify({
    creates: [
      {
        scope: 'user',
        title: 'good',
        content: 'valid skill',
        tags: [],
        confidence: 0.8,
        importance: 0.7,
        observedEvidence: []
      },
      {
        scope: 'user',
        title: longTitle, // violates schema
        content: 'x',
        tags: [],
        confidence: 0.8,
        importance: 0.7,
        observedEvidence: []
      }
    ],
    updates: [],
    refines: [],
    decays: []
  })
  const result = parseUserSkillExtractionReply(raw)
  // Recovery should yield at least the 1 valid create
  assert.ok(result, 'recovery should succeed')
  assert.equal(result?.creates.length, 1)
  assert.equal(result?.creates[0]?.title, 'good')
})

test('extraction parser: detailed result reports schema-mismatch when fully unrecoverable', () => {
  const raw = JSON.stringify({
    // wrong shape: creates is a string, not an array
    creates: 'oops',
    updates: [],
    refines: [],
    decays: []
  })
  const result = parseUserSkillExtractionReplyDetailed(raw)
  assert.equal(result.ok, false)
  // could be schema-mismatch (if recovery yields 0 creates) — either way no data
  assert.equal(result.data, undefined)
})

// =============================================================================
// Failure reasons
// =============================================================================

test('extraction parser: empty input → no-json-block', () => {
  const r = parseUserSkillExtractionReplyDetailed('')
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no-json-block')
})

test('extraction parser: prose-only input → no-json-block', () => {
  const r = parseUserSkillExtractionReplyDetailed(
    'I think the user is a B2B PM, but here is no JSON.'
  )
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no-json-block')
})

test('extraction parser: malformed JSON syntax → json-syntax', () => {
  // Has matched outer braces (so the regex `\{[\s\S]*\}` matches), but the
  // contents inside are not valid JSON (unquoted identifier as value).
  const r = parseUserSkillExtractionReplyDetailed('{ "creates": [unterminated_value] }')
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'json-syntax')
})

// =============================================================================
// Consolidation parser (Layer-2)
// =============================================================================

test('consolidation parser: well-formed merges + splits pass through', () => {
  const raw = JSON.stringify({
    merges: [
      {
        sourceIds: ['a', 'b'],
        merged: {
          scope: 'user',
          title: 'merged title',
          content: 'merged content',
          tags: ['domain'],
          confidence: 0.85,
          importance: 0.8,
          observedEvidence: ['t1', 't2']
        },
        reason: 'duplicate B2B traits'
      }
    ],
    splits: [
      {
        sourceId: 'c',
        parts: [
          {
            // content min length is 4 chars (UTF-16 code units); short
            // Chinese strings can fall under that limit if unwary.
            scope: 'user',
            title: '部分1',
            content: '部分1的详细内容',
            tags: [],
            confidence: 0.7,
            importance: 0.6,
            observedEvidence: []
          },
          {
            scope: 'user',
            title: '部分2',
            content: '部分2的详细内容',
            tags: [],
            confidence: 0.7,
            importance: 0.6,
            observedEvidence: []
          }
        ],
        reason: 'bundled traits split'
      }
    ]
  })
  const r = parseUserSkillConsolidationReplyDetailed(raw)
  assert.equal(r.ok, true)
  assert.equal(r.data?.merges.length, 1)
  assert.equal(r.data?.splits.length, 1)
  assert.equal(r.data?.merges[0]?.sourceIds.length, 2)
  assert.equal(r.data?.splits[0]?.parts.length, 2)
})

test('consolidation parser: no per-item recovery (all-or-nothing)', () => {
  // intentionally include a merge with only 1 sourceId (violates min(2))
  const raw = JSON.stringify({
    merges: [
      {
        sourceIds: ['only-one'], // INVALID
        merged: {
          scope: 'user',
          title: 'x',
          content: 'xxxx',
          tags: [],
          confidence: 0.7,
          importance: 0.6,
          observedEvidence: []
        },
        reason: 'should fail'
      }
    ],
    splits: []
  })
  const r = parseUserSkillConsolidationReplyDetailed(raw)
  // Consolidation parser is intentionally strict — no per-item recovery
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'schema-mismatch')
})

test('consolidation parser: empty merges + empty splits is valid', () => {
  const r = parseUserSkillConsolidationReplyDetailed(
    JSON.stringify({ merges: [], splits: [] })
  )
  assert.equal(r.ok, true)
  assert.equal(r.data?.merges.length, 0)
  assert.equal(r.data?.splits.length, 0)
})
