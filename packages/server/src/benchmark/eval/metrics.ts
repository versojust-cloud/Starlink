/**
 * Phase 3.5 · Benchmark metrics.
 */

import type { BenchmarkCase, BenchmarkRun, MetricScore } from '../types.js'
import { BMC_DIMENSION_IDS } from '../types.js'
import { scoreTeamBalance, scoreCriticEngagement } from './per-agent-contribution.js'

export { scoreTeamBalance, scoreCriticEngagement }

interface BmcOutputNode {
  domain?: string
  content?: string
  metadata?: Record<string, unknown>
}

function extractNodes(run: BenchmarkRun): BmcOutputNode[] {
  return (run.output.bmc_nodes ?? []) as BmcOutputNode[]
}

export function scoreCoverage(_case: BenchmarkCase, run: BenchmarkRun): MetricScore {
  const nodes = extractNodes(run)
  const covered = new Set<string>()
  for (const n of nodes) {
    if (n.domain) covered.add(String(n.domain))
  }
  return {
    name: 'coverage',
    score: covered.size / 9,
    detail: { coveredDimensions: [...covered], total: 9 }
  }
}

export function scoreMustCover(c: BenchmarkCase, run: BenchmarkRun): MetricScore {
  const nodes = extractNodes(run)
  const byDim = new Map<string, string>()
  for (const n of nodes) {
    const dim = String(n.domain ?? '')
    byDim.set(dim, (byDim.get(dim) ?? '') + '\n' + String(n.content ?? ''))
  }

  let totalExpected = 0
  let totalMatched = 0
  const missing: Array<{ dim: string; keyword: string }> = []

  const dimensions = c.expected_output.dimensions ?? {}
  for (const dimId of BMC_DIMENSION_IDS) {
    const expected = dimensions[dimId]
    if (!expected) continue
    const content = byDim.get(dimId) ?? ''
    for (const keyword of expected.must_cover ?? []) {
      totalExpected++
      if (content.includes(keyword)) totalMatched++
      else missing.push({ dim: dimId, keyword })
    }
  }

  const score = totalExpected === 0 ? 1 : totalMatched / totalExpected
  return {
    name: 'must_cover',
    score,
    detail: { totalExpected, totalMatched, missing }
  }
}

export function scoreGrounding(_case: BenchmarkCase, run: BenchmarkRun): MetricScore {
  const nodes = extractNodes(run)
  if (nodes.length === 0) return { name: 'grounding', score: 0 }
  let withCitations = 0
  for (const n of nodes) {
    const meta = n.metadata ?? {}
    const hasCitations =
      Array.isArray((meta as { citations?: unknown[] }).citations) &&
      ((meta as { citations: unknown[] }).citations.length > 0)
    const hasEvidenceRefs =
      Array.isArray((meta as { evidenceRefs?: unknown[] }).evidenceRefs) &&
      ((meta as { evidenceRefs: unknown[] }).evidenceRefs.length > 0)
    if (hasCitations || hasEvidenceRefs) withCitations++
  }
  return {
    name: 'grounding',
    score: withCitations / nodes.length,
    detail: { withCitations, total: nodes.length }
  }
}

export function scoreRevisionEfficiency(
  _case: BenchmarkCase,
  run: BenchmarkRun,
  handoffCount?: number
): MetricScore {
  const count = handoffCount ?? run.output.handoff_count ?? 0
  if (count === 0) return { name: 'revision_efficiency', score: 1 }
  const score = Math.max(0, 1 - (count - 10) / 40)
  return {
    name: 'revision_efficiency',
    score,
    detail: { handoffCount: count }
  }
}

export function scoreTokenCost(_case: BenchmarkCase, run: BenchmarkRun): MetricScore {
  const tc = run.token_cost?.total ?? 0
  return {
    name: 'token_cost',
    score: tc,
    detail: { input: run.token_cost?.input, output: run.token_cost?.output }
  }
}

export function scoreAll(c: BenchmarkCase, run: BenchmarkRun): MetricScore[] {
  return [
    scoreCoverage(c, run),
    scoreMustCover(c, run),
    scoreGrounding(c, run),
    scoreRevisionEfficiency(c, run),
    scoreTeamBalance(c, run),
    scoreCriticEngagement(c, run)
  ]
}

export function compositeScore(metrics: MetricScore[]): number {
  if (metrics.length === 0) return 0
  const sum = metrics.reduce((acc, m) => acc + (m.score >= 0 && m.score <= 1 ? m.score : 0), 0)
  return sum / metrics.length
}
