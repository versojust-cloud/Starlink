/**
 * Per-trace debate-LLM-call budget + orchestration-mode/ debate-enabled
 * env flag helpers. Extracted from business-langgraph.ts (Stage 4d).
 *
 * Module-scoped `DEBATE_BUDGET` map is intentional — the budget is a
 * process-wide property of an in-flight conversation, not of any single
 * orchestrator instance. Tests that need isolation should call
 * `releaseDebateBudget(traceId)` between cases.
 */

export type OrchestrationMode = 'legacy' | 'registry'

export function getOrchestrationMode(): OrchestrationMode {
  return process.env.ORCHESTRATION_MODE === 'registry' ? 'registry' : 'legacy'
}

export function isDebateEnabled(): boolean {
  // P11.18 · Ablation override: when ABLATION_DISABLE_DEBATE=true,
  // debate is forced off regardless of DEBATE_ENABLED. Used by
  // yc-vs-runners.ts --no-debate to measure BMC quality without
  // adversarial loop.
  if (process.env.ABLATION_DISABLE_DEBATE === 'true') return false
  return process.env.DEBATE_ENABLED === 'true'
}

/**
 * A2 hardening (2026-04-29): per-trace budget on debate LLM calls.
 *
 * `runDebate` does up to `maxRounds` × 2 turns + 1 judge call per
 * invocation, and `maybeRunDebates` calls it once per (high-severity
 * conflict × related agent). With 3 conflicts × 2 related agents ×
 * (2 rounds × 2 turns + 1 judge) = 30 LLM calls per critic round.
 * Repeated over MAX_ROUNDS supervisor cycles → cost can spike
 * unboundedly for pathological inputs.
 *
 * We budget total debate-related LLM calls per trace (env
 * `MAX_DEBATE_LLM_CALLS_PER_TRACE`, default 10). Once hit, subsequent
 * `runDebate` invocations are skipped + emit a `budget-exceeded`
 * handoff so operators see what was aborted. Conflicts that didn't
 * get debated still go through the regular revision-request path —
 * just without the deliberative back-and-forth.
 */
/**
 * P11.13 / T3.3 · entries carry a `createdAt` timestamp so the periodic
 * sweeper below can evict stale rows that the caller's `finally` block
 * forgot to release (e.g. if the streamConversation pipeline crashed
 * before reaching releaseDebateBudget).
 */
type BudgetEntry = { used: number; limit: number; createdAt: number }
const DEBATE_BUDGET = new Map<string, BudgetEntry>()

export function getDebateBudgetLimit(): number {
  const raw = Number(process.env.MAX_DEBATE_LLM_CALLS_PER_TRACE ?? '10')
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10
}

export function ensureDebateBudget(traceId: string): { used: number; limit: number } {
  let entry = DEBATE_BUDGET.get(traceId)
  if (!entry) {
    entry = { used: 0, limit: getDebateBudgetLimit(), createdAt: Date.now() }
    DEBATE_BUDGET.set(traceId, entry)
  }
  return entry
}

export function releaseDebateBudget(traceId: string): void {
  DEBATE_BUDGET.delete(traceId)
}

/**
 * P11.13 / T3.3 · sweep stale entries. A `finally` block in
 * streamConversation already calls releaseDebateBudget on the happy +
 * exception paths, but uncaught crashes (process kill mid-stream) can
 * still leak entries. Run a sweeper every 10 min that drops anything
 * older than 1 hour. Net memory impact: zero in steady state.
 *
 * Lazy-installed on first ensureDebateBudget call so test isolation
 * (and short-lived CLI scripts) don't pay the timer overhead.
 */
const BUDGET_TTL_MS = Number(process.env.DEBATE_BUDGET_TTL_MS) || 60 * 60 * 1000
const BUDGET_SWEEP_INTERVAL_MS = Number(process.env.DEBATE_BUDGET_SWEEP_MS) || 10 * 60 * 1000

let sweepTimer: NodeJS.Timeout | null = null

function startBudgetSweeperOnce(): void {
  if (sweepTimer) return
  sweepTimer = setInterval(() => {
    const now = Date.now()
    for (const [traceId, entry] of DEBATE_BUDGET) {
      if (now - entry.createdAt >= BUDGET_TTL_MS) {
        DEBATE_BUDGET.delete(traceId)
      }
    }
  }, BUDGET_SWEEP_INTERVAL_MS)
  // Allow Node.js to exit even if the interval is still pending
  // (e.g. graceful shutdown / one-shot scripts).
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref()
}

// Side-effect on import: arm the sweeper. Safe because it's idempotent.
startBudgetSweeperOnce()
