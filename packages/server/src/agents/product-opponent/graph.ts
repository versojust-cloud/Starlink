/**
 * Product-opponent agent registration (orphan — see orphan-subgraph-stub.ts).
 *
 * Same pattern as market-opponent/graph.ts.
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
  const productDisputed = state.conflicts.some(
    (c) =>
      c.severity === 'high' &&
      (c.relatedAgents ?? []).some((a) => a.toLowerCase().includes('product'))
  )
  return productDisputed ? 1 : 0
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
