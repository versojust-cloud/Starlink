/**
 * Moderator agent registration (orphan — see orphan-subgraph-stub.ts header).
 *
 * The moderator's `agent.yaml.system_prompt` is consumed directly by
 * `LlmDebateInvoker.judge()` for debate verdicts. The LangGraph subgraph
 * was a 1-node passthrough that nothing called; replaced with the shared
 * stub to skip the wasteful `.compile()` at boot.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  makeProfileGetter,
  profileToDescriptor,
  registerAgent
} from '../../capabilities/index.js'
import { getOrphanSubgraphStub } from '../shared/orphan-subgraph-stub.js'

const here = dirname(fileURLToPath(import.meta.url))
const getProfile = makeProfileGetter(join(here, 'agent.yaml'))

export const ready: Promise<void> = (async () => {
  const profile = await getProfile()
  registerAgent(profileToDescriptor(profile, () => getOrphanSubgraphStub()))
})()
