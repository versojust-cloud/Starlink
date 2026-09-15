/**
 * Unit tests for SupervisorService — pure-function helpers.
 *
 * classifyIntent requires an LLM, so it's exercised end-to-end via the
 * yc benchmark (not here). This file covers the pure routing predicate
 * + the cross-context prompt builder.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { SupervisorService } from './supervisor-service.js'
import type { BusinessStateType } from './state.js'

function makeState(over: Partial<BusinessStateType> = {}): BusinessStateType {
  return {
    traceId: 't',
    workspaceId: 'w',
    userId: 'u',
    question: 'q',
    contextPrompt: '',
    intent: null,
    roundNumber: 0,
    supervisorDirective: null,
    crossContext: { marketSummary: '', productSummary: '', financeSummary: '', consistencyNotes: '', consistencySummary: '' },
    knowledgeEvidence: [],
    generalNodes: [],
    marketNodes: [],
    productNodes: [],
    financeNodes: [],
    agentAvatars: [],
    conflicts: [],
    edges: [],
    moderatorVerdict: null,
    ...over
  } as BusinessStateType
}

const svc = new SupervisorService({
  model: null,
  buildWorkspaceContextPrompt: () => ''
})

// ---------- isAgentActive ----------

test('isAgentActive: returns true when no directive yet', () => {
  assert.equal(svc.isAgentActive(makeState(), 'marketAgent'), true)
})

test('isAgentActive: returns true when agent in activeAgents list', () => {
  const state = makeState({
    supervisorDirective: {
      activeAgents: ['marketAgent', 'productAgent'],
      guidance: '',
      conflictSummary: ''
    }
  })
  assert.equal(svc.isAgentActive(state, 'marketAgent'), true)
  assert.equal(svc.isAgentActive(state, 'productAgent'), true)
  assert.equal(svc.isAgentActive(state, 'financeAgent'), false)
})

test('isAgentActive: returns false on empty activeAgents', () => {
  const state = makeState({
    supervisorDirective: { activeAgents: [], guidance: '', conflictSummary: '' }
  })
  assert.equal(svc.isAgentActive(state, 'marketAgent'), false)
})

// ---------- buildCrossContextPrompt ----------

test('buildCrossContextPrompt: empty input → empty string', () => {
  assert.equal(svc.buildCrossContextPrompt(makeState(), 'market'), '')
})

test('buildCrossContextPrompt: includes supervisor guidance', () => {
  const state = makeState({
    supervisorDirective: {
      activeAgents: ['marketAgent'],
      guidance: '关注定价合理性',
      conflictSummary: ''
    }
  })
  const out = svc.buildCrossContextPrompt(state, 'market')
  assert.match(out, /Supervisor 修正指导/)
  assert.match(out, /关注定价合理性/)
})

test('buildCrossContextPrompt: excludes own agent summary', () => {
  const state = makeState({
    crossContext: {
      marketSummary: 'MARKET-S',
      productSummary: 'PRODUCT-S',
      financeSummary: 'FINANCE-S',
      consistencyNotes: '',
      consistencySummary: ''
    }
  })
  const market = svc.buildCrossContextPrompt(state, 'market')
  // Excludes market summary; includes others.
  assert.equal(market.includes('MARKET-S'), false)
  assert.equal(market.includes('PRODUCT-S'), true)
  assert.equal(market.includes('FINANCE-S'), true)

  const product = svc.buildCrossContextPrompt(state, 'product')
  assert.equal(product.includes('PRODUCT-S'), false)
  assert.equal(product.includes('MARKET-S'), true)
  assert.equal(product.includes('FINANCE-S'), true)
})

test('buildCrossContextPrompt: includes consistencyNotes when set', () => {
  const state = makeState({
    crossContext: {
      marketSummary: '',
      productSummary: '',
      financeSummary: '',
      consistencyNotes: '高端 vs 低价矛盾',
      consistencySummary: ''
    }
  })
  const out = svc.buildCrossContextPrompt(state, 'market')
  assert.match(out, /一致性报告/)
  assert.match(out, /高端 vs 低价矛盾/)
})
