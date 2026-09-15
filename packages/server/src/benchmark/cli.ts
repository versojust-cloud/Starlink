/**
 * Phase 3.5 · Benchmark CLI.
 * pnpm --filter @starlink/server benchmark:run [--case <id>] [--runner <ids>]
 */

import { loadAllCases, loadCaseById } from './corpus/schema.js'
import type { BenchmarkCase, BenchmarkRun, RunReport } from './types.js'
import { runStarlink } from './runners/run-starlink.js'
import { runGptSolo } from './runners/run-gpt-solo.js'
import { runMetaGPT } from './runners/run-metagpt.js'
import { runAutoGen } from './runners/run-autogen.js'
import { scoreAll, scoreTokenCost, compositeScore } from './eval/metrics.js'

type RunnerId = 'starlink' | 'gpt-solo' | 'metagpt' | 'autogen'

const RUNNERS: Record<RunnerId, (c: BenchmarkCase) => Promise<BenchmarkRun>> = {
  starlink: runStarlink,
  'gpt-solo': runGptSolo,
  metagpt: runMetaGPT,
  autogen: runAutoGen
}

function parseArgs(argv: string[]): { cases?: string[]; runners: RunnerId[] } {
  const out: { cases?: string[]; runners: RunnerId[] } = {
    runners: ['starlink', 'gpt-solo', 'metagpt', 'autogen']
  }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--case' && argv[i + 1]) {
      out.cases = [argv[++i]!]
    } else if (argv[i] === '--runner' && argv[i + 1]) {
      out.runners = argv[++i]!.split(',').map((s) => s.trim() as RunnerId)
    }
  }
  return out
}

async function main(): Promise<void> {
  const { cases: filterCases, runners } = parseArgs(process.argv.slice(2))

  const allCases = await loadAllCases()
  const cases = filterCases
    ? (await Promise.all(
        filterCases.map(async (id) => {
          const c = await loadCaseById(id)
          if (!c) throw new Error(`Case not found: ${id}`)
          return c
        })
      ))
    : allCases

  console.log('# Starlink Benchmark Report\n')
  console.log(`- cases: ${cases.length}`)
  console.log(`- runners: ${runners.join(', ')}\n`)

  const reports: RunReport[] = []
  let totalFailures = 0

  for (const c of cases) {
    console.log(`## ${c.case_id}`)
    console.log(`- domain: ${c.domain}`)
    console.log(`- source: ${c.source.kind} — ${c.source.citation ?? '(uncited)'}\n`)
    console.log(
      '| runner | coverage | must_cover | grounding | revision_eff | team_balance | critic_eng | composite | error |'
    )
    console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')

    for (const runnerId of runners) {
      const fn = RUNNERS[runnerId]
      if (!fn) continue
      try {
        const run = await fn(c)
        const metrics = scoreAll(c, run)
        metrics.push(scoreTokenCost(c, run))
        const composite = compositeScore(metrics.filter((m) => m.name !== 'token_cost'))
        const byName = Object.fromEntries(metrics.map((m) => [m.name, m.score.toFixed(3)]))
        const errCell = run.error ? run.error.slice(0, 40) + '…' : '—'
        console.log(
          `| ${runnerId} | ${byName['coverage']} | ${byName['must_cover']} | ${byName['grounding']} | ${byName['revision_efficiency']} | ${byName['team_balance'] ?? '—'} | ${byName['critic_engagement'] ?? '—'} | ${composite.toFixed(3)} | ${errCell} |`
        )
        if (run.error) totalFailures++
        reports.push({ case_id: c.case_id, runner: runnerId, metrics, composite })
      } catch (err) {
        console.log(
          `| ${runnerId} | — | — | — | — | — | — | — | ${(err as Error).message.slice(0, 50)} |`
        )
        totalFailures++
      }
    }
    console.log('')
  }

  console.log('---')
  console.log(
    `Done: ${reports.length} run(s) across ${cases.length} case(s). ${totalFailures} failure(s).`
  )
  if (totalFailures > 0) process.exit(1)
}

main().catch((err) => {
  console.error('[benchmark:cli] fatal:', err)
  process.exit(1)
})
