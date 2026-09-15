import assert from 'node:assert/strict'
import test from 'node:test'
import {
  agentNodeForBmcDomain,
  buildCompactBmcCardContext,
  deriveBmcSummaryTags,
  formatBmcSummaryContent,
  renderCompactBmcCardsForPrompt,
  validateNineBmcDimensions
} from './business-langgraph.js'

type TestCard = {
  id: string
  type: string
  domain?: string
  label?: string
  content?: string
}

const CC_BMC_DIMENSIONS = [
  '客户细分',
  '渠道通路',
  '客户关系',
  '价值主张',
  '核心资源',
  '关键业务',
  '重要合作',
  '收入来源',
  '成本结构'
] as const

function card(domain: string): TestCard {
  return {
    id: `test-${domain}`,
    type: 'cc-bmc-card',
    domain,
    label: domain,
    content: `analysis for ${domain}`
  }
}

test('validateNineBmcDimensions: returns empty for a complete 9-dim graph', () => {
  const nodes = CC_BMC_DIMENSIONS.map(card)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.deepEqual(validateNineBmcDimensions(nodes as any), [])
})

test('validateNineBmcDimensions: detects Key Partnerships missing', () => {
  const withoutPartnerships = CC_BMC_DIMENSIONS.filter((d) => d !== '重要合作').map(card)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const missing = validateNineBmcDimensions(withoutPartnerships as any)
  assert.deepEqual(missing, ['重要合作'])
})

test('validateNineBmcDimensions: detects multiple missing dimensions', () => {
  const partial = [card('客户细分'), card('价值主张'), card('收入来源')]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const missing = validateNineBmcDimensions(partial as any)
  assert.equal(missing.length, 6)
  assert.ok(missing.includes('渠道通路'))
  assert.ok(missing.includes('重要合作'))
  assert.ok(missing.includes('成本结构'))
})

test('validateNineBmcDimensions: ignores duplicate domains', () => {
  const dupCustomerSeg = [...CC_BMC_DIMENSIONS.map(card), card('客户细分'), card('客户细分')]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.deepEqual(validateNineBmcDimensions(dupCustomerSeg as any), [])
})

test('validateNineBmcDimensions: ignores non-BMC node types without domain', () => {
  const mixed: TestCard[] = [
    ...CC_BMC_DIMENSIONS.map(card),
    { id: 'critic-1', type: 'conflict-alert', label: 'conflict' },
    { id: 'note-1', type: 'insight-note', label: 'note' }
  ]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.deepEqual(validateNineBmcDimensions(mixed as any), [])
})

test('validateNineBmcDimensions: empty input returns all 9 dimensions as missing', () => {
  const missing = validateNineBmcDimensions([])
  assert.equal(missing.length, 9)
})

test('buildCompactBmcCardContext preserves structured claims instead of fixed-prefix truncation', () => {
  const content = [
    '## 核心判断',
    '- 第一条：目标客户不是泛泛的学生，而是假设集中在准备考研且愿意付费的高压学习人群。',
    '- 第二条：渠道依赖校园社群和学习博主，可能受平台规则变化影响。',
    '- 第三条：需要通过访谈和转化率数据验证真实付费意愿。',
    '- 第四条：如果只做通用聊天助手，差异化不足。'
  ].join('\n')

  const compact = buildCompactBmcCardContext({
    id: 'market-customer-segments',
    type: 'cc-bmc-card',
    domain: '客户细分',
    label: '考研学生',
    content,
    metadata: {
      agent_signature: 'Market_Agent',
      confidence: 'medium'
    }
  })

  assert.equal(compact.domain, '客户细分')
  assert.equal(compact.agentSignature, 'Market_Agent')
  assert.equal(compact.confidence, 'medium')
  assert.ok(compact.keyClaims.some((claim) => claim.includes('准备考研且愿意付费')))
  assert.ok(compact.assumptions.some((claim) => claim.includes('假设集中')))
  assert.ok(compact.risks.some((claim) => claim.includes('平台规则变化')))
})

// ============================================================================
// Stage 3 hygiene: BMC dim → agent node mapping (used by supervisor's
// coverage gate to bring back the right agent when a dim is missing)
// ============================================================================

test('agentNodeForBmcDomain: market dims route to marketAgent', () => {
  assert.equal(agentNodeForBmcDomain('客户细分'), 'marketAgent')
  assert.equal(agentNodeForBmcDomain('渠道通路'), 'marketAgent')
  assert.equal(agentNodeForBmcDomain('客户关系'), 'marketAgent')
})

test('agentNodeForBmcDomain: product dims route to productAgent', () => {
  assert.equal(agentNodeForBmcDomain('价值主张'), 'productAgent')
  assert.equal(agentNodeForBmcDomain('核心资源'), 'productAgent')
  assert.equal(agentNodeForBmcDomain('关键业务'), 'productAgent')
  assert.equal(agentNodeForBmcDomain('重要合作'), 'productAgent')
})

test('agentNodeForBmcDomain: finance dims route to financeAgent', () => {
  assert.equal(agentNodeForBmcDomain('收入来源'), 'financeAgent')
  assert.equal(agentNodeForBmcDomain('成本结构'), 'financeAgent')
})

test('agentNodeForBmcDomain: covers all 9 BMC dims (none returns null)', () => {
  for (const dim of CC_BMC_DIMENSIONS) {
    assert.ok(
      agentNodeForBmcDomain(dim) !== null,
      `BMC dim "${dim}" has no responsible agent — coverage gate would silently leave it unfilled`
    )
  }
})

// ============================================================================
// Stage 1 hygiene: BMC summary tag derivation
// ============================================================================

test('deriveBmcSummaryTags: bare run with no conflicts and partial coverage', () => {
  const tags = deriveBmcSummaryTags({ conflictCount: 0, dimsCovered: 4 })
  assert.deepEqual(tags, ['bmc-conversation'])
})

test('deriveBmcSummaryTags: had-conflicts fires when conflictCount > 0', () => {
  const tags = deriveBmcSummaryTags({ conflictCount: 1, dimsCovered: 4 })
  assert.deepEqual(tags, ['bmc-conversation', 'had-conflicts'])
})

test('deriveBmcSummaryTags: full-9-dim-coverage requires 9 distinct dims, not 9 nodes', () => {
  // Pre-fix bug: predicate was `bmcNodeCount >= 9`, so a run with 9
  // customer-segments nodes would falsely tag full coverage. New predicate
  // takes dimsCovered (Set size) — 8 dims is NOT full.
  const eightDims = deriveBmcSummaryTags({ conflictCount: 0, dimsCovered: 8 })
  assert.ok(!eightDims.includes('full-9-dim-coverage'))

  const nineDims = deriveBmcSummaryTags({ conflictCount: 2, dimsCovered: 9 })
  assert.deepEqual(nineDims, ['bmc-conversation', 'had-conflicts', 'full-9-dim-coverage'])
})

test('formatBmcSummaryContent: includes dim coverage as N/9', () => {
  const content = formatBmcSummaryContent({
    question: '分析考研助手 SaaS 的盈利模式',
    bmcNodeCount: 12,
    conflictCount: 2,
    dimsCovered: 7,
    durationMs: 18_500,
    handoffCount: 24
  })
  assert.match(content, /产出 12 个 BMC 节点/)
  assert.match(content, /冲突 2 条/)
  assert.match(content, /维度 7\/9/)
  assert.match(content, /18\.5s/)
  assert.match(content, /握手 24 次/)
})

test('formatBmcSummaryContent: truncates question past 120 chars', () => {
  const long = 'x'.repeat(200)
  const content = formatBmcSummaryContent({
    question: long,
    bmcNodeCount: 1,
    conflictCount: 0,
    dimsCovered: 1,
    durationMs: 100,
    handoffCount: 1
  })
  // Question slice of 120 chars should appear; the full 200-char version must not.
  assert.ok(content.includes('x'.repeat(120)))
  assert.ok(!content.includes('x'.repeat(121)))
})

test('renderCompactBmcCardsForPrompt includes evidence refs from parsed citation metadata', () => {
  const rendered = renderCompactBmcCardsForPrompt([
    {
      id: 'finance-revenue-streams',
      type: 'cc-bmc-card',
      domain: '收入来源',
      label: '订阅收入',
      content: '采用订阅收入，并通过企业版提高 ARPU。',
      metadata: {
        agent_signature: 'Finance_Agent',
        confidence: 'high',
        citations: [
          {
            textStart: 0,
            textEnd: 4,
            refs: [{ evidenceId: 'ev1', docId: 'doc-a', snippetId: 'chunk-1' }]
          }
        ]
      }
    }
  ])

  assert.match(rendered, /收入来源/)
  assert.match(rendered, /Finance_Agent/)
  assert.match(rendered, /doc-a#chunk-1/)
})
