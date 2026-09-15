import { createRegistry } from './base-registry.js'
import type { AgentDescriptor, AdvisorDescriptor } from './types.js'

/**
 * Central registries for agents and advisors. Each agent/advisor file registers
 * itself at import time (side-effect); a top-level loader determines which
 * files are imported to control which capabilities are available.
 */

export const agentRegistry = createRegistry<AgentDescriptor>()
export const advisorRegistry = createRegistry<AdvisorDescriptor>()

/**
 * Register a generation-team agent. Must not have role='advisor' (use
 * registerAdvisor for those). Returns the descriptor for chaining / inspection.
 */
export function registerAgent(descriptor: AgentDescriptor): AgentDescriptor {
  if (descriptor.role === 'advisor') {
    throw new Error(
      `Agent "${descriptor.id}" has role=advisor; call registerAdvisor() instead`
    )
  }
  return agentRegistry.register(descriptor)
}

/**
 * Register an advisor (critic or framework advisor). The generic preserves the
 * caller's state type for routing callbacks; internally stored with
 * State=unknown to keep the registry homogeneous.
 */
export function registerAdvisor<State = unknown>(
  descriptor: AdvisorDescriptor<State>
): AdvisorDescriptor<State> {
  advisorRegistry.register(descriptor as AdvisorDescriptor)
  return descriptor
}
