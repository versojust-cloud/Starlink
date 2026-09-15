import type { BenchmarkCase, BenchmarkRun } from '../types.js'

export async function runAutoGen(c: BenchmarkCase): Promise<BenchmarkRun> {
  const startedAt = new Date()
  const t0 = Date.now()
  const endedAt = new Date()
  return {
    case_id: c.case_id,
    runner: 'autogen',
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: Date.now() - t0,
    output: { bmc_nodes: [], handoff_count: 0 },
    error: 'AutoGen adapter stub — Phase 3.6 subprocess integration pending'
  }
}
