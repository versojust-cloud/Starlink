/**
 * Stage J.5++ end-to-end runner: pits Starlink (multi-agent BMC pipeline)
 * against gpt-solo (single-LLM baseline) on the Tier-A YC seed cases,
 * with Agent-as-a-Judge scoring.
 *
 * Output is a markdown report with:
 *   - per-case × per-runner total / average score
 *   - per-dimension score grids
 *   - latency / handoff metadata
 *   - sample rationales for spot-checking
 *
 * This is the FIRST real "Starlink vs single-LLM baseline" comparison
 * on REAL public startups (not the synthetic probes under
 * benchmark/corpus/cases/).
 *
 * Run via:
 *
 *   pnpm --filter @starlink/server build && \
 *   DEEPSEEK_API_KEY=sk-... LLM_API_KEY=sk-... \
 *     node packages/server/dist/benchmark/eval/yc-vs-runners.js
 *
 *   # Single case (faster smoke):
 *   ... yc-vs-runners.js --case=yc-stripe-2024
 *
 *   # Single runner (skip the slow Starlink pipeline):
 *   ... yc-vs-runners.js --runners=gpt-solo
 *
 *   # Force scripted-judge (no judge LLM cost):
 *   JUDGE_MODE=heuristic ... yc-vs-runners.js
 *
 *   # Prompt-richness ablation: strip the detailed description from
 *   # the question, keeping only one_liner + sector. Both runners are
 *   # affected equally; useful for measuring how much the prompt
 *   # context was contributing. Orthogonal to --with-kb-only.
 *   ... yc-vs-runners.js --minimal-context
 *
 *   # Citation eval: filter to YC cases that have non-empty
 *   # `workspace_knowledge` seeded. Activates the RAG / citation
 *   # pipeline (agents emit [[ref:doc#chunk]] tokens parsed by
 *   # citation-parser into node metadata.citations). Currently seeded:
 *   # yc-stripe, yc-airbnb. Add more via the workspace_knowledge field
 *   # on YcCompanyCase.
 *   ... yc-vs-runners.js --with-kb-only
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BMC_DIMENSION_IDS,
  type BenchmarkCase,
  type BenchmarkRun,
  type BmcDimensionId
} from '../types.js'
import { loadAllYcCases, type YcCompanyCase } from '../corpus/yc-cases/index.js'
import { evaluateCase, type CaseEvaluation } from './agent-as-judge.js'
import { runStarlink } from '../runners/run-starlink.js'
import { runGptSolo } from '../runners/run-gpt-solo.js'

// =============================================================================
// Adapter: YC case → BenchmarkCase shape that runners already accept
// =============================================================================

/**
 * Build a BenchmarkCase from a YcCompanyCase. Wraps the public profile
 * (one_liner + description) into a single user-facing question, and maps
 * each dimension's must_cover into the BenchmarkCase expectation shape
 * for compat with downstream metric consumers.
 */
function ycToBenchmarkCase(
  yc: YcCompanyCase,
  options: { minimalContext?: boolean } = {}
): BenchmarkCase {
  const dimensions: BenchmarkCase['expected_output']['dimensions'] = {}
  for (const dim of BMC_DIMENSION_IDS) {
    const truth = yc.ground_truth_bmc[dim]
    if (!truth) continue
    dimensions[dim] = {
      must_cover: truth.must_cover ?? [],
      must_not_cover: truth.must_not_cover ?? []
    }
  }

  const fullQuestion = `请为以下创业项目生成完整的 CC-BMC 商业模型画布（覆盖 9 个维度）：

公司：${yc.company_name}
一句话定位：${yc.one_liner}

详细描述：
${yc.description}

行业：${yc.sector}`

  const minimalQuestion = `请为以下创业项目生成完整的 CC-BMC 商业模型画布（覆盖 9 个维度）：

公司：${yc.company_name}
一句话定位：${yc.one_liner}

行业：${yc.sector}`

  return {
    case_id: yc.case_id,
    domain: yc.sector,
    region: 'global',
    source: {
      kind: 'business-case',
      citation: `${yc.company_name} (${yc.yc_batch}) — ${yc.source_url}`
    },
    input: {
      question: options.minimalContext ? minimalQuestion : fullQuestion,
      // YC cases now optionally carry seed `workspace_knowledge` (Stage 6,
      // 2026-05-01). When non-empty the runner passes it as knowledgeEvidence
      // and the citation pipeline activates ([[ref:docId#snippetId]] in
      // agent output → parsed by citation-parser → grounding-rate / refs
      // attached to node metadata). When omitted or empty the run is the
      // legacy "no RAG" path — same behaviour as before.
      workspace_knowledge: yc.workspace_knowledge ?? [],
      constraints: []
    },
    expected_output: {
      dimensions,
      consistency_checks: []
    }
  }
}

// =============================================================================
// Bridge: BenchmarkRun's bmc_nodes → Partial<Record<BmcDimensionId, string>>
// =============================================================================

/**
 * The runners produce BMC nodes with `domain: '客户细分'` (Chinese label).
 * The judge expects `Partial<Record<BmcDimensionId, string>>` keyed by the
 * canonical English ID ('CUSTOMER_SEGMENTS' etc).
 *
 * We invert CC_BMC_DOMAINS to produce a Chinese→ID map, then group the
 * runner's nodes by dimension and concatenate their content into one
 * string per cell (multiple nodes per dim = joined by " · ").
 */
const CC_BMC_LABEL_TO_ID: Record<string, BmcDimensionId> = {
  客户细分: 'CUSTOMER_SEGMENTS',
  价值主张: 'VALUE_PROPOSITIONS',
  渠道通路: 'CHANNELS',
  客户关系: 'CUSTOMER_RELATIONSHIPS',
  收入来源: 'REVENUE_STREAMS',
  关键业务: 'KEY_ACTIVITIES',
  核心资源: 'KEY_RESOURCES',
  重要合作: 'KEY_PARTNERSHIPS',
  成本结构: 'COST_STRUCTURE'
}

interface RunnerBmcNode {
  domain?: string
  content?: string
  data?: { content?: string; meta?: { domain?: string } }
}

function nodesToCandidate(
  nodes: unknown[]
): Partial<Record<BmcDimensionId, string>> {
  const buckets: Partial<Record<BmcDimensionId, string[]>> = {}
  for (const raw of nodes) {
    const n = raw as RunnerBmcNode
    const label = n.domain ?? n.data?.meta?.domain
    const content = n.content ?? n.data?.content
    if (!label || !content) continue
    const id = CC_BMC_LABEL_TO_ID[label]
    if (!id) continue
    const arr = buckets[id] ?? []
    arr.push(content)
    buckets[id] = arr
  }
  const out: Partial<Record<BmcDimensionId, string>> = {}
  for (const [id, contents] of Object.entries(buckets)) {
    if (contents && contents.length > 0) {
      out[id as BmcDimensionId] = contents.join(' · ')
    }
  }
  return out
}

// =============================================================================
// Per-case × per-runner driver
// =============================================================================

interface ResultRow {
  case_id: string
  company_name: string
  runner: string
  run: BenchmarkRun
  evaluation: CaseEvaluation
  candidateLengthChars: number
  /** Number of `workspace_knowledge` docs the case carried into the runner.
   *  >0 means the citation pipeline was active for this row. */
  kbDocCount: number
}

type RunnerName = 'starlink' | 'gpt-solo' | 'gpt-solo-forced'

async function evalOneRunner(
  yc: YcCompanyCase,
  benchCase: BenchmarkCase,
  runnerName: RunnerName,
  runnerFn: (c: BenchmarkCase) => Promise<BenchmarkRun>
): Promise<ResultRow> {
  console.error(`  · ${runnerName} on ${yc.case_id} …`)
  const run = await runnerFn(benchCase)
  const candidate = nodesToCandidate(run.output.bmc_nodes)
  const candidateLengthChars = Object.values(candidate).reduce(
    (acc, s) => acc + (s?.length ?? 0),
    0
  )
  const evaluation = await evaluateCase(yc, candidate, runnerName)
  return {
    case_id: yc.case_id,
    company_name: yc.company_name,
    // Bug fix · use run.runner (which carries the ablation variant tag,
    // e.g. 'starlink-no-critic') instead of the type-level runnerName
    // ('starlink'). Without this every variant rendered as 'starlink' in
    // the aggregate table — the variant tag was correctly computed but
    // erased before ResultRow construction, so compile-ablation-comparison
    // could never separate variants.
    runner: run.runner ?? runnerName,
    run,
    evaluation,
    candidateLengthChars,
    kbDocCount: yc.workspace_knowledge?.length ?? 0
  }
}

// =============================================================================
// Markdown report
// =============================================================================

function renderReport(rows: ResultRow[], options: { minimalContext?: boolean } = {}): string {
  const lines: string[] = []
  const cases = [...new Set(rows.map((r) => r.case_id))]
  const runners = [...new Set(rows.map((r) => r.runner))]

  lines.push('# Stage J.5++ — Starlink vs single-LLM baseline on Tier-A YC cases')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push(`Cases: ${cases.length} (${cases.join(', ')})`)
  lines.push(`Runners: ${runners.join(', ')}`)
  lines.push(`Judge: Agent-as-a-Judge (Zhuge et al. 2024) ${process.env.JUDGE_MODE === 'heuristic' ? '· **heuristic mode**' : '· DeepSeek deepseek-chat'}`)
  if (options.minimalContext) {
    lines.push(`Context: **minimal** (one_liner + sector only — detailed description stripped). Prompt-richness ablation; not a RAG ablation.`)
  } else {
    lines.push(`Context: full (one_liner + detailed description + sector).`)
  }
  // Stage 6: surface RAG status in the report header so readers don't have
  // to grep individual case files to know whether the citation pipeline
  // was active.
  const ragCases = rows.filter((r) => r.kbDocCount > 0).map((r) => r.case_id)
  const uniqueRagCases = [...new Set(ragCases)]
  if (uniqueRagCases.length > 0) {
    lines.push(
      `RAG: **active** for ${uniqueRagCases.length}/${cases.length} case(s) — ${uniqueRagCases.join(', ')}. Citation pipeline emits [[ref:doc#chunk]] tokens parsed into node metadata.`
    )
  } else {
    lines.push(`RAG: **not exercised** (workspace_knowledge=[] across all cases). Use \`--with-kb-only\` to filter to RAG-seeded cases once any are populated.`)
  }
  lines.push('')
  lines.push('## TL;DR — total scores per case × runner')
  lines.push('')
  lines.push(`| case | company | KB | ${runners.map((r) => `${r} total`).join(' | ')} | winner |`)
  lines.push(`| --- | --- | --- | ${runners.map(() => '---').join(' | ')} | --- |`)

  for (const caseId of cases) {
    const sub = rows.filter((r) => r.case_id === caseId)
    const company = sub[0]?.company_name ?? '?'
    const kbCount = sub[0]?.kbDocCount ?? 0
    const kbCell = kbCount > 0 ? `${kbCount} docs` : '—'
    const cells = runners.map((r) => {
      const row = sub.find((s) => s.runner === r)
      return row ? `${row.evaluation.total}/27 (${row.evaluation.average.toFixed(2)})` : '-'
    })
    const totals = sub.map((r) => ({ runner: r.runner, total: r.evaluation.total }))
    const winner = totals.length > 0
      ? totals.reduce((a, b) => (a.total >= b.total ? a : b)).runner
      : '-'
    lines.push(`| ${caseId} | ${company} | ${kbCell} | ${cells.join(' | ')} | **${winner}** |`)
  }

  // Aggregate
  lines.push('')
  lines.push('## Aggregate by runner')
  lines.push('')
  lines.push('| runner | mean total | mean avg | mean candidate chars | mean duration |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const r of runners) {
    const sub = rows.filter((row) => row.runner === r)
    const meanTotal = sub.reduce((a, b) => a + b.evaluation.total, 0) / sub.length
    const meanAvg = sub.reduce((a, b) => a + b.evaluation.average, 0) / sub.length
    const meanChars =
      sub.reduce((a, b) => a + b.candidateLengthChars, 0) / sub.length
    const meanDur = sub.reduce((a, b) => a + b.run.duration_ms, 0) / sub.length
    lines.push(
      `| ${r} | ${meanTotal.toFixed(1)}/27 | ${meanAvg.toFixed(2)} | ${meanChars.toFixed(0)} | ${(meanDur / 1000).toFixed(1)}s |`
    )
  }

  // Per-dimension grid (compact)
  lines.push('')
  lines.push('## Per-dimension score grid')
  lines.push('')
  const dimHeader = BMC_DIMENSION_IDS.map((d) => d.slice(0, 2)).join(' ')
  lines.push(`| case | runner | ${dimHeader} | total |`)
  lines.push(
    `| --- | --- | ${BMC_DIMENSION_IDS.map(() => '--').join(' ')} | --- |`
  )
  for (const row of rows) {
    const dimScores = BMC_DIMENSION_IDS.map(
      (d) => row.evaluation.perDimension[d]?.score ?? '-'
    ).join(' ')
    lines.push(
      `| ${row.case_id} | ${row.runner} | ${dimScores} | ${row.evaluation.total}/27 |`
    )
  }

  // Sample rationales — one rationale per case × runner (the first dim with score>0
  // OR first non-empty rationale)
  lines.push('')
  lines.push('## Sample rationales')
  lines.push('')
  for (const row of rows) {
    lines.push(
      `### ${row.case_id} · ${row.runner} · ${row.evaluation.total}/27`
    )
    lines.push('')
    if (row.run.error) {
      lines.push(`> error: ${row.run.error}`)
      lines.push('')
      continue
    }
    for (const dim of BMC_DIMENSION_IDS) {
      const score = row.evaluation.perDimension[dim]
      if (!score) continue
      lines.push(`- **${dim}** · score=${score.score} — ${score.rationale.slice(0, 220)}`)
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
  // P15 smoke · `--case=` accepts a single id or a comma-separated list
  // (e.g. --case=yc-stripe-2024,yc-airbnb-2024) so we can run a small
  // multi-case smoke without spinning up the full 12-case suite.
  const caseIdArg = args.find((a) => a.startsWith('--case='))?.split('=')[1]
  const caseIdSet = caseIdArg
    ? new Set(caseIdArg.split(',').map((s) => s.trim()).filter(Boolean))
    : null
  const runnersArg = args.find((a) => a.startsWith('--runners='))?.split('=')[1]
  const minimalContext = args.includes('--minimal-context')
  // Stage 6: filter to cases that have non-empty workspace_knowledge so the
  // citation pipeline isn't diluted by empty-KB runs in the same report.
  const withKbOnly = args.includes('--with-kb-only')
  // P11.18 · ablation flags. Each toggles a process-level gate honored
  // by BusinessLangGraph at invocation time. Combine to study marginal
  // contribution of each subsystem (e.g. --no-critic --no-debate
  // measures impact of removing both adversarial paths).
  // The variant tag goes into the runner column so a single report can
  // contain rows from multiple ablation variants run separately.
  const noCritic = args.includes('--no-critic')
  const noDebate = args.includes('--no-debate')
  const noRag = args.includes('--no-rag')
  const explicitVariant = args.find((a) => a.startsWith('--variant='))?.split('=')[1]
  const ablationParts = [
    noCritic ? 'no-critic' : null,
    noDebate ? 'no-debate' : null,
    noRag ? 'no-rag' : null
  ].filter((s): s is string => s !== null)
  const variantTag =
    explicitVariant ??
    (ablationParts.length > 0 ? ablationParts.join('+') : 'full')

  const allCases = loadAllYcCases()
  const filteredByCaseId = caseIdSet
    ? allCases.filter((c) => caseIdSet.has(c.case_id))
    : allCases
  const cases = withKbOnly
    ? filteredByCaseId.filter((c) => (c.workspace_knowledge?.length ?? 0) > 0)
    : filteredByCaseId

  if (cases.length === 0) {
    if (withKbOnly) {
      console.error(
        'No cases with workspace_knowledge populated. Add `workspace_knowledge` to a YC case file to enable citation eval.'
      )
    } else {
      console.error('No matching cases. Available case_ids:')
      for (const c of allCases) console.error(`  - ${c.case_id}`)
    }
    process.exit(1)
  }

  const validRunners = ['starlink', 'gpt-solo', 'gpt-solo-forced'] as const
  const runnerNames: RunnerName[] = runnersArg
    ? (runnersArg
        .split(',')
        .filter((r): r is RunnerName =>
          (validRunners as readonly string[]).includes(r)
        ) as RunnerName[])
    : ['starlink', 'gpt-solo']
  const runnerFns: Record<RunnerName, (c: BenchmarkCase) => Promise<BenchmarkRun>> = {
    // Forward ablation flags to the Starlink runner. The runner stamps
    // the variant tag onto the BenchmarkRun.runner field so the rendered
    // report's table can compare rows by variant.
    starlink: (c) => runStarlink(c, { noCritic, noDebate, noRag, variantTag }),
    'gpt-solo': (c) => runGptSolo(c),
    'gpt-solo-forced': (c) => runGptSolo(c, { forceNineCells: true })
  }

  console.error(
    `[yc-vs-runners] ${cases.length} case(s) × ${runnerNames.length} runner(s) = ${cases.length * runnerNames.length} runs`
  )
  console.error(
    `[yc-vs-runners] each Starlink run is full multi-agent pipeline (~15-30s); gpt-solo is single LLM call (~3-8s)`
  )
  if (minimalContext) {
    console.error(
      `[yc-vs-runners] --minimal-context: stripping detailed description, keeping only one_liner + sector. NOTE: this is a prompt-richness ablation; orthogonal to --with-kb-only which controls the RAG path.`
    )
  }
  if (noCritic || noDebate || noRag) {
    const off = [
      noCritic && 'critic',
      noDebate && 'debate',
      noRag && 'RAG'
    ]
      .filter(Boolean)
      .join(' + ')
    console.error(
      `[yc-vs-runners] ABLATION variant=${variantTag} · disabled: ${off}. Starlink runner runs with ${off} stripped; gpt-solo unaffected.`
    )
  }
  if (withKbOnly) {
    const kbCounts = cases
      .map((c) => `${c.case_id} (${c.workspace_knowledge?.length ?? 0} docs)`)
      .join(', ')
    console.error(
      `[yc-vs-runners] --with-kb-only: ${cases.length} case(s) with seeded knowledge — ${kbCounts}. Citation pipeline activates: agents emit [[ref:doc#chunk]] tokens, parser attaches grounding-rate to node metadata.`
    )
  }
  console.error('')

  const rows: ResultRow[] = []
  for (const yc of cases) {
    const benchCase = ycToBenchmarkCase(yc, { minimalContext })
    for (const r of runnerNames) {
      const fn = runnerFns[r]
      try {
        const row = await evalOneRunner(yc, benchCase, r, fn)
        rows.push(row)
      } catch (err) {
        console.error(`  ! ${r} on ${yc.case_id} threw:`, err)
      }
    }
  }

  const md = renderReport(rows, { minimalContext })
  console.log(md)

  // Persist
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const reportsDir = join(here, '..', '..', '..', 'benchmark', 'reports')
    mkdirSync(reportsDir, { recursive: true })
    const ts = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+/, '')
      .replace('T', '-')
    const suffix = minimalContext ? '-minctx' : ''
    const fp = join(reportsDir, `yc-vs-runners-${ts}${suffix}.md`)
    writeFileSync(fp, md)
    console.error(`\n[yc-vs-runners] report written: ${fp}`)
  } catch (err) {
    console.error('[yc-vs-runners] failed to write report file:', err)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
