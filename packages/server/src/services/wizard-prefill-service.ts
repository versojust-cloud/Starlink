/**
 * KB-aware wizard pre-read.
 *
 * When a user starts the structured wizard while KB content already exists
 * for their workspace, instead of asking 7 generic questions, we:
 *   1. Sample KB chunks per wizard dimension (cosine retrieval against a
 *      step-specific seed query)
 *   2. Send the chunks + 7 dimension definitions to one LLM call
 *   3. Get back a per-step assessment: covered / partial / absent +
 *      draft answer + supporting citations
 *
 * The frontend uses this to skip already-covered steps (user just confirms)
 * and only ask the user about gaps.
 *
 * Why one LLM call (not 7): cheaper + the model can use cross-step context
 * (e.g. revenue model implies customer segment). Cap input at ~16K chars
 * of KB excerpts so we stay under provider limits.
 */

import { LLMClient } from './llm-client.js'
import { listKnowledgeBases, searchKnowledgeBase } from './kb-task-service.js'
import { listKbBindingsForAgent } from './kb-task-service.js'
import { createAuditLogger } from '@starlink/shared'

const auditLogger = createAuditLogger('packages/server:services:wizard-prefill')

export interface PrefillCitation {
  docId: string
  snippet: string
}

export interface PrefillItem {
  step: string
  status: 'covered' | 'partial' | 'absent'
  draftAnswer: string
  citations: PrefillCitation[]
  confidence: number
}

export interface WizardPrefillResult {
  items: PrefillItem[]
  kbNames: string[]
  chunksScanned: number
}

/**
 * Per-step seed queries used for cosine retrieval.
 *
 * P12 fix M4 · semantic gap mitigation. Single abstract seed strings
 * like "商业模式 定价 收入来源" failed to retrieve concrete chunks
 * such as user-interview transcripts ("6/8 受访者愿意付费 ¥99/月")
 * even when the embedding was computed correctly. The vector + lexical
 * RRF only had ONE shot per step, and abstract↔concrete phrasing
 * mismatch dominated the score.
 *
 * Solution: each step now carries 3-5 query variants spanning abstract
 * ("商业模式") + concrete ("定价 ¥99 月费 订阅") + outcome ("付费率
 * 渗透率 客单价") phrasings. We run all variants in parallel and union
 * the top-3 unique chunks per step. More variants ≠ much more cost
 * because PG vector index hits are sub-millisecond; the bottleneck was
 * always the embedding API on the query side, and that's already
 * bounded by Promise.all in the caller.
 */
const STEP_SEEDS: Record<string, string[]> = {
  'core-idea': [
    '产品核心想法 价值主张 一句话总结',
    '我们做什么 产品定义 用一句话',
    '解决什么问题 提供什么服务 卖什么'
  ],
  'customer-pain': [
    '客户痛点 用户问题 使用场景 困扰',
    '用户访谈 用户反馈 抱怨 不满',
    '现有方案 缺陷 不便 痛苦点'
  ],
  'value-angle': [
    '差异化 独特价值 竞争优势 切入点',
    '与竞品对比 我们更好 独特之处',
    '比 X 更 Y 优势 卖点 USP'
  ],
  'hypothesis': [
    '关键假设 前提条件 待验证',
    '我们假设 我们相信 我们认为',
    '尚未验证 风险点 不确定性'
  ],
  'validation': [
    '验证方法 测试渠道 MVP 试点',
    '用户访谈 试用 测试 调研 问卷',
    '小规模试验 PoC 早期客户'
  ],
  'revenue': [
    '商业模式 定价 收入来源 付费意愿',
    '订阅 月费 年费 一次性 付费意愿 单价',
    '收费 佣金 抽成 广告 增值服务',
    '受访者 用户 愿意支付 ¥ 价格 月'
  ],
  'risk': [
    '主要风险 失败原因 阻碍因素',
    '担心 顾虑 最坏情况 翻车',
    '监管 合规 安全 隐私 法律风险'
  ]
}

const STEP_LABELS: Record<string, string> = {
  'core-idea':     '核心想法 / Core Idea',
  'customer-pain': '客户痛点 / Customer Pain',
  'value-angle':   '价值切入 / Value Angle',
  'hypothesis':    '关键假设 / Hypothesis',
  'validation':    '验证渠道 / Validation Channel',
  'revenue':       '收入模式 / Revenue Model',
  'risk':          '主要风险 / Key Risk'
}

const SYSTEM_PROMPT = `你是一个商业模型分析助手。我会给你 7 个商业模型维度的定义，以及用户已上传的 KB 知识库片段。

你的任务：对每个维度判断 KB 是否已经覆盖了内容，并按下面 JSON Schema 返回。

输出 JSON Schema:
{
  "items": [
    {
      "step": "core-idea" | "customer-pain" | "value-angle" | "hypothesis" | "validation" | "revenue" | "risk",
      "status": "covered" | "partial" | "absent",
      "draftAnswer": "如果 covered/partial，给出 2-3 句话的总结作为草稿；absent 时为空字符串",
      "citations": [{"docId": "doc1", "snippet": "原文片段最多 100 字"}],
      "confidence": 0.0-1.0
    }
  ]
}

判定规则：
- covered (信心 ≥ 0.7)：KB 中能找到清晰证据支持该维度
- partial (信心 0.4-0.7)：KB 提到一些但不完整
- absent (信心 < 0.4)：KB 与该维度无关

只引用 KB 中确实存在的片段；不要编造。citations 最多 2 条，snippet 必须是 KB 原文。`

/**
 * Module-scope helpers exported for unit testing. Strict pure functions
 * — no side effects, no I/O. Used internally by WizardPrefillService.
 */

export function parsePrefillReply(raw: string): { items: PrefillItem[] } | null {
  if (!raw) return null
  // Strip markdown code fences if present.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    const parsed = JSON.parse(cleaned) as { items?: unknown[] }
    if (!Array.isArray(parsed.items)) return null
    return { items: parsed.items as PrefillItem[] }
  } catch {
    // Try to extract first {...} JSON block.
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      const parsed = JSON.parse(m[0]) as { items?: unknown[] }
      if (!Array.isArray(parsed.items)) return null
      return { items: parsed.items as PrefillItem[] }
    } catch {
      return null
    }
  }
}

export function normalisePrefillItem(raw: unknown): PrefillItem {
  const r = raw as Partial<PrefillItem>
  const status = r.status === 'covered' || r.status === 'partial' ? r.status : 'absent'
  const draftAnswer = typeof r.draftAnswer === 'string' ? r.draftAnswer.slice(0, 600) : ''
  const confidence = typeof r.confidence === 'number'
    ? Math.max(0, Math.min(1, r.confidence))
    : 0
  const citations = Array.isArray(r.citations)
    ? r.citations
        .filter((c): c is PrefillCitation =>
          !!c && typeof (c as PrefillCitation).docId === 'string' && typeof (c as PrefillCitation).snippet === 'string'
        )
        .slice(0, 2)
        .map((c) => ({ docId: c.docId, snippet: c.snippet.slice(0, 200) }))
    : []
  return {
    step: typeof r.step === 'string' ? r.step : '',
    status,
    draftAnswer,
    citations,
    confidence
  }
}

interface DepsLike {
  llm: LLMClient
}

export class WizardPrefillService {
  private readonly llm: LLMClient
  constructor(deps: DepsLike) {
    this.llm = deps.llm
  }

  async prefill(args: {
    workspaceId: string
    userId: string
    /** Optional: limit to one KB. When omitted, samples all KBs in the workspace. */
    kbId?: string
  }): Promise<WizardPrefillResult> {
    const startedAt = Date.now()

    // 1. Resolve which KBs to scan.
    const allKbs = await listKnowledgeBases(args.workspaceId)
    const targetKbs = args.kbId
      ? allKbs.filter((kb) => kb.id === args.kbId)
      : allKbs
    if (targetKbs.length === 0) {
      // No KBs at all → return all-absent quickly.
      return {
        items: Object.keys(STEP_SEEDS).map((step) => ({
          step,
          status: 'absent' as const,
          draftAnswer: '',
          citations: [],
          confidence: 0
        })),
        kbNames: [],
        chunksScanned: 0
      }
    }

    // 2. Per-step retrieval (top-3 chunks per dimension per KB).
    //
    // P12 fix M3 · queries used to run sequentially in nested for-loops:
    //   stepIds × targetKbs ≈ 7 × N steps × ~300ms each = ~15-20s on
    //   typical workspaces (single KB). Each searchKnowledgeBase call is
    //   independent and side-effect-free (read-only PG vector + lexical
    //   merge), so they parallelise safely. Build a flat task list across
    //   the cartesian product, run via Promise.all, then re-assemble.
    const stepIds = Object.keys(STEP_SEEDS)
    type Task = { stepId: string; kbId: string; seed: string }
    const tasks: Task[] = []
    for (const stepId of stepIds) {
      const seeds = STEP_SEEDS[stepId]
      for (const kb of targetKbs) {
        for (const seed of seeds) {
          tasks.push({ stepId, kbId: kb.id, seed })
        }
      }
    }
    const taskResults = await Promise.all(
      tasks.map(async (t) => {
        try {
          const results = await searchKnowledgeBase(
            args.workspaceId,
            t.kbId,
            t.seed,
            3,
            args.userId
          )
          return { stepId: t.stepId, results }
        } catch (err) {
          auditLogger.warn({
            action: 'wizard-prefill.search-failed',
            workflowId: args.workspaceId,
            userId: args.userId,
            metadata: { kbId: t.kbId, step: t.stepId, err: err instanceof Error ? err.message : String(err) }
          })
          return { stepId: t.stepId, results: [] as Awaited<ReturnType<typeof searchKnowledgeBase>> }
        }
      })
    )
    // Multiple seed variants per step → many duplicate chunks. Dedupe
    // by docId+chunkIndex within a step, keeping the highest-scoring
    // hit. Then cap to top-3 per step so the LLM input stays small.
    const perStepBest = new Map<string, Map<string, { docId: string; snippet: string; score: number }>>()
    for (const tr of taskResults) {
      let stepMap = perStepBest.get(tr.stepId)
      if (!stepMap) {
        stepMap = new Map()
        perStepBest.set(tr.stepId, stepMap)
      }
      for (const r of tr.results) {
        const key = `${r.docId}#${r.snippet.slice(0, 30)}`
        const prior = stepMap.get(key)
        if (!prior || prior.score < r.score) {
          stepMap.set(key, { docId: r.docId, snippet: r.snippet.slice(0, 240), score: r.score })
        }
      }
    }
    const allChunks: Array<{ step: string; docId: string; snippet: string; score: number }> = []
    for (const [stepId, stepMap] of perStepBest) {
      const top3 = Array.from(stepMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
      for (const r of top3) {
        allChunks.push({ step: stepId, ...r })
      }
    }

    if (allChunks.length === 0) {
      return {
        items: stepIds.map((step) => ({ step, status: 'absent' as const, draftAnswer: '', citations: [], confidence: 0 })),
        kbNames: targetKbs.map((k) => k.name),
        chunksScanned: 0
      }
    }

    // 3. One LLM call: stuff all retrieved chunks (capped at 16K chars) +
    //    dimension definitions, ask for per-step assessment.
    const userMessage = this.buildUserMessage(allChunks)
    let parsed: { items: PrefillItem[] } | null = null
    try {
      const response = await this.llm.chat({
        // deepseek-v4-flash is the cheap-fast tier — appropriate for
        // a one-shot scan of a few KB chunks. The default model name
        // (gpt-4o-mini) gets rejected by our DeepSeek-compatible
        // backend with HTTP 400.
        model: process.env.WIZARD_PREFILL_MODEL ?? 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.1
      })
      parsed = parsePrefillReply(response.content ?? '')
    } catch (err) {
      auditLogger.warn({
        action: 'wizard-prefill.llm-failed',
        workflowId: args.workspaceId,
        userId: args.userId,
        metadata: { err: err instanceof Error ? err.message : String(err) }
      })
    }

    // 4. Normalise: ensure all 7 steps present, defaults to absent.
    const itemsMap = new Map<string, PrefillItem>()
    for (const stepId of stepIds) {
      itemsMap.set(stepId, {
        step: stepId,
        status: 'absent',
        draftAnswer: '',
        citations: [],
        confidence: 0
      })
    }
    if (parsed?.items) {
      for (const item of parsed.items) {
        if (stepIds.includes(item.step)) {
          itemsMap.set(item.step, normalisePrefillItem(item))
        }
      }
    }

    const result: WizardPrefillResult = {
      items: stepIds.map((s) => itemsMap.get(s)!),
      kbNames: targetKbs.map((k) => k.name),
      chunksScanned: allChunks.length
    }
    auditLogger.info({
      action: 'wizard-prefill.completed',
      workflowId: args.workspaceId,
      userId: args.userId,
      metadata: {
        durationMs: Date.now() - startedAt,
        chunksScanned: allChunks.length,
        coveredCount: result.items.filter((i) => i.status === 'covered').length,
        partialCount: result.items.filter((i) => i.status === 'partial').length
      }
    })
    return result
  }

  private buildUserMessage(chunks: Array<{ step: string; docId: string; snippet: string; score: number }>): string {
    // Group by step + cap total length.
    const byStep: Record<string, typeof chunks> = {}
    for (const c of chunks) {
      if (!byStep[c.step]) byStep[c.step] = []
      byStep[c.step].push(c)
    }
    const sections: string[] = []
    sections.push('## 7 个维度定义\n')
    for (const [step, label] of Object.entries(STEP_LABELS)) {
      // P12 fix · STEP_SEEDS[step] is now string[]; join for prompt
      // readability (was previously a single string, not the array).
      const seeds = STEP_SEEDS[step]
      const seedText = Array.isArray(seeds) ? seeds.join(' / ') : String(seeds)
      sections.push(`- **${step}** (${label}): ${seedText}`)
    }
    sections.push('\n## KB 检索片段（按维度分组）\n')
    let totalChars = 0
    const limit = 16_000
    // P12 fix · also build a deduped "ALL CHUNKS" pool for cross-step
    // inference. Frequent failure mode: a step's direct retrieval
    // returns 0 chunks (e.g. "主要风险" against an interview
    // transcript), but a chunk retrieved for ANOTHER step indirectly
    // mentions the missing dimension ("Snyk 启动免费层升级" mentioned
    // under value-angle is also a risk signal). The LLM scoring step
    // can use this pool to mark partial instead of absent. Dedupe by
    // docId+chunk-prefix so the LLM doesn't see the same chunk twice.
    const allChunkIndex = new Map<string, { docId: string; snippet: string; score: number }>()
    for (const c of chunks) {
      const key = `${c.docId}#${c.snippet.slice(0, 30)}`
      const prior = allChunkIndex.get(key)
      if (!prior || prior.score < c.score) {
        allChunkIndex.set(key, { docId: c.docId, snippet: c.snippet, score: c.score })
      }
    }
    for (const stepId of Object.keys(STEP_SEEDS)) {
      const stepChunks = byStep[stepId] ?? []
      if (stepChunks.length === 0) continue
      sections.push(`\n### ${STEP_LABELS[stepId]}`)
      // Top 3 by score
      const top = stepChunks.sort((a, b) => b.score - a.score).slice(0, 3)
      for (const c of top) {
        const line = `[doc:${c.docId}] ${c.snippet}`
        if (totalChars + line.length > limit) break
        sections.push(line)
        totalChars += line.length
      }
    }
    // Cross-step pool — only emit if budget allows. This is supplemental
    // material; primary scoring still uses the per-step grouped chunks.
    const remainingBudget = limit - totalChars
    if (remainingBudget > 500 && allChunkIndex.size > 0) {
      sections.push('\n## 跨维度全集（任意维度可引用，用于补救 absent 判断）\n')
      let crossChars = 0
      const pool = Array.from(allChunkIndex.values()).sort((a, b) => b.score - a.score)
      for (const c of pool) {
        const line = `[doc:${c.docId}] ${c.snippet}`
        if (crossChars + line.length > remainingBudget) break
        sections.push(line)
        crossChars += line.length
      }
    }
    sections.push('\n## 任务')
    sections.push(
      '对每个维度，依据上面的 KB 片段判断 status (covered/partial/absent) + ' +
      'draftAnswer + citations + confidence。' +
      '**重要**：如果一个维度的直接检索片段为空，但「跨维度全集」中有片段能** ' +
      '间接** 提供该维度的线索（哪怕只是一两句相关），请标记为 partial 而非 absent，' +
      '并在 draftAnswer 中说明这是基于间接线索的推断。返回纯 JSON。'
    )
    return sections.join('\n')
  }

}

// Avoid unused-import warning for listKbBindingsForAgent — referenced in
// future per-agent prefill scope. Keep import for forward compatibility.
void listKbBindingsForAgent
