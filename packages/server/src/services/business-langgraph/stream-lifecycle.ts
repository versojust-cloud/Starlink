/**
 * P15 Sprint 1 · Stream lifecycle helpers extracted from
 * `BusinessLangGraphService.streamConversation`.
 *
 * The full streamConversation method is a 480-line generator with two
 * orthogonal concerns:
 *
 *   1. Lifecycle scaffold — heartbeat timer, handoff log subscribe/unsubscribe,
 *      OTel span open/close, run-end persistence summary, span context map
 *      registration. ← This file.
 *
 *   2. Per-node update routing — switch on nodeName, dispatch to canvas
 *      builder, accumulate counters. ← Stays inline in business-langgraph.ts
 *      until Sprint 3 (GenerationService) when the switch can move into the
 *      service that owns each node.
 *
 * The lifecycle helpers below are the first slice of P15's extraction:
 * pure functions / small classes with no orchestrator coupling. They
 * accept the dependencies they need explicitly and return cleanup hooks.
 *
 * Each helper has a one-line docstring on top describing the invariant
 * it preserves.
 */

import { trace, context as otelContext, type Context as OtelContext, SpanStatusCode } from '@opentelemetry/api'
import type { Span } from '@opentelemetry/api'
import { nanoid } from 'nanoid'
import { getTracer } from '../../infrastructure/telemetry/otel-init.js'
import {
  getHandoffLogger,
  releaseHandoffLogger,
  type Handoff,
  type HandoffLogger
} from '../../infrastructure/handoff-log/index.js'
import { releaseDebateBudget } from './debate-budget.js'
import { createAuditLogger } from '@starlink/shared'

const otelTracer = getTracer('starlink/business-langgraph')
import type { ConversationMemoryStore } from '../../application/conversation-memory-store.js'
import type { BusinessStreamUpdate } from './state.js'

const auditLogger = createAuditLogger('packages/server:business-langgraph:stream-lifecycle')

const HEARTBEAT_INTERVAL_MS = 30_000

/** Module-level OTel span context map keyed by traceId. Lookup is used
 *  by `parentCtx(traceId)` in business-langgraph.ts so child spans
 *  (per-agent invocations) attach to the right parent. */
export const businessSpanContexts = new Map<string, OtelContext>()

export type StreamLifecycleDeps = {
  conversationMemoryStore: ConversationMemoryStore
}

export type StreamLifecycleContext = {
  workspaceId: string
  userId: string
  traceId: string
}

export type StreamLifecycleHandles = {
  /** OTel root span for this conversation. Children attach via `businessCtx`. */
  span: Span
  /** OTel context bound to `span` — register this in businessSpanContexts. */
  businessCtx: OtelContext
  /** Handoff logger instance (registered for this traceId). */
  handoffLogger: HandoffLogger
  /** Drains queued handoffs into BusinessStreamUpdate items.
   *  Call between yield points to flush. */
  drainHandoffs: () => BusinessStreamUpdate[]
  /** Unsubscribe handoff logger; call once at end of stream (in cleanup). */
  unsubscribeHandoff: () => void
  /** Stop heartbeat timer; called once in cleanup. */
  stopHeartbeat: () => void
  /** True if `streamStartedAt` should be considered the wall-clock start. */
  streamStartedAt: number
}

/**
 * Open OTel span + register span ctx + start heartbeat + subscribe handoff
 * logger. Returns a bag of handles + cleanup callbacks. The caller (the
 * streaming generator) is expected to:
 *
 *   1. Attach `handles.businessCtx` so child spans link to the root.
 *   2. Drain `handles.drainHandoffs()` between every yield iteration.
 *   3. Call `closeStreamLifecycle(handles, ...)` from a finally block.
 *
 * Invariants preserved:
 *   - heartbeat row is touched IMMEDIATELY after open (so heartbeat_at is
 *     non-null before the first 30s tick → reaper doesn't false-positive
 *     a brand-new session as stale).
 *   - businessSpanContexts.set is paired with .delete in close (no leak).
 *   - handoffLogger is subscribed BEFORE first iteration (otherwise the
 *     first round's events drain into an empty queue).
 */
export function openStreamLifecycle(
  deps: StreamLifecycleDeps,
  context: StreamLifecycleContext
): StreamLifecycleHandles {
  const span = otelTracer.startSpan('business.streamConversation', {
    attributes: {
      'starlink.workspace_id': context.workspaceId,
      'starlink.user_id': context.userId,
      'starlink.trace_id': context.traceId
    }
  })
  const businessCtx = trace.setSpan(otelContext.active(), span)
  businessSpanContexts.set(context.traceId, businessCtx)

  // Heartbeat: 30s interval + immediate prime. Without the prime, heartbeat_at
  // would be NULL until the first interval fires; the reaper grace window
  // prevents false-positives but the contract is cleaner with non-null
  // ASAP.
  const ownerPid = `gateway-${process.pid}-${nanoid(6)}`
  const heartbeatTimer = setInterval(() => {
    void deps.conversationMemoryStore
      .touchHeartbeat(context.traceId, ownerPid)
      .catch((err) => {
        auditLogger.warn({
          action: 'stream-lifecycle.heartbeat.failed',
          requestId: context.traceId,
          workflowId: context.workspaceId,
          userId: context.userId,
          metadata: { error: err instanceof Error ? err.message : String(err) }
        })
      })
  }, HEARTBEAT_INTERVAL_MS)
  void deps.conversationMemoryStore
    .touchHeartbeat(context.traceId, ownerPid)
    .catch(() => undefined)

  // Handoff queue + subscriber. The subscriber pushes into an in-memory
  // queue; the generator drains it between yields so events appear in
  // chronological order on the wire.
  const handoffLogger = getHandoffLogger(context.traceId)
  const handoffQueue: Handoff[] = []
  const unsubscribeHandoff = handoffLogger.subscribe((h) => handoffQueue.push(h))
  const drainHandoffs = (): BusinessStreamUpdate[] => {
    const out: BusinessStreamUpdate[] = []
    while (handoffQueue.length > 0) {
      const h = handoffQueue.shift()
      if (h) out.push({ type: 'handoff', handoff: h })
    }
    return out
  }

  return {
    span,
    businessCtx,
    handoffLogger,
    drainHandoffs,
    unsubscribeHandoff,
    stopHeartbeat: () => clearInterval(heartbeatTimer),
    streamStartedAt: Date.now()
  }
}

/**
 * Close all lifecycle resources opened by `openStreamLifecycle`. Idempotent
 * w.r.t. handoff drain (caller drains again after invoking).
 *
 * Pairs every set/subscribe in open with a corresponding delete/unsubscribe,
 * preventing leaks if the orchestrator is recreated mid-process.
 *
 * Caller is responsible for:
 *   - The final yield 'status' event (this fn doesn't yield).
 *   - The final writeConversationSummary / persistence-warning yield (those
 *     are higher-level concerns owned by the orchestrator's finally block).
 */
export function closeStreamLifecycle(
  handles: StreamLifecycleHandles,
  context: StreamLifecycleContext,
  outcome: 'completed' | 'failed',
  error?: Error
): void {
  if (outcome === 'failed' && error) {
    handles.span.recordException(error)
    handles.span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
  }
  handles.stopHeartbeat()
  handles.unsubscribeHandoff()
  releaseHandoffLogger(context.traceId)
  releaseDebateBudget(context.traceId)
  businessSpanContexts.delete(context.traceId)
  handles.span.end()
}

/**
 * Look up the OTel context for a traceId. Used by per-agent span creation
 * to attach to the right parent business span. Returns the active context
 * if no entry exists (defensive — should never be the case for active
 * streams).
 */
export function parentCtxFor(traceId: string): OtelContext {
  return businessSpanContexts.get(traceId) ?? otelContext.active()
}
