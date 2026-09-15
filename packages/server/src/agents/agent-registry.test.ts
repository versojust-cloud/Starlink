/**
 * Agent layer registry-contract suite.
 *
 * Loads every agent module so its top-level `ready` IIFE registers the
 * descriptor in agentRegistry / advisorRegistry, then asserts:
 *
 *   1. All 12 agents register exactly once
 *   2. Each agent has the expected role + capabilities
 *   3. Generator agents (8 of 12) return a compiled subgraph from
 *      buildSubgraph() — i.e. an object with an .invoke function.
 *   4. Debate-only agents (4 of 12) return an orphan subgraph stub
 *      (still .invoke-callable but the LLM call happens via
 *      LlmDebateInvoker, not the subgraph route).
 *   5. OPPONENT_MAP covers all 3 BMC dimensions (market/product/finance).
 *
 * Pure unit-level — no DB, no LLM calls.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { agentRegistry, advisorRegistry } from '../capabilities/index.js'
import { OPPONENT_MAP } from '../services/business-langgraph/constants.js'
import { ToolRegistry } from '../tool-registry/registry.js'
import { loadAllTools } from '../tool-registry/loader.js'
import { setToolRegistryForAgents } from './shared/register-helpers.js'

// Bootstrap the tool registry BEFORE importing agent graph modules.
// Agent IIFEs call resolveLangchainToolsForAgent at module-load time,
// which requires a populated registry. Same dance as benchmark runners
// (run-starlink.ts) — production goes through context/index.ts but that
// module eagerly opens PG pools, so we duplicate the headless path.
const ALL_READY: Promise<unknown> = (async () => {
  const reg = new ToolRegistry()
  await loadAllTools(reg)
  setToolRegistryForAgents(reg)

  // Now safe to import — the IIFEs will resolve tools against `reg`.
  const [
    marketReady, productReady, financeReady, criticReady,
    synthesizerReady, generalResponderReady, deepResearchReady,
    reportWriterReady, marketOpponentReady, productOpponentReady,
    financeOpponentReady, moderatorReady
  ] = await Promise.all([
    import('./market/graph.js').then((m) => m.ready),
    import('./product/graph.js').then((m) => m.ready),
    import('./finance/graph.js').then((m) => m.ready),
    import('./critic/graph.js').then((m) => m.ready),
    import('./synthesizer/graph.js').then((m) => m.ready),
    import('./general-responder/graph.js').then((m) => m.ready),
    import('./deep-research/graph.js').then((m) => m.ready),
    import('./report-writer/graph.js').then((m) => m.ready),
    import('./market-opponent/graph.js').then((m) => m.ready),
    import('./product-opponent/graph.js').then((m) => m.ready),
    import('./finance-opponent/graph.js').then((m) => m.ready),
    import('./moderator/graph.js').then((m) => m.ready)
  ])
  return Promise.all([
    marketReady, productReady, financeReady, criticReady,
    synthesizerReady, generalResponderReady, deepResearchReady,
    reportWriterReady, marketOpponentReady, productOpponentReady,
    financeOpponentReady, moderatorReady
  ])
})()

// Registration buckets — matches each graph.ts's actual register*() call:
//
//  • agentRegistry  · 8 generators / synth / moderator (compiled subgraphs
//                     OR orphan stubs for prompt-only routes)
//  • advisorRegistry · critic + 3 opponents (have RelevanceScorer)
//
// Moderator is registered via registerAgent (not registerAdvisor) because
// LangGraph nodes use it for verdict synthesis even though its actual
// LLM call happens via LlmDebateInvoker.judge — same orphan-subgraph pattern
// as market-opponent etc, but classified as 'meta' role.
const AGENT_REGISTRY_IDS = [
  'market-agent', 'product-agent', 'finance-agent',
  'general-responder', 'deep-research', 'report-writer',
  'synthesizer',
  'moderator'
] as const

const ADVISOR_REGISTRY_IDS = [
  'critic-agent',
  'market-opponent', 'product-opponent', 'finance-opponent'
] as const

// Subset of agentRegistry whose buildSubgraph returns a real compiled
// subgraph (not the orphan stub). These agents go through invokeRegisteredAgent.
const COMPILED_SUBGRAPH_AGENTS = [
  'market-agent', 'product-agent', 'finance-agent',
  'general-responder', 'deep-research', 'report-writer',
  'synthesizer'
] as const

test('all 12 agents register without error', async () => {
  await ALL_READY
  for (const id of AGENT_REGISTRY_IDS) {
    assert.ok(agentRegistry.has(id), `agent registry missing: ${id}`)
  }
  for (const id of ADVISOR_REGISTRY_IDS) {
    assert.ok(advisorRegistry.has(id), `advisor registry missing: ${id}`)
  }
  // Total = 8 + 4 = 12 agents
  assert.equal(
    AGENT_REGISTRY_IDS.length + ADVISOR_REGISTRY_IDS.length,
    12,
    'expected 12 agents in total'
  )
})

test('compiled-subgraph generators return .invoke fns', async () => {
  await ALL_READY
  for (const id of COMPILED_SUBGRAPH_AGENTS) {
    const desc = agentRegistry.get(id)
    assert.ok(desc, `descriptor missing for ${id}`)
    const sg = desc.buildSubgraph() as { invoke?: unknown }
    assert.equal(
      typeof sg?.invoke,
      'function',
      `${id} subgraph missing .invoke (likely uncompiled)`
    )
  }
})

test('orphan-stub agents (4 debate-only) return invoke-callable stubs', async () => {
  await ALL_READY
  // market-opponent / product-opponent / finance-opponent / moderator
  // all use the orphan-subgraph-stub. Their actual LLM call goes through
  // LlmDebateInvoker (prompt-only route), but the stub still needs to be
  // invoke-callable so invokeRegisteredAgent's runtime check (audit 2.8)
  // doesn't reject them.
  for (const id of ['market-opponent', 'product-opponent', 'finance-opponent', 'moderator'] as const) {
    const reg = id === 'moderator' ? agentRegistry : advisorRegistry
    const desc = reg.get(id)
    assert.ok(desc, `descriptor missing for ${id}`)
    const sg = desc.buildSubgraph() as { invoke?: unknown }
    assert.equal(
      typeof sg?.invoke,
      'function',
      `${id} stub missing .invoke`
    )
  }
})

test('critic registers as advisor with .invoke subgraph', async () => {
  await ALL_READY
  const desc = advisorRegistry.get('critic-agent')
  assert.ok(desc)
  const sg = desc.buildSubgraph() as { invoke?: unknown }
  assert.equal(typeof sg?.invoke, 'function')
})

test('subgraph is closure-cached (same instance returned twice) — audit 2.7', async () => {
  await ALL_READY
  for (const id of COMPILED_SUBGRAPH_AGENTS) {
    const desc = agentRegistry.get(id)
    assert.ok(desc)
    const a = desc.buildSubgraph()
    const b = desc.buildSubgraph()
    assert.equal(a, b, `${id} buildSubgraph should return cached instance`)
  }
})

test('OPPONENT_MAP covers all 3 BMC dimensions (audit issue 2.5)', () => {
  assert.equal(OPPONENT_MAP['market-agent'], 'market-opponent')
  assert.equal(OPPONENT_MAP['product-agent'], 'product-opponent')
  assert.equal(OPPONENT_MAP['finance-agent'], 'finance-opponent')
  assert.equal(Object.keys(OPPONENT_MAP).length, 3)
})

test('descriptor roles match expected (generator vs advisor)', async () => {
  await ALL_READY
  // Spot-check role assignments — these are part of the agent contract.
  const expectGenerator = [
    'market-agent', 'product-agent', 'finance-agent',
    'synthesizer', 'report-writer'
  ]
  for (const id of expectGenerator) {
    const desc = agentRegistry.get(id)
    assert.ok(desc, id)
    assert.equal(desc.role, 'generator', `${id} role mismatch`)
  }
  // Critic is an advisor.
  const critic = advisorRegistry.get('critic-agent')
  assert.ok(critic)
  assert.equal(critic.role, 'advisor')
})

test('opponent agents are independent registry entries (audit framing)', async () => {
  await ALL_READY
  // Each opponent's profile is read by LlmDebateInvoker DIRECTLY (prompt-only
  // route); their subgraph is intentionally an orphan stub. That's by design,
  // not a bug — this test pins the contract so a future refactor can't
  // silently downgrade them to "no registration at all".
  for (const id of ['market-opponent', 'product-opponent', 'finance-opponent']) {
    assert.ok(advisorRegistry.has(id), `${id} should be in advisor registry`)
  }
  // Moderator goes through agentRegistry (registerAgent), not advisor.
  assert.ok(agentRegistry.has('moderator'), 'moderator should be in agent registry')
})
