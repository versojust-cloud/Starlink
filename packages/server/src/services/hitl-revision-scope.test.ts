/**
 * Phase 2.6 · supervisor-level HITL revision scope tests.
 *
 * Builds a BusinessLangGraphService with `model = null` to skip the LLM
 * guidance rewrite, sets a directive via the public API, then drives the
 * private `runSupervisor` through the revision-round path (roundNumber > 0)
 * and verifies the resulting `supervisorDirective.activeAgents` and
 * `guidance` honour the directive.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { BusinessLangGraphService, type BusinessStateType } from './business-langgraph.js'
import type { HitlResumeDirective } from '../application/hitl-resume.js'

type SupervisorOut = {
  roundNumber: number
  conflicts: unknown[]
  supervisorDirective: { activeAgents: string[]; guidance: string; conflictSummary: string }
}

function buildState(overrides: Partial<BusinessStateType> = {}): BusinessStateType {
  return {
    traceId: 'trace-1',
    workspaceId: 'ws-1',
    userId: 'user-1',
    question: '',
    contextPrompt: '',
    intent: { intent: 'analyze_business', confidence: 1, reasoning: '' } as unknown as BusinessStateType['intent'],
    roundNumber: 1,                       // revision round, not first
    supervisorDirective: null,
    crossContext: {
      marketSummary: '', productSummary: '', financeSummary: '', consistencyNotes: ''
    } as unknown as BusinessStateType['crossContext'],
    knowledgeEvidence: [],
    generalNodes: [],
    marketNodes: [],
    productNodes: [],
    financeNodes: [],
    agentAvatars: [],
    conflicts: [
      {
        id: 'c1',
        label: 'fake conflict',
        content: 'placeholder',
        type: 'conflict-alert',
        severity: 'high',
        relatedAgents: ['Market_Agent']
      } as unknown as BusinessStateType['conflicts'][number]
    ],
    edges: [],
    ...overrides
  } as BusinessStateType
}

function callSupervisor(svc: BusinessLangGraphService, state: BusinessStateType) {
  return (svc as unknown as { runSupervisor(s: BusinessStateType): Promise<SupervisorOut> })
    .runSupervisor(state)
}

test('accepted directive halts critic loop with empty activeAgents', async () => {
  const svc = new BusinessLangGraphService(null)
  const directive: HitlResumeDirective = { kind: 'accepted', raw: '[ACCEPTED]' }
  svc.setHitlResumeDirective('trace-1', directive)

  const out = await callSupervisor(svc, buildState())
  assert.deepEqual(out.supervisorDirective.activeAgents, [])
  assert.match(out.supervisorDirective.guidance, /人类已批准/)
})

test('rejected directive halts critic loop with empty activeAgents', async () => {
  const svc = new BusinessLangGraphService(null)
  const directive: HitlResumeDirective = { kind: 'rejected', raw: '[REJECTED]' }
  svc.setHitlResumeDirective('trace-1', directive)

  const out = await callSupervisor(svc, buildState())
  assert.deepEqual(out.supervisorDirective.activeAgents, [])
  assert.match(out.supervisorDirective.guidance, /人类已驳回/)
})

test('edit_plan with dimension scopes to that dimension owning agent', async () => {
  const svc = new BusinessLangGraphService(null)
  const directive: HitlResumeDirective = {
    kind: 'edit_plan',
    dimension: '客户细分',
    body: '把目标群体扩到 18-35',
    raw: '[EDIT_PLAN][客户细分]: 把目标群体扩到 18-35'
  }
  svc.setHitlResumeDirective('trace-1', directive)

  const out = await callSupervisor(svc, buildState())
  assert.deepEqual(out.supervisorDirective.activeAgents, ['marketAgent'])
  assert.match(out.supervisorDirective.guidance, /人类指令.*客户细分/)
  assert.match(out.supervisorDirective.guidance, /18-35/)
})

test('edit_plan with finance dimension routes to financeAgent', async () => {
  const svc = new BusinessLangGraphService(null)
  const directive: HitlResumeDirective = {
    kind: 'edit_plan',
    dimension: '成本结构',
    body: 'rebalance fixed vs variable',
    raw: '[EDIT_PLAN][成本结构]: rebalance fixed vs variable'
  }
  svc.setHitlResumeDirective('trace-1', directive)

  const out = await callSupervisor(svc, buildState())
  assert.deepEqual(out.supervisorDirective.activeAgents, ['financeAgent'])
})

test('edit_plan without dimension keeps full revision but prepends user body to guidance', async () => {
  const svc = new BusinessLangGraphService(null)
  const directive: HitlResumeDirective = {
    kind: 'edit_plan',
    dimension: null,
    body: '整体调整估值口径',
    raw: '[EDIT_PLAN]: 整体调整估值口径'
  }
  svc.setHitlResumeDirective('trace-1', directive)

  const out = await callSupervisor(svc, buildState())
  // marketAgent because the seed conflict relatedAgent is Market_Agent
  assert.ok(out.supervisorDirective.activeAgents.length >= 1)
  assert.match(out.supervisorDirective.guidance, /人类指令.*整体调整估值口径/)
})

test('directive is consumed (one-shot) and not re-applied to a second supervisor call', async () => {
  const svc = new BusinessLangGraphService(null)
  const directive: HitlResumeDirective = { kind: 'accepted', raw: '[ACCEPTED]' }
  svc.setHitlResumeDirective('trace-1', directive)

  const first = await callSupervisor(svc, buildState())
  assert.deepEqual(first.supervisorDirective.activeAgents, [])
  assert.match(first.supervisorDirective.guidance, /人类已批准/)

  const second = await callSupervisor(svc, buildState())
  // No directive remaining → falls back to auto-revision (uses the seed
  // conflict's relatedAgent, marketAgent).
  assert.equal(/人类已批准/.test(second.supervisorDirective.guidance), false)
  assert.ok(second.supervisorDirective.activeAgents.length >= 1)
})

test('consumeHitlResumeDirective returns null when nothing pending', async () => {
  const svc = new BusinessLangGraphService(null)
  assert.equal(await svc.consumeHitlResumeDirective('nope'), null)
})

test('setHitlResumeDirective is a no-op for empty traceId', async () => {
  const svc = new BusinessLangGraphService(null)
  await svc.setHitlResumeDirective('', { kind: 'accepted', raw: '[ACCEPTED]' })
  assert.equal(await svc.consumeHitlResumeDirective(''), null)
})
