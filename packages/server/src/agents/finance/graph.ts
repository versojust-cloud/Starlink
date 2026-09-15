import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  makeProfileGetter,
  profileToDescriptor,
  registerAgent
} from '../../capabilities/index.js'
import { createLLMModelFor } from '../../services/llm-factory.js'
import { buildBmcGeneratorSubgraph } from '../shared/bmc-generator-subgraph.js'
import { resolveLangchainToolsForAgent } from '../shared/register-helpers.js'
import { FINANCE_DOMAINS, AGENT_TYPES } from '../shared/parsing.js'

const here = dirname(fileURLToPath(import.meta.url))
const getProfile = makeProfileGetter(join(here, 'agent.yaml'))

export const ready: Promise<void> = (async () => {
  const profile = await getProfile()
  const model = createLLMModelFor(profile)
  const lcTools = resolveLangchainToolsForAgent(profile)
  const compiled = buildBmcGeneratorSubgraph(profile, model, lcTools, {
    outputField: 'financeNodes',
    domains: FINANCE_DOMAINS,
    agentType: AGENT_TYPES.FINANCE,
    loggerName: 'agents.finance.graph'
  })
  registerAgent(profileToDescriptor(profile, () => compiled))
})()
