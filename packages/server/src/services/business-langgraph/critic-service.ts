/**
 * P15 Sprint 4 · CriticService — review + HITL + observability emit.
 *
 * Fourth slice of the BusinessLangGraphService decomposition. Holds the
 * non-LangGraph pieces of the critic flow: HITL directive set/consume +
 * the three handoff-log emit helpers (generation-output, agent-degraded,
 * revision-request).
 *
 * The heavy `runCritic` method (~280 LOC) remains in business-langgraph.ts
 * for now — it intertwines with LangGraph node wiring, registry vs legacy
 * routing, and conflict construction logic that depends on multiple
 * un-extracted services. It becomes a facade calling CriticService once
 * S5+S6 land.
 *
 * Public API:
 *   - setHitlResumeDirective(traceId, directive) — dual-write Map + PG
 *   - consumeHitlResumeDirective(traceId) — Map-first, PG fallback
 *   - emitGenerationOutput(state, agent, nodes, usage?)
 *   - emitAgentDegraded(state, agent, error, fallback)
 *   - emitRevisionRequests(state, conflicts) — fan-out per relatedAgent
 */

import { trace } from '@opentelemetry/api'
import { createAuditLogger } from '@starlink/shared'
import type { ConversationMemoryStore } from '../../application/conversation-memory-store.js'
import {
  getHandoffLogger,
  type GenerationOutputPayload,
  type RevisionRequestPayload
} from '../../infrastructure/handoff-log/index.js'
import type { HitlResumeDirective } from '../../application/hitl-resume.js'
import type { BusinessStateType, MacraNodeData, CriticConflict } from './state.js'

const auditLogger = createAuditLogger('packages/server:business-langgraph:critic-service')

export class CriticService {
  /** Same-process Map for HITL directive hot path. Cross-process recovery
   *  reads from conversation_sessions.hitl_directive. */
  private readonly hitlResumeDirectives = new Map<string, HitlResumeDirective>()

  constructor(private readonly conversationMemoryStore: ConversationMemoryStore) {}

  /**
   * Phase 2.6 / P11.16 · publish a HITL resume directive. Writes to BOTH
   * in-memory Map (fast path) AND conversation_sessions.hitl_directive
   * (durable fallback for cross-process recovery). Returns the in-memory
   * write's promise so callers can await durable persistence if needed.
   */
  async setHitlResumeDirective(traceId: string, directive: HitlResumeDirective): Promise<void> {
    if (!traceId) return
    this.hitlResumeDirectives.set(traceId, directive)
    try {
      await this.conversationMemoryStore.setHitlDirective(
        traceId,
        directive as unknown as Record<string, unknown>
      )
    } catch (err) {
      auditLogger.warn({
        action: 'critic-service.setHitlResumeDirective.persist-failed',
        requestId: traceId,
        metadata: { err: err instanceof Error ? err.message : String(err) }
      })
    }
  }

  /**
   * Phase 2.6 / P11.16 · consume the HITL resume directive. Tries Map
   * first (same-process hot path); on miss falls back to PG read+clear
   * so a directive set in process A is consumable by process B after
   * a gateway restart.
   */
  async consumeHitlResumeDirective(traceId: string): Promise<HitlResumeDirective | null> {
    if (!traceId) return null
    const cached = this.hitlResumeDirectives.get(traceId)
    if (cached) {
      this.hitlResumeDirectives.delete(traceId)
      // Best-effort clear of DB row too so a future restart doesn't
      // re-apply the same directive.
      this.conversationMemoryStore
        .consumeHitlDirective(traceId)
        .catch(() => {/* tolerated — DB may be down; in-memory was authoritative */})
      return cached
    }
    try {
      const persisted = await this.conversationMemoryStore.consumeHitlDirective(traceId)
      if (!persisted) return null
      return persisted as unknown as HitlResumeDirective
    } catch (err) {
      auditLogger.warn({
        action: 'critic-service.consumeHitlResumeDirective.read-failed',
        requestId: traceId,
        metadata: { err: err instanceof Error ? err.message : String(err) }
      })
      return null
    }
  }

  /** Phase 3.1 · emit a `generation-output` handoff after an agent's
   *  ReAct subgraph or legacy LLM path produces nodes. Fans into the
   *  benchmark `team_balance` metric (per-agent contribution). */
  emitGenerationOutput(
    state: BusinessStateType,
    agentNodeName: string,
    nodes: MacraNodeData[],
    usage?: Record<string, number> | undefined
  ): void {
    const payload: GenerationOutputPayload = {
      nodeCount: nodes.length,
      nodeIds: nodes.map((n) => n.id),
      tokensUsed: usage?.['totalTokens'] ?? usage?.['total_tokens']
    }
    getHandoffLogger(state.traceId).record({
      from: agentNodeName,
      to: 'synthesizer',
      kind: 'generation-output',
      payload: payload as unknown as Record<string, unknown>,
      meta: {
        round: state.roundNumber,
        threadId: state.traceId,
        traceId: state.traceId
      }
    })
    trace.getActiveSpan()?.addEvent('handoff', {
      kind: 'generation-output',
      from: agentNodeName,
      to: 'synthesizer',
      'starlink.node_count': nodes.length
    })
  }

  /**
   * A4 hardening (2026-04-29): make subgraph-fallback observable.
   *
   * Fired when a registry-mode subgraph invocation throws and the
   * orchestrator falls through to legacy inline-LLM. The conversation
   * keeps going (graceful degradation by design), but operators need to
   * see the silent downgrade in the audit trail — pre-A4 it only showed
   * up as "agent ran slightly slower than usual" which is not actionable.
   */
  emitAgentDegraded(
    state: BusinessStateType,
    agentId: string,
    error: unknown,
    fallback: 'legacy-inline-llm' | 'rule-based' | 'noop' | 'legacy-supervisor'
  ): void {
    const message = error instanceof Error ? error.message : String(error)
    getHandoffLogger(state.traceId).record({
      from: agentId,
      to: '_system',
      kind: 'agent-degraded',
      payload: {
        agentId,
        error: message,
        fallback
      },
      meta: {
        round: state.roundNumber,
        threadId: state.traceId,
        traceId: state.traceId
      }
    })
    trace.getActiveSpan()?.addEvent('agent-degraded', {
      'starlink.agent_id': agentId,
      'starlink.fallback': fallback,
      'starlink.error': message.slice(0, 200)
    })
  }

  /** Phase 3.1 · emit `revision-request` handoffs from critic to each
   *  affected agent. Fans out per (conflict × relatedAgent). Fed by
   *  benchmark `revision_efficiency` metric. */
  emitRevisionRequests(
    state: BusinessStateType,
    conflicts: CriticConflict[]
  ): void {
    if (conflicts.length === 0) return
    const logger = getHandoffLogger(state.traceId)
    for (const conflict of conflicts) {
      const targets = conflict.relatedAgents ?? []
      for (const target of targets) {
        const payload: RevisionRequestPayload = {
          conflictId: conflict.id,
          severity: conflict.severity ?? 'medium',
          conflictType: conflict.conflictType ?? 'other',
          summary: conflict.label,
          suggestedChange: conflict.content.split('\n')[0]
        }
        logger.record({
          from: 'critic-agent',
          to: target,
          kind: 'revision-request',
          payload: payload as unknown as Record<string, unknown>,
          meta: {
            round: state.roundNumber,
            threadId: state.traceId,
            traceId: state.traceId
          }
        })
        trace.getActiveSpan()?.addEvent('handoff', {
          kind: 'revision-request',
          from: 'critic-agent',
          to: target,
          'starlink.conflict_id': conflict.id,
          'starlink.severity': conflict.severity ?? 'medium'
        })
      }
    }
  }
}
