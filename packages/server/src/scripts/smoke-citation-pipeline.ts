/**
 * Smoke: Citation pipeline end-to-end (synthetic LLM output).
 *
 * Validates that, given:
 *   1. A KnowledgeEvidence[] set with derived snippetIds
 *   2. Simulated agent output containing [[ref:docId#snippetId]] / [[no-ref]]
 * the parser produces correctly aligned CitationSpan[], clean text,
 * and a groundingRate > 0.
 *
 * This does NOT hit any LLM — it exercises the deterministic parser path
 * that is the innovation core (docs/architecture-evidence-grounded-bmc.md §6).
 *
 * Run:  pnpm --filter @starlink/server run build && \
 *       node dist/scripts/smoke-citation-pipeline.js
 */

import assert from 'node:assert/strict'
import { deriveSnippetId, type Evidence } from '@starlink/shared'
import {
  computeGroundingRate,
  parseCitations
} from '../services/citation/citation-parser.js'

async function main() {
  console.log('[smoke-citation-pipeline] start')

  // --- Step 1. 模拟 KB 检索结果 ---
  const evidenceRaw = [
    {
      docId: 'd42',
      snippet:
        '18-26 岁的 Z 世代展现出强烈的品牌认同需求,消费能力较父辈提升 30% 以上。',
      score: 0.89,
      metadata: { source: 'file' as const, chunkIndex: 3, title: '新能源行业白皮书' }
    },
    {
      docId: 'd8',
      snippet: '一二线城市新能源车接受度显著高于下沉市场。',
      score: 0.76,
      metadata: { source: 'file' as const, chunkIndex: 1, title: '市场渗透分析' }
    }
  ]

  // --- Step 2. 派生 snippetId(模拟 ConversationStore 的逻辑)---
  const evidenceSet: Evidence[] = evidenceRaw.map((r) => {
    const snippetId = deriveSnippetId(r.docId, r.metadata, r.snippet)
    return {
      id: `${r.docId}-${snippetId}`,
      docId: r.docId,
      snippetId,
      text: r.snippet,
      score: r.score,
      metadata: r.metadata
    }
  })

  console.log('[smoke-citation-pipeline] derived evidence:', evidenceSet.map((e) => ({
    id: e.id,
    docId: e.docId,
    snippetId: e.snippetId
  })))

  assert.equal(evidenceSet[0].snippetId, 'chunk-3', 'snippetId derivation for d42 chunk 3')
  assert.equal(evidenceSet[1].snippetId, 'chunk-1', 'snippetId derivation for d8 chunk 1')

  // --- Step 3. 模拟 LLM 输出(带 citation 标记)---
  const rawAgentOutput =
    '主力客群是 Z 世代都市青年[[ref:d42#chunk-3]],集中在一二线城市[[ref:d8#chunk-1]]。该群体消费能力较父辈提升约 30%[[no-ref]]。此外还存在一条虚构引用[[ref:d999#chunk-x]]以测试降级。'

  console.log('[smoke-citation-pipeline] raw agent output:')
  console.log('  ', rawAgentOutput)

  // --- Step 4. 跑 Parser ---
  const result = parseCitations(rawAgentOutput, evidenceSet)
  const groundingRate = computeGroundingRate(result)

  console.log('[smoke-citation-pipeline] parse result:')
  console.log('  cleanText:', result.cleanText)
  console.log('  spans:', result.spans.length)
  console.log('  noRefRanges:', result.noRefRanges.length)
  console.log('  invalidRefs:', result.invalidRefs)
  console.log('  groundingRate:', groundingRate.toFixed(3))

  // --- Step 5. 断言 ---
  assert.equal(result.spans.length, 2, 'exactly 2 valid citations (d42, d8)')
  assert.equal(
    result.invalidRefs.length,
    1,
    'exactly 1 invalidRef (the fabricated d999 reference)'
  )
  assert.deepEqual(
    result.invalidRefs[0],
    { docId: 'd999', snippetId: 'chunk-x' },
    'invalidRef correctly identifies the fabricated ref'
  )
  assert.ok(
    result.noRefRanges.length >= 2,
    'no-ref count >= 2 (explicit [[no-ref]] + downgraded invalid ref)'
  )

  assert.ok(
    groundingRate > 0 && groundingRate < 1,
    `groundingRate in (0, 1) — got ${groundingRate}`
  )

  assert.ok(
    !result.cleanText.includes('[[ref:'),
    'cleanText must strip [[ref:...]] tokens'
  )
  assert.ok(
    !result.cleanText.includes('[[no-ref]]'),
    'cleanText must strip [[no-ref]] tokens'
  )

  // --- Step 6. 验证 span refs 指向正确 evidence ---
  const firstSpan = result.spans[0]
  assert.equal(firstSpan.refs[0].docId, 'd42', 'first span references d42')
  assert.equal(firstSpan.refs[0].snippetId, 'chunk-3', 'first span snippetId = chunk-3')
  assert.equal(
    firstSpan.refs[0].evidenceId,
    'd42-chunk-3',
    'first span evidenceId matches'
  )

  console.log('[smoke-citation-pipeline] ✅ all assertions passed')
}

main().catch((error) => {
  console.error('[smoke-citation-pipeline] FAILED', error)
  process.exit(1)
})
