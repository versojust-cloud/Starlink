/**
 * CLI entry for the coaching-mode user-skill benchmark (2026-04-28).
 *
 *   pnpm --filter @starlink/server build
 *   DEEPSEEK_API_KEY=... LLM_API_KEY=... \
 *     LLM_BASE_URL=https://api.deepseek.com/v1 LLM_MODEL=deepseek-chat \
 *     node packages/server/dist/benchmark/coaching/run-coach-eval.js
 *
 * Optional flags:
 *   --persona=<id>   only evaluate one persona (default: all)
 *
 * Output: markdown report at
 *   packages/server/benchmark/reports/coaching-eval-<timestamp>.md
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALL_PERSONAS } from './personas.js'
import {
  evaluatePersona,
  type PersonaEvalResult
} from './coach-eval-runner.js'

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`
}

function renderReport(results: PersonaEvalResult[]): string {
  const lines: string[] = []
  lines.push('# Coaching-Mode User-Skill Benchmark')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push(`Personas: ${results.length}`)
  lines.push(`Model: ${process.env.LLM_MODEL ?? 'default'}`)
  lines.push('')
  lines.push('## TL;DR')
  lines.push('')
  lines.push('| persona | judge recall | lexical recall | precision | block kw hits | persona pickup | discovery avoid |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- |')
  for (const r of results) {
    const pickup = r.abMetrics
      ? (r.abMetrics.personaTermPickup >= 0 ? '+' : '') + r.abMetrics.personaTermPickup
      : 'n/a'
    const avoid = r.abMetrics
      ? (r.abMetrics.genericDiscoveryAvoidance >= 0 ? '+' : '') + r.abMetrics.genericDiscoveryAvoidance
      : 'n/a'
    const judgeCell = r.judgeRecall
      ? `${pct(r.judgeRecall.fraction)} (${r.judgeRecall.traits.filter((t) => t.hit).length}/${r.persona.traits.length})` +
        (r.judgeRecall.judgeFailed > 0 ? ` ⚠️${r.judgeRecall.judgeFailed} fallback` : '')
      : 'n/a'
    lines.push(
      `| ${r.persona.id} | **${judgeCell}** | ${pct(r.recall.fraction)} (${r.recall.traits.filter((t) => t.hit).length}/${r.persona.traits.length}) | ${pct(r.precision.fraction)} (${r.precision.skills.filter((s) => s.justified).length}/${r.precision.skills.length}) | ${r.blockRender.keywordHits}/${r.blockRender.keywordTotal} | ${pickup} | ${avoid} |`
    )
  }
  lines.push('')
  // Aggregate across personas (when N >= 2).
  if (results.length >= 2) {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
    const judgeRecalls = results.map((r) => r.judgeRecall?.fraction ?? 0)
    const lexRecalls = results.map((r) => r.recall.fraction)
    const precisions = results.map((r) => r.precision.fraction)
    const pickups = results.map((r) => r.abMetrics?.personaTermPickup ?? 0)
    const avoids = results.map((r) => r.abMetrics?.genericDiscoveryAvoidance ?? 0)
    lines.push('### Aggregate (N=' + results.length + ')')
    lines.push('')
    lines.push(`- **mean judge recall**: ${pct(mean(judgeRecalls))}`)
    lines.push(`- mean lexical recall: ${pct(mean(lexRecalls))}`)
    lines.push(`- mean precision: ${pct(mean(precisions))}`)
    lines.push(`- mean persona pickup: ${mean(pickups).toFixed(2)}`)
    lines.push(`- mean discovery avoid: ${mean(avoids).toFixed(2)}`)
    lines.push('')
  }
  lines.push(
    '> **judge recall** = LLM judge (semantic, threshold 0.6) — primary signal. ' +
      '**lexical recall** = old keyword-density ≥ 0.25 — kept for transparency. ' +
      '**persona pickup** = (with-block persona-keyword hits) − (baseline). ' +
      '**discovery avoid** = (baseline generic-discovery hits) − (with-block).'
  )
  lines.push('')

  for (const r of results) {
    lines.push('---')
    lines.push('')
    lines.push(`## ${r.persona.name} (\`${r.persona.id}\`)`)
    lines.push('')
    lines.push(`> ${r.persona.bio}`)
    lines.push('')

    if (r.errors.length) {
      lines.push('### ⚠️ Errors')
      for (const err of r.errors) lines.push(`- ${err}`)
      lines.push('')
    }

    // Ground truth traits
    lines.push('### Ground-truth traits')
    lines.push('')
    for (const t of r.persona.traits) {
      lines.push(`- **\`${t.id}\`** (${t.category}) **${t.label}** — ${t.description}`)
      lines.push(`    keywords: \`${t.keywords.join(', ')}\``)
    }
    lines.push('')

    // Synthetic summaries
    lines.push('### Synthetic summaries seeded into the store')
    lines.push('')
    for (const s of r.summaries) {
      lines.push(`**${s.ideaName}** (\`${s.workspaceId}\`)`)
      lines.push('')
      lines.push(`> ${s.summary}`)
      lines.push('')
    }

    // Extracted skills
    lines.push('### Extracted user-skill rows')
    lines.push('')
    if (r.extractedSkills.length === 0) {
      lines.push('_(none — extractor produced no skills)_')
    } else {
      lines.push('| title | scope | confidence | tags | content |')
      lines.push('| --- | --- | --- | --- | --- |')
      for (const s of r.extractedSkills) {
        lines.push(
          `| **${s.title}** | ${s.scope} | ${s.confidence.toFixed(2)} | ${s.tags.join(',')} | ${s.content.replace(/\n+/g, ' ').slice(0, 200)} |`
        )
      }
    }
    lines.push('')

    // Recall details — LLM judge (primary)
    if (r.judgeRecall) {
      lines.push('### Trait recall — LLM judge (primary)')
      lines.push('')
      lines.push('| trait | hit | score | best match | rationale |')
      lines.push('| --- | --- | --- | --- | --- |')
      for (const e of r.judgeRecall.traits) {
        const m = e.bestMatch
        const skillCell = m ? `**${m.skillTitle}**` : '—'
        const scoreCell = e.judge ? e.judge.score.toFixed(2) : 'lex'
        const rationale = e.judge?.rationale ?? '_(fallback to lexical)_'
        lines.push(`| ${e.trait.label} | ${e.hit ? '✅' : '❌'} | ${scoreCell} | ${skillCell} | ${rationale} |`)
      }
      if (r.judgeRecall.judgeFailed > 0) {
        lines.push('')
        lines.push(`⚠️ ${r.judgeRecall.judgeFailed} trait(s) fell back to lexical (judge call failed/parse error)`)
      }
      lines.push('')
    }

    // Recall details — lexical (kept for transparency)
    lines.push('### Trait recall — lexical (legacy)')
    lines.push('')
    lines.push('| trait | hit | best match (score) |')
    lines.push('| --- | --- | --- |')
    for (const e of r.recall.traits) {
      const m = e.bestMatch
      const cell = m
        ? `**${m.skillTitle}** (${m.score.toFixed(2)}) — ${m.skillContent.slice(0, 100)}`
        : '—'
      lines.push(`| ${e.trait.label} | ${e.hit ? '✅' : '❌'} | ${cell} |`)
    }
    lines.push('')

    // Precision details
    lines.push('### Skill precision detail')
    lines.push('')
    lines.push('| skill | justified? | matched traits |')
    lines.push('| --- | --- | --- |')
    for (const p of r.precision.skills) {
      lines.push(
        `| ${p.skill.title} | ${p.justified ? '✅' : '⚠️ unjustified'} | ${p.matchedTraitIds.join(', ') || '_none_'} |`
      )
    }
    lines.push('')

    // Rendered block
    lines.push('### Rendered userSkillBlock (what gets injected into prompts)')
    lines.push('')
    lines.push('```')
    lines.push(r.blockRender.block || '(empty — no skills passed confidence threshold)')
    lines.push('```')
    lines.push('')
    lines.push(
      `Keyword saturation: **${r.blockRender.keywordHits}/${r.blockRender.keywordTotal}** (${pct(r.blockRender.keywordHits / Math.max(1, r.blockRender.keywordTotal))})`
    )
    lines.push('')

    // A/B coach
    lines.push('### A/B coach comparison (`reflectOnIdeation` with vs without skill block)')
    lines.push('')
    lines.push(`Sentinels (lower-case substring match): \`${r.sentinels.join(', ')}\``)
    lines.push('')
    for (const c of r.abCoachComparison) {
      lines.push(`#### scenario: \`${c.scenario}\` · scaffold=${c.response.scaffold} · source=${c.response.source}`)
      lines.push('')
      lines.push('> ' + c.response.content.replace(/\n+/g, '\n> '))
      lines.push('')
      lines.push(
        `Persona-term hits: **${c.personaTermHits}** · Generic-discovery hits: **${c.genericDiscoveryHits}** · ` +
          `Legacy sentinel hits: ${c.sentinelHits.length === 0 ? '_(none)_' : c.sentinelHits.map((s) => '`' + s + '`').join(', ')}`
      )
      lines.push('')
    }
    if (r.abMetrics) {
      lines.push(
        `**A/B summary**: persona-term pickup = **${r.abMetrics.personaTermPickup >= 0 ? '+' : ''}${r.abMetrics.personaTermPickup}** · ` +
          `generic-discovery avoidance = **${r.abMetrics.genericDiscoveryAvoidance >= 0 ? '+' : ''}${r.abMetrics.genericDiscoveryAvoidance}**`
      )
      lines.push('')
    }

    lines.push('')
  }

  return lines.join('\n')
}

async function main() {
  const args = process.argv.slice(2)
  const personaArg = args.find((a) => a.startsWith('--persona='))?.split('=')[1]
  const personas = personaArg
    ? ALL_PERSONAS.filter((p) => p.id === personaArg)
    : ALL_PERSONAS

  if (personas.length === 0) {
    console.error('No matching personas. Available:', ALL_PERSONAS.map((p) => p.id).join(', '))
    process.exit(1)
  }

  console.error(`[coach-eval] running ${personas.length} persona(s)`)
  const results: PersonaEvalResult[] = []
  for (const p of personas) {
    console.error(`  · ${p.id} ...`)
    const r = await evaluatePersona(p)
    const judgeStr = r.judgeRecall ? pct(r.judgeRecall.fraction) : 'n/a'
    console.error(
      `    judge-recall=${judgeStr} lex-recall=${pct(r.recall.fraction)} precision=${pct(r.precision.fraction)} block=${r.blockRender.keywordHits}/${r.blockRender.keywordTotal}`
    )
    results.push(r)
  }

  const md = renderReport(results)
  console.log(md)

  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const reportsDir = join(here, '..', '..', '..', 'benchmark', 'reports')
    mkdirSync(reportsDir, { recursive: true })
    const ts = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+/, '')
      .replace('T', '-')
    const fp = join(reportsDir, `coaching-eval-${ts}.md`)
    writeFileSync(fp, md)
    console.error(`\n[coach-eval] report written: ${fp}`)
  } catch (err) {
    console.error('[coach-eval] failed to write report:', err)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
