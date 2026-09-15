/**
 * P11.18 · tokenizeForLexical unit tests.
 *
 * Verifies the tokenizer used by hybrid retrieval. The tokenizer feeds
 * into a `unnest($tokens::text[]) WHERE content ILIKE '%' || t || '%'`
 * subquery, so any change in tokens directly changes recall — these
 * tests pin the contract.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokenizeForLexical } from './kb-store.js'

test('tokenizeForLexical: extracts Latin words ≥ 3 chars, lowercased', () => {
  const tokens = tokenizeForLexical('Stripe API Pricing v3')
  assert.deepEqual(tokens.sort(), ['api', 'pricing', 'stripe'].sort())
  // 'v3' is 2 chars → filtered.
})

test('tokenizeForLexical: drops Latin tokens shorter than 3 chars', () => {
  const tokens = tokenizeForLexical('a b c hi yes ok')
  // 'hi' (2), 'ok' (2) drop; 'yes' (3) stays.
  assert.deepEqual(tokens, ['yes'])
})

test('tokenizeForLexical: produces CJK 2-char bigrams', () => {
  const tokens = tokenizeForLexical('订阅服务')
  // 订阅, 阅服, 服务 — all 3 bigrams.
  assert.deepEqual(tokens, ['订阅', '阅服', '服务'])
})

test('tokenizeForLexical: mixes Latin words + CJK bigrams', () => {
  const tokens = tokenizeForLexical('SaaS 订阅 pricing')
  // SaaS → saas, pricing → pricing
  // 订阅 → bigram 订阅
  assert.ok(tokens.includes('saas'))
  assert.ok(tokens.includes('pricing'))
  assert.ok(tokens.includes('订阅'))
})

test('tokenizeForLexical: deduplicates repeated terms', () => {
  const tokens = tokenizeForLexical('stripe stripe stripe')
  assert.deepEqual(tokens, ['stripe'])
})

test('tokenizeForLexical: empty / whitespace input returns empty array', () => {
  assert.deepEqual(tokenizeForLexical(''), [])
  assert.deepEqual(tokenizeForLexical('   '), [])
})

test('tokenizeForLexical: ignores punctuation', () => {
  const tokens = tokenizeForLexical('hello, world! foo-bar')
  assert.ok(tokens.includes('hello'))
  assert.ok(tokens.includes('world'))
  assert.ok(tokens.includes('foo'))
  assert.ok(tokens.includes('bar'))
})

test('tokenizeForLexical: single CJK char produces no bigrams (need 2+)', () => {
  const tokens = tokenizeForLexical('订')
  assert.deepEqual(tokens, [])
})
