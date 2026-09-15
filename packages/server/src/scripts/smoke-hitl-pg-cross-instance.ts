/**
 * A3++ — cross-INSTANCE HITL PG smoke (2026-04-29).
 *
 * Companion to `smoke-hitl-langgraph.ts` (process-local MemorySaver). This
 * one verifies the SAME flow with the production PostgresSaver, simulating
 * a server-restart scenario:
 *
 *   1. Instance A: build critic subgraph w/ PostgresSaver + thread_id=T
 *      - inject high-severity conflict
 *      - critic interrupts on await-human
 *      - state persisted to PG (`checkpoints` table by thread_id=T)
 *   2. Instance A goes away (we simulate by dropping the compiled subgraph
 *      reference and building a NEW one — different in-memory state, same PG)
 *   3. Instance B: build a fresh critic subgraph w/ the SAME PostgresSaver
 *      + same thread_id=T
 *      - resume with Command(resume='[ACCEPTED]')
 *      - reads checkpoint from PG, picks up where Instance A left off
 *      - asserts humanDecision = { kind: 'accepted' }
 *
 * If this passes against a real PG, it proves cross-restart HITL works
 * — the gateway can reboot mid-interrupt, and the human's decision still
 * routes to the right paused conversation.
 *
 * REQUIREMENTS:
 *   - DATABASE_URL pointing at a Postgres with the pgvector extension
 *     (LangGraph checkpoint tables auto-created via PostgresSaver.setup)
 *   - LANGGRAPH_CHECKPOINTER_ENABLED=true   (or DATABASE_URL set without
 *     LANGGRAPH_CHECKPOINTER_ENABLED=false — see infrastructure/langgraph/
 *     checkpointer.ts:isEnabled() for the rule)
 *
 * Run:
 *   pnpm --filter @starlink/server build
 *   DATABASE_URL=postgres://... LANGGRAPH_CHECKPOINTER_ENABLED=true \
 *     node packages/server/dist/scripts/smoke-hitl-pg-cross-instance.js
 *
 * Or via local docker pg:
 *   docker run -d --name pgvector -p 5432:5432 \
 *     -e POSTGRES_PASSWORD=secret pgvector/pgvector:pg16
 *   psql postgresql://postgres:secret@localhost:5432 -c 'CREATE EXTENSION vector;'
 *   DATABASE_URL=postgres://postgres:secret@localhost:5432/postgres \
 *     LANGGRAPH_CHECKPOINTER_ENABLED=true \
 *     node packages/server/dist/scripts/smoke-hitl-pg-cross-instance.js
 */

import { Command } from '@langchain/langgraph'
import {
  buildCriticSubgraph,
  type CriticConflict
} from '../agents/critic/graph.js'
import { getCheckpointer } from '../infrastructure/langgraph/checkpointer.js'
import { pool } from '../infrastructure/db/pool.js'

process.env.HITL_ENABLED = 'true'
if (!process.env.LANGGRAPH_CHECKPOINTER_ENABLED) {
  // Default-on if user didn't set it explicitly — this script is
  // about exercising PG specifically.
  process.env.LANGGRAPH_CHECKPOINTER_ENABLED = 'true'
}

// We're using the rule-based critic path (no LLM) to keep this test
// deterministic + zero-cost. The conflict is injected via the input
// state's `nodesSummary` field (the rule-based detector greps for
// '中产' + '低价' keyword pairs to flag a high-end-vs-low-price conflict).
// See critic/graph.ts:ruleBasedCriticCheck.
const TRACE_BASE = `smoke-pg-hitl-${Date.now()}`

async function instanceAEnterInterrupt(threadId: string): Promise<void> {
  console.log(`[A] booting Instance A (thread_id=${threadId})`)
  const checkpointer = await getCheckpointer()
  if (!checkpointer) {
    throw new Error(
      'Instance A: getCheckpointer() returned null. ' +
        'Is DATABASE_URL set + LANGGRAPH_CHECKPOINTER_ENABLED truthy?'
    )
  }
  const compiled = buildCriticSubgraph(
    null,
    'rule-based critic for HITL smoke',
    checkpointer
  )

  const inputState = {
    traceId: threadId,
    workspaceId: 'smoke-pg-workspace',
    userId: 'smoke-pg-user',
    question: '定价怎么定？',
    roundNumber: 1,
    nodesSummary:
      '- 客户细分: 中产高端用户 (premium)\n' +
      '- 定价: 低价策略 (低价获客)',
    workspaceContext: '',
    supervisorDirective: '',
    knowledgeEvidence: ''
  }

  const result = (await compiled.invoke(inputState, {
    configurable: { thread_id: threadId }
  })) as { __interrupt__?: unknown[]; conflicts?: CriticConflict[] }

  if (!result.__interrupt__ || result.__interrupt__.length === 0) {
    throw new Error(
      'Instance A: expected interrupt; got none. Check that ' +
        'HITL_ENABLED=true + the rule-based critic actually flagged the conflict.'
    )
  }
  console.log(
    `[A] interrupted at await-human; ${result.conflicts?.length ?? 0} conflict(s) ` +
      `persisted to PG checkpoint`
  )
}

async function instanceBResume(
  threadId: string,
  resumeValue: string,
  expectedKind: 'accepted' | 'edit_plan'
): Promise<{ ok: boolean; details: Record<string, unknown> }> {
  console.log(`[B] booting Instance B (same thread_id=${threadId}, fresh subgraph)`)
  const checkpointer = await getCheckpointer()
  if (!checkpointer) {
    return { ok: false, details: { reason: 'checkpointer-null-on-instance-B' } }
  }
  const compiled = buildCriticSubgraph(
    null,
    'rule-based critic for HITL smoke (instance B)',
    checkpointer
  )

  const result = (await compiled.invoke(
    new Command({ resume: resumeValue }),
    { configurable: { thread_id: threadId } }
  )) as { humanDecision?: { kind: string }; humanOverride?: string }

  if (result.humanDecision?.kind !== expectedKind) {
    return {
      ok: false,
      details: {
        reason: `expected humanDecision.kind=${expectedKind}, got ${result.humanDecision?.kind}`,
        humanDecision: result.humanDecision,
        humanOverride: result.humanOverride
      }
    }
  }
  return {
    ok: true,
    details: {
      humanDecision: result.humanDecision,
      humanOverride: result.humanOverride
    }
  }
}

async function main(): Promise<void> {
  const threadId = TRACE_BASE
  console.log('[smoke-hitl-pg-cross-instance] starting')

  await instanceAEnterInterrupt(threadId)

  // Discard Instance A's references entirely — Instance B builds its own
  // compiled subgraph from scratch. They share only the PG-backed
  // PostgresSaver singleton (the cross-restart contract).
  const r = await instanceBResume(threadId, '[ACCEPTED]', 'accepted')

  if (!r.ok) {
    console.error('[smoke-hitl-pg-cross-instance] FAILED', r.details)
    await pool.end().catch(() => undefined)
    process.exit(1)
  }
  console.log('[smoke-hitl-pg-cross-instance] PASSED', r.details)

  // Optional cleanup: drop the checkpoint rows we wrote for this thread.
  // Comment out if you want to inspect them post-run.
  try {
    await pool.query(
      `DELETE FROM checkpoints WHERE thread_id = $1`,
      [threadId]
    )
    await pool.query(
      `DELETE FROM checkpoint_blobs WHERE thread_id = $1`,
      [threadId]
    )
    await pool.query(
      `DELETE FROM checkpoint_writes WHERE thread_id = $1`,
      [threadId]
    )
    console.log('[smoke-hitl-pg-cross-instance] checkpoint rows cleaned up')
  } catch (err) {
    console.warn('[smoke-hitl-pg-cross-instance] cleanup warning:', err)
  }

  await pool.end()
}

main().catch(async (err) => {
  console.error('[smoke-hitl-pg-cross-instance] unhandled error', err)
  await pool.end().catch(() => undefined)
  process.exit(1)
})
