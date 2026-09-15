/**
 * Phase 3.2 · Debate state shape (Society of Mind / B).
 */

import type { AgentId } from '../../infrastructure/handoff-log/handoff-types.js'

export type DebateTurnKind = 'claim' | 'rebuttal' | 'concession' | 'question'

export interface DebateTurn {
  round: number
  speaker: AgentId
  addressee: AgentId
  kind: DebateTurnKind
  targetNodeId?: string
  message: string
  citations?: string[]
}

export type DebateOutcome =
  | { kind: 'consensus'; ratifiedNodes: string[] }
  | { kind: 'opponent-wins'; invalidatedNodes: string[] }
  | { kind: 'escalate'; reason: string }
  | { kind: 'max-rounds-reached'; decision: 'accept' | 'reject' | 'partial' }

export interface DebateVerdict {
  convergedAfterRounds: number
  outcome: DebateOutcome
  reasoning: string
  nodeOutcomes: Array<{
    nodeId: string
    status: 'ratified' | 'invalidated' | 'edited' | 'pending'
    edits?: string
  }>
}

export interface DebateLog {
  proponent: AgentId
  opponent: AgentId
  moderator: AgentId
  dimension?: string
  turns: DebateTurn[]
  verdict: DebateVerdict
  startedAt: number
  endedAt: number
}

export interface DebateConfig {
  maxRounds?: number
  convergencePredicate?: (turns: DebateTurn[]) => 'converged' | 'continue'
}
