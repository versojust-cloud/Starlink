/**
 * Agent-as-a-Judge evaluator (Zhuge et al. 2024 methodology applied to BMC).
 *
 * Reference: arxiv.org/abs/2410.10934 — uses an LLM as the evaluator,
 * with prompted rubrics enforcing structured judgement. We adapt the
 * methodology to score BMC outputs against hand-authored ground truth:
 *
 *   For each (case, runner_bmc_output) pair, ask a JUDGE LLM
 *   to score on a 0-3 rubric per BMC dimension:
 *     0 — empty / off-topic
 *     1 — partially covers must_cover
 *     2 — covers all must_cover, plausible content
 *     3 — covers all must_cover + adds defensible nuance
 *
 *   PLUS dual-LLM consensus: ask GPT-4o AND Claude (if available),
 *   take per-dimension MIN to be conservative. Disagreement >1 point
 *   on any dimension → flag for human review.
 *
 * Stage status: SKELETON. The actual LLM judge call is stubbed —
 * the prompt template + scoring scaffolding are real but `runJudge()`
 * returns a placeholder zero-score until DeepSeek + a separate judge
 * model are wired (Stage J.4).
 *
 * Why ship the skeleton now: lets us iterate on the rubric + dataset
 * shape without committing to a particular judge LLM yet, and lets
 * the benchmark CLI plug in stub scores for end-to-end pipeline
 * testing.
 */

import { BMC_DIMENSION_IDS, type BmcDimensionId } from '../types.js'
import type { YcCompanyCase } from '../corpus/yc-cases/index.js'

// =============================================================================
// Types
// =============================================================================

export interface JudgeRubric {
  /** What the runner produced for this dimension (free-text BMC content). */
  candidate: string
  /** Hand-authored truth for this dimension. */
  ground_truth: string
  must_cover: string[]
  must_not_cover: string[]
}

export interface JudgeScore {
  /** 0-3 integer per the rubric */
  score: 0 | 1 | 2 | 3
  /** brief one-line rationale from the judge */
  rationale: string
  /** which must_cover tokens were detected in candidate */
  covered: string[]
  /** which must_cover tokens were missing */
  missed: string[]
  /** any must_not_cover tokens that did appear (penalty signal) */
  violations: string[]
}

export interface CaseEvaluation {
  case_id: string
  runner: string
  /** per-dimension scores keyed by canonical BMC dimension id */
  perDimension: Partial<Record<BmcDimensionId, JudgeScore>>
  /** sum of all 9 dimension scores, 0-27 */
  total: number
  /** average across non-empty dimensions, 0-3 */
  average: number
  /** dimensions where judge confidence is low and a human should review */
  needs_human_review: BmcDimensionId[]
}

// =============================================================================
// Judge prompt template (copy-pastable into a chat completion)
// =============================================================================

export const JUDGE_SYSTEM_PROMPT = `You are an expert evaluator scoring a Business Model Canvas (BMC) output against hand-authored ground truth.

For each dimension you evaluate, score 0-3:
- 0: candidate is empty, off-topic, or contradicts the company's actual model
- 1: candidate partially covers must_cover concepts, but misses key ones or has plausibility gaps
- 2: covers all must_cover concepts, content is plausible and on-domain
- 3: covers must_cover + adds defensible, non-obvious nuance the ground truth itself omitted

Penalties:
- If candidate mentions any must_not_cover token, cap score at 1
- If candidate is purely generic (e.g. "online users" with no specifics), cap at 1

Output STRICT JSON: {
  "score": 0 | 1 | 2 | 3,
  "rationale": "<one short sentence>",
  "covered": [<must_cover tokens detected>],
  "missed": [<must_cover tokens missing>],
  "violations": [<must_not_cover tokens that appeared>]
}`

export function buildJudgeUserMessage(
  rubric: JudgeRubric,
  dimensionId: BmcDimensionId
): string {
  return `BMC dimension: ${dimensionId}

GROUND_TRUTH (hand-authored):
${rubric.ground_truth}

MUST_COVER (concepts the candidate should mention):
${rubric.must_cover.length > 0 ? rubric.must_cover.map((t) => `- ${t}`).join('\n') : '(none)'}

MUST_NOT_COVER (concepts the candidate should NOT mention):
${rubric.must_not_cover.length > 0 ? rubric.must_not_cover.map((t) => `- ${t}`).join('\n') : '(none)'}

CANDIDATE (the BMC pipeline output for this dimension):
${rubric.candidate}

Score the candidate per the rubric. Respond with the JSON object only.`
}

// =============================================================================
// Heuristic stub — token-overlap fallback used until the LLM judge is wired
// =============================================================================

/**
 * Cheap heuristic that approximates the LLM judge's scoring by pure token
 * overlap. Useful for:
 *   - smoke-testing the eval pipeline without burning judge LLM calls
 *   - pre-screening to decide which cases need an actual LLM judge
 *   - CI / dev environments where no LLM key is available
 */
export function heuristicScore(rubric: JudgeRubric): JudgeScore {
  const candidateLower = rubric.candidate.toLowerCase()
  const covered = rubric.must_cover.filter((t) =>
    candidateLower.includes(t.toLowerCase())
  )
  const missed = rubric.must_cover.filter((t) => !covered.includes(t))
  const violations = rubric.must_not_cover.filter((t) =>
    candidateLower.includes(t.toLowerCase())
  )

  // Penalty: if candidate touches any must_not_cover, cap at 1
  if (violations.length > 0) {
    return {
      score: 1,
      rationale: `mentions must_not_cover token(s): ${violations.join(', ')}`,
      covered,
      missed,
      violations
    }
  }

  if (rubric.must_cover.length === 0) {
    // nothing to cover — score by length + non-emptiness
    const score = candidateLower.trim().length < 10 ? 0 : 2
    return {
      score: score as 0 | 2,
      rationale:
        score === 0
          ? 'candidate is essentially empty'
          : 'no must_cover defined; candidate is non-empty and on-topic',
      covered,
      missed,
      violations: []
    }
  }

  const ratio = covered.length / rubric.must_cover.length
  let score: 0 | 1 | 2 | 3
  let rationale: string
  if (ratio === 0) {
    score = 0
    rationale = 'no must_cover concepts detected'
  } else if (ratio < 0.5) {
    score = 1
    rationale = `covers ${covered.length}/${rubric.must_cover.length} must_cover concepts`
  } else if (ratio < 1) {
    score = 2
    rationale = `covers ${covered.length}/${rubric.must_cover.length} must_cover concepts; plausible`
  } else {
    score = 3
    rationale = 'covers all must_cover concepts'
  }
  return { score, rationale, covered, missed, violations }
}

// =============================================================================
// Dual-judge consensus stub
// =============================================================================

/**
 * Returns the conservative (per-dimension MIN) score across multiple judges
 * + flags dimensions where judges disagreed by ≥2 points (caller should
 * surface these for human review).
 */
export function dualJudgeConsensus(
  scores: JudgeScore[]
): { consensus: JudgeScore; disagreement: number } {
  if (scores.length === 0) {
    throw new Error('dualJudgeConsensus: empty scores array')
  }
  if (scores.length === 1) {
    return { consensus: scores[0], disagreement: 0 }
  }
  const minScore = scores.reduce((a, b) => (a.score <= b.score ? a : b))
  const maxScore = scores.reduce((a, b) => (a.score >= b.score ? a : b))
  return { consensus: minScore, disagreement: maxScore.score - minScore.score }
}

// =============================================================================
// Real LLM judge (Stage J.4 — DeepSeek wired)
// =============================================================================

const DEEPSEEK_URL =
  process.env.DEEPSEEK_BASE_URL?.replace(/\/+$/, '') ?? 'https://api.deepseek.com/v1'
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY ?? process.env.LLM_API_KEY ?? ''
const DEEPSEEK_MODEL = process.env.JUDGE_MODEL ?? process.env.LLM_MODEL ?? 'deepseek-chat'
const JUDGE_TIMEOUT_MS = 20_000

interface DeepSeekChoice {
  message?: { content?: string | null }
}
interface DeepSeekResp {
  choices?: DeepSeekChoice[]
  error?: { message?: string }
}

interface RawJudgeOutput {
  score: number
  rationale: string
  covered?: string[]
  missed?: string[]
  violations?: string[]
}

async function callDeepSeekJudge(
  rubric: JudgeRubric,
  dimensionId: BmcDimensionId
): Promise<RawJudgeOutput> {
  if (!DEEPSEEK_KEY) {
    throw new Error('JUDGE: no DEEPSEEK_API_KEY / LLM_API_KEY configured')
  }
  const ac = new AbortController()
  const timeoutId = setTimeout(() => ac.abort(), JUDGE_TIMEOUT_MS)
  try {
    const res = await fetch(`${DEEPSEEK_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_KEY}`
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: JUDGE_SYSTEM_PROMPT },
          { role: 'user', content: buildJudgeUserMessage(rubric, dimensionId) }
        ],
        response_format: { type: 'json_object' },
        // Lower temperature for evaluator stability — we want repeatable
        // scores, not creative ones.
        temperature: 0.2,
        max_tokens: 400
      }),
      signal: ac.signal
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 200)}`)
    }
    const json = (await res.json()) as DeepSeekResp
    if (json.error) throw new Error(`DeepSeek error: ${json.error.message ?? 'unknown'}`)
    const content = json.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('DeepSeek returned empty content')

    const stripped = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
    let parsed: unknown
    try {
      parsed = JSON.parse(stripped)
    } catch {
      throw new Error(`Judge output is not valid JSON: ${content.slice(0, 120)}`)
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Judge output is not an object')
    }
    const obj = parsed as Record<string, unknown>
    const score = typeof obj.score === 'number' ? obj.score : Number(obj.score)
    if (!Number.isInteger(score) || score < 0 || score > 3) {
      throw new Error(`Judge score out of range or not integer: ${obj.score}`)
    }
    return {
      score,
      rationale:
        typeof obj.rationale === 'string' ? obj.rationale.slice(0, 400) : 'no rationale',
      covered: Array.isArray(obj.covered) ? obj.covered.filter((t) => typeof t === 'string') : [],
      missed: Array.isArray(obj.missed) ? obj.missed.filter((t) => typeof t === 'string') : [],
      violations: Array.isArray(obj.violations)
        ? obj.violations.filter((t) => typeof t === 'string')
        : []
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Run a judge LLM on a candidate BMC output for one dimension.
 *
 * Strategy:
 *   1. If `JUDGE_MODE=heuristic` env or no API key → heuristic-only path
 *      (pure token-overlap; reproducible, free, used in CI / smoke).
 *   2. Otherwise → DeepSeek with structured-JSON output + 20s timeout +
 *      Zod-shape validation. On failure of any kind, fall back to the
 *      heuristic so the eval pipeline never crashes mid-run.
 *
 * Note: the function takes `dimensionId` so the judge prompt can carry
 * the dimension's canonical id (helps the LLM stay in scope, especially
 * for adjacent-but-not-identical dims like CUSTOMER_SEGMENTS vs CR).
 */
/**
 * P15-fix #2 · Multi-judge ensemble (opt-in).
 *
 * Single-judge runs swing ±2-3 points across the 27-point yc benchmark
 * just from LLM temperature variance, blocking us from telling apart real
 * agent changes (P15 BMC prompt tweaks) vs noise.
 *
 * Ensemble: call the same judge K times with different temperatures
 * (0.0 / 0.3 / 0.6) in parallel, take the median score, and report
 * disagreement (max - min). Costs 3× tokens but only run when explicitly
 * opted-in (JUDGE_ENSEMBLE_SIZE=3).
 *
 * Why median (not mean): scores are integer 0-3, so a mean smears resolution.
 * Median with K=3 → exact integer + robust to one outlier voter.
 */
const ENSEMBLE_TEMPS = [0.0, 0.3, 0.6] as const

function medianScore(raws: RawJudgeOutput[]): RawJudgeOutput {
  const sorted = [...raws].sort((a, b) => a.score - b.score)
  return sorted[Math.floor(sorted.length / 2)]
}

async function callDeepSeekJudgeWithTemp(
  rubric: JudgeRubric,
  dimensionId: BmcDimensionId,
  temperature: number
): Promise<RawJudgeOutput> {
  if (!DEEPSEEK_KEY) {
    throw new Error('JUDGE: no DEEPSEEK_API_KEY / LLM_API_KEY configured')
  }
  const ac = new AbortController()
  const timeoutId = setTimeout(() => ac.abort(), JUDGE_TIMEOUT_MS)
  try {
    const res = await fetch(`${DEEPSEEK_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_KEY}`
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: JUDGE_SYSTEM_PROMPT },
          { role: 'user', content: buildJudgeUserMessage(rubric, dimensionId) }
        ],
        response_format: { type: 'json_object' },
        temperature,
        max_tokens: 400
      }),
      signal: ac.signal
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 200)}`)
    }
    const json = (await res.json()) as DeepSeekResp
    if (json.error) throw new Error(`DeepSeek error: ${json.error.message ?? 'unknown'}`)
    const content = json.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('DeepSeek returned empty content')
    const stripped = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
    const parsed = JSON.parse(stripped) as Record<string, unknown>
    const score = typeof parsed.score === 'number' ? parsed.score : Number(parsed.score)
    if (!Number.isInteger(score) || score < 0 || score > 3) {
      throw new Error(`Judge score out of range: ${parsed.score}`)
    }
    return {
      score,
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 400) : 'no rationale',
      covered: Array.isArray(parsed.covered) ? parsed.covered.filter((t) => typeof t === 'string') : [],
      missed: Array.isArray(parsed.missed) ? parsed.missed.filter((t) => typeof t === 'string') : [],
      violations: Array.isArray(parsed.violations) ? parsed.violations.filter((t) => typeof t === 'string') : []
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

async function runJudgeEnsemble(
  rubric: JudgeRubric,
  dimensionId: BmcDimensionId,
  ensembleSize: number
): Promise<JudgeScore> {
  const temps = ENSEMBLE_TEMPS.slice(0, Math.min(ensembleSize, ENSEMBLE_TEMPS.length))
  const results = await Promise.allSettled(
    temps.map((t) => callDeepSeekJudgeWithTemp(rubric, dimensionId, t))
  )
  const successes = results
    .filter((r): r is PromiseFulfilledResult<RawJudgeOutput> => r.status === 'fulfilled')
    .map((r) => r.value)
  if (successes.length === 0) {
    throw new Error('all ensemble judges failed')
  }
  const median = medianScore(successes)
  const scores = successes.map((s) => s.score)
  const disagreement = Math.max(...scores) - Math.min(...scores)
  return {
    score: median.score as 0 | 1 | 2 | 3,
    rationale: `[ensemble n=${successes.length} med=${median.score} disagree=${disagreement}] ${median.rationale}`,
    covered: median.covered ?? [],
    missed: median.missed ?? [],
    violations: median.violations ?? []
  }
}

export async function runJudge(
  rubric: JudgeRubric,
  dimensionId: BmcDimensionId
): Promise<JudgeScore> {
  const heuristicMode = process.env.JUDGE_MODE === 'heuristic'
  if (heuristicMode || !DEEPSEEK_KEY) {
    return heuristicScore(rubric)
  }
  const ensembleSize = Number(process.env.JUDGE_ENSEMBLE_SIZE) || 1
  try {
    if (ensembleSize > 1) {
      return await runJudgeEnsemble(rubric, dimensionId, ensembleSize)
    }
    const raw = await callDeepSeekJudge(rubric, dimensionId)
    return {
      score: raw.score as 0 | 1 | 2 | 3,
      rationale: raw.rationale,
      covered: raw.covered ?? [],
      missed: raw.missed ?? [],
      violations: raw.violations ?? []
    }
  } catch (err) {
    // Eval pipeline never crashes — fall back to heuristic
    const errMsg = err instanceof Error ? err.message : String(err)
    console.warn(`[agent-as-judge] LLM judge failed for ${dimensionId}, using heuristic`, errMsg)
    const fallback = heuristicScore(rubric)
    return {
      ...fallback,
      rationale: `${fallback.rationale} [llm-fallback: ${errMsg.slice(0, 80)}]`
    }
  }
}

/**
 * Score one whole case (all 9 BMC dimensions). Caller provides:
 *   - the case (with ground_truth_bmc)
 *   - the candidate BMC output keyed by dimension id (free text per cell)
 */
export async function evaluateCase(
  testCase: YcCompanyCase,
  candidate: Partial<Record<BmcDimensionId, string>>,
  runner: string
): Promise<CaseEvaluation> {
  const perDimension: Partial<Record<BmcDimensionId, JudgeScore>> = {}
  let totalScore = 0
  let scoredDimensions = 0
  const needs_human_review: BmcDimensionId[] = []

  for (const dimId of BMC_DIMENSION_IDS) {
    const truth = testCase.ground_truth_bmc[dimId]
    if (!truth) continue
    const candidateText = candidate[dimId] ?? ''
    const score = await runJudge(
      {
        candidate: candidateText,
        ground_truth: truth.ground_truth,
        must_cover: truth.must_cover ?? [],
        must_not_cover: truth.must_not_cover ?? []
      },
      dimId
    )
    perDimension[dimId] = score
    totalScore += score.score
    scoredDimensions += 1
    // For now (heuristic), no disagreement signal — Stage J.4 will populate.
  }

  return {
    case_id: testCase.case_id,
    runner,
    perDimension,
    total: totalScore,
    average: scoredDimensions > 0 ? totalScore / scoredDimensions : 0,
    needs_human_review
  }
}
