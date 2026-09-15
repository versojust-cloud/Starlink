/**
 * Phase 4.2 · Heterogeneous LLM router.
 */

import { ChatOpenAI } from '@langchain/openai'
import { createAuditLogger } from '@starlink/shared'
import type { AgentProfile } from '../capabilities/profile-schema.js'
import type { BusinessModel } from './business-langgraph.js'

const auditLogger = createAuditLogger('packages/server:llm-factory')

export type ModelFamily = 'anthropic' | 'deepseek' | 'google' | 'openai'

export function detectFamily(modelName: string): ModelFamily {
  const m = modelName.toLowerCase()
  if (m.startsWith('claude')) return 'anthropic'
  if (m.startsWith('deepseek')) return 'deepseek'
  if (m.startsWith('gemini')) return 'google'
  return 'openai'
}

interface FamilyConfig {
  apiKey: string
  baseURL: string | undefined
  source: string
}

function readFamilyConfig(family: ModelFamily): FamilyConfig | null {
  const fallbackKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || ''
  const fallbackBase = process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || ''

  switch (family) {
    case 'anthropic': {
      const key = process.env.ANTHROPIC_API_KEY || fallbackKey
      const base = process.env.ANTHROPIC_BASE_URL || fallbackBase || undefined
      if (!key) return null
      return {
        apiKey: key,
        baseURL: base,
        source: process.env.ANTHROPIC_API_KEY ? 'anthropic-native' : 'anthropic-via-fallback'
      }
    }
    case 'deepseek': {
      const key = process.env.DEEPSEEK_API_KEY || fallbackKey
      const base = process.env.DEEPSEEK_BASE_URL || fallbackBase || 'https://api.deepseek.com/v1'
      if (!key) return null
      return {
        apiKey: key,
        baseURL: base,
        source: process.env.DEEPSEEK_API_KEY ? 'deepseek-native' : 'deepseek-via-fallback'
      }
    }
    case 'google': {
      const key = process.env.GEMINI_API_KEY || fallbackKey
      const base = process.env.GEMINI_BASE_URL || fallbackBase || undefined
      if (!key) return null
      return {
        apiKey: key,
        baseURL: base,
        source: process.env.GEMINI_API_KEY ? 'gemini-native' : 'gemini-via-fallback'
      }
    }
    case 'openai':
    default: {
      if (!fallbackKey) return null
      return {
        apiKey: fallbackKey,
        baseURL: fallbackBase || undefined,
        source: 'openai-default'
      }
    }
  }
}

/** DeepSeek V4 family — supports `thinking.type` + `reasoning_effort`
 * extra params (passed through OpenAI-compatible body via modelKwargs).
 * Detected by name prefix; fallback for older deepseek-chat / -reasoner
 * does NOT inject these (they reject unknown fields). */
function isDeepSeekThinkingModel(model: string): boolean {
  const m = model.toLowerCase()
  return m.startsWith('deepseek-v4') || m.includes('-thinking')
}

function buildModelKwargs(model: string): Record<string, unknown> | undefined {
  if (!isDeepSeekThinkingModel(model)) return undefined
  return {
    thinking: { type: 'enabled' },
    reasoning_effort: 'high',
  }
}

/**
 * P11.13 / T3.4 · process-level ChatOpenAI cache.
 *
 * Original implementation called `new ChatOpenAI()` every invocation,
 * which means each LLM request opened a fresh HTTPS connection (no
 * keep-alive reuse). For a 12-agent conversation with multi-round
 * revisions + debate (~30 LLM calls/session), that's 30 cold sockets.
 * Under sustained load the per-process file-descriptor and ephemeral-
 * port budgets get hit fast.
 *
 * Cache by (model + temperature + maxTokens + baseURL + family) tuple.
 * Different agents calling deepseek-chat with the same params share
 * one instance; agent profiles that differ in any param get their own.
 *
 * Cache key intentionally excludes apiKey (don't want to log/leak it
 * via Map iteration) — the cfg.apiKey is captured per cache entry but
 * keys use the family alias (deepseek/openai).
 */
type CacheKey = string
const llmCache = new Map<CacheKey, BusinessModel>()

function cacheKeyFor(profile: AgentProfile, family: string, baseURL: string | undefined): CacheKey {
  return [
    family,
    profile.model,
    profile.temperature ?? 'default',
    profile.max_tokens ?? 'default',
    baseURL ?? 'no-base'
  ].join('|')
}

/**
 * P15-fix #7 · Global per-invocation max_tokens ceiling.
 *
 * Each agent.yaml sets its own `max_tokens` (e.g. report-writer 8000,
 * BMC generator 4000). With ReAct multi-turn loops accumulating context
 * across iterations, a runaway loop could push token usage far above
 * what we ever intend to pay for. This ceiling clamps the *declared*
 * max_tokens at instantiation time — agent YAMLs above the cap get
 * silently capped + audit-logged so the misconfig is visible.
 *
 * Override via env: AGENT_MAX_TOKENS_CEILING=12000 (default 10000).
 */
const AGENT_MAX_TOKENS_CEILING = Number(process.env.AGENT_MAX_TOKENS_CEILING ?? 10000)

/**
 * Exported for unit testing — production callers should use the
 * single-arg signature which reads `AGENT_MAX_TOKENS_CEILING` from env.
 * Pass an explicit `ceiling` only from tests that need to assert the
 * clamp + audit-log behaviour without monkey-patching env.
 */
export function clampMaxTokens(
  profile: AgentProfile,
  ceiling: number = AGENT_MAX_TOKENS_CEILING
): number | undefined {
  const declared = profile.max_tokens
  if (declared == null) return undefined
  if (declared <= ceiling) return declared
  auditLogger.warn({
    action: 'llm-factory.max-tokens-clamped',
    metadata: {
      agentId: profile.id,
      model: profile.model,
      declared,
      capped: ceiling
    }
  })
  return ceiling
}

export function createLLMModelFor(profile: AgentProfile): BusinessModel | null {
  const family = detectFamily(profile.model)
  const cfg = readFamilyConfig(family)
  if (!cfg) {
    auditLogger.warn({
      action: 'llm-factory.no-api-key',
      metadata: { agentId: profile.id, model: profile.model, family }
    })
    return null
  }
  const key = cacheKeyFor(profile, family, cfg.baseURL)
  const cached = llmCache.get(key)
  if (cached) {
    auditLogger.info({
      action: 'llm-factory.cache-hit',
      metadata: { agentId: profile.id, model: profile.model, family, source: cfg.source }
    })
    return cached
  }

  const configuration = cfg.baseURL ? { baseURL: cfg.baseURL } : undefined
  const modelKwargs = buildModelKwargs(profile.model)
  const cappedMaxTokens = clampMaxTokens(profile)
  auditLogger.info({
    action: 'llm-factory.created',
    metadata: {
      agentId: profile.id,
      model: profile.model,
      family,
      source: cfg.source,
      hasBaseURL: Boolean(cfg.baseURL),
      hasThinking: Boolean(modelKwargs),
      maxTokens: cappedMaxTokens ?? null
    }
  })

  const instance = new ChatOpenAI({
    apiKey: cfg.apiKey,
    model: profile.model,
    temperature: profile.temperature,
    maxTokens: cappedMaxTokens,
    configuration,
    ...(modelKwargs ? { modelKwargs } : {})
  })
  llmCache.set(key, instance)
  return instance
}
