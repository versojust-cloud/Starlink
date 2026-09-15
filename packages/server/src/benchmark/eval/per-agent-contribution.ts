/**
 * Phase 4.3 · Per-agent contribution computation + scorers.
 */

import type { Handoff } from '../../infrastructure/handoff-log/handoff-types.js'
import type {
  BenchmarkCase,
  BenchmarkRun,
  MetricScore,
  PerAgentContribution
} from '../types.js'

const ZERO_ROW = (): PerAgentContribution[string] => ({
  generations: 0,
  revisions_received: 0,
  critiques_emitted: 0,
  debate_turns: 0,
  actions_invoked: 0,
  escalations: 0
})

function ensureRow(
  acc: PerAgentContribution,
  agentId: string
): PerAgentContribution[string] {
  if (!acc[agentId]) acc[agentId] = ZERO_ROW()
  return acc[agentId]!
}

export function computePerAgentContribution(handoffs: Handoff[]): PerAgentContribution {
  const acc: PerAgentContribution = {}
  for (const h of handoffs) {
    const fromIsAgent = !h.from.startsWith('_')
    const toIsAgent = !h.to.startsWith('_')
    switch (h.kind) {
      case 'generation-output':
        if (fromIsAgent) ensureRow(acc, h.from).generations++
        break
      case 'revision-request':
        if (toIsAgent) ensureRow(acc, h.to).revisions_received++
        if (fromIsAgent) ensureRow(acc, h.from).critiques_emitted++
        break
      case 'critique':
        if (fromIsAgent) ensureRow(acc, h.from).critiques_emitted++
        break
      case 'debate-turn':
        if (fromIsAgent) ensureRow(acc, h.from).debate_turns++
        break
      case 'action-invocation':
        if (fromIsAgent) ensureRow(acc, h.from).actions_invoked++
        break
      case 'escalation':
        if (fromIsAgent) ensureRow(acc, h.from).escalations++
        break
      default:
        break
    }
  }
  return acc
}

export function scoreTeamBalance(_case: BenchmarkCase, run: BenchmarkRun): MetricScore {
  const contrib = run.output.per_agent_contribution ?? {}
  const generators = Object.entries(contrib)
    .filter(([id]) => id.endsWith('-agent') && !id.includes('opponent'))
    .map(([id, row]) => ({ id, generations: row.generations }))

  if (generators.length === 0) {
    return { name: 'team_balance', score: 0, detail: { reason: 'no generator activity' } }
  }
  if (generators.length === 1) {
    return {
      name: 'team_balance',
      score: 0.5,
      detail: { reason: 'single generator active', generators }
    }
  }

  const counts = generators.map((g) => g.generations)
  const total = counts.reduce((a, b) => a + b, 0)
  if (total === 0) {
    return { name: 'team_balance', score: 0, detail: { reason: 'no generations recorded' } }
  }
  const mean = total / counts.length
  const variance = counts.reduce((acc, c) => acc + (c - mean) ** 2, 0) / counts.length
  const stdev = Math.sqrt(variance)
  const cv = mean > 0 ? Math.min(1, stdev / mean) : 1
  return {
    name: 'team_balance',
    score: Math.max(0, 1 - cv),
    detail: { generators, total, mean, stdev }
  }
}

export function scoreCriticEngagement(
  _case: BenchmarkCase,
  run: BenchmarkRun
): MetricScore {
  const contrib = run.output.per_agent_contribution ?? {}
  const critic = contrib['critic-agent']
  if (!critic) {
    return { name: 'critic_engagement', score: 0, detail: { reason: 'no critic activity' } }
  }
  const critiques = critic.critiques_emitted
  const score = Math.min(1, critiques / 5)
  return {
    name: 'critic_engagement',
    score,
    detail: { critiques_emitted: critiques, debates: critic.debate_turns }
  }
}

export function summarisePerAgentContribution(
  contrib: PerAgentContribution
): Array<{ agentId: string; summary: string; totalActivity: number }> {
  return Object.entries(contrib)
    .map(([agentId, row]) => {
      const totalActivity =
        row.generations +
        row.revisions_received +
        row.critiques_emitted +
        row.debate_turns +
        row.actions_invoked +
        row.escalations
      const summary = [
        `gen=${row.generations}`,
        `recv=${row.revisions_received}`,
        `crit=${row.critiques_emitted}`,
        `debate=${row.debate_turns}`,
        `act=${row.actions_invoked}`,
        row.escalations > 0 ? `esc=${row.escalations}` : ''
      ]
        .filter(Boolean)
        .join(' ')
      return { agentId, summary, totalActivity }
    })
    .sort((a, b) => b.totalActivity - a.totalActivity)
}
