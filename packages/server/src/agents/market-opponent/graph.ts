/**
 * Market-opponent agent registration (orphan — see orphan-subgraph-stub.ts).
 *
 * Profile is read by `LlmDebateInvoker.nextTurn()` directly when debate
 * is triggered for a market-related conflict. LangGraph subgraph
 * invocation is not wired — stub used to skip `.compile()` at boot.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  makeProfileGetter,
  profileToAdvisorDescriptor,
  registerAdvisor,
  type RelevanceScorer
} from '../../capabilities/index.js'
import { getOrphanSubgraphStub } from '../shared/orphan-subgraph-stub.js'

const here = dirname(fileURLToPath(import.meta.url))
const getProfile = makeProfileGetter(join(here, 'agent.yaml'))

interface OpponentRelevantState {
  roundNumber?: number
  conflicts?: Array<{ relatedAgents?: string[]; severity?: string }>
}

const relevanceScorer: RelevanceScorer<OpponentRelevantState> = (state) => {
  if (!state.conflicts) return 0
  const marketDisputed = state.conflicts.some(
    (c) =>
      c.severity === 'high' &&
      (c.relatedAgents ?? []).some((a) => a.toLowerCase().includes('market'))
  )
  return marketDisputed ? 1 : 0
}

export const ready: Promise<void> = (async () => {
  const profile = await getProfile()
  registerAdvisor(
    profileToAdvisorDescriptor<OpponentRelevantState>(
      profile,
      () => getOrphanSubgraphStub(),
      relevanceScorer
    )
  )
})()
