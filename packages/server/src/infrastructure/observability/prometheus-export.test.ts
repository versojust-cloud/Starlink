/**
 * P11.18 · Prometheus exposition format unit tests.
 *
 * Verifies that the rendered text:
 *   1. has matching `# HELP` / `# TYPE` for each metric
 *   2. emits per-agent label sets correctly
 *   3. escapes special characters in labels (quotes / backslashes)
 *   4. ends with trailing newline (Prom requirement)
 */

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { renderPrometheusMetrics } from './prometheus-export.js'
import { recordAgentInvocation, clearAgentSloForTest } from './agent-slo-tracker.js'

beforeEach(() => {
  clearAgentSloForTest()
})

test('prometheus: empty state renders all metric headers but no per-agent rows', () => {
  const text = renderPrometheusMetrics()
  assert.match(text, /# HELP starlink_agent_invocations_total/)
  assert.match(text, /# TYPE starlink_agent_invocations_total counter/)
  assert.match(text, /# HELP starlink_agent_latency_p50_ms/)
  assert.match(text, /# TYPE starlink_agent_latency_p50_ms gauge/)
  // No agent rows yet, so the metric headers should not be followed by row data.
  assert.doesNotMatch(text, /starlink_agent_invocations_total{/)
})

test('prometheus: per-agent rows include agent_id label', () => {
  recordAgentInvocation('market-agent', 100, 'success')
  recordAgentInvocation('market-agent', 200, 'success')
  recordAgentInvocation('market-agent', 50, 'error')
  const text = renderPrometheusMetrics()
  assert.match(text, /starlink_agent_invocations_total{agent_id="market-agent"} 3/)
  assert.match(text, /starlink_agent_errors_total{agent_id="market-agent"} 1/)
  assert.match(text, /starlink_agent_error_rate{agent_id="market-agent"} 0.333/)
})

test('prometheus: degraded gauge flips 0/1 based on threshold', () => {
  // 6/10 errors → 60% > 30% threshold → degraded=1
  for (let i = 0; i < 4; i++) recordAgentInvocation('failing-agent', 100, 'success')
  for (let i = 0; i < 6; i++) recordAgentInvocation('failing-agent', 100, 'error')
  const text = renderPrometheusMetrics()
  assert.match(text, /starlink_agent_degraded{agent_id="failing-agent"} 1/)
})

test('prometheus: trailing newline present', () => {
  recordAgentInvocation('healthy', 50, 'success')
  const text = renderPrometheusMetrics()
  assert.equal(text[text.length - 1], '\n')
})

test('prometheus: multiple agents → multiple rows', () => {
  recordAgentInvocation('a', 10, 'success')
  recordAgentInvocation('b', 20, 'success')
  recordAgentInvocation('c', 30, 'success')
  const text = renderPrometheusMetrics()
  assert.match(text, /starlink_agent_invocations_total{agent_id="a"} 1/)
  assert.match(text, /starlink_agent_invocations_total{agent_id="b"} 1/)
  assert.match(text, /starlink_agent_invocations_total{agent_id="c"} 1/)
})

test('prometheus: special-char label escaping', () => {
  // Agent IDs with backslashes / quotes should be escaped per Prom spec.
  recordAgentInvocation('weird"agent\\name', 50, 'success')
  const text = renderPrometheusMetrics()
  // Backslash and quote should both appear ESCAPED in the output.
  assert.match(text, /agent_id="weird\\"agent\\\\name"/)
})
