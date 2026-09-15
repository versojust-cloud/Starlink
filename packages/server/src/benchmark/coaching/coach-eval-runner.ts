/**
 * Coaching-mode benchmark orchestrator (2026-04-28).
 *
 * Runs the full pipeline for one persona:
 *   1. Generate N synthetic conversation summaries (LLM)
 *   2. Seed them into the in-memory store
 *   3. Run UserSkillExtractor against the store (LLM)
 *   4. Read back the user-skill rows
 *   5. Score recall + precision against the persona's GT traits
 *   6. Generate the rendered userSkillBlock via shared renderer
 *   7. A/B compare reflectOnIdeation: with vs without skill block
 *
 * No production code is modified — the extractor + buildUserSkillPrompt
 * + reflectOnIdeation are all real, only the storage backing is swapped.
 */

import {
  type ReflectionRequest,
  type ReflectionResponse,
  renderUserSkillBlock
} from '@starlink/shared'
import type { MemoryItem } from '@starlink/shared'
import { reflectOnIdeation } from '../../services/ideation-coach-service.js'
import type { BenchmarkPersona, PersonaTrait } from './personas.js'
import {
  generateSyntheticSummaries,
  type SyntheticSummary
} from './synthetic-summaries.js'
import { InMemoryConversationMemoryStore } from './in-memory-store.js'
import { UserSkillExtractor } from '../../services/user-skill-extractor.js'
import { LLMClient } from '../../services/llm-client.js'
import type { ConversationMemoryStore } from '../../application/conversation-memory-store.js'

// ============================================================================
// Types
// ============================================================================

export interface TraitRecallEntry {
  trait: PersonaTrait
  /** Best matching skill content + score; null = trait missed. */
  bestMatch: { skillId: string; skillTitle: string; skillContent: string; score: number } | null
  hit: boolean
  /** When LLM judge is used: reasoning + judge-assigned score 0..1. */
  judge?: { score: number; rationale: string; matchedSkillId: string | null }
}

export interface SkillPrecisionEntry {
  skill: { id: string; title: string; content: string; confidence: number }
  /** Mapped GT trait ids; empty array = fabricated / unjustified. */
  matchedTraitIds: string[]
  justified: boolean
}

export interface ABComparison {
  scenario: 'with-skill-block' | 'no-skill-block'
  rawRequest: ReflectionRequest
  response: ReflectionResponse
  /** Lexical sentinels in the response that are present (lower-case match). */
  sentinelHits: string[]
  /** Count of persona-trait keyword occurrences in the response. */
  personaTermHits: number
  /** Generic-discovery sentinel hits ("你的用户是谁" / "什么背景" etc). */
  genericDiscoveryHits: number
}

export interface ABMetrics {
  /**
   * (with-block persona keyword hits) − (baseline persona keyword hits).
   * Positive = personalization is showing up in coach output that wasn't
   * there in the baseline. Direct, slightly tautological (we reward the
   * model for echoing the block) but the most concrete signal available
   * without manual judging.
   */
  personaTermPickup: number
  /**
   * (baseline generic-discovery hits) − (with-block generic-discovery hits).
   * Positive = with-block coach successfully avoided basic-discovery
   * questions the baseline had to ask. Less tautological than
   * personaTermPickup; harder to converge without broader sentinels.
   */
  genericDiscoveryAvoidance: number
}

export interface PersonaEvalResult {
  persona: BenchmarkPersona
  summaries: SyntheticSummary[]
  extractedSkills: MemoryItem[]
  recall: {
    traits: TraitRecallEntry[]
    fraction: number /* 0..1 */
  }
  /** LLM-judge recall (preferred over the harsh lexical recall above).
   *  null only when LLM client unavailable. */
  judgeRecall: {
    traits: TraitRecallEntry[]
    fraction: number /* 0..1 */
    judgeFailed: number /* how many traits fell back to lexical */
  } | null
  precision: {
    skills: SkillPrecisionEntry[]
    fraction: number /* 0..1, 0 if no skills */
  }
  blockRender: {
    block: string
    /** Number of GT keywords that surface in the rendered block. */
    keywordHits: number
    /** Total keywords across all traits. */
    keywordTotal: number
  }
  abCoachComparison: ABComparison[]
  /** Sentinel keywords whose absence in the WITH-block response indicates
   *  personalisation working (the coach skipped a "basic" question because
   *  the skill block already answered it). */
  sentinels: string[]
  /** New metrics — drop-in replacement for the broken sentinel-only signal
   *  that was 0 → 0 across every persona because the persona-specific
   *  sentinels never appeared in either condition. */
  abMetrics: ABMetrics | null
  errors: string[]
}

// ============================================================================
// Recall / precision scoring (lexical, cheap)
// ============================================================================

function lowerWord(s: string): string {
  return s.toLowerCase().normalize('NFC')
}

function keywordHitCount(text: string, keywords: string[]): number {
  const lower = lowerWord(text)
  return keywords.reduce((acc, kw) => (lower.includes(lowerWord(kw)) ? acc + 1 : acc), 0)
}

function scoreRecall(
  traits: PersonaTrait[],
  skills: MemoryItem[]
): { traits: TraitRecallEntry[]; fraction: number } {
  const entries: TraitRecallEntry[] = traits.map((trait) => {
    let best: TraitRecallEntry['bestMatch'] = null
    for (const s of skills) {
      const hits = keywordHitCount(`${s.title}\n${s.content}`, trait.keywords)
      const score = trait.keywords.length > 0 ? hits / trait.keywords.length : 0
      if (score > 0 && (!best || score > best.score)) {
        best = { skillId: s.id, skillTitle: s.title, skillContent: s.content, score }
      }
    }
    // Threshold: any keyword hit within a single skill row, AND that skill's
    // top-keyword density ≥ 0.25, counts as "extractor surfaced this trait".
    return { trait, bestMatch: best, hit: !!best && best.score >= 0.25 }
  })
  const hits = entries.filter((e) => e.hit).length
  return { traits: entries, fraction: traits.length > 0 ? hits / traits.length : 0 }
}

// ============================================================================
// LLM-judge recall (semantic; replaces the harsh 0.25-keyword cutoff)
// ============================================================================

/**
 * Ask the LLM whether any of the extracted skills semantically expresses the
 * given persona trait. Returns null on LLM/parse failure — callers should
 * then fall back to lexical scoring.
 *
 * Why an LLM judge: the keyword-density cutoff at 0.25 is brittle. A skill
 * titled "硬件极客思维" semantically covers "嵌入式 + 3D 打印背景" (the GT
 * trait) but its content may not contain the literal keyword "嵌入式". The
 * LLM can read both and decide if the trait is captured.
 */
async function judgeRecallForTrait(
  trait: PersonaTrait,
  skills: MemoryItem[],
  llm: LLMClient
): Promise<TraitRecallEntry['judge'] | null> {
  if (skills.length === 0) {
    return { score: 0, rationale: '没有任何 extracted skill 可供判定', matchedSkillId: null }
  }
  const skillsBlock = skills
    .map(
      (s, i) =>
        `[${i + 1}] id=${s.id}\n    title: ${s.title}\n    content: ${s.content.replace(/\n+/g, ' ').slice(0, 300)}`
    )
    .join('\n')
  const sys = `你是一个判官，判断某个 ground-truth 特质 (GT trait) 是否已经被一组 user-skill 行覆盖。

判断标准：
- 语义上覆盖即可，不要求字面包含关键词。
- 部分覆盖 (0.4-0.6)、明显覆盖 (0.7-0.9)、完美对应 (1.0)、未覆盖 (0)。
- 一个 skill 可以同时覆盖多个 GT trait（但每次判定只针对单个 GT trait）。
- 输出 JSON，不带 markdown 围栏。`
  const usr = `GT TRAIT:
- id: ${trait.id}
- 类别 (axis): ${trait.category}
- 标签: ${trait.label}
- 完整描述: ${trait.description}
- 期望关键词 (仅供语义参考): ${trait.keywords.join(', ')}

EXTRACTED SKILLS (候选):
${skillsBlock}

判断哪一个 skill 最能覆盖这个 GT trait。输出 JSON:
{"score": <0..1>, "matchedSkillId": "<id 或 null>", "rationale": "<≤60 字中文理由>"}`

  try {
    const resp = await llm.chat({
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: usr }
      ],
      temperature: 0.0,
      maxTokens: 300
    })
    const raw = (resp.content ?? '').trim()
    // Strip code fences if the model added them
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned) as {
      score?: number
      matchedSkillId?: string | null
      rationale?: string
    }
    const score = Math.max(0, Math.min(1, Number(parsed.score) || 0))
    return {
      score,
      rationale: String(parsed.rationale ?? '').slice(0, 200),
      matchedSkillId:
        typeof parsed.matchedSkillId === 'string' && parsed.matchedSkillId.trim().length > 0
          ? parsed.matchedSkillId
          : null
    }
  } catch (err) {
    void err
    return null
  }
}

async function judgeRecallAll(
  traits: PersonaTrait[],
  skills: MemoryItem[],
  llm: LLMClient
): Promise<{ traits: TraitRecallEntry[]; fraction: number; judgeFailed: number }> {
  // Threshold: LLM judge score >= 0.6 counts as a hit (matches the natural
  // 0.7-0.9 "明显覆盖" range, with a small buffer for borderline cases).
  const HIT_THRESHOLD = 0.6
  let judgeFailed = 0
  const entries: TraitRecallEntry[] = []
  for (const trait of traits) {
    const judge = await judgeRecallForTrait(trait, skills, llm)
    if (!judge) {
      judgeFailed++
      // Fallback to lexical
      let best: TraitRecallEntry['bestMatch'] = null
      for (const s of skills) {
        const hits = keywordHitCount(`${s.title}\n${s.content}`, trait.keywords)
        const score = trait.keywords.length > 0 ? hits / trait.keywords.length : 0
        if (score > 0 && (!best || score > best.score)) {
          best = { skillId: s.id, skillTitle: s.title, skillContent: s.content, score }
        }
      }
      entries.push({
        trait,
        bestMatch: best,
        hit: !!best && best.score >= 0.25
      })
      continue
    }
    const matched = judge.matchedSkillId
      ? skills.find((s) => s.id === judge.matchedSkillId)
      : null
    const best: TraitRecallEntry['bestMatch'] = matched
      ? {
          skillId: matched.id,
          skillTitle: matched.title,
          skillContent: matched.content,
          score: judge.score
        }
      : null
    entries.push({
      trait,
      bestMatch: best,
      hit: judge.score >= HIT_THRESHOLD,
      judge
    })
  }
  const hits = entries.filter((e) => e.hit).length
  return {
    traits: entries,
    fraction: traits.length > 0 ? hits / traits.length : 0,
    judgeFailed
  }
}

function scorePrecision(
  traits: PersonaTrait[],
  skills: MemoryItem[]
): { skills: SkillPrecisionEntry[]; fraction: number } {
  const entries: SkillPrecisionEntry[] = skills.map((s) => {
    const matched: string[] = []
    for (const trait of traits) {
      const hits = keywordHitCount(`${s.title}\n${s.content}`, trait.keywords)
      if (hits > 0) matched.push(trait.id)
    }
    return {
      skill: { id: s.id, title: s.title, content: s.content, confidence: s.confidence },
      matchedTraitIds: matched,
      justified: matched.length > 0
    }
  })
  const justified = entries.filter((e) => e.justified).length
  return { skills: entries, fraction: skills.length > 0 ? justified / skills.length : 0 }
}

// ============================================================================
// Block-render quality
// ============================================================================

function scoreBlockRender(
  traits: PersonaTrait[],
  block: string
): { block: string; keywordHits: number; keywordTotal: number } {
  const allKeywords = traits.flatMap((t) => t.keywords)
  const total = allKeywords.length
  let hits = 0
  for (const kw of allKeywords) {
    if (lowerWord(block).includes(lowerWord(kw))) hits++
  }
  return { block, keywordHits: hits, keywordTotal: total }
}

// ============================================================================
// A/B coach comparison
// ============================================================================

/** Sentinels we expect the WITH-block coach to NOT have to ask, since the
 *  user-skill block already conveys the relevant info. Lower-cased lexical
 *  match against the coach `content`. Kept around for backward-compatible
 *  per-scenario reporting; the *primary* A/B signal is now ABMetrics
 *  (personaTermPickup + genericDiscoveryAvoidance) which actually fires. */
const COACH_SENTINELS_BY_PERSONA: Record<string, string[]> = {
  'persona-b2b-saas-pm': ['to-b', 'to-c', 'b2c', '客户类型是', '面向消费者还是', '是 b 端还是 c 端'],
  'persona-indie-hardware': ['你能做硬件吗', '有制造经验吗', '懂 3d 打印吗', '是不是工程出身']
}

/**
 * Generic discovery questions a "blank-slate" coach reaches for when it
 * knows nothing about the user. The with-block coach SHOULD skip these
 * because the skill block has already answered them. Broader than the
 * per-persona sentinels — these are the kind of phrases a coach generates
 * when forced to ask basic background questions.
 */
const GENERIC_DISCOVERY_SENTINELS: readonly string[] = [
  '你的用户是谁',
  '什么类型',
  '面向谁',
  '什么背景',
  '是否有经验',
  '具体是谁',
  '是怎样的',
  '你的客户类型',
  '你打算面向',
  '一类用户',
  '常见痛点',
  '你的目标',
  '哪些群体'
]

function detectSentinelHits(text: string, sentinels: readonly string[]): string[] {
  const lower = lowerWord(text)
  return sentinels.filter((s) => lower.includes(lowerWord(s)))
}

function countPersonaTermHits(text: string, traits: PersonaTrait[]): number {
  const lower = lowerWord(text)
  let count = 0
  for (const trait of traits) {
    for (const kw of trait.keywords) {
      if (lower.includes(lowerWord(kw))) count++
    }
  }
  return count
}

/**
 * Call reflectOnIdeation with one transparent retry on `source: 'error'`.
 * Persona-2's longer skill block was timing out (12s default in
 * ideation-coach-service.ts) and falling back to scripted output, which
 * makes the A/B comparison uninterpretable. A single 1.5s-delayed retry
 * recovers most timeout cases without changing production timeouts.
 */
async function reflectWithRetry(
  request: ReflectionRequest
): Promise<ReflectionResponse> {
  const first = await reflectOnIdeation(request)
  if (first.source !== 'error') return first
  await new Promise((resolve) => setTimeout(resolve, 1500))
  return reflectOnIdeation(request)
}

function buildBaselineCoachRequest(persona: BenchmarkPersona): ReflectionRequest {
  // A canvas snapshot deliberately spare so the coach has lots of room to
  // ask basic questions. The persona's traits aren't on the canvas either —
  // only skill injection should change behaviour.
  return {
    event: { type: 'meta-check' },
    canvas: {
      nodes: [
        {
          id: 'core-idea-1',
          kind: 'core-idea',
          label: '核心想法（占位）',
          content: '一个轻量的工具帮一类用户解决一个常见痛点。'
        }
      ],
      edgeCount: 0,
      nodeCountByKind: { 'core-idea': 1 }
    },
    recentChat: [
      { role: 'ai', content: '我们刚开始记录你的核心想法。' },
      { role: 'user', content: '好。' }
    ],
    firedMetaIds: []
  }
}

// ============================================================================
// Driver
// ============================================================================

export async function evaluatePersona(
  persona: BenchmarkPersona,
  options: { llm?: LLMClient } = {}
): Promise<PersonaEvalResult> {
  const errors: string[] = []
  const llm = options.llm ?? new LLMClient()

  // 1. Synthetic summaries
  const summaries = await generateSyntheticSummaries(persona, llm)

  // 2. Seed in-memory store
  const store = new InMemoryConversationMemoryStore()
  const userId = `bench-coaching-${persona.id}`
  for (const s of summaries) {
    store.seedSummary({
      userId,
      workspaceId: s.workspaceId,
      traceId: s.traceId,
      summary: s.summary,
      createdAt: s.createdAt
    })
  }

  // 3. Run extractor — bypass the throttle by calling enough times to
  //    cross EXTRACT_EVERY_N (default 3). We force one real extraction.
  const extractor = new UserSkillExtractor({
    memoryStore: store as unknown as ConversationMemoryStore,
    llm
  })
  // Ensure we actually trigger LLM work regardless of node-process module
  // counter state — call up to 3 times; the third is guaranteed to fire.
  let appliedFinal = 0
  for (let i = 0; i < 3; i++) {
    const applied = await extractor.extractUserSkills({
      userId,
      workspaceId: persona.ideaWorkspaces[0]?.workspaceId ?? 'ws-coaching-default',
      traceId: `bench-coaching-extract-${i}`
    })
    if (applied > 0) {
      appliedFinal = applied
      break
    }
  }
  if (appliedFinal === 0) {
    errors.push('extractor produced 0 changes across 3 attempts — likely LLM/parse failure')
  }

  // 4. Read back skills (across all this user's idea workspaces — extractor
  //    may have written to the workspace it was called against; we want the
  //    full picture).
  const allSkills: MemoryItem[] = []
  for (const ws of persona.ideaWorkspaces) {
    const rows = await store.searchUserSkills(userId, ws.workspaceId, { limit: 50 })
    for (const r of rows) {
      if (!allSkills.some((s) => s.id === r.id)) allSkills.push(r)
    }
  }

  // 5. Recall + precision (lexical) + LLM-judge recall (semantic)
  const recall = scoreRecall(persona.traits, allSkills)
  const precision = scorePrecision(persona.traits, allSkills)
  let judgeRecall: PersonaEvalResult['judgeRecall'] = null
  try {
    judgeRecall = await judgeRecallAll(persona.traits, allSkills, llm)
  } catch (err) {
    errors.push(
      `llm-judge recall failed entirely: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  // 6. Render skill block + measure keyword saturation
  const blockInput = allSkills.slice(0, 5).map((s) => ({
    title: s.title,
    content: s.content,
    confidence: s.confidence,
    scope: (s.scope === 'user' ? 'user' : 'workspace') as 'user' | 'workspace',
    tags: s.tags
  }))
  const blockText = renderUserSkillBlock(blockInput)
  const blockRender = scoreBlockRender(persona.traits, blockText)

  // 7. A/B coach comparison
  const sentinels = COACH_SENTINELS_BY_PERSONA[persona.id] ?? []
  const baselineReq = buildBaselineCoachRequest(persona)
  const ab: ABComparison[] = []
  try {
    const noSkillResp = await reflectWithRetry(baselineReq)
    ab.push({
      scenario: 'no-skill-block',
      rawRequest: baselineReq,
      response: noSkillResp,
      sentinelHits: detectSentinelHits(noSkillResp.content, sentinels),
      personaTermHits: countPersonaTermHits(noSkillResp.content, persona.traits),
      genericDiscoveryHits: detectSentinelHits(noSkillResp.content, GENERIC_DISCOVERY_SENTINELS).length
    })
  } catch (err) {
    errors.push(`coach (no-skill-block) failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  try {
    const withSkillReq: ReflectionRequest = { ...baselineReq, userSkillBlock: blockText || undefined }
    const withSkillResp = await reflectWithRetry(withSkillReq)
    ab.push({
      scenario: 'with-skill-block',
      rawRequest: withSkillReq,
      response: withSkillResp,
      sentinelHits: detectSentinelHits(withSkillResp.content, sentinels),
      personaTermHits: countPersonaTermHits(withSkillResp.content, persona.traits),
      genericDiscoveryHits: detectSentinelHits(withSkillResp.content, GENERIC_DISCOVERY_SENTINELS).length
    })
  } catch (err) {
    errors.push(`coach (with-skill-block) failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Compute A/B metrics. Both scenarios must have completed for the
  // delta to be meaningful — if either one errored, leave abMetrics null
  // and let the report explain the gap rather than print a misleading 0.
  const baseline = ab.find((c) => c.scenario === 'no-skill-block')
  const withBlock = ab.find((c) => c.scenario === 'with-skill-block')
  const abMetrics: ABMetrics | null =
    baseline && withBlock
      ? {
          personaTermPickup: withBlock.personaTermHits - baseline.personaTermHits,
          genericDiscoveryAvoidance: baseline.genericDiscoveryHits - withBlock.genericDiscoveryHits
        }
      : null

  return {
    persona,
    summaries,
    extractedSkills: allSkills,
    recall,
    judgeRecall,
    precision,
    blockRender,
    abCoachComparison: ab,
    sentinels,
    abMetrics,
    errors
  }
}
