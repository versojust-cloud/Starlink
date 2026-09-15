/**
 * Stage J.5 smoke-test runner — exercises the Agent-as-a-Judge pipeline
 * end-to-end against the Tier A YC seed cases, WITHOUT requiring the
 * full Starlink LangGraph BMC pipeline.
 *
 * Three "candidate" sources for differential scoring:
 *
 *   1. ECHO   — candidate = the case's own ground_truth verbatim.
 *               Expected: scores cluster at 3 (judge sees its own truth).
 *               Acts as a CALIBRATION test: if echoed truth doesn't get
 *               near-perfect scores, the judge prompt is broken.
 *
 *   2. NULL   — candidate is empty / "TODO" / pure stopwords.
 *               Expected: scores cluster at 0.
 *               FLOOR test: confirms judge reliably rejects garbage.
 *
 *   3. GENERIC — candidate is a plausible-but-shallow BMC ("the
 *               company has customers and makes money via fees")
 *               that doesn't address must_cover specifics.
 *               Expected: scores cluster at 1.
 *               MIDDLE test: confirms judge can distinguish substance
 *               from generic boilerplate.
 *
 * Run via:
 *
 *   pnpm --filter @starlink/server build && \
 *   DEEPSEEK_API_KEY=sk-... node packages/server/dist/benchmark/eval/yc-judge-smoke.js \
 *     --case yc-stripe-2024 --candidate echo
 *
 *   # Run all cases × all candidate types:
 *   ... yc-judge-smoke.js --all
 *
 * Output: prints a markdown table to stdout + writes a copy to
 * packages/server/benchmark/reports/yc-judge-smoke-<timestamp>.md
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BMC_DIMENSION_IDS, type BmcDimensionId } from '../types.js'
import { loadAllYcCases, type YcCompanyCase } from '../corpus/yc-cases/index.js'
import { evaluateCase, type CaseEvaluation } from './agent-as-judge.js'

type CandidateMode = 'echo' | 'null' | 'generic'

function buildCandidateBmc(
  testCase: YcCompanyCase,
  mode: CandidateMode
): Partial<Record<BmcDimensionId, string>> {
  const out: Partial<Record<BmcDimensionId, string>> = {}
  for (const dim of BMC_DIMENSION_IDS) {
    const truth = testCase.ground_truth_bmc[dim]
    if (!truth) continue
    if (mode === 'echo') {
      out[dim] = truth.ground_truth
    } else if (mode === 'null') {
      out[dim] = ''
    } else {
      // generic — same shallow boilerplate for every dim, expecting
      // judge to score 0-1 since must_cover specifics are missing
      out[dim] = `${testCase.company_name} 是一家公司，有客户、有产品、有收入。我们靠提供服务收钱。`
    }
  }
  return out
}

interface SmokeRow {
  caseId: string
  mode: CandidateMode
  result: CaseEvaluation
  durationMs: number
}

async function runOne(testCase: YcCompanyCase, mode: CandidateMode): Promise<SmokeRow> {
  const candidate = buildCandidateBmc(testCase, mode)
  const startedAt = Date.now()
  const result = await evaluateCase(testCase, candidate, `smoke-${mode}`)
  return {
    caseId: testCase.case_id,
    mode,
    result,
    durationMs: Date.now() - startedAt
  }
}

function renderRow(row: SmokeRow): string {
  const dimScores = BMC_DIMENSION_IDS.map(
    (d) => row.result.perDimension[d]?.score ?? '-'
  ).join(' ')
  const avg = row.result.average.toFixed(2)
  const total = row.result.total
  return `| ${row.caseId} | ${row.mode.padEnd(8)} | ${dimScores} | ${total.toString().padStart(2)}/27 | ${avg} | ${row.durationMs}ms |`
}

function renderReport(rows: SmokeRow[]): string {
  const lines: string[] = []
  lines.push(`# Stage J.5 — Agent-as-a-Judge smoke test`)
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push(`Cases: ${new Set(rows.map((r) => r.caseId)).size}`)
  lines.push(`Modes: ${[...new Set(rows.map((r) => r.mode))].join(', ')}`)
  lines.push('')
  lines.push('## Calibration expectations')
  lines.push('')
  lines.push('- **echo** (candidate = ground truth): scores should cluster at **3**')
  lines.push('- **null** (empty candidate): scores should cluster at **0**')
  lines.push('- **generic** (boilerplate, no must_cover specifics): scores should cluster at **1**')
  lines.push('')
  lines.push('If any column violates these calibration expectations,')
  lines.push('the judge prompt or LLM is mis-behaving and needs investigation.')
  lines.push('')
  lines.push('## Results')
  lines.push('')
  const dimHeader = BMC_DIMENSION_IDS.map((d) => d.slice(0, 2)).join(' ')
  lines.push(`| case | mode | ${dimHeader} | total | avg | dur |`)
  lines.push(
    `| --- | --- | ${BMC_DIMENSION_IDS.map(() => '--').join(' ')} | --- | --- | --- |`
  )
  for (const r of rows) lines.push(renderRow(r))

  // Aggregates per mode
  lines.push('')
  lines.push('## Aggregate by mode')
  lines.push('')
  lines.push('| mode | mean total | mean avg | calibration |')
  lines.push('| --- | --- | --- | --- |')
  const byMode = new Map<CandidateMode, SmokeRow[]>()
  for (const r of rows) {
    const arr = byMode.get(r.mode) ?? []
    arr.push(r)
    byMode.set(r.mode, arr)
  }
  for (const [mode, arr] of byMode) {
    const meanTotal = arr.reduce((a, b) => a + b.result.total, 0) / arr.length
    const meanAvg = arr.reduce((a, b) => a + b.result.average, 0) / arr.length
    const expected =
      mode === 'echo'
        ? meanAvg >= 2.4
          ? 'PASS (>=2.4)'
          : 'FAIL (echo should be near 3)'
        : mode === 'null'
          ? meanAvg <= 0.6
            ? 'PASS (<=0.6)'
            : 'FAIL (null should be near 0)'
          : meanAvg >= 0.5 && meanAvg <= 1.6
            ? 'PASS (0.5..1.6)'
            : 'FAIL (generic should land mid)'
    lines.push(`| ${mode} | ${meanTotal.toFixed(1)}/27 | ${meanAvg.toFixed(2)} | ${expected} |`)
  }

  // Sample rationales (from the first row of each mode for quick eyeballing)
  lines.push('')
  lines.push('## Sample rationales (first row per mode)')
  lines.push('')
  for (const [mode, arr] of byMode) {
    const first = arr[0]
    if (!first) continue
    lines.push(`### ${mode} · ${first.caseId}`)
    lines.push('')
    for (const dim of BMC_DIMENSION_IDS) {
      const score = first.result.perDimension[dim]
      if (!score) continue
      lines.push(
        `- **${dim}** · score=${score.score} — ${score.rationale.slice(0, 200)}`
      )
    }
    lines.push('')
  }
  return lines.join('\n')
}

// =============================================================================
// CLI
// =============================================================================

async function main() {
  const args = process.argv.slice(2)
  const all = args.includes('--all')
  const caseIdArg = args.find((a) => a.startsWith('--case='))?.split('=')[1]
  const modeArg = args.find((a) => a.startsWith('--candidate='))?.split('=')[1] as
    | CandidateMode
    | undefined

  const allCases = loadAllYcCases()
  const cases = all
    ? allCases
    : caseIdArg
      ? allCases.filter((c) => c.case_id === caseIdArg)
      : [allCases[0]] // default: just the first case

  const modes: CandidateMode[] = all || !modeArg ? ['echo', 'null', 'generic'] : [modeArg]

  if (cases.length === 0) {
    console.error('No matching cases. Available case_ids:')
    for (const c of allCases) console.error(`  - ${c.case_id}`)
    process.exit(1)
  }

  console.error(
    `[smoke] running ${cases.length} case(s) × ${modes.length} mode(s) = ${cases.length * modes.length} evaluations…`
  )
  if (process.env.JUDGE_MODE === 'heuristic') {
    console.error(`[smoke] JUDGE_MODE=heuristic — using token-overlap stub (no LLM call)`)
  } else if (!process.env.DEEPSEEK_API_KEY && !process.env.LLM_API_KEY) {
    console.error(`[smoke] WARNING: no DEEPSEEK_API_KEY/LLM_API_KEY — judge will fall back to heuristic per dim`)
  }

  const rows: SmokeRow[] = []
  for (const c of cases) {
    for (const m of modes) {
      console.error(`  · ${c.case_id} / ${m}`)
      rows.push(await runOne(c, m))
    }
  }

  const md = renderReport(rows)
  console.log(md)

  // Persist a copy
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    // dist/benchmark/eval/yc-judge-smoke.js (here)
    //   ↑ ../              → dist/benchmark
    //   ↑ ../../           → dist/
    //   ↑ ../../../        → packages/server/
    // + benchmark/reports/ → packages/server/benchmark/reports/
    const reportsDir = join(here, '..', '..', '..', 'benchmark', 'reports')
    mkdirSync(reportsDir, { recursive: true })
    const ts = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+/, '')
      .replace('T', '-')
    const fp = join(reportsDir, `yc-judge-smoke-${ts}.md`)
    writeFileSync(fp, md)
    console.error(`\n[smoke] report written: ${fp}`)
  } catch (err) {
    console.error('[smoke] failed to write report file:', err)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
