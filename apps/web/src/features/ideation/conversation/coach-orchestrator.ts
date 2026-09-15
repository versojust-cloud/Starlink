'use client'

/**
 * Coach Orchestrator (Stage B).
 *
 * Routes coach events through the LLM endpoint at /api/ideation/reflect with
 * debounce + fallback. Module-level singleton state — there's exactly one
 * canvas per page, so per-instance state is OK.
 *
 * Design contract:
 *   schedule(event, getContext, scriptedFallback, callbacks)
 *
 *   1. Debounces 800 ms — rapid canvas events coalesce; only the LAST event
 *      actually hits the LLM. Prevents reflection-spam when user drags 5
 *      nodes in 2 seconds.
 *   2. Aborts the previous in-flight fetch when a new schedule() arrives —
 *      otherwise stale LLM responses could overtake fresh ones.
 *   3. Calls onStart() right before fetch (caller flips coachThinking=true).
 *   4. Calls onComplete() with the result. Result.source is one of:
 *      - 'llm' : DeepSeek returned valid JSON
 *      - 'scripted' : LLM endpoint returned source:'error' (its own fallback),
 *                     OR network/HTTP failed and we used the local fallback
 *      - 'error' : both LLM and local fallback gave nothing useful
 *   5. Caller is responsible for setting coachThinking=false in onComplete.
 */

import type { CoachEvent, Reflection, ScaffoldKind } from './coach-engine'
import type {
  ReflectionRequest,
  ReflectionResponse
} from '../types/coach-rpc-types'

export interface OrchestratorContext {
  /** lightweight canvas snapshot suitable for sending over the wire */
  canvas: ReflectionRequest['canvas']
  /** last ≤ 8 user/ai exchange */
  recentChat: ReflectionRequest['recentChat']
  /** ids of meta prompts already shown — server SHOULD avoid these themes */
  firedMetaIds: string[]
}

export interface OrchestratorResult {
  content: string
  scaffold: ScaffoldKind
  source: 'llm' | 'scripted' | 'error'
  latencyMs?: number
}

export interface OrchestratorCallbacks {
  /** Called once the debounce settles and the network request begins. */
  onStart(): void
  /** Called with the final reflection (LLM or fallback). */
  onComplete(result: OrchestratorResult): void
}

interface ScheduleOpts {
  debounceMs?: number
  /** override endpoint URL — primarily for tests. Default: /api/ideation/reflect */
  endpoint?: string
}

// =============================================================================
// Module-level state (single in-flight request at a time)
// =============================================================================

let pendingTimer: ReturnType<typeof setTimeout> | null = null
let inflight: AbortController | null = null

/**
 * Schedule a reflection. Returns immediately — result arrives via callbacks.
 *
 * `scriptedFallback` is the locally-computed reflection used if the LLM
 * endpoint fails. The store computes it BEFORE calling schedule() so the
 * fallback path is synchronous and trivial.
 */
export function scheduleReflection(
  event: CoachEvent,
  getContext: () => OrchestratorContext,
  scriptedFallback: Reflection | null,
  callbacks: OrchestratorCallbacks,
  opts: ScheduleOpts = {}
): void {
  const debounceMs = opts.debounceMs ?? 800
  const endpoint = opts.endpoint ?? '/api/ideation/reflect'

  // Cancel any pending debounce — only the latest event survives
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  // Abort any in-flight request — its response is now stale
  if (inflight) {
    inflight.abort()
    inflight = null
  }

  pendingTimer = setTimeout(async () => {
    pendingTimer = null
    callbacks.onStart()

    const ctx = getContext()
    inflight = new AbortController()

    try {
      const body: ReflectionRequest = {
        event: serializeEventForRpc(event),
        canvas: ctx.canvas,
        recentChat: ctx.recentChat,
        firedMetaIds: ctx.firedMetaIds
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: inflight.signal
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ReflectionResponse

      callbacks.onComplete({
        content: json.content,
        scaffold: json.scaffold,
        source: json.source, // 'llm' | 'error' (route never returns 'scripted')
        latencyMs: json.latencyMs
      })
    } catch (err) {
      // Quietly drop aborted requests (newer schedule() superseded us)
      if (err instanceof Error && err.name === 'AbortError') return

      // Network / parse failure — use the locally pre-computed scripted fallback
      const fallback = scriptedFallback
      if (fallback) {
        callbacks.onComplete({
          content: fallback.content,
          scaffold: fallback.scaffold,
          source: 'scripted'
        })
      } else {
        callbacks.onComplete({
          content: '思考中… 暂时没有新的反思。',
          scaffold: 'meta',
          source: 'error'
        })
      }
    } finally {
      inflight = null
    }
  }, debounceMs)
}

/**
 * Cancel any pending reflection. Call on unmount or when the user manually
 * resets the canvas — avoids a stale "thinking…" bubble.
 */
export function cancelPendingReflection(): void {
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  if (inflight) {
    inflight.abort()
    inflight = null
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** Convert a CoachEvent (canvas-side type) to the RPC discriminated union. */
function serializeEventForRpc(event: CoachEvent): ReflectionRequest['event'] {
  switch (event.type) {
    case 'node-added':
      return { type: 'node-added', kind: event.kind, label: event.label }
    case 'node-linked':
      return { type: 'node-linked', fromKind: event.fromKind, toKind: event.toKind }
    case 'meta-check':
      return { type: 'meta-check' }
    case 'manual-reflect':
      // Manual reflect is sent over the wire as a meta-check too — the LLM
      // sees the canvas + chat history and produces a fresh observation.
      // The "explicit user intent" is conveyed via firedMetaIds being
      // intentionally cleared by the caller (so all triggers can re-fire).
      return { type: 'meta-check' }
    case 'node-edited':
      // No dedicated RPC variant for edits in Stage B; promote to node-added
      // so the LLM still gets *something* useful.
      return { type: 'node-added', kind: event.kind, label: event.label }
  }
}
