/**
 * Unit tests for SynthesisService — rule-based synthesis output helpers.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { SynthesisService, computeBMCEdgesForCells } from './synthesis-service.js'
import type { BusinessStateType, MacraNodeData } from './state.js'

function makeBmcCell(over: Partial<MacraNodeData> & { id: string; domain: string; content?: string }): MacraNodeData {
  return {
    id: over.id,
    type: 'cc-bmc-card',
    label: over.id,
    content: over.content ?? '',
    domain: over.domain as MacraNodeData['domain'],
    metadata: {}
  }
}

function makeState(over: Partial<BusinessStateType> = {}): BusinessStateType {
  return {
    traceId: 't', workspaceId: 'w', userId: 'u', question: 'q', contextPrompt: '',
    intent: null, roundNumber: 0, supervisorDirective: null,
    crossContext: { marketSummary: '', productSummary: '', financeSummary: '', consistencyNotes: '', consistencySummary: '' },
    knowledgeEvidence: [], generalNodes: [], marketNodes: [], productNodes: [],
    financeNodes: [], agentAvatars: [], conflicts: [], edges: [],
    moderatorVerdict: null, ...over
  } as BusinessStateType
}

const svc = new SynthesisService()

test('buildAgentAvatars: empty state → no avatars', () => {
  assert.equal(svc.buildAgentAvatars(makeState()).length, 0)
})

test('buildAgentAvatars: 1 avatar per domain with nodes', () => {
  const state = makeState({
    marketNodes: [makeBmcCell({ id: 'mc1', domain: '客户细分', content: '北美 SMB' })],
    productNodes: [makeBmcCell({ id: 'pp1', domain: '价值主张', content: '数据中台' })]
  })
  const avatars = svc.buildAgentAvatars(state)
  assert.equal(avatars.length, 2)
  assert.ok(avatars.some((a) => a.id === 'avatar-market'))
  assert.ok(avatars.some((a) => a.id === 'avatar-product'))
  assert.ok(!avatars.some((a) => a.id === 'avatar-finance'))
})

test('buildCrossContext: no nodes → empty consistency notes', () => {
  const ctx = svc.buildCrossContext(makeState())
  assert.equal(ctx.consistencyNotes, '')
})

test('buildCrossContext: high-end + low-price → flags conflict', () => {
  const state = makeState({
    marketNodes: [makeBmcCell({ id: 'm1', domain: '客户细分', content: '高端中产' })],
    financeNodes: [makeBmcCell({ id: 'f1', domain: '收入来源', content: '低价订阅' })]
  })
  const ctx = svc.buildCrossContext(state)
  assert.match(ctx.consistencyNotes, /定价与客户定位/)
})

test('buildCrossContext: heavy + light asset → flags conflict', () => {
  const state = makeState({
    productNodes: [
      makeBmcCell({ id: 'p1', domain: '核心资源', content: '自建工厂生产线' }),
      makeBmcCell({ id: 'p2', domain: '关键业务', content: '轻资产平台外包' })
    ]
  })
  const ctx = svc.buildCrossContext(state)
  assert.match(ctx.consistencyNotes, /资源模型矛盾/)
})

// ---------- computeBMCEdgesForCells ----------

test('computeBMCEdgesForCells: full 9 cells → all 9 canonical edges', () => {
  const cells: MacraNodeData[] = [
    '价值主张', '客户细分', '渠道通路', '客户关系', '收入来源',
    '核心资源', '关键业务', '重要合作', '成本结构'
  ].map((domain, i) => makeBmcCell({ id: `c${i}`, domain }))
  const edges = computeBMCEdgesForCells(cells)
  // 9 edges: VP→CS, CH→CS, CR→CS, KR→VP, KA→VP, CS→REV, KR→COST, KA→COST, KP→KR
  assert.equal(edges.length, 9)
  for (const e of edges) {
    assert.equal(e.kind, 'bmc-structure')
  }
})

test('computeBMCEdgesForCells: partial → partial edges', () => {
  // Only customer-segments + value-proposition → 1 edge (VP→CS)
  const cells: MacraNodeData[] = [
    makeBmcCell({ id: 'a', domain: '客户细分' }),
    makeBmcCell({ id: 'b', domain: '价值主张' })
  ]
  const edges = computeBMCEdgesForCells(cells)
  assert.equal(edges.length, 1)
  assert.equal(edges[0].source, 'b')
  assert.equal(edges[0].target, 'a')
  assert.equal(edges[0].label, '服务于')
})

test('computeBMCEdgesForCells: empty → empty', () => {
  assert.equal(computeBMCEdgesForCells([]).length, 0)
})

test('buildBMCEdges via SynthesisService matches free function', () => {
  const cells: MacraNodeData[] = [
    makeBmcCell({ id: 'c1', domain: '价值主张' }),
    makeBmcCell({ id: 'c2', domain: '客户细分' })
  ]
  const state = makeState({ marketNodes: [cells[1]], productNodes: [cells[0]] })
  const fromService = svc.buildBMCEdges(state)
  const fromFree = computeBMCEdgesForCells([...state.marketNodes, ...state.productNodes, ...state.financeNodes])
  assert.deepEqual(fromService, fromFree)
})
