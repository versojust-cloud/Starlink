/**
 * BMC Cell Summarizer · post-generator distillation pass (P11.5 / B3)
 *
 * Each market/product/finance generator agent emits a `MacraNodeData` with
 * both `summary` (~120-200 字 markdown) and `content` (~300-800 字 markdown).
 * The agent's own summary is constrained by single-call attention budget —
 * the agent has to context-switch between writing detail and writing digest,
 * leading to truncation, formulaic templates, and inconsistent coverage.
 *
 * This helper runs an independent post-hoc distillation pass on each cell's
 * `content` using a cheap-fast model (deepseek-v4-flash by default).
 * The summarizer has a single dedicated job: read the full content and emit a
 * concise markdown digest that covers every H2/H3 sub-section's core takeaway
 * while preserving key numbers and named entities.
 *
 * Failure semantics: caller is expected to wrap each call in try/catch.
 * On any failure (LLM error / empty response / over-length), throw and let
 * the caller fall back to the agent's original summary. We never silently
 * substitute a degraded summary.
 */

import { LLMClient } from '../../services/llm-client.js'
import { createAuditLogger } from '@starlink/shared'

const auditLogger = createAuditLogger('packages/server:agents:cell-summarizer')

const DEFAULT_MODEL = process.env.BMC_SUMMARIZER_MODEL ?? 'deepseek-v4-flash'
const MIN_SUMMARY_CHARS = 60
const MAX_SUMMARY_CHARS = 600 // hard cap from bmcAnalysisCardSchema

export interface SummarizeCellOptions {
  /** BMC domain in Chinese (e.g. "客户细分"). Used to flavor the prompt. */
  domain?: string
  /** Cell label (e.g. "目标客户群体"). Helps the summarizer name the subject. */
  label?: string
  /** Optional model override; defaults to BMC_SUMMARIZER_MODEL env or v4-flash. */
  model?: string
  /** trace info for audit logs. */
  traceId?: string
  workspaceId?: string
  userId?: string
}

export interface SummarizerDeps {
  /**
   * LLMClient instance. Caller injects so we share connection pooling
   * with other server-side LLM consumers.
   */
  llm: LLMClient
}

const SYSTEM_PROMPT = `你是商业模型画布（BMC）的"卡片摘要员"。你的唯一任务是把一段 BMC 单元格的详细分析（markdown）压缩成一份**结构化要点列表**（markdown unordered list）。

## 输出要求

1. **格式**：必须是 markdown 短列表，每行一项，行首 \`- \`。共 3-5 个要点，**禁止单段落输出**。
2. **每项结构**：\`- **标签**：一句话核心结论（含数字/比例/专有名词）\`。标签 4-8 字概括该要点的主题，结论一句话不超过 60 字。
3. **覆盖度**：每条要点对应原文一个核心子节（H2 / H3 / 编号小节）的 takeaway，确保**所有重要子节都被覆盖**。
4. **保留**：关键数字、百分比、金额、专有名词、Wizard N 编号、引用标记必须保留在结论里。
5. **总长度**：3-5 项合计 200-450 个汉字（含 markdown 语法），单项不要过长。
6. **禁止**：禁止省略号（…/...）、禁止 \`# 标题\`、禁止"本摘要/以下/综上"等元描述、禁止纯叙述段落、禁止把单项内容拆成多行。

## 示例

输入：一段关于"开发者社区获客 50% / AI 工具聚合平台 30% / 社交媒体 20%"的 800 字详细分析。

正确输出：
- **核心渠道**：开发者社区贡献 50% 流量，主战场为 GitHub 开源模板 + 掘金/V2EX 内容
- **次级渠道**：AI 工具聚合平台贡献 30%，依托 Product Hunt + 国内导航站
- **辅助渠道**：社交媒体贡献 20%，B 站实操视频 + 小红书图文 + Twitter KOL
- **转化路径**：免费模板 → 注册 → 7 天试用 → 付费转化
- **关键指标**：注册转化率 ≥ 15%，付费转化率 ≥ 5%

## 输出格式

直接输出 markdown 列表，不要包裹代码块、不要 JSON、不要前缀。第一行立即是 \`- **\` 开头。`

function buildUserPrompt(content: string, opts: SummarizeCellOptions): string {
  const labelLine = opts.label ? `\n卡片标题：${opts.label}` : ''
  const domainLine = opts.domain ? `\nBMC 维度：${opts.domain}` : ''
  return `请为下面这张 BMC 卡片的"详细分析"产出**结构化要点列表**（3-5 个 markdown 短列表项）。${labelLine}${domainLine}

==== 详细分析（待压缩）====

${content}

==== 现在输出结构化要点列表（必须 markdown \`- **标签**：结论\` 格式，3-5 项，无省略号）====`
}

/**
 * Strip leading code fences / "摘要：" prefixes / trailing whitespace so the
 * raw markdown drops cleanly into the drawer's prose renderer.
 *
 * Validates that the output is a markdown short-list (3-5 `- ` items).
 * Returns null if the output is not a valid list — caller should fall back
 * to the agent's original summary.
 */
function postProcess(raw: string): string | null {
  let s = raw.trim()
  // Strip ```markdown ... ``` or ``` ... ``` wrappers
  const fence = s.match(/^```(?:markdown)?\s*\n([\s\S]*?)\n```\s*$/)
  if (fence) s = fence[1].trim()
  // Strip leading "摘要：" / "总结：" prefixes that the model occasionally adds
  s = s.replace(/^(摘要|总结|核心摘要|精华摘要|要点列表|要点)\s*[:：]?\s*\n?/, '')
  // Collapse runs of trailing ellipsis (defensive — prompt forbids them)
  s = s.replace(/[…\.]{2,}\s*$/, '').trim()

  // Validate: must contain 3-5 markdown bullet items at the top level
  const bulletLines = s.split('\n').filter((line) => /^\s*[-*]\s+/.test(line))
  if (bulletLines.length < 3 || bulletLines.length > 6) {
    return null
  }
  return s
}

/**
 * Distill one cell's content into a 120-180 char markdown summary.
 * Throws on failure; caller is expected to fall back to the agent's
 * original summary.
 *
 * P15-improvement #2 · single retry on flake. DeepSeek-flash returned
 * `0 raw chars` ~30% of the time in the P15 smoke benchmark — the
 * caller previously fell back to the agent's verbose original summary,
 * which the judge then penalized for "generic content". One retry
 * with a stricter prompt + slightly higher temperature catches the
 * common flake without doubling the cost in the happy path.
 */
export async function summarizeCellMarkdown(
  content: string,
  opts: SummarizeCellOptions,
  deps: SummarizerDeps
): Promise<string> {
  const trimmed = content?.trim()
  if (!trimmed || trimmed.length < 40) {
    throw new Error(`cell-summarizer: content too short (${trimmed?.length ?? 0} chars)`)
  }

  const startedAt = Date.now()
  const model = opts.model ?? DEFAULT_MODEL
  const callLLM = async (attempt: 1 | 2): Promise<string> => {
    const response = await deps.llm.chat({
      model,
      // Attempt 1: deterministic, low temp. Retry: bump temperature
      // slightly so we don't get the exact same empty response.
      temperature: attempt === 1 ? 0.1 : 0.4,
      maxTokens: 600,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(trimmed, opts) }
      ]
    })
    return response.content ?? ''
  }

  let raw = await callLLM(1)
  let summary = postProcess(raw)
  let retried = false

  // Retry once if first attempt is empty / too short — these are the
  // hallmarks of an LLM flake (provider-side timeout, garbled stream).
  if (!summary || summary.length < MIN_SUMMARY_CHARS) {
    retried = true
    cellSummarizerTelemetry.retries++
    auditLogger.info({
      action: 'cell-summarizer.distill.retry',
      requestId: opts.traceId,
      workflowId: opts.workspaceId,
      userId: opts.userId,
      metadata: {
        domain: opts.domain,
        label: opts.label,
        firstAttemptRawChars: raw.length,
        firstAttemptSummaryChars: summary?.length ?? 0
      }
    })
    raw = await callLLM(2)
    summary = postProcess(raw)
  }
  cellSummarizerTelemetry.invocations++
  if (retried && summary && summary.length >= MIN_SUMMARY_CHARS) {
    cellSummarizerTelemetry.retriesRecovered++
  }

  if (!summary) {
    throw new Error(`cell-summarizer: output not a valid 3-5 item list (${raw.length} raw chars)`)
  }
  if (summary.length < MIN_SUMMARY_CHARS) {
    throw new Error(`cell-summarizer: output too short (${summary.length} chars)`)
  }
  if (summary.length > MAX_SUMMARY_CHARS) {
    throw new Error(`cell-summarizer: output too long (${summary.length} chars > ${MAX_SUMMARY_CHARS})`)
  }

  auditLogger.info({
    action: 'cell-summarizer.distill',
    requestId: opts.traceId,
    workflowId: opts.workspaceId,
    userId: opts.userId,
    metadata: {
      domain: opts.domain,
      label: opts.label,
      model,
      contentChars: trimmed.length,
      summaryChars: summary.length,
      durationMs: Date.now() - startedAt
    }
  })

  return summary
}

/**
 * Process-local cell-summarizer telemetry. Reset by `resetCellSummarizerTelemetry`
 * (test only). Exposed for the agent-slo-tracker / health snapshot, so the
 * frontend health chip can show "0.3% retry rate" alongside the SLO chips.
 */
export const cellSummarizerTelemetry = {
  invocations: 0,
  retries: 0,
  retriesRecovered: 0
}

export function getCellSummarizerSnapshot(): {
  invocations: number
  retries: number
  retriesRecovered: number
  retryRate: number /* retries / max(1, invocations), 0..1 */
  recoveryRate: number /* retriesRecovered / max(1, retries), 0..1 */
} {
  const inv = cellSummarizerTelemetry.invocations
  const ret = cellSummarizerTelemetry.retries
  const rec = cellSummarizerTelemetry.retriesRecovered
  return {
    invocations: inv,
    retries: ret,
    retriesRecovered: rec,
    retryRate: inv > 0 ? ret / inv : 0,
    recoveryRate: ret > 0 ? rec / ret : 0
  }
}

export function resetCellSummarizerTelemetry(): void {
  cellSummarizerTelemetry.invocations = 0
  cellSummarizerTelemetry.retries = 0
  cellSummarizerTelemetry.retriesRecovered = 0
}

/**
 * Run summarizer in parallel for every cc-bmc-card node in the array.
 * Replaces `summary` on each node when distillation succeeds; keeps
 * original on failure. Non-cc-bmc-card nodes pass through unchanged.
 *
 * Disabled when BMC_SUMMARIZER_ENABLED=false.
 */
export async function distillSummariesForCells<
  T extends { id: string; type: string; summary?: string; content?: string; domain?: string; label?: string }
>(
  nodes: T[],
  opts: { traceId?: string; workspaceId?: string; userId?: string },
  deps: SummarizerDeps
): Promise<T[]> {
  if (process.env.BMC_SUMMARIZER_ENABLED === 'false') {
    return nodes
  }
  if (!nodes || nodes.length === 0) return nodes

  // P11.13 · T2.3 batch-level failure-rate aggregation. Per-cell failures
  // already log distill-failed but a single warn-per-cell hides the
  // aggregate degradation (5/9 silently failing looks the same as 1/9
  // in audit). Aggregate after Promise.all and emit a single summary
  // log so operators / handoff streams can see batch health.
  let successes = 0
  let failures = 0
  const failedDomains: string[] = []

  const tasks = nodes.map(async (node) => {
    if (node.type !== 'cc-bmc-card') return node
    if (!node.content || node.content.trim().length < 40) return node
    try {
      const distilled = await summarizeCellMarkdown(
        node.content,
        {
          domain: node.domain,
          label: node.label,
          traceId: opts.traceId,
          workspaceId: opts.workspaceId,
          userId: opts.userId
        },
        deps
      )
      successes += 1
      return { ...node, summary: distilled }
    } catch (err) {
      failures += 1
      if (node.domain) failedDomains.push(node.domain)
      auditLogger.warn({
        action: 'cell-summarizer.distill-failed',
        requestId: opts.traceId,
        workflowId: opts.workspaceId,
        userId: opts.userId,
        metadata: {
          nodeId: node.id,
          domain: node.domain,
          label: node.label,
          err: err instanceof Error ? err.message : String(err),
          fallback: 'keeping agent original summary'
        }
      })
      return node
    }
  })

  const result = await Promise.all(tasks)

  const eligible = successes + failures
  if (eligible > 0) {
    const failureRate = failures / eligible
    const isDegraded = failureRate >= 0.3 // ≥ 30% threshold
    auditLogger[isDegraded ? 'warn' : 'info']({
      action: isDegraded
        ? 'cell-summarizer.batch-degraded'
        : 'cell-summarizer.batch-completed',
      requestId: opts.traceId,
      workflowId: opts.workspaceId,
      userId: opts.userId,
      metadata: {
        eligible,
        successes,
        failures,
        failureRate: Number(failureRate.toFixed(3)),
        failedDomains,
        threshold: 0.3,
        note: isDegraded
          ? `Cell summarizer fell back to agent original on ≥30% of cells — check flash availability + parser logs.`
          : undefined
      }
    })
  }

  return result
}
