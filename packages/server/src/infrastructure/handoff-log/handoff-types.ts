/**
 * Phase 3.1 · Inter-Agent Handoff Protocol
 *
 * Every time one agent hands information to another, we emit a Handoff
 * event. The log is the foundation for:
 *   - debate convergence analysis
 *   - benchmark metrics (revision-efficiency, escalation rate)
 *   - paper figure: agent-interaction timeline per case
 */

export type AgentId = string

export type HandoffKind =
  | 'task-assignment'
  | 'generation-output'
  | 'critique'
  | 'revision-request'
  | 'escalation'
  | 'completion'
  | 'debate-turn'
  | 'debate-verdict'
  | 'action-invocation'
  | 'action-result'
  /**
   * Emitted when a registered-agent (registry-mode) subgraph invocation
   * fails and the orchestrator falls through to legacy inline-LLM. The
   * conversation continues, but the agent's "registered" path didn't
   * deliver — operators need to know about the silent downgrade.
   */
  | 'agent-degraded'
  /**
   * Emitted when a debate or other LLM-budgeted operation hits its
   * per-trace ceiling and aborts gracefully instead of recursing further.
   * Conflict ends up unresolved; critic state moves on.
   */
  | 'budget-exceeded'

export interface HandoffMeta {
  round: number
  threadId: string
  traceId: string
  dimension?: string
}

export interface Handoff {
  t: number
  from: AgentId
  to: AgentId
  kind: HandoffKind
  payload: Record<string, unknown>
  meta: HandoffMeta
}

export interface TaskAssignmentPayload {
  promptVars?: Record<string, unknown>
  overrides?: Record<string, unknown>
  reason: string
  capability?: string
}

export interface GenerationOutputPayload {
  nodeCount: number
  nodeIds: string[]
  tokensUsed?: number
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>
}

export interface RevisionRequestPayload {
  conflictId: string
  severity: 'high' | 'medium' | 'low'
  conflictType: string
  summary: string
  suggestedChange?: string
}

export interface DebateTurnPayload {
  speaker: AgentId
  addressee: AgentId
  claimOrRebuttal: 'claim' | 'rebuttal' | 'concession' | 'question'
  targetNodeId?: string
  message: string
  citations?: string[]
}

export interface DebateVerdictPayload {
  convergedAfterRounds: number
  winner: AgentId | 'tie' | 'unresolved'
  reasoning: string
}

export interface ActionInvocationPayload {
  toolName: string
  dimension: string
  args: Record<string, unknown>
}

export interface ActionResultPayload {
  toolName: string
  ok: boolean
  resultSummary: string
  error?: string
}

export interface AgentDegradedPayload {
  /** Which agent's registry path failed. */
  agentId: string
  /** Error message from the subgraph attempt. */
  error: string
  /** Path the orchestrator fell back to. */
  fallback: 'legacy-inline-llm' | 'rule-based' | 'noop'
}

export interface BudgetExceededPayload {
  /** What budget hit its ceiling. */
  budgetKind: 'debate-llm-calls' | 'debate-rounds'
  /** Configured limit (numeric). */
  limit: number
  /** Actual usage that triggered the abort. */
  used: number
  /** Free-text describing what was aborted (e.g. "debate on conflict X"). */
  context: string
}

export interface HandoffLogger {
  record(event: Omit<Handoff, 't'>): void
  dump(): Handoff[]
  subscribe(cb: (h: Handoff) => void): () => void
  clear(): void
  readonly size: number
}
