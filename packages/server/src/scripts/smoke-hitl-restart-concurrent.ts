/**
 * P15-fix #5 · HITL server-restart smoke (concurrent + multi-decision).
 *
 * Complements smoke-hitl-pg-cross-instance.ts which only proves single-thread
 * `[ACCEPTED]` resume across an instance boundary. This smoke proves the
 * harder production scenario:
 *
 *   1. Multiple concurrent threads (3) each enter await-human at the same
 *      time on Instance A
 *   2. Instance A "crashes" (we drop all compiled subgraph references +
 *      any in-memory state)
 *   3. Instance B comes up cold, resumes each thread independently with
 *      DIFFERENT decisions (`accepted` / `edit_plan` / `accepted` mixed)
 *   4. Verifies each thread's humanDecision routes to its own state, not
 *      another thread's
 *
 * This catches three categories of bug:
 *   - thread_id leakage (two pauses end up sharing one row)
 *   - decision-routing crosstalk (accepted on T1 accidentally applied to T2)
 *   - in-memory state assumption (some code path that only works if the
 *     same instance handled both pause + resume)
 *
 * REQUIREMENTS: same as smoke-hitl-pg-cross-instance.ts
 *
 * Run:
 *   pnpm --filter @starlink/server build
 *   DATABASE_URL=postgres://... LANGGRAPH_CHECKPOINTER_ENABLED=true \
 *     node packages/server/dist/scripts/smoke-hitl-restart-concurrent.js
 */

import { Command } from '@langchain/langgraph'
import { buildCriticSubgraph, type CriticConflict } from '../agents/critic/graph.js'
import { getCheckpointer } from '../infrastructure/langgraph/checkpointer.js'
import { pool } from '../infrastructure/db/pool.js'

process.env.HITL_ENABLED = 'true'
if (!process.env.LANGGRAPH_CHECKPOINTER_ENABLED) {
  process.env.LANGGRAPH_CHECKPOINTER_ENABLED = 'true'
}

const BASE = `smoke-hitl-restart-${Date.now()}`

interface ThreadPlan {
  threadId: string
  workspaceId: string
  resumeValue: string
  expectedKind: 'accepted' | 'edit_plan'
  expectedOverride?: string
}

const THREADS: ThreadPlan[] = [
  {
    threadId: `${BASE}-t1`,
    workspaceId: 'restart-ws-1',
    resumeValue: '[ACCEPTED]',
    expectedKind: 'accepted'
  },
  {
    threadId: `${BASE}-t2`,
    workspaceId: 'restart-ws-2',
    resumeValue: '[EDIT_PLAN] use bundle pricing instead',
    expectedKind: 'edit_plan',
    expectedOverride: 'use bundle pricing instead'
  },
  {
    threadId: `${BASE}-t3`,
    workspaceId: 'restart-ws-3',
    resumeValue: '[ACCEPTED]',
    expectedKind: 'accepted'
  }
]

async function instanceAPauseAll(): Promise<void> {
  console.log(`[A] booting Instance A — pausing ${THREADS.length} concurrent threads`)
  const checkpointer = await getCheckpointer()
  if (!checkpointer) {
    throw new Error('checkpointer null on Instance A; DATABASE_URL + LANGGRAPH_CHECKPOINTER_ENABLED?')
  }
  // Each thread gets its OWN compiled subgraph instance to mirror real
  // production (where each conversation builds its own graph). This is
  // what proves concurrent isolation — they all share the PG checkpointer
  // but should not crosstalk through it.
  await Promise.all(
    THREADS.map(async (plan) => {
      const compiled = buildCriticSubgraph(null, 'rule-based critic concurrent A', checkpointer)
      const inputState = {
        traceId: plan.threadId,
        workspaceId: plan.workspaceId,
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
        configurable: { thread_id: plan.threadId }
      })) as { __interrupt__?: unknown[]; conflicts?: CriticConflict[] }
      if (!result.__interrupt__ || result.__interrupt__.length === 0) {
        throw new Error(`thread ${plan.threadId} did not interrupt`)
      }
      console.log(
        `[A] t=${plan.threadId.slice(-2)} interrupted; ${result.conflicts?.length ?? 0} conflict(s)`
      )
    })
  )
}

async function instanceBResumeAll(): Promise<{ ok: boolean; failures: string[] }> {
  console.log('[B] booting Instance B — resuming all threads with mixed decisions')
  const checkpointer = await getCheckpointer()
  if (!checkpointer) {
    return { ok: false, failures: ['checkpointer-null-on-instance-B'] }
  }
  const failures: string[] = []
  // Resume in reverse order to expose any "first thread wins" bugs in the
  // checkpointer routing.
  const reversed = [...THREADS].reverse()
  for (const plan of reversed) {
    const compiled = buildCriticSubgraph(null, 'rule-based critic concurrent B', checkpointer)
    const result = (await compiled.invoke(
      new Command({ resume: plan.resumeValue }),
      { configurable: { thread_id: plan.threadId } }
    )) as { humanDecision?: { kind: string }; humanOverride?: string }
    const gotKind = result.humanDecision?.kind
    if (gotKind !== plan.expectedKind) {
      failures.push(
        `t=${plan.threadId.slice(-2)} expected kind=${plan.expectedKind} got ${gotKind}`
      )
      continue
    }
    if (plan.expectedOverride && result.humanOverride !== plan.expectedOverride) {
      failures.push(
        `t=${plan.threadId.slice(-2)} expected override="${plan.expectedOverride}" got "${result.humanOverride}"`
      )
      continue
    }
    console.log(`[B] t=${plan.threadId.slice(-2)} resumed ${gotKind} ✓`)
  }
  return { ok: failures.length === 0, failures }
}

async function cleanupCheckpoints(): Promise<void> {
  for (const plan of THREADS) {
    await pool
      .query(`DELETE FROM checkpoints WHERE thread_id = $1`, [plan.threadId])
      .catch(() => undefined)
    await pool
      .query(`DELETE FROM checkpoint_blobs WHERE thread_id = $1`, [plan.threadId])
      .catch(() => undefined)
    await pool
      .query(`DELETE FROM checkpoint_writes WHERE thread_id = $1`, [plan.threadId])
      .catch(() => undefined)
  }
}

async function main(): Promise<void> {
  console.log('[smoke-hitl-restart-concurrent] starting (N=' + THREADS.length + ')')
  await instanceAPauseAll()
  // Drop Instance A — simulate process death.
  console.log('[A] simulating crash (dropping all in-memory state)')
  const result = await instanceBResumeAll()
  await cleanupCheckpoints()
  if (!result.ok) {
    console.error('[smoke-hitl-restart-concurrent] FAILED', result.failures)
    await pool.end().catch(() => undefined)
    process.exit(1)
  }
  console.log('[smoke-hitl-restart-concurrent] PASSED · N=' + THREADS.length + ' threads')
  await pool.end()
}

main().catch(async (err) => {
  console.error('[smoke-hitl-restart-concurrent] unhandled error', err)
  await pool.end().catch(() => undefined)
  process.exit(1)
})
