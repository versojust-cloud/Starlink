/**
 * Profile Loader — reads an agent.yaml from disk, validates against the
 * AgentProfileSchema, and produces either an AgentDescriptor or
 * AdvisorDescriptor suitable for Capability Registry registration.
 *
 * Two-step separation on purpose:
 *   1. loadAgentProfile(path) → AgentProfile (pure data)
 *   2. profileToDescriptor(profile, buildSubgraph) → AgentDescriptor
 *
 * This lets each `graph.ts` close over its YAML profile at buildSubgraph()
 * *call time* (not load time), so temperature / prompt overrides passed via
 * config.configurable can still override profile values.
 */

import { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import { parseAgentProfile, type AgentProfile } from './profile-schema.js'
import type {
  AgentDescriptor,
  AdvisorDescriptor,
  RelevanceScorer,
  TriggerPredicate,
  AgentRole,
  Capability
} from './types.js'

// ============== loadAgentProfile ==============

export async function loadAgentProfile(yamlPath: string): Promise<AgentProfile> {
  let raw: string
  try {
    raw = await readFile(yamlPath, 'utf8')
  } catch (err) {
    throw new Error(
      `loadAgentProfile: failed to read ${yamlPath}: ${(err as Error).message}`
    )
  }

  let parsed: unknown
  try {
    parsed = parseYaml(raw)
  } catch (err) {
    throw new Error(
      `loadAgentProfile: invalid YAML at ${yamlPath}: ${(err as Error).message}`
    )
  }

  const result = parseAgentProfile(parsed)
  if (!result.ok) {
    throw new Error(
      `loadAgentProfile: schema validation failed at ${yamlPath}:\n${result.errors.join('\n')}`
    )
  }
  return result.profile
}

// ============== profileToDescriptor ==============

export function profileToDescriptor(
  profile: AgentProfile,
  buildSubgraph: () => unknown
): AgentDescriptor {
  if (profile.role === 'advisor') {
    throw new Error(
      `profileToDescriptor: agent "${profile.id}" has role=advisor; ` +
        `use profileToAdvisorDescriptor instead`
    )
  }
  return {
    id: profile.id,
    name: profile.name,
    role: profile.role as Exclude<AgentRole, 'advisor'>,
    capabilities: profile.capabilities as Capability[],
    runtime: {
      timeout: profile.timeout_ms,
      retries: profile.retries,
      cacheable: profile.cacheable
    },
    buildSubgraph
  }
}

// ============== profileToAdvisorDescriptor ==============

export function profileToAdvisorDescriptor<State = unknown>(
  profile: AgentProfile,
  buildSubgraph: () => unknown,
  relevanceScorer: RelevanceScorer<State>,
  triggerPredicate?: TriggerPredicate<State>
): AdvisorDescriptor<State> {
  if (profile.role !== 'advisor') {
    throw new Error(
      `profileToAdvisorDescriptor: agent "${profile.id}" must have role=advisor ` +
        `(got "${profile.role}")`
    )
  }
  return {
    id: profile.id,
    name: profile.name,
    role: 'advisor',
    capabilities: profile.capabilities as Capability[],
    runtime: {
      timeout: profile.timeout_ms,
      retries: profile.retries,
      cacheable: profile.cacheable
    },
    buildSubgraph,
    relevanceScorer,
    triggerPredicate
  }
}

// ============== Lazy-init helper ==============

/**
 * P11.13 / T3.2 · TTL-aware profile cache.
 *
 * Original implementation was a one-shot lazy cache: profile was loaded
 * once on first read and never refreshed. That made hot-reloading
 * agent.yaml impossible without restarting the server, and stale
 * profiles bled across debate sessions if the operator edited a
 * prompt mid-run.
 *
 * New behaviour: cache for AGENT_PROFILE_TTL_MS (default 5 min); after
 * TTL the next call re-reads the YAML. Trade-off: tiny per-5-min disk
 * read overhead vs. eliminating the staleness bug.
 *
 * Override via env AGENT_PROFILE_TTL_MS (e.g. set to 0 for no-cache
 * during development; 86400000 for daily refresh in prod).
 */
const PROFILE_TTL_MS = Number(process.env.AGENT_PROFILE_TTL_MS) || 5 * 60 * 1000

export function makeProfileGetter(yamlPath: string): () => Promise<AgentProfile> {
  let cached: Promise<AgentProfile> | undefined
  let cachedAt = 0
  return () => {
    const now = Date.now()
    if (!cached || now - cachedAt >= PROFILE_TTL_MS) {
      cached = loadAgentProfile(yamlPath)
      cachedAt = now
    }
    return cached
  }
}
