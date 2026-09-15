import assert from 'node:assert/strict'
import test from 'node:test'
import type { Evidence } from '@starlink/shared'
import { computeGroundingRate, parseCitations } from './citation-parser.js'

function ev(id: string, docId: string, snippetId: string, text = 'evidence text'): Evidence {
  return {
    id,
    docId,
    snippetId,
    text,
    score: 0.8,
    metadata: { source: 'file', chunkIndex: 0 }
  }
}

test('empty string produces empty result', () => {
  const result = parseCitations('', [])
  assert.equal(result.cleanText, '')
  assert.equal(result.spans.length, 0)
  assert.equal(result.noRefRanges.length, 0)
  assert.equal(result.invalidRefs.length, 0)
})

test('plain text without citation tokens passes through unchanged', () => {
  const text = '这是一段没有引用的普通文本。'
  const result = parseCitations(text, [])
  assert.equal(result.cleanText, text)
  assert.equal(result.spans.length, 0)
  assert.equal(result.noRefRanges.length, 0)
})

test('single valid citation produces one span covering preceding phrase', () => {
  const evidences = [ev('e1', 'd1', 's1')]
  const raw = 'Z 世代是主力客群[[ref:d1#s1]]。'
  const result = parseCitations(raw, evidences)
  assert.equal(result.cleanText, 'Z 世代是主力客群。')
  assert.equal(result.spans.length, 1)
  const span = result.spans[0]
  assert.equal(span.textStart, 0)
  assert.equal(span.textEnd, 'Z 世代是主力客群'.length)
  assert.equal(span.refs.length, 1)
  assert.equal(span.refs[0].evidenceId, 'e1')
})

test('two adjacent refs with different evidence produce two spans', () => {
  const evidences = [ev('e1', 'd1', 's1'), ev('e2', 'd2', 's1')]
  const raw = '判断一[[ref:d1#s1]]判断二[[ref:d2#s1]]'
  const result = parseCitations(raw, evidences)
  assert.equal(result.cleanText, '判断一判断二')
  assert.equal(result.spans.length, 2)
  assert.equal(result.spans[0].refs[0].evidenceId, 'e1')
  assert.equal(result.spans[1].refs[0].evidenceId, 'e2')
})

test('adjacent spans sharing the same evidence are merged into one', () => {
  const evidences = [ev('e1', 'd1', 's1')]
  const raw = '一段[[ref:d1#s1]]另一段[[ref:d1#s1]]'
  const result = parseCitations(raw, evidences)
  assert.equal(result.cleanText, '一段另一段')
  assert.equal(result.spans.length, 1)
  assert.equal(result.spans[0].textStart, 0)
  assert.equal(result.spans[0].textEnd, '一段另一段'.length)
})

test('Chinese sentence terminator 。 bounds a span', () => {
  const evidences = [ev('e1', 'd1', 's1')]
  const raw = '上一句话。这一句话是有证据的[[ref:d1#s1]]。'
  const result = parseCitations(raw, evidences)
  assert.equal(result.cleanText, '上一句话。这一句话是有证据的。')
  assert.equal(result.spans.length, 1)
  const span = result.spans[0]
  assert.equal(span.textStart, '上一句话。'.length)
  assert.equal(span.textEnd, '上一句话。这一句话是有证据的'.length)
})

test('semicolon ； also bounds a span', () => {
  const evidences = [ev('e1', 'd1', 's1')]
  const raw = '先说一点；再说一点[[ref:d1#s1]]。'
  const result = parseCitations(raw, evidences)
  assert.equal(result.spans.length, 1)
  assert.equal(result.spans[0].textStart, '先说一点；'.length)
})

test('invalid ref (docId not in evidenceSet) is reported and downgraded to no-ref', () => {
  const evidences = [ev('e1', 'd1', 's1')]
  const raw = '编造的引用[[ref:d999#s999]]'
  const result = parseCitations(raw, evidences)
  assert.equal(result.cleanText, '编造的引用')
  assert.equal(result.spans.length, 0)
  assert.equal(result.noRefRanges.length, 1)
  assert.equal(result.invalidRefs.length, 1)
  assert.deepEqual(result.invalidRefs[0], { docId: 'd999', snippetId: 's999' })
})

test('no-ref marker standalone produces NoRefRange', () => {
  const raw = '这个判断没有支撑[[no-ref]]。'
  const result = parseCitations(raw, [])
  assert.equal(result.cleanText, '这个判断没有支撑。')
  assert.equal(result.noRefRanges.length, 1)
  assert.equal(result.noRefRanges[0].textStart, 0)
  assert.equal(result.noRefRanges[0].textEnd, '这个判断没有支撑'.length)
})

test('no-ref and valid ref mixed in the same text', () => {
  const evidences = [ev('e1', 'd1', 's1')]
  const raw = '第一条有证据[[ref:d1#s1]]。第二条无证据[[no-ref]]。'
  const result = parseCitations(raw, evidences)
  assert.equal(result.cleanText, '第一条有证据。第二条无证据。')
  assert.equal(result.spans.length, 1)
  assert.equal(result.noRefRanges.length, 1)
})

test('token at start of text (no preceding phrase) yields empty-range span', () => {
  const evidences = [ev('e1', 'd1', 's1')]
  const raw = '[[ref:d1#s1]]后面是正文。'
  const result = parseCitations(raw, evidences)
  assert.equal(result.cleanText, '后面是正文。')
  assert.equal(result.spans.length, 1)
  assert.equal(result.spans[0].textStart, 0)
  assert.equal(result.spans[0].textEnd, 0)
})

test('token at end of text after sentence body', () => {
  const evidences = [ev('e1', 'd1', 's1')]
  const raw = '整句话都是要引用的[[ref:d1#s1]]'
  const result = parseCitations(raw, evidences)
  assert.equal(result.cleanText, '整句话都是要引用的')
  assert.equal(result.spans[0].textStart, 0)
  assert.equal(result.spans[0].textEnd, '整句话都是要引用的'.length)
})

test('malformed token with whitespace is not recognized', () => {
  const raw = '这里[[ref: d1#s1]]是错误格式'
  const result = parseCitations(raw, [])
  // token with space is NOT matched, so it stays as-is in cleanText
  assert.equal(result.cleanText, raw)
  assert.equal(result.spans.length, 0)
  assert.equal(result.invalidRefs.length, 0)
})

test('snippetId with dashes and underscores is valid', () => {
  const evidences = [ev('e1', 'doc-42', 'chunk_5')]
  const raw = 'Z 世代[[ref:doc-42#chunk_5]]'
  const result = parseCitations(raw, evidences)
  assert.equal(result.spans.length, 1)
  assert.equal(result.spans[0].refs[0].evidenceId, 'e1')
})

test('multiple paragraphs separated by newline form independent spans', () => {
  const evidences = [ev('e1', 'd1', 's1'), ev('e2', 'd2', 's1')]
  const raw = '段落一内容[[ref:d1#s1]]\n段落二内容[[ref:d2#s1]]'
  const result = parseCitations(raw, evidences)
  assert.equal(result.spans.length, 2)
  assert.equal(result.spans[0].textEnd, '段落一内容'.length)
  // span 2 starts after newline, not at 0
  assert.equal(result.spans[1].textStart, '段落一内容\n'.length)
})

test('long text with 3 refs and 1 no-ref produces correct counts', () => {
  const evidences = [
    ev('e1', 'd1', 's1'),
    ev('e2', 'd1', 's2'),
    ev('e3', 'd2', 's1')
  ]
  const raw =
    '主力客群是 Z 世代都市青年[[ref:d1#s1]]，集中在一二线城市[[ref:d1#s2]]，品牌敏感度较强[[ref:d2#s1]]。该群体消费能力较父辈提升约 30%[[no-ref]]。'
  const result = parseCitations(raw, evidences)
  assert.equal(result.spans.length, 3)
  assert.equal(result.noRefRanges.length, 1)
  assert.equal(result.invalidRefs.length, 0)
})

test('computeGroundingRate is 0 for empty text', () => {
  const result = parseCitations('', [])
  assert.equal(computeGroundingRate(result), 0)
})

test('computeGroundingRate is 1 when entire text is covered by a single span', () => {
  const evidences = [ev('e1', 'd1', 's1')]
  const raw = '整段被引用[[ref:d1#s1]]'
  const result = parseCitations(raw, evidences)
  assert.equal(computeGroundingRate(result), 1)
})

test('computeGroundingRate is between 0 and 1 for partial coverage', () => {
  const evidences = [ev('e1', 'd1', 's1')]
  const raw = '前半段[[ref:d1#s1]]。后半段没有引用。'
  const result = parseCitations(raw, evidences)
  const rate = computeGroundingRate(result)
  assert.ok(rate > 0 && rate < 1, `expected 0 < rate < 1, got ${rate}`)
})
