import type { StructuredToolInterface } from '@langchain/core/tools'
import { resolveToolNames } from '../../capabilities/tool-resolver.js'
import type { ToolRegistry } from '../../tool-registry/registry.js'
import type { AgentProfile } from '../../capabilities/profile-schema.js'
import {
  toLangchainTools,
  buildToolContextFromConfigurable
} from './lc-tool-adapter.js'

/**
 * Tool registry for agent graph.ts modules to resolve their tool bindings.
 *
 * Two paths inject this:
 *   - Apollo production: context/index.ts calls setToolRegistry() with its
 *     own singleton registry once `loadAllTools` populates it.
 *   - Benchmark / headless: benchmark/runners/run-starlink.ts builds a
 *     fresh ToolRegistry, populates it via loadAllTools, and injects it
 *     here BEFORE loadYamlAgents() runs the agent graph.ts `ready` IIFEs.
 *
 * Decoupled from context/index.ts so benchmark code can run without
 * triggering the PG-pool side effects of context's module-level inits.
 */
let agentToolRegistry: ToolRegistry | undefined

export function setToolRegistryForAgents(registry: ToolRegistry): void {
  agentToolRegistry = registry
}

export function resolveLangchainToolsForAgent(
  profile: AgentProfile
): StructuredToolInterface[] {
  if (profile.tools.length === 0) return []
  if (!agentToolRegistry) {
    throw new Error(
      'resolveLangchainToolsForAgent: tool registry not initialised. ' +
        'Apollo path must call setToolRegistryForAgents from context/index.ts; ' +
        'headless callers (benchmarks) must inject before loadYamlAgents.'
    )
  }
  const { tools: baseTools } = resolveToolNames(profile.tools, agentToolRegistry)
  return toLangchainTools(baseTools, {
    // P11.18 fix: per-call factory pulls workspaceId / userId from
    // the LangChain runConfig.configurable bag that BusinessLangGraph
    // populates at subgraph.invoke time (see invokeRegisteredAgent +
    // runCritic). Previously this was `() => ...({}, ...)` which
    // forced every tool to see _context.workspaceId === '' and made
    // KB / memory / web-search lookups silently empty.
    contextFactory: (runConfig) =>
      buildToolContextFromConfigurable(
        (runConfig?.configurable ?? {}) as Record<string, unknown>,
        new AbortController().signal
      ),
    // B4 hardening: tag every tool wrapped here with the calling agent's
    // id, so action-invocation / action-result handoff events show the
    // owner without us having to thread it through LangGraph's runConfig.
    ownerAgentId: profile.id
  })
}
