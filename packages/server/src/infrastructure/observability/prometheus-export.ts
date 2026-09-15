/**
 * P11.18 · Prometheus text-format /metrics export.
 *
 * Why Prometheus format: every modern observability stack speaks it
 * (Prometheus / VictoriaMetrics / Grafana Mimir / OTel collector via
 * receiver). Exposing `/metrics` in the canonical `# HELP / # TYPE /
 * <name>{labels} <value>` format lets the operator scrape from any
 * tool without us standing up an OTel metrics SDK pipeline (heavier
 * dependency, more config).
 *
 * What we export:
 *   - starlink_agent_invocations_total{agent_id} (counter)
 *   - starlink_agent_errors_total{agent_id}      (counter)
 *   - starlink_agent_fallbacks_total{agent_id}   (counter)
 *   - starlink_agent_latency_p50_ms{agent_id}    (gauge, rolling window)
 *   - starlink_agent_latency_p95_ms{agent_id}    (gauge, rolling window)
 *   - starlink_agent_error_rate{agent_id}        (gauge, rolling window)
 *   - starlink_agent_degraded{agent_id}          (gauge 0/1)
 *   - starlink_error_fingerprints_total          (gauge — distinct fps in memory)
 *   - starlink_error_events_total                (counter — sum of fp counts)
 *   - starlink_pool_errors_total                 (counter)
 *
 * Counters never reset (lifetime). Gauges reflect the rolling window.
 * Prometheus scrape interval handles "rate" calculations downstream
 * via `rate()` PromQL.
 */

import { getAllAgentSloSnapshots } from './agent-slo-tracker.js'
import { getErrorSummary } from './error-aggregator.js'
import { getPoolErrorCount } from '../db/pool.js'

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

function metric(name: string, type: 'counter' | 'gauge', help: string, lines: string[]): string {
  return [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} ${type}`,
    ...lines
  ].join('\n')
}

export function renderPrometheusMetrics(): string {
  const blocks: string[] = []

  const agents = getAllAgentSloSnapshots()
  const invLines: string[] = []
  const errLines: string[] = []
  const fbLines: string[] = []
  const p50Lines: string[] = []
  const p95Lines: string[] = []
  const erLines: string[] = []
  const degLines: string[] = []
  for (const a of agents) {
    const lbl = `agent_id="${escapeLabel(a.agentId)}"`
    invLines.push(`starlink_agent_invocations_total{${lbl}} ${a.totals.invocations}`)
    errLines.push(`starlink_agent_errors_total{${lbl}} ${a.totals.errors}`)
    fbLines.push(`starlink_agent_fallbacks_total{${lbl}} ${a.totals.fallbacks}`)
    p50Lines.push(`starlink_agent_latency_p50_ms{${lbl}} ${a.latencyP50Ms}`)
    p95Lines.push(`starlink_agent_latency_p95_ms{${lbl}} ${a.latencyP95Ms}`)
    erLines.push(`starlink_agent_error_rate{${lbl}} ${a.errorRate}`)
    degLines.push(`starlink_agent_degraded{${lbl}} ${a.degraded ? 1 : 0}`)
  }

  blocks.push(metric('starlink_agent_invocations_total', 'counter', 'Total agent invocations (lifetime).', invLines))
  blocks.push(metric('starlink_agent_errors_total', 'counter', 'Total agent invocations that ended in error (lifetime).', errLines))
  blocks.push(metric('starlink_agent_fallbacks_total', 'counter', 'Total agent invocations that hit fallback path (lifetime).', fbLines))
  blocks.push(metric('starlink_agent_latency_p50_ms', 'gauge', 'p50 wall-clock latency over last N invocations.', p50Lines))
  blocks.push(metric('starlink_agent_latency_p95_ms', 'gauge', 'p95 wall-clock latency over last N invocations.', p95Lines))
  blocks.push(metric('starlink_agent_error_rate', 'gauge', 'Error fraction over last N invocations.', erLines))
  blocks.push(metric('starlink_agent_degraded', 'gauge', '1 when error rate breaches AGENT_SLO_DEGRADED_THRESHOLD.', degLines))

  const summary = getErrorSummary(1) // we only need totals
  blocks.push(metric(
    'starlink_error_fingerprints_total',
    'gauge',
    'Distinct error fingerprints currently held in memory.',
    [`starlink_error_fingerprints_total ${summary.totalFingerprints}`]
  ))
  blocks.push(metric(
    'starlink_error_events_total',
    'counter',
    'Total WARN+ERROR audit events seen (sum across fingerprints).',
    [`starlink_error_events_total ${summary.totalEvents}`]
  ))

  blocks.push(metric(
    'starlink_pool_errors_total',
    'counter',
    'Total PG pool-level errors observed since boot.',
    [`starlink_pool_errors_total ${getPoolErrorCount()}`]
  ))

  // Prometheus expects a trailing newline on the body.
  return blocks.join('\n\n') + '\n'
}
