import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalisePrefillItem,
  parsePrefillReply,
} from './wizard-prefill-service.js'

// ============== parsePrefillReply ==============

test('parsePrefillReply: parses plain JSON with items array', () => {
  const raw = JSON.stringify({
    items: [
      { step: 'core-idea', status: 'covered', draftAnswer: 'A', citations: [], confidence: 0.9 },
    ],
  })
  const result = parsePrefillReply(raw)
  assert.ok(result)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].step, 'core-idea')
})

test('parsePrefillReply: strips ```json fences before parsing', () => {
  const raw = '```json\n{"items":[{"step":"risk","status":"absent"}]}\n```'
  const result = parsePrefillReply(raw)
  assert.ok(result)
  assert.equal(result.items[0].step, 'risk')
})

test('parsePrefillReply: extracts first JSON block from prose surround', () => {
  const raw = '这是分析结果：\n{"items":[{"step":"revenue","status":"partial"}]}\n以上。'
  const result = parsePrefillReply(raw)
  assert.ok(result)
  assert.equal(result.items[0].step, 'revenue')
})

test('parsePrefillReply: returns null on non-JSON prose', () => {
  assert.equal(parsePrefillReply('I cannot parse this'), null)
})

test('parsePrefillReply: returns null on empty string', () => {
  assert.equal(parsePrefillReply(''), null)
})

test('parsePrefillReply: returns null when items is not an array', () => {
  const raw = JSON.stringify({ items: 'not-an-array' })
  assert.equal(parsePrefillReply(raw), null)
})

// ============== normalisePrefillItem ==============

test('normalisePrefillItem: clamps confidence to [0, 1]', () => {
  const above = normalisePrefillItem({ step: 'a', status: 'covered', draftAnswer: '', citations: [], confidence: 1.7 })
  const below = normalisePrefillItem({ step: 'a', status: 'covered', draftAnswer: '', citations: [], confidence: -0.3 })
  assert.equal(above.confidence, 1)
  assert.equal(below.confidence, 0)
})

test('normalisePrefillItem: defaults invalid status to absent', () => {
  const item = normalisePrefillItem({ step: 'x', status: 'banana', draftAnswer: '', citations: [], confidence: 0.5 })
  assert.equal(item.status, 'absent')
})

test('normalisePrefillItem: truncates draftAnswer at 600 chars', () => {
  const longAnswer = 'a'.repeat(800)
  const item = normalisePrefillItem({ step: 'x', status: 'covered', draftAnswer: longAnswer, citations: [], confidence: 0.9 })
  assert.equal(item.draftAnswer.length, 600)
})

test('normalisePrefillItem: caps citations at 2 + truncates snippets at 200 chars', () => {
  const cites = [
    { docId: 'd1', snippet: 'x'.repeat(300) },
    { docId: 'd2', snippet: 'y' },
    { docId: 'd3', snippet: 'z' },
  ]
  const item = normalisePrefillItem({
    step: 'x', status: 'covered', draftAnswer: '',
    citations: cites, confidence: 0.5,
  })
  assert.equal(item.citations.length, 2)
  assert.equal(item.citations[0].snippet.length, 200)
})

test('normalisePrefillItem: drops citations missing docId or snippet', () => {
  const cites = [
    { docId: 'd1', snippet: 'good' },
    { docId: 'd2' },              // missing snippet
    { snippet: 'orphan' },        // missing docId
    null,
  ] as unknown[]
  const item = normalisePrefillItem({
    step: 'x', status: 'covered', draftAnswer: '',
    citations: cites, confidence: 0.5,
  })
  assert.equal(item.citations.length, 1)
  assert.equal(item.citations[0].docId, 'd1')
})

test('normalisePrefillItem: handles totally malformed input', () => {
  const item = normalisePrefillItem({ wrong: 'shape' })
  assert.equal(item.step, '')
  assert.equal(item.status, 'absent')
  assert.equal(item.draftAnswer, '')
  assert.equal(item.citations.length, 0)
  assert.equal(item.confidence, 0)
})
