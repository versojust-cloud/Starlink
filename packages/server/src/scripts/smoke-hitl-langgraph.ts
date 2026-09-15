/**
 * A3 hardening (2026-04-29) — LangGraph-level HITL interrupt/resume smoke test.
 *
 * The cross-instance test (smoke-hitl-cross-instance.ts) covers the
 * approval-store layer (PG LISTEN/NOTIFY between gateway instances),
 * but DOES NOT exercise LangGraph's `interrupt` + `Command` resume.
 * That's the actual primitive the critic subgraph relies on.
 *
 * What this smoke does:
 *
 *   1. Build the critic subgraph with an in-memory MemorySaver
 *      checkpointer (no PG required — process-local).
 *   2. Invoke with a synthetic high-severity conflict + HITL_ENABLED=true
 *      → critic should hit `interrupt` at the await-human node.
 *   3. Read the interrupted state from the checkpointer via the same
 *      `thread_id` LangGraph used.
 *   4. Resume with Command(resume: '[ACCEPTED]') → critic continues to END,
 *      humanDecision should be { kind: 'accepted' }.
 *   5. Resume a SECOND thread with Command(resume: '[EDIT_PLAN]:override
 *      text') → humanDecision should be { kind: 'edit_plan', plan: '...' }
 *      and humanOverride should hold the plan text.
 *
 * Production parity: when LANGGRAPH_CHECKPOINTER_ENABLED=true and
 * DATABASE_URL is set, the critic IIFE in agents/critic/graph.ts swaps
 * MemorySaver for PostgresSaver (commit dbdb175). The interrupt/Command
 * flow tested here is identical — only the persistence backend differs.
 * Cross-restart resume (server bounce → resume on a different process)
 * needs PG and is a separate test.
 *
 * Run:
 *   pnpm --filter @starlink/server build
 *   node packages/server/dist/scripts/smoke-hitl-langgraph.js
 *
 * No env required (no DB, no LLM key — uses rule-based critic + force
 * conflicts via direct state injection).
 */

import { MemorySaver, Command } from '@langchain/langgraph'
import {
  buildCriticSubgraph,
  type CriticConflict
} from '../agents/critic/graph.js'

// Force HITL on for the duration of this smoke.
process.env.HITL_ENABLED = 'true'

const HIGH_SEV_CONFLICT: CriticConflict = {
  id: 'smoke-conflict-1',
  type: 'conflict-alert',
  label: '定价 vs 客户群冲突',
  content:
    '**冲突类型**：channel-product\n\n' +
    '**原因**：高端客户定位 + 低价定价矛盾。\n\n' +
    '**相关 Agent**：Market_Agent, Finance_Agent',
  severity: 'high',
  conflictType: 'channel-product',
  relatedAgents: ['Market_Agent', 'Finance_Agent'],
  metadata: {
    agent_signature: 'Critic',
    confidence: 'high',
    stage: 'review'
  }
}

interface InterruptedState {
  humanDecision?: { kind: string; plan?: string }
  humanOverride?: string
  conflicts?: CriticConflict[]
  __interrupt__?: unknown[] | undefined
}

async function runOneScenario(args: {
  name: string
  resumeValue: string
  expectedKind: 'accepted' | 'edit_plan' | 'rejected'
  expectedPlan?: string
}): Promise<{ ok: boolean; details: Record<string, unknown> }> {
  const checkpointer = new MemorySaver()
  // We pass `null` for the model — the critic subgraph's detect-conflicts
  // node will fall through to ruleBasedCriticCheck(nodesSummary). We don't
  // care about LLM behaviour for this test; we PRE-INJECT a high-severity
  // conflict by calling buildCriticSubgraph but immediately invoking with
  // state.conflicts already populated... except the schema-default reducer
  // for `conflicts` overwrites with the detect-conflicts output.
  //
  // Workaround: use a system prompt that includes 中产 + 低价 keywords
  // so the rule-based path produces the conflict we want.
  const systemPromptStub =
    'You are a critic. Detect conflicts in BMC content. Rule-based ' +
    'fallback handles when no LLM is configured.'
  const compiled = buildCriticSubgraph(null, systemPromptStub, checkpointer)

  const threadId = `smoke-hitl-${args.name}-${Date.now()}`
  const config = { configurable: { thread_id: threadId } }

  const inputState = {
    traceId: threadId,
    workspaceId: 'smoke-workspace',
    userId: 'smoke-user',
    question: '定价怎么定？',
    roundNumber: 1,
    nodesSummary:
      '- 客户细分: 中产高端用户 (premium)\n' +
      '- 定价: 低价策略 (低价获客)',
    workspaceContext: '',
    supervisorDirective: '',
    knowledgeEvidence: ''
  }

  // First invocation: the rule-based critic should detect the
  // high-end-vs-low-price conflict (severity: high), then HITL_ENABLED
  // routing sends it to await-human, which calls `interrupt(...)`.
  const firstResult = (await compiled.invoke(inputState, config)) as InterruptedState

  if (!firstResult.__interrupt__ || firstResult.__interrupt__.length === 0) {
    return {
      ok: false,
      details: {
        reason: 'expected interrupt, got none',
        firstResult
      }
    }
  }
  if ((firstResult.conflicts ?? []).length === 0) {
    return {
      ok: false,
      details: {
        reason: 'expected conflicts populated before interrupt',
        firstResult
      }
    }
  }

  // Resume with the human decision.
  const resumeResult = (await compiled.invoke(
    new Command({ resume: args.resumeValue }),
    config
  )) as InterruptedState

  if (resumeResult.humanDecision?.kind !== args.expectedKind) {
    return {
      ok: false,
      details: {
        reason: `expected humanDecision.kind=${args.expectedKind}, got ${resumeResult.humanDecision?.kind}`,
        resumeResult
      }
    }
  }
  if (
    args.expectedPlan !== undefined &&
    resumeResult.humanOverride !== args.expectedPlan
  ) {
    return {
      ok: false,
      details: {
        reason: `expected humanOverride=${args.expectedPlan}, got ${resumeResult.humanOverride}`,
        resumeResult
      }
    }
  }

  return {
    ok: true,
    details: {
      threadId,
      conflictCount: firstResult.conflicts?.length ?? 0,
      humanDecision: resumeResult.humanDecision,
      humanOverride: resumeResult.humanOverride
    }
  }
}

async function main() {
  console.log('[smoke-hitl-langgraph] starting (process-local MemorySaver)')

  const scenarios: Array<{
    name: string
    resumeValue: string
    expectedKind: 'accepted' | 'edit_plan' | 'rejected'
    expectedPlan?: string
  }> = [
    {
      name: 'accept-as-is',
      resumeValue: '[ACCEPTED]',
      expectedKind: 'accepted'
    },
    {
      name: 'edit-plan',
      resumeValue: '[EDIT_PLAN]:改用中端定价 + 渠道分层',
      expectedKind: 'edit_plan',
      expectedPlan: '改用中端定价 + 渠道分层'
    }
  ]

  let allPassed = true
  for (const s of scenarios) {
    process.stdout.write(`  · scenario "${s.name}"... `)
    const r = await runOneScenario(s)
    if (r.ok) {
      console.log('OK', r.details)
    } else {
      console.log('FAIL', r.details)
      allPassed = false
    }
  }

  if (!allPassed) {
    console.error('\n[smoke-hitl-langgraph] one or more scenarios failed')
    process.exit(1)
  }
  console.log('\n[smoke-hitl-langgraph] all scenarios passed')
}

main().catch((err) => {
  console.error('[smoke-hitl-langgraph] failed', err)
  process.exit(1)
})
