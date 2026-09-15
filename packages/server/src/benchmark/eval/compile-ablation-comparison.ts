#!/usr/bin/env node
/**
 * compile-ablation-comparison.ts — aggregate the 5 ablation variants
 * into a single comparison table for the paper.
 *
 * Inputs: 5 markdown reports under benchmark/reports/
 *   - yc-vs-runners-*.md (one per variant: full / no-critic /
 *     no-debate / no-rag / minimal)
 *
 * Detection: each report's table rows tag the runner column with the
 * variant suffix (e.g. `starlink-no-critic`). We accept both formats:
 *   1. Filename suffix: yc-vs-runners-no-critic-<ts>.md
 *   2. Aggregate-table row labelled `starlink-<variant>` or `starlink`
 *      (the variantTag is appended to BenchmarkRun.runner upstream).
 *
 * Output: writes packages/server/benchmark/reports/ABLATION-COMPARISON.md
 * with three tables:
 *   - Aggregate per variant (mean total / avg / chars / duration)
 *   - Per-case scoreboard (rows = cases, columns = variants)
 *   - Per-dimension delta (full vs minimal — which dimensions degrade
 *     most when capabilities are stripped)
 *
 * Run:
 *   pnpm --filter @starlink/server build
 *   node packages/server/dist/benchmark/eval/compile-ablation-comparison.js
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

interface AggregateRow {
  variant: string
  meanTotal: number
  meanAvg: number
  meanChars: number
  meanDuration: number
}

interface CaseRow {
  caseId: string
  company: string
  scores: Record<string, { total: number; avg: number }> // keyed by variant
}

const VARIANTS = ['full', 'no-critic', 'no-debate', 'no-rag', 'minimal'] as const
type Variant = (typeof VARIANTS)[number]

function parseAggregate(md: string): { variant: string; row: Omit<AggregateRow, 'variant'> } | null {
  // Find the "## Aggregate by runner" section.
  const aggMatch = md.match(/## Aggregate by runner\n\n(\| runner \|[\s\S]*?)(?=\n##|$)/)
  if (!aggMatch) return null
  const tableLines = aggMatch[1].split('\n').filter((l) => l.trim().startsWith('|'))
  if (tableLines.length < 3) return null
  // Skip header (line 0) and separator (line 1). Each remaining row is a
  // runner. We pick the first non-gpt-solo line — the variant tag lives
  // in the runner cell.
  for (const line of tableLines.slice(2)) {
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0)
    if (cells.length < 5) continue
    const [runner, total, avg, chars, dur] = cells
    if (runner === 'gpt-solo') continue
    // Strip the "/27" suffix from total.
    const totalNum = Number(total.replace('/27', '').trim())
    const avgNum = Number(avg)
    const charsNum = Number(chars)
    // duration is "12.3s"
    const durNum = Number(dur.replace('s', ''))
    if (![totalNum, avgNum, charsNum, durNum].every(Number.isFinite)) continue
    return {
      variant: extractVariantFromRunner(runner),
      row: { meanTotal: totalNum, meanAvg: avgNum, meanChars: charsNum, meanDuration: durNum }
    }
  }
  return null
}

function extractVariantFromRunner(runner: string): string {
  // runner shapes: "starlink", "starlink-no-critic", "starlink-no-rag", etc.
  if (runner === 'starlink') return 'full'
  const m = runner.match(/^starlink-(.+)$/)
  if (m) return m[1]
  return runner
}

function parseCaseTable(md: string): { variant: string | null; cases: Map<string, { total: number; avg: number; company: string }> } {
  // Find "## TL;DR — total scores per case × runner" then walk rows.
  const out = new Map<string, { total: number; avg: number; company: string }>()
  const tldrMatch = md.match(/## TL;DR[\s\S]*?\n\n(\| case [\s\S]*?)(?=\n##|$)/)
  if (!tldrMatch) return { variant: null, cases: out }
  const tableLines = tldrMatch[1].split('\n').filter((l) => l.trim().startsWith('|'))
  if (tableLines.length < 3) return { variant: null, cases: out }

  // Header tells us which column is which variant.
  const header = tableLines[0].split('|').map((c) => c.trim()).filter(Boolean)
  // Expected: case | company | KB | <runner> total | ... | winner
  const totalColIndex = header.findIndex((c) => c.endsWith('total'))
  const variantFromHeader = totalColIndex >= 0
    ? extractVariantFromRunner(header[totalColIndex].replace(' total', ''))
    : null

  for (const line of tableLines.slice(2)) {
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0)
    if (cells.length < 4) continue
    const [caseId, company, , scoreCell] = cells
    // scoreCell shape: "20/27 (2.22)"
    const m = scoreCell.match(/(\d+)\/27\s*\(([\d.]+)\)/)
    if (!m) continue
    out.set(caseId, { total: Number(m[1]), avg: Number(m[2]), company })
  }
  return { variant: variantFromHeader, cases: out }
}

async function main() {
  const reportsDir = path.resolve(process.cwd(), 'benchmark/reports')
  const files = await readdir(reportsDir)
  // Pick the most-recent yc-vs-runners-*.md per variant. The runner
  // column in the aggregate table tells us the variant.
  const candidates = files
    .filter((f) => f.startsWith('yc-vs-runners-') && f.endsWith('.md'))
    .sort()
    .reverse()  // newest first

  // Map variant → most-recent report path.
  const found = new Map<string, { path: string; agg: AggregateRow; cases: Map<string, { total: number; avg: number; company: string }> }>()
  for (const f of candidates) {
    if (found.size === VARIANTS.length) break
    const full = path.join(reportsDir, f)
    const md = await readFile(full, 'utf8')
    const agg = parseAggregate(md)
    if (!agg) continue
    const variant = agg.variant
    if (!VARIANTS.includes(variant as Variant)) continue
    if (found.has(variant)) continue  // already have a newer report for this variant
    const { cases } = parseCaseTable(md)
    found.set(variant, {
      path: f,
      agg: { variant, ...agg.row },
      cases
    })
  }

  if (found.size < 2) {
    console.error(`[compile-ablation] Only found ${found.size} variant report(s) — need ≥ 2 for comparison.`)
    console.error('  Variants found:', [...found.keys()].join(', ') || '(none)')
    process.exit(1)
  }

  // ---- Build comparison markdown ----
  const lines: string[] = []
  lines.push('# Ablation comparison · Starlink BMC pipeline')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push(`Variants found: **${[...found.keys()].join('** · **')}**`)
  lines.push('')
  lines.push('Source reports:')
  for (const [v, info] of found) {
    lines.push(`  - **${v}** ← \`${info.path}\``)
  }
  lines.push('')

  // 1. Aggregate per variant
  lines.push('## Aggregate per variant')
  lines.push('')
  lines.push('| variant | mean total | mean avg | mean chars | mean duration | Δ vs full |')
  lines.push('| --- | --- | --- | --- | --- | --- |')
  const fullAgg = found.get('full')?.agg
  for (const v of VARIANTS) {
    const info = found.get(v)
    if (!info) {
      lines.push(`| ${v} | — | — | — | — | (no data) |`)
      continue
    }
    const a = info.agg
    const delta = fullAgg && v !== 'full'
      ? (a.meanTotal - fullAgg.meanTotal).toFixed(1)
      : '—'
    const deltaStr = delta === '—' ? '—' : (Number(delta) > 0 ? `+${delta}` : delta)
    lines.push(
      `| **${v}** | ${a.meanTotal.toFixed(1)}/27 | ${a.meanAvg.toFixed(2)} | ${a.meanChars.toFixed(0)} | ${a.meanDuration.toFixed(1)}s | ${deltaStr} |`
    )
  }
  lines.push('')

  // 2. Per-case scoreboard
  lines.push('## Per-case scoreboard')
  lines.push('')
  // Collect all case ids across all variants.
  const allCaseIds = new Set<string>()
  for (const info of found.values()) {
    for (const c of info.cases.keys()) allCaseIds.add(c)
  }
  const caseIds = [...allCaseIds].sort()
  const variantCols = [...found.keys()]
  lines.push(`| case | company | ${variantCols.join(' | ')} |`)
  lines.push(`| --- | --- | ${variantCols.map(() => '---').join(' | ')} |`)
  for (const caseId of caseIds) {
    const company = [...found.values()][0].cases.get(caseId)?.company ?? '?'
    const scoreCells = variantCols.map((v) => {
      const c = found.get(v)?.cases.get(caseId)
      return c ? `${c.total}/27 (${c.avg.toFixed(2)})` : '—'
    })
    lines.push(`| ${caseId} | ${company} | ${scoreCells.join(' | ')} |`)
  }
  lines.push('')

  // 3. Δ analysis (full vs others)
  if (fullAgg) {
    lines.push('## Capability impact · Δ from full pipeline')
    lines.push('')
    lines.push('| capability disabled | mean Δ score | mean Δ duration | interpretation |')
    lines.push('| --- | --- | --- | --- |')
    const interpretations: Record<string, string> = {
      'no-critic': 'critic loop adds adversarial review → if Δ ≈ 0 critic is mostly cosmetic; large negative Δ means real value',
      'no-debate': 'debate triggers when conflicts surface → typically infrequent; small Δ expected',
      'no-rag': 'RAG injects KB chunks → only matters on cases with seeded KB',
      'minimal': 'all 3 stripped → upper bound on combined value-add of the orchestration layer'
    }
    for (const v of VARIANTS.filter((x) => x !== 'full')) {
      const info = found.get(v)
      if (!info) continue
      const dScore = (info.agg.meanTotal - fullAgg.meanTotal).toFixed(1)
      const dDur = (info.agg.meanDuration - fullAgg.meanDuration).toFixed(1)
      const dScoreStr = Number(dScore) > 0 ? `+${dScore}` : dScore
      const dDurStr = Number(dDur) > 0 ? `+${dDur}s` : `${dDur}s`
      lines.push(`| ${v} | ${dScoreStr} | ${dDurStr} | ${interpretations[v] ?? ''} |`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push('*Auto-generated by `compile-ablation-comparison.ts`. Re-run after every full ablation sweep.*')

  const outPath = path.join(reportsDir, 'ABLATION-COMPARISON.md')
  await writeFile(outPath, lines.join('\n'), 'utf8')
  console.log(`[compile-ablation] Wrote ${outPath}`)
  console.log(`[compile-ablation] Variants: ${[...found.keys()].join(', ')}`)
}

main().catch((err) => {
  console.error('[compile-ablation] failed:', err)
  process.exit(1)
})
