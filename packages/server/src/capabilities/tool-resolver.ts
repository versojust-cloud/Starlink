/**
 * Tool Resolver — validate YAML tool names against ToolRegistry.
 *
 * Phase A scope: name-existence check only (fail-fast on unknown tool).
 * Phase B will add a BaseTool → LangChain StructuredTool adapter so sub-agent
 * subgraphs can call `llm.bindTools(resolved)` and drive the ReAct loop.
 */

import type { BaseTool } from '@starlink/shared'
import type { ToolRegistry } from '../tool-registry/registry.js'
import type { AgentProfile } from './profile-schema.js'

export interface ResolvedTools {
  tools: BaseTool[]
  names: string[]
}

export function resolveToolNames(
  names: string[],
  registry: ToolRegistry
): ResolvedTools {
  if (names.length === 0) {
    return { tools: [], names: [] }
  }

  const missing: string[] = []
  const tools: BaseTool[] = []
  const resolvedNames: string[] = []

  for (const name of names) {
    if (!registry.has(name)) {
      missing.push(name)
      continue
    }
    tools.push(registry.getTool(name))
    resolvedNames.push(name)
  }

  if (missing.length > 0) {
    const available = registry.listAll().map((d) => d.identity.name).sort()
    throw new Error(
      `resolveToolNames: unknown tool(s): ${missing.join(', ')}. ` +
        `Available (${available.length}): ${available.join(', ')}`
    )
  }

  return { tools, names: resolvedNames }
}

export function validateAgentTools(
  profile: AgentProfile,
  registry: ToolRegistry
): void {
  if (profile.tools.length === 0) return
  try {
    resolveToolNames(profile.tools, registry)
  } catch (err) {
    throw new Error(
      `validateAgentTools: agent "${profile.id}" declares invalid tools — ` +
        `${(err as Error).message}`
    )
  }
}
