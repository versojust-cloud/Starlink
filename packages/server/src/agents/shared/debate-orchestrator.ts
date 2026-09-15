/**
 * Phase 3.2 · Debate Orchestrator. Runs proponent ⇄ opponent ⇄ moderator
 * cycle, emits Phase 3.1 handoffs (debate-turn + debate-verdict).
 */

import type { AgentId } from '../../infrastructure/handoff-log/handoff-types.js'
import { getHandoffLogger } from '../../infrastructure/handoff-log/index.js'
import type {
  DebateLog,
  DebateTurn,
  DebateVerdict,
  DebateConfig
} from './debate-state.js'

// Re-export for downstream consumers (e.g. llm-debate-invoker imports
// DebateTurn / DebateVerdict from this module).
export type { DebateTurn, DebateVerdict, DebateLog, DebateConfig } from './debate-state.js'

export interface RunDebateParams {
  proponent: AgentId
  opponent: AgentId
  moderator: AgentId
  dimension?: string
  traceId: string
  threadId: string
  round: number
  disputedNodeIds: string[]
  config?: DebateConfig
}

export interface DebateAgentInvoker {
  nextTurn(params: {
    speaker: AgentId
    addressee: AgentId
    dimension?: string
    priorTurns: DebateTurn[]
    disputedNodeIds: string[]
  }): Promise<DebateTurn>

  judge(params: {
    moderator: AgentId
    turns: DebateTurn[]
  }): Promise<DebateVerdict>
}

export const scaffoldDebateInvoker: DebateAgentInvoker = {
  async nextTurn({ speaker, addressee, priorTurns, disputedNodeIds }) {
    const round = Math.floor(priorTurns.length / 2) + 1
    const isRebuttal = priorTurns.length % 2 === 1
    return {
      round,
      speaker,
      addressee,
      kind: isRebuttal ? 'rebuttal' : 'claim',
      targetNodeId: disputedNodeIds[0],
      message: `[scaffold] ${speaker} → ${addressee}: ${
        isRebuttal ? 'rebuttal' : 'claim'
      } on round ${round}`,
      citations: []
    }
  },
  async judge({ moderator, turns }) {
    return {
      convergedAfterRounds: Math.ceil(turns.length / 2),
      outcome: { kind: 'max-rounds-reached', decision: 'partial' },
      reasoning: `[scaffold] ${moderator} synthetic verdict`,
      nodeOutcomes: []
    }
  }
}

export async function runDebate(
  params: RunDebateParams,
  invoker: DebateAgentInvoker = scaffoldDebateInvoker
): Promise<DebateLog> {
  const maxRounds = params.config?.maxRounds ?? 3
  const convergencePredicate =
    params.config?.convergencePredicate ?? defaultConvergencePredicate
  const logger = getHandoffLogger(params.threadId)

  const turns: DebateTurn[] = []
  const startedAt = Date.now()
  let converged: 'continue' | 'converged' = 'continue'

  for (let r = 0; r < maxRounds; r++) {
    const propTurn = await invoker.nextTurn({
      speaker: params.proponent,
      addressee: params.opponent,
      dimension: params.dimension,
      priorTurns: turns,
      disputedNodeIds: params.disputedNodeIds
    })
    turns.push(propTurn)
    logger.record({
      from: propTurn.speaker,
      to: propTurn.addressee,
      kind: 'debate-turn',
      payload: propTurn as unknown as Record<string, unknown>,
      meta: {
        round: params.round,
        threadId: params.threadId,
        traceId: params.traceId,
        dimension: params.dimension
      }
    })

    const oppTurn = await invoker.nextTurn({
      speaker: params.opponent,
      addressee: params.proponent,
      dimension: params.dimension,
      priorTurns: turns,
      disputedNodeIds: params.disputedNodeIds
    })
    turns.push(oppTurn)
    logger.record({
      from: oppTurn.speaker,
      to: oppTurn.addressee,
      kind: 'debate-turn',
      payload: oppTurn as unknown as Record<string, unknown>,
      meta: {
        round: params.round,
        threadId: params.threadId,
        traceId: params.traceId,
        dimension: params.dimension
      }
    })

    converged = convergencePredicate(turns)
    if (converged === 'converged') break
  }

  const verdict = await invoker.judge({
    moderator: params.moderator,
    turns
  })
  const endedAt = Date.now()

  logger.record({
    from: params.moderator,
    to: '_system',
    kind: 'debate-verdict',
    payload: {
      convergedAfterRounds: verdict.convergedAfterRounds,
      outcome: verdict.outcome,
      nodeOutcomes: verdict.nodeOutcomes
    },
    meta: {
      round: params.round,
      threadId: params.threadId,
      traceId: params.traceId,
      dimension: params.dimension
    }
  })

  return {
    proponent: params.proponent,
    opponent: params.opponent,
    moderator: params.moderator,
    dimension: params.dimension,
    turns,
    verdict,
    startedAt,
    endedAt
  }
}

function defaultConvergencePredicate(turns: DebateTurn[]): 'converged' | 'continue' {
  if (turns.length < 2) return 'continue'
  const last = turns.at(-1)
  if (last?.kind === 'concession') return 'converged'
  if (turns.length >= 4) {
    const lastFour = turns.slice(-4)
    const allEmpty = lastFour.every((t) => !t.citations || t.citations.length === 0)
    if (allEmpty) return 'converged'
  }
  return 'continue'
}
