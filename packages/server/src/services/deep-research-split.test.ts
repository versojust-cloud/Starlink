/**
 * Phase 2.6 · tests for the deep-research markdown splitter that turns one
 * LLM blob into the (核心结论, 详细分析) pair the canvas renders as two
 * insight-note cards.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { splitDeepResearchSections } from './business-langgraph.js'

test('empty input returns empty pair', () => {
  const r = splitDeepResearchSections('')
  assert.equal(r.summary, '')
  assert.equal(r.detail, '')
})

test('whitespace-only input returns empty pair', () => {
  const r = splitDeepResearchSections('   \n\n   ')
  assert.equal(r.summary, '')
  assert.equal(r.detail, '')
})

test('canonical two-section markdown splits cleanly', () => {
  const raw = `## 核心结论
新能源汽车赛道头部集中。市场份额前 5 占 70%。

## 详细分析
2023-2025 销量翻倍。

电池成本下降 40%。

竞争格局加剧。
`
  const r = splitDeepResearchSections(raw)
  assert.match(r.summary, /头部集中/)
  assert.match(r.summary, /70%/)
  assert.match(r.detail, /销量翻倍/)
  assert.match(r.detail, /竞争格局加剧/)
  assert.equal(r.summary.includes('## 详细分析'), false)
  assert.equal(r.detail.includes('## 核心结论'), false)
})

test('only summary section present, detail is empty', () => {
  const raw = `## 核心结论
只有结论没有详情。`
  const r = splitDeepResearchSections(raw)
  assert.match(r.summary, /只有结论没有详情/)
  assert.equal(r.detail, '')
})

test('only detail section present, summary is empty', () => {
  const raw = `## 详细分析
只有详情。`
  const r = splitDeepResearchSections(raw)
  assert.equal(r.summary, '')
  assert.match(r.detail, /只有详情/)
})

test('no headers — fallback splits first paragraph as summary, rest as detail', () => {
  const raw = `这是 1-2 句结论摘要。

第一段详细分析。

第二段详细分析。`
  const r = splitDeepResearchSections(raw)
  assert.match(r.summary, /这是 1-2 句结论摘要/)
  assert.match(r.detail, /第一段详细分析/)
  assert.match(r.detail, /第二段详细分析/)
})

test('no headers + single paragraph — all goes to summary, detail empty', () => {
  const raw = '只有一段，没有详情。'
  const r = splitDeepResearchSections(raw)
  assert.match(r.summary, /只有一段/)
  assert.equal(r.detail, '')
})

test('headers in reverse order still parse correctly', () => {
  const raw = `## 详细分析
详情段落。

## 核心结论
结论段落。`
  const r = splitDeepResearchSections(raw)
  assert.match(r.summary, /结论段落/)
  assert.match(r.detail, /详情段落/)
})

test('citation tokens inside split sections are preserved (not stripped here)', () => {
  // The splitter is a pure markdown operation; the citation pipeline runs
  // afterwards in business-langgraph.applyCitationParsing.
  const raw = `## 核心结论
头部集中[[ref:d1#s1]]。

## 详细分析
具体细节[[ref:d1#s2]]。`
  const r = splitDeepResearchSections(raw)
  assert.match(r.summary, /\[\[ref:d1#s1\]\]/)
  assert.match(r.detail, /\[\[ref:d1#s2\]\]/)
})
