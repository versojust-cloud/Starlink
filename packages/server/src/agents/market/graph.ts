import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  makeProfileGetter,
  profileToDescriptor,
  registerAgent
} from '../../capabilities/index.js'
import { createLLMModelFor } from '../../services/llm-factory.js'
import {
  buildBmcGeneratorSubgraph,
  BmcGeneratorState
} from '../shared/bmc-generator-subgraph.js'
import { resolveLangchainToolsForAgent } from '../shared/register-helpers.js'
import { MARKET_DOMAINS, AGENT_TYPES } from '../shared/parsing.js'

const here = dirname(fileURLToPath(import.meta.url))
const profilePath = join(here, 'agent.yaml')
const getProfile = makeProfileGetter(profilePath)

export { BmcGeneratorState as MarketAgentState }
export type MarketAgentStateType = typeof BmcGeneratorState.State

export const ready: Promise<void> = (async () => {
  const profile = await getProfile()
  const model = createLLMModelFor(profile)
  const lcTools = resolveLangchainToolsForAgent(profile)
  const compiled = buildBmcGeneratorSubgraph(profile, model, lcTools, {
    outputField: 'marketNodes',
    domains: MARKET_DOMAINS,
    agentType: AGENT_TYPES.MARKET,
    loggerName: 'agents.market.graph'
  })
  registerAgent(profileToDescriptor(profile, () => compiled))
})()
