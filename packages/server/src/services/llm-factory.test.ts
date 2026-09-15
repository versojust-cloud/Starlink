/**
 * P15-fix #7 · clampMaxTokens regression test.
 *
 * Asserts the global max_tokens ceiling actually clamps over-spec'd
 * agent YAMLs (and audit-logs the clamp). Currently no agent.yaml in
 * the repo declares max_tokens > 10000, so the production path never
 * exercises this code — without a unit test it would silently break.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { clampMaxTokens } from './llm-factory.js'
import type { AgentProfile } from '../capabilities/profile-schema.js'

function buildProfile(maxTokens: number | undefined): AgentProfile {
  // Cast-via-Partial because AgentProfile is huge and we only need
  // max_tokens for these tests. The function under test reads
  // .max_tokens / .id / .model only.
  return {
    version: 1,
    id: 'test-agent',
    name: 'test',
    role: 'generator',
    language: 'zh-CN',
    model: 'deepseek-chat',
    temperature: 0.3,
    max_tokens: maxTokens,
    timeout_ms: 30000,
    retries: 1,
    cacheable: false,
    tools: [],
    knowledge_bases: [],
    capabilities: [],
    critic_policy: 'off',
    system_prompt: '',
    few_shot: []
  } as unknown as AgentProfile
}

test('clampMaxTokens · undeclared max_tokens passes through as undefined', () => {
  const got = clampMaxTokens(buildProfile(undefined), 10000)
  assert.equal(got, undefined)
})

test('clampMaxTokens · declared value within ceiling returns the declared value', () => {
  const got = clampMaxTokens(buildProfile(4000), 10000)
  assert.equal(got, 4000)
})

test('clampMaxTokens · declared value equal to ceiling returns the declared value', () => {
  const got = clampMaxTokens(buildProfile(10000), 10000)
  assert.equal(got, 10000)
})

test('clampMaxTokens · declared value above ceiling clamps to ceiling', () => {
  // Use a low test ceiling to force the clamp path without changing env.
  const got = clampMaxTokens(buildProfile(8000), 500)
  assert.equal(got, 500, 'returned value must be the ceiling, not the declared value')
})

test('clampMaxTokens · ceiling defaults from env (10000 default)', () => {
  // Single-arg call uses the env-derived default. Under default
  // AGENT_MAX_TOKENS_CEILING=10000, a declared 8000 passes through.
  const got = clampMaxTokens(buildProfile(8000))
  assert.equal(got, 8000)
})
