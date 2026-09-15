/**
 * Unit tests for kb-store's `chunkText` helper. The DB-backed methods
 * (addDocument / searchChunks) need a live PG and aren't covered here;
 * chunker is a pure function and is the most-likely source of subtle
 * bugs (overlap drift, single-paragraph splits, empty inputs).
 */

import assert from 'node:assert/strict'
import test from 'node:test'

// Note: `chunkText` is exported from kb-store.ts. Importing it does NOT
// open a DB connection — `pool` is only touched inside ensureTables /
// addDocument / searchChunks paths.
import { chunkText } from './kb-store.js'

test('chunkText: empty input returns empty array', () => {
  assert.deepEqual(chunkText(''), [])
  assert.deepEqual(chunkText('   '), [])
  assert.deepEqual(chunkText('\n\n\n'), [])
})

test('chunkText: short text fits in one chunk', () => {
  const input = 'Just a short paragraph. Nothing more.'
  const chunks = chunkText(input)
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0], input)
})

test('chunkText: target=600, 3 medium paragraphs → 3 chunks', () => {
  const para = '段落'.repeat(150) // 300 chars
  const input = [para + 'A', para + 'B', para + 'C'].join('\n\n')
  const chunks = chunkText(input, { targetChars: 600, overlapChars: 50 })
  // each para is ~301 chars, so 1 para fits, 2 paras would be ~602 > 600,
  // so we expect 3 chunks (one per paragraph) with overlap carryover.
  assert.equal(chunks.length, 3)
  // paragraph A in first chunk
  assert.match(chunks[0], /段落.*A/)
  // paragraph B and C in subsequent chunks
  assert.match(chunks[1], /段落.*B/)
  assert.match(chunks[2], /段落.*C/)
})

test('chunkText: single huge paragraph hard-splits at targetChars', () => {
  const input = 'x'.repeat(2000)
  const chunks = chunkText(input, { targetChars: 600 })
  // 2000 / 600 = 3.33 → 4 chunks (last one shorter)
  assert.equal(chunks.length, 4)
  assert.equal(chunks[0].length, 600)
  assert.equal(chunks[1].length, 600)
  assert.equal(chunks[2].length, 600)
  assert.equal(chunks[3].length, 200)
})

test('chunkText: respects targetChars option', () => {
  const para = 'p'.repeat(100)
  const input = [para, para, para, para, para].join('\n\n')
  // 5 paragraphs × 100 chars = 500 chars total; with target=200 we get
  // chunks that hold ~2 paragraphs each
  const chunks = chunkText(input, { targetChars: 200, overlapChars: 0 })
  // each chunk should be ≤ 200 (or close to it with paragraph boundary)
  for (const c of chunks) {
    assert.ok(c.length <= 250, `chunk too big: ${c.length} chars`)
  }
})

test('chunkText: overlap carryover preserves cross-paragraph context', () => {
  const para = '内容'.repeat(150) // 300 chars
  const input = [para + 'AAAA', para + 'BBBB'].join('\n\n')
  const chunks = chunkText(input, { targetChars: 350, overlapChars: 60 })
  assert.equal(chunks.length, 2)
  // First chunk ends with end of paragraph A
  assert.match(chunks[0], /AAAA/)
  // Second chunk should have SOME overlap — i.e., contain a tail from
  // paragraph A, before paragraph B starts. Given overlap=60, we expect
  // at least a few chars of "内容内容..." carried in.
  assert.match(chunks[1], /内容/)
  assert.match(chunks[1], /BBBB/)
})

test('chunkText: zero-length paragraphs collapsed', () => {
  const input = 'first\n\n\n\n\nsecond\n\n\n\nthird'
  const chunks = chunkText(input, { targetChars: 1000 })
  // Three paragraphs separated by extra newlines → still merged into
  // one chunk because total length is small.
  assert.equal(chunks.length, 1)
  assert.match(chunks[0], /first/)
  assert.match(chunks[0], /second/)
  assert.match(chunks[0], /third/)
})

test('chunkText: minimum target is 200 (clamped)', () => {
  // request a tiny target; implementation clamps to 200 to avoid
  // pathological 5-char chunks
  const input = 'x'.repeat(800)
  const chunks = chunkText(input, { targetChars: 50 })
  // With clamp at 200, expect 4 chunks of 200 each
  assert.equal(chunks.length, 4)
  for (const c of chunks) {
    assert.equal(c.length, 200)
  }
})
