/**
 * Critic agent.yaml content regression test.
 *
 * Live observation (2026-05-11): the critic returned "未检出冲突"
 * when the user explicitly pointed out a year-1 revenue ¥258k vs
 * year-1 operating cost ¥1.2M+ mismatch — a textbook resource-goal
 * conflict. Root cause: the prompt's "分析维度" was purely qualitative
 * ("是否一致" / "是否匹配") and lacked any explicit arithmetic
 * instruction, so the LLM gave a stylistic check and missed the
 * dollar math. Additionally, user-stated suspicion in the question
 * field was not prioritized.
 *
 * These tests pin the agent.yaml content so the two new HARD RULES
 * don't silently drift away in future prompt rewrites.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const yamlSource = readFileSync(join(here, 'agent.yaml'), 'utf-8')

test('critic agent.yaml · arithmetic check hard rule present', () => {
  assert.match(
    yamlSource,
    /量化可行性检查/,
    'agent.yaml must contain the "量化可行性检查" section header'
  )
  assert.match(
    yamlSource,
    /年化成本.*1\.5.*Year-1 收入/,
    'agent.yaml must specify the 1.5x cost-vs-revenue threshold'
  )
  assert.match(
    yamlSource,
    /resource-goal/,
    'agent.yaml must require resource-goal conflictType for arithmetic failures'
  )
})

test('critic agent.yaml · user-stated suspicion priority rule present', () => {
  assert.match(
    yamlSource,
    /优先核验 user-stated suspicion/,
    'agent.yaml must contain the user-suspicion priority rule'
  )
  assert.match(
    yamlSource,
    /不能直接说"未检出冲突"绕开用户问题/,
    'agent.yaml must forbid the "未检出冲突" deflection observed in live run'
  )
})

test('critic agent.yaml · team-size vs customer-power mismatch is flagged as resource-goal', () => {
  // The specific failure that motivated this fix — 10-person team
  // serving an indie-hacker customer base must be caught.
  assert.match(
    yamlSource,
    /团队规模与目标客群购买力错配/,
    'agent.yaml must explicitly call out team-size-vs-customer-power as resource-goal'
  )
})
