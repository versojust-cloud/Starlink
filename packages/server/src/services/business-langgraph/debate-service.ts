/**
 * P15 Sprint 5 · DebateService — adversarial Debate B orchestration.
 *
 * Fifth slice of the BusinessLangGraphService decomposition. Holds the
 * per-conflict debate trigger logic that fires after critic detects a
 * high-severity conflict — proponent (the BMC agent that produced the
 * disputed nodes) vs opponent (the dimension's adversary) with a
 * moderator judging up to N rounds.
 *
 * The actual single-LLM-call mechanics live in
 * `agents/shared/llm-debate-invoker.ts` (orphan-stub-route — no ReAct
 * subgraph, just structured prompts). DebateService is the orchestrator
 * that decides WHEN and BETWEEN WHICH agents debates run.
 *
 * The moderator's heuristic-or-LLM verdict node (~115 LOC `runModerator`)
 * stays in business-langgraph.ts for now — it depends on `this.model`
 * for the LLM call and emits a `generalNodes` insight via
 * `emitGenerationOutput` (CriticService). Becomes a facade calling
 * DebateService once S6 (Synthesis) extraction lands.
 *
 * Public API:
 *   - maybeRunDebates(state, conflicts) — fans out per high-severity
 *     conflict × relatedAgent, runs runDebate(), tracks budget.
 */

import { trace, SpanStatusCode } from '@opentelemetry/api'
import { createAuditLogger } from '@starlink/shared'
import {
  agentRegistry,
  advisorRegistry
} from '../../capabilities/index.js'
import { runDebate } from '../../agents/shared/debate-orchestrator.js'
import { defaultLlmDebateInvoker } from '../../agents/shared/llm-debate-invoker.js'
import { getHandoffLogger } from '../../infrastructure/handoff-log/index.js'
import { getTracer } from '../../infrastructure/telemetry/otel-init.js'
import { ensureDebateBudget, isDebateEnabled } from './debate-budget.js'
import { AGENT_SIGNATURE_TO_ID, OPPONENT_MAP } from './constants.js'
import { parentCtxFor } from './stream-lifecycle.js'
import type { BusinessStateType, CriticConflict } from './state.js'

const auditLogger = createAuditLogger('packages/server:business-langgraph:debate-service')
const otelTracer = getTracer('starlink/business-langgraph')

export class DebateService {
  /**
   * Phase 4.1 · Debate B trigger. Runs after `runCritic` produces the
   * conflicts array. For each high-severity conflict:
   *   for each relatedAgent in conflict:
   *     proponentId = AGENT_SIGNATURE_TO_ID[signature]
   *     opponentId = OPPONENT_MAP[proponentId]
   *     runDebate(proponent, opponent, moderator, ...)
   *
   * Budget gate (A2): each debate is up to (maxRounds × 2 + 1) LLM calls.
   * If even one more debate would exceed the per-trace budget, the loop
   * aborts with a `budget-exceeded` handoff event.
   *
   * No-op when:
   *   - DEBATE_ENABLED=false (process flag)
   *   - moderator agent not registered
   *   - No high-severity conflicts
   */
  async maybeRunDebates(
    state: BusinessStateType,
    conflicts: CriticConflict[]
  ): Promise<void> {
    if (!isDebateEnabled()) return
    if (!agentRegistry.has('moderator')) return
    const highSev = conflicts.filter((c) => c.severity === 'high')
    if (highSev.length === 0) return

    const budget = ensureDebateBudget(state.traceId)
    const handoffLogger = getHandoffLogger(state.traceId)

    for (const conflict of highSev) {
      const related = conflict.relatedAgents ?? []
      for (const signature of related) {
        const proponentId = AGENT_SIGNATURE_TO_ID[signature]
        if (!proponentId) continue
        const opponentId = OPPONENT_MAP[proponentId]
        if (!opponentId) continue
        if (!agentRegistry.has(proponentId)) continue
        if (!advisorRegistry.has(opponentId)) continue

        // A2 budget gate: each runDebate is up to (maxRounds × 2 + 1)
        // LLM calls. We pessimistically assume the worst-case before
        // entering, and abort if even one more debate would put us
        // over the limit. After return we increment by ACTUAL turn
        // count so the budget reflects real usage.
        const worstCaseCalls = 2 * 2 + 1 // maxRounds=2 × 2 turns + judge
        if (budget.used + worstCaseCalls > budget.limit) {
          handoffLogger.record({
            from: '_system',
            to: '_canvas',
            kind: 'budget-exceeded',
            payload: {
              budgetKind: 'debate-llm-calls',
              limit: budget.limit,
              used: budget.used,
              context: `debate(${proponentId} vs ${opponentId}) on conflict ${conflict.id}`
            },
            meta: {
              round: state.roundNumber,
              threadId: state.traceId,
              traceId: state.traceId
            }
          })
          // Bail entire loop — once over budget, no further debates.
          return
        }

        const debateSpan = otelTracer.startSpan(
          'business.debate.run',
          {
            attributes: {
              'starlink.proponent': proponentId,
              'starlink.opponent': opponentId,
              'starlink.round': state.roundNumber,
              'starlink.conflict_id': conflict.id,
              'starlink.trace_id': state.traceId
            }
          },
          parentCtxFor(state.traceId)
        )
        try {
          const log = await runDebate(
            {
              proponent: proponentId,
              opponent: opponentId,
              moderator: 'moderator',
              dimension: conflict.conflictType ?? undefined,
              traceId: state.traceId,
              threadId: state.traceId,
              round: state.roundNumber,
              disputedNodeIds: [conflict.id],
              config: { maxRounds: 2 }
            },
            defaultLlmDebateInvoker
          )
          // Increment by ACTUAL LLM calls: 1 per turn + 1 judge.
          // runDebate returns DebateLog with `.turns: DebateTurn[]`.
          const turnCount = log?.turns?.length ?? worstCaseCalls - 1
          budget.used += turnCount + 1
        } catch (err) {
          // On error we still charge the worst-case so a flapping
          // debate can't loop unboundedly past the budget.
          budget.used += worstCaseCalls
          debateSpan.recordException(err as Error)
          debateSpan.setStatus({ code: SpanStatusCode.ERROR, message: String(err) })
          auditLogger.warn({
            action: 'debate-service.maybeRunDebates.debate-failed',
            requestId: state.traceId,
            workflowId: state.workspaceId,
            userId: state.userId,
            metadata: {
              proponent: proponentId,
              opponent: opponentId,
              conflictId: conflict.id,
              error: String(err)
            }
          })
        } finally {
          debateSpan.end()
        }
      }
    }
    void trace // keep import alive (used inside debateSpan attributes)
  }
}
