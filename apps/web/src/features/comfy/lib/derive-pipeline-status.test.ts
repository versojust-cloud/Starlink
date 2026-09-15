/**
 * P13 · Unit tests for derivePipelineStatus.
 *
 * Pure-function tests — no React, no DOM. Run with:
 *   node --test --experimental-strip-types apps/web/src/features/comfy/lib/derive-pipeline-status.test.ts
 *
 * Covers each of the 5 stages × the 5 status states, plus the cascade
 * rules (running stage past N implies N is done) and the
 * subAgentActivity freshness window.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  derivePipelineStatus,
  isPipelineTerminal,
  type DerivePipelineInput,
  type StageKey,
  type StageStatus
} from './derive-pipeline-status.ts'

type MacraNode = {
  id: string
  type: 'cc-bmc-card' | 'agent-avatar' | 'insight-note' | 'conflict-alert' | 'data-source' | 'report-card'
  label: string
  content: string
  metadata: Record<string, unknown>
}

const NOW = 1_700_000_000_000

function makeNodes(specs: Array<Pick<MacraNode, 'id' | 'type'>>): Map<string, MacraNode> {
  const m = new Map<string, MacraNode>()
  for (const s of specs) {
    m.set(s.id, {
      id: s.id,
      type: s.type,
      label: s.id,
      content: 'x',
      metadata: {}
    })
  }
  return m
}

function baseInput(overrides: Partial<DerivePipelineInput> = {}): DerivePipelineInput {
  return {
    lastPhase: null,
    isOrchestratorProcessing: false,
    hasFailed: false,
    wizardChat: { active: false, stepIndex: 0, totalSteps: 7 },
    macraNodes: new Map() as DerivePipelineInput['macraNodes'],
    subAgentActivity: null,
    now: NOW,
    ...overrides
  }
}

function statusOf(stages: ReturnType<typeof derivePipelineStatus>, id: StageKey): StageStatus {
  return stages.find((s) => s.id === id)!.status
}

// ---------------------------------------------------------------------
// Fresh canvas — every stage pending; report skipped only after stream
// kicks off. On a never-touched canvas with no signal, all-pending is OK.
// ---------------------------------------------------------------------

test('fresh canvas with no signal → all 5 stages pending or skipped', () => {
  const stages = derivePipelineStatus(baseInput())
  assert.equal(stages.length, 5)
  assert.equal(statusOf(stages, 'input'), 'pending')
  assert.equal(statusOf(stages, 'generate'), 'pending')
  assert.equal(statusOf(stages, 'review'), 'pending')
  assert.equal(statusOf(stages, 'synthesize'), 'pending')
  // report stage is skipped when not processing and no report-card exists
  assert.equal(statusOf(stages, 'report'), 'skipped')
})

// ---------------------------------------------------------------------
// Stage 1 · INPUT
// ---------------------------------------------------------------------

test('wizard active → input running with stepIndex count', () => {
  const stages = derivePipelineStatus(
    baseInput({ wizardChat: { active: true, stepIndex: 3, totalSteps: 7 } })
  )
  assert.equal(statusOf(stages, 'input'), 'running')
  const input = stages.find((s) => s.id === 'input')!
  assert.equal(input.count, 3)
  assert.equal(input.countLabel, '/ 7')
})

test('wizard finished + stream started → input done', () => {
  const stages = derivePipelineStatus(
    baseInput({
      wizardChat: { active: false, stepIndex: 7, totalSteps: 7 },
      isOrchestratorProcessing: true,
      lastPhase: 'planning'
    })
  )
  assert.equal(statusOf(stages, 'input'), 'done')
})

// ---------------------------------------------------------------------
// Stage 2 · GENERATE
// ---------------------------------------------------------------------

test('phase=execution → generate running, count BMC cells', () => {
  const stages = derivePipelineStatus(
    baseInput({
      isOrchestratorProcessing: true,
      lastPhase: 'execution',
      macraNodes: makeNodes([
        { id: 'market-customer-segments-1', type: 'cc-bmc-card' },
        { id: 'product-value-propositions-1', type: 'cc-bmc-card' },
        { id: 'finance-revenue-streams-1', type: 'cc-bmc-card' }
      ]) as DerivePipelineInput['macraNodes']
    })
  )
  assert.equal(statusOf(stages, 'generate'), 'running')
  const g = stages.find((s) => s.id === 'generate')!
  assert.equal(g.count, 3)
  assert.equal(g.countLabel, 'cells')
})

test('phase advanced past execution → generate done', () => {
  const stages = derivePipelineStatus(
    baseInput({
      isOrchestratorProcessing: true,
      lastPhase: 'review',
      macraNodes: makeNodes([
        { id: 'market-customer-segments-1', type: 'cc-bmc-card' }
      ]) as DerivePipelineInput['macraNodes']
    })
  )
  assert.equal(statusOf(stages, 'generate'), 'done')
  // cascade: input must be done too
  assert.equal(statusOf(stages, 'input'), 'done')
})

// ---------------------------------------------------------------------
// Stage 3 · REVIEW
// ---------------------------------------------------------------------

test('phase=review → review running, with conflict count', () => {
  const stages = derivePipelineStatus(
    baseInput({
      isOrchestratorProcessing: true,
      lastPhase: 'review',
      macraNodes: makeNodes([
        { id: 'market-customer-segments-1', type: 'cc-bmc-card' },
        { id: 'conflict-001', type: 'conflict-alert' },
        { id: 'conflict-002', type: 'conflict-alert' }
      ]) as DerivePipelineInput['macraNodes']
    })
  )
  assert.equal(statusOf(stages, 'review'), 'running')
  const r = stages.find((s) => s.id === 'review')!
  assert.equal(r.count, 2)
  assert.equal(r.countLabel, 'conflicts')
})

test('phase=decision → review done, synthesize running', () => {
  const stages = derivePipelineStatus(
    baseInput({
      isOrchestratorProcessing: true,
      lastPhase: 'decision',
      macraNodes: makeNodes([
        { id: 'market-customer-segments-1', type: 'cc-bmc-card' }
      ]) as DerivePipelineInput['macraNodes']
    })
  )
  assert.equal(statusOf(stages, 'review'), 'done')
  assert.equal(statusOf(stages, 'synthesize'), 'running')
  // cascade: generate also done
  assert.equal(statusOf(stages, 'generate'), 'done')
})

// ---------------------------------------------------------------------
// Stage 4 · SYNTHESIZE
// ---------------------------------------------------------------------

test('synthesizer insight + stream complete → synthesize done', () => {
  const stages = derivePipelineStatus(
    baseInput({
      isOrchestratorProcessing: false,
      lastPhase: 'decision',
      macraNodes: makeNodes([
        { id: 'market-customer-segments-1', type: 'cc-bmc-card' },
        { id: 'synthesizer-insight-001', type: 'insight-note' }
      ]) as DerivePipelineInput['macraNodes']
    })
  )
  assert.equal(statusOf(stages, 'synthesize'), 'done')
  const s = stages.find((s) => s.id === 'synthesize')!
  assert.equal(s.count, 1)
  assert.equal(s.countLabel, 'insights')
})

// ---------------------------------------------------------------------
// Stage 5 · REPORT
// ---------------------------------------------------------------------

test('report-card present → report done', () => {
  const stages = derivePipelineStatus(
    baseInput({
      isOrchestratorProcessing: false,
      lastPhase: 'decision',
      macraNodes: makeNodes([
        { id: 'report-2026-01-01', type: 'report-card' }
      ]) as DerivePipelineInput['macraNodes']
    })
  )
  assert.equal(statusOf(stages, 'report'), 'done')
  const r = stages.find((s) => s.id === 'report')!
  assert.equal(r.count, 1)
})

test('P15-fix #8 · mention-only report → earlier pending stages become skipped', () => {
  // Direct @report-writer mention produces a report-card without going
  // through the seminar pipeline (no phase.changed events fire). Without
  // this cascade, input/generate/review/synthesize would stay 'pending'
  // forever, making the strip look stuck.
  const stages = derivePipelineStatus(
    baseInput({
      isOrchestratorProcessing: false,
      lastPhase: null,
      macraNodes: makeNodes([
        { id: 'report-2026-05-11', type: 'report-card' }
      ]) as DerivePipelineInput['macraNodes']
    })
  )
  assert.equal(statusOf(stages, 'report'), 'done')
  // All four earlier stages must be 'skipped' (they were 'pending' and
  // the report-done cascade flips them).
  assert.equal(statusOf(stages, 'input'), 'skipped')
  assert.equal(statusOf(stages, 'generate'), 'skipped')
  assert.equal(statusOf(stages, 'review'), 'skipped')
  assert.equal(statusOf(stages, 'synthesize'), 'skipped')
})

test('P15-fix #8 · mention-only cascade does NOT override done/running stages', () => {
  // Full pipeline + then a mention-only report shouldn't downgrade
  // genuinely-completed stages to 'skipped'.
  const stages = derivePipelineStatus(
    baseInput({
      isOrchestratorProcessing: false,
      lastPhase: 'decision',
      macraNodes: makeNodes([
        { id: 'market-cs-1', type: 'cc-bmc-card' },
        { id: 'product-vp-1', type: 'cc-bmc-card' },
        { id: 'insight-1', type: 'insight-note' },
        { id: 'report-2026-05-11', type: 'report-card' }
      ]) as DerivePipelineInput['macraNodes']
    })
  )
  assert.equal(statusOf(stages, 'report'), 'done')
  // The full-pipeline cascade upgraded these to done; mention cascade
  // must NOT touch non-pending stages.
  assert.notEqual(statusOf(stages, 'generate'), 'skipped')
  assert.notEqual(statusOf(stages, 'review'), 'skipped')
  assert.notEqual(statusOf(stages, 'synthesize'), 'skipped')
})

test('no report-card during processing → report pending; not skipped', () => {
  const stages = derivePipelineStatus(
    baseInput({
      isOrchestratorProcessing: true,
      lastPhase: 'execution',
      macraNodes: makeNodes([
        { id: 'market-customer-segments-1', type: 'cc-bmc-card' }
      ]) as DerivePipelineInput['macraNodes']
    })
  )
  assert.equal(statusOf(stages, 'report'), 'pending')
})

// ---------------------------------------------------------------------
// Failure path
// ---------------------------------------------------------------------

test('hasFailed flag → active stage marked failed', () => {
  const stages = derivePipelineStatus(
    baseInput({
      isOrchestratorProcessing: false,
      hasFailed: true,
      lastPhase: 'execution',
      macraNodes: makeNodes([
        { id: 'market-customer-segments-1', type: 'cc-bmc-card' }
      ]) as DerivePipelineInput['macraNodes']
    })
  )
  // active stage at lastPhase='execution' is 'generate'
  assert.equal(statusOf(stages, 'generate'), 'failed')
})

test('failure cascade: downstream stages become skipped (not pending)', () => {
  const stages = derivePipelineStatus(
    baseInput({
      isOrchestratorProcessing: false,
      hasFailed: true,
      lastPhase: 'execution',
      macraNodes: makeNodes([
        { id: 'market-customer-segments-1', type: 'cc-bmc-card' }
      ]) as DerivePipelineInput['macraNodes']
    })
  )
  assert.equal(statusOf(stages, 'generate'), 'failed')
  // After the failure, pipeline aborts — downstream is skipped, not pending
  assert.equal(statusOf(stages, 'review'), 'skipped')
  assert.equal(statusOf(stages, 'synthesize'), 'skipped')
  assert.equal(statusOf(stages, 'report'), 'skipped')
  // Pipeline must be terminal so the auto-hide timer can fire
  assert.equal(isPipelineTerminal(stages), true)
})

// ---------------------------------------------------------------------
// subAgentActivity freshness window
// ---------------------------------------------------------------------

test('fresh subAgentActivity → currentAction set on running stage', () => {
  const stages = derivePipelineStatus(
    baseInput({
      isOrchestratorProcessing: true,
      lastPhase: 'execution',
      subAgentActivity: { parentNode: 'marketAgent', nodeName: 'tools', ts: NOW - 1_000 },
      macraNodes: makeNodes([
        { id: 'market-customer-segments-1', type: 'cc-bmc-card' }
      ]) as DerivePipelineInput['macraNodes']
    })
  )
  const g = stages.find((s) => s.id === 'generate')!
  assert.equal(g.currentAction, 'market-agent · 调用工具')
})

test('stale subAgentActivity (>4s) → currentAction undefined', () => {
  const stages = derivePipelineStatus(
    baseInput({
      isOrchestratorProcessing: true,
      lastPhase: 'execution',
      subAgentActivity: { parentNode: 'marketAgent', nodeName: 'tools', ts: NOW - 5_000 },
      macraNodes: makeNodes([
        { id: 'market-customer-segments-1', type: 'cc-bmc-card' }
      ]) as DerivePipelineInput['macraNodes']
    })
  )
  const g = stages.find((s) => s.id === 'generate')!
  assert.equal(g.currentAction, undefined)
})

test('subAgentActivity attached only to currently-active stage', () => {
  const stages = derivePipelineStatus(
    baseInput({
      isOrchestratorProcessing: true,
      lastPhase: 'review',
      subAgentActivity: { parentNode: 'criticAgent', nodeName: 'call-llm', ts: NOW - 500 },
      macraNodes: makeNodes([
        { id: 'market-customer-segments-1', type: 'cc-bmc-card' }
      ]) as DerivePipelineInput['macraNodes']
    })
  )
  // generate stage should NOT carry the action
  assert.equal(stages.find((s) => s.id === 'generate')!.currentAction, undefined)
  // review stage SHOULD
  assert.equal(stages.find((s) => s.id === 'review')!.currentAction, 'critic-agent · 推理中')
})

// ---------------------------------------------------------------------
// Pipeline terminal helper
// ---------------------------------------------------------------------

test('isPipelineTerminal: all done → true', () => {
  const stages = derivePipelineStatus(
    baseInput({
      isOrchestratorProcessing: false,
      lastPhase: 'decision',
      wizardChat: { active: false, stepIndex: 7, totalSteps: 7 },
      macraNodes: makeNodes([
        { id: 'market-customer-segments-1', type: 'cc-bmc-card' },
        { id: 'synthesizer-insight-001', type: 'insight-note' },
        { id: 'report-2026-01-01', type: 'report-card' }
      ]) as DerivePipelineInput['macraNodes']
    })
  )
  assert.equal(isPipelineTerminal(stages), true)
})

test('isPipelineTerminal: any running → false', () => {
  const stages = derivePipelineStatus(
    baseInput({
      isOrchestratorProcessing: true,
      lastPhase: 'execution',
      macraNodes: makeNodes([
        { id: 'market-customer-segments-1', type: 'cc-bmc-card' }
      ]) as DerivePipelineInput['macraNodes']
    })
  )
  assert.equal(isPipelineTerminal(stages), false)
})

// ---------------------------------------------------------------------
// Cascade integrity: synthesize running ⇒ generate + review must be done
// ---------------------------------------------------------------------

test('cascade: synthesize running → generate + review forced done', () => {
  const stages = derivePipelineStatus(
    baseInput({
      isOrchestratorProcessing: true,
      lastPhase: 'decision',
      macraNodes: makeNodes([
        // Note: NO cc-bmc-card; cascade still applies.
      ]) as DerivePipelineInput['macraNodes']
    })
  )
  assert.equal(statusOf(stages, 'generate'), 'done')
  assert.equal(statusOf(stages, 'review'), 'done')
})
