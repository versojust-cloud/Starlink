/**
 * Pure helpers for the business-langgraph orchestrator: JSON extraction,
 * domain normalization, BMC summary tagging, deep-research splitting,
 * card-context rendering, blank/seeded state construction, model-text
 * normalization, and the LLM factory.
 *
 * Extracted from business-langgraph.ts (Stage 4d cleanup, 2026-05-04). All
 * functions here are I/O-free except for `createLLMModel` (constructs a
 * ChatOpenAI client from env) and `auditLogger.warn/error` calls inside
 * the JSON-extraction recovery paths. The orchestrator file re-exports the
 * public symbols so external imports (`extractAndParseJSON`,
 * `normalizeDomainNodes`, `validateNineBmcDimensions`,
 * `splitDeepResearchSections`, `agentNodeForBmcDomain`,
 * `buildDeterministicNodeId`, `buildCompactBmcCardContext`,
 * `renderCompactBmcCardsForPrompt`, `readModelText`, `createLLMModel`,
 * `deriveBmcSummaryTags`, `formatBmcSummaryContent`) remain unchanged.
 */

import { ChatOpenAI } from '@langchain/openai'
import {
  createAuditLogger,
  type CanvasGraph,
  type CanvasNode,
  type BmcCompactCardContext,
  type SeminarPhase
} from '@starlink/shared'
import {
  AGENT_TYPES,
  CC_BMC_DOMAINS,
  FINANCE_DOMAINS,
  MARKET_DOMAINS,
  MAX_CONTEXT_CLAIMS_PER_CARD,
  NODE_SPACING,
  PRODUCT_DOMAINS,
  ROOT_POSITION,
  type AgentType,
  type BusinessModel,
  type CCBMCDomain
} from './constants.js'
import {
  EMPTY_CROSS_CONTEXT,
  type BusinessStateType,
  type CriticConflict,
  type Intent,
  type MacraNodeData,
  type SeededBusinessState
} from './state.js'

const auditLogger = createAuditLogger('packages/server:business-langgraph')

// ============== BMC summary tagging (Stage 1 hygiene) ==============
// Pure helpers extracted so they're testable in isolation. The tag
// predicate intentionally checks distinct dimension coverage rather than
// raw node count — a run with 9 customer-segments nodes is NOT 9-dim
// coverage.
export function deriveBmcSummaryTags(args: {
  conflictCount: number
  dimsCovered: number
}): string[] {
  const tags = ['bmc-conversation']
  if (args.conflictCount > 0) tags.push('had-conflicts')
  if (args.dimsCovered >= 9) tags.push('full-9-dim-coverage')
  return tags
}

export function formatBmcSummaryContent(args: {
  question: string
  bmcNodeCount: number
  conflictCount: number
  dimsCovered: number
  durationMs: number
  handoffCount: number
}): string {
  return (
    `问题: ${args.question.slice(0, 120)} | 产出 ${args.bmcNodeCount} 个 BMC 节点 |` +
    ` 冲突 ${args.conflictCount} 条 | 维度 ${args.dimsCovered}/9 |` +
    ` 耗时 ${(args.durationMs / 1000).toFixed(1)}s | 握手 ${args.handoffCount} 次`
  )
}

// ============== Token-usage extraction ==============
export function extractUsageMetadata(response: unknown): Record<string, number> | undefined {
  const raw = response as {
    usage_metadata?: Record<string, unknown>
    response_metadata?: {
      tokenUsage?: Record<string, unknown>
      usage?: Record<string, unknown>
    }
  }

  const usage = raw?.usage_metadata ?? raw?.response_metadata?.tokenUsage ?? raw?.response_metadata?.usage

  if (!usage) return undefined

  const inputTokens = readNumber(usage, ['input_tokens', 'promptTokens', 'prompt_tokens']) ?? 0
  const outputTokens = readNumber(usage, ['output_tokens', 'completionTokens', 'completion_tokens']) ?? 0
  const totalTokens = readNumber(usage, ['total_tokens', 'totalTokens']) ?? inputTokens + outputTokens

  return {
    inputTokens,
    outputTokens,
    totalTokens
  }
}

function readNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }
  return undefined
}

// ============== JSON extraction with per-cell partial recovery ==============

/**
 * Extract one balanced top-level JSON object substring starting at `start`
 * (which must point at `{`). Tracks string-state so braces inside string
 * literals don't trip the depth counter. Returns the substring including
 * outer braces, or null if no balanced object found before EOF.
 */
function extractBalancedObject(src: string, start: number): string | null {
  if (src[start] !== '{') return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < src.length; i++) {
    const ch = src[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  return null
}

/**
 * Per-cell partial-recovery fallback. When the top-level JSON.parse fails
 * (a single malformed cell taints the whole array), this iterates the
 * cleaned source extracting balanced `{...}` blocks one at a time and
 * tries to parse each independently. Even one broken cell of three no
 * longer drops the entire batch — the surviving cells are returned.
 *
 * Without this, a single SyntaxError at position N inside cell 2 would
 * zero out cells 1, 2, AND 3 — a single point of failure for 3 BMC
 * dimensions. Observed on Notion + Coursera in N=12 evals where
 * market-agent's verbose JSON occasionally trips on Chinese punctuation.
 */
function partialRecoveryParseObjects(
  cleaned: string,
  agentName: string
): MacraNodeData[] {
  const nodes: MacraNodeData[] = []
  let cursor = cleaned.indexOf('{')
  let attempts = 0
  let recovered = 0
  while (cursor !== -1 && attempts < 20) {
    attempts++
    const objStr = extractBalancedObject(cleaned, cursor)
    if (!objStr) break
    try {
      let cleanedObj = objStr.replace(/,(\s*[}\]])/g, '$1')
      // P11.9 · same control-char escaping as the main parse path so
      // recovered objects with raw markdown newlines also succeed.
      cleanedObj = escapeControlCharsInJsonStrings(cleanedObj)
      const node = JSON.parse(cleanedObj) as MacraNodeData
      // Lightweight shape check: must look like a cc-bmc-card cell
      if (
        node &&
        typeof node === 'object' &&
        typeof (node as { domain?: string }).domain === 'string' &&
        typeof (node as { content?: string }).content === 'string'
      ) {
        nodes.push(node)
        recovered++
      }
    } catch {
      // skip this object, continue scanning
    }
    cursor = cleaned.indexOf('{', cursor + objStr.length)
  }
  if (recovered > 0) {
    auditLogger.warn({
      action: `business-langgraph.${agentName}.parseJSON.partial-recovery`,
      metadata: { recovered, attempts }
    })
  }
  return nodes
}

/**
 * P11.9 / J1 · Tolerant JSON preprocessor.
 *
 * Walk the input char-by-char tracking string-vs-non-string state. When
 * inside a JSON string (between unescaped double quotes) replace literal
 * control chars with their escaped equivalents:
 *   - 0x0A (\n) → \\n
 *   - 0x0D (\r) → \\r
 *   - 0x09 (\t) → \\t
 *
 * This catches the common LLM failure where the model emits multi-line
 * markdown inside a content field as raw newlines instead of escaped
 * \\n. JSON.parse rejects that with "Bad control character in string
 * literal" — by escaping during preprocess we make the string parseable.
 *
 * Outside strings (in keys, structural characters, whitespace) we leave
 * everything alone — newlines there are valid JSON whitespace.
 */
function escapeControlCharsInJsonStrings(input: string): string {
  let out = ''
  let inString = false
  let escape = false
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (escape) {
      // Previous char was an unescaped backslash; this char is part of
      // the escape sequence (e.g. \", \\, \n already-escaped). Pass
      // through untouched.
      out += c
      escape = false
      continue
    }
    if (c === '\\' && inString) {
      out += c
      escape = true
      continue
    }
    if (c === '"') {
      // P11.14 · smart inner-quote escaping. When inside a string and we
      // encounter `"`, look ahead past whitespace to determine whether
      // this is the LEGITIMATE string terminator (followed by `,` `}`
      // `]` `:` or end-of-input) or an INNER unescaped quote inside the
      // value (followed by alphanumeric / Chinese chars / etc).
      //
      // LLMs frequently emit content like "...知道很多道理却教不好孩子..."
      // where the inner ASCII double quotes are unescaped, prematurely
      // terminating the JSON string. This look-ahead heuristic escapes
      // them back to \" so JSON.parse succeeds.
      if (inString) {
        let j = i + 1
        while (j < input.length && (input[j] === ' ' || input[j] === '\t' || input[j] === '\n' || input[j] === '\r')) {
          j++
        }
        const nextNonWs = j < input.length ? input[j] : ''
        const isStringTerminator = nextNonWs === ',' || nextNonWs === '}' || nextNonWs === ']' || nextNonWs === ':' || nextNonWs === ''
        if (!isStringTerminator) {
          // Inner quote — escape and stay in-string.
          out += '\\"'
          continue
        }
      }
      out += c
      inString = !inString
      continue
    }
    if (inString) {
      if (c === '\n') { out += '\\n'; continue }
      if (c === '\r') { out += '\\r'; continue }
      if (c === '\t') { out += '\\t'; continue }
    }
    out += c
  }
  return out
}

export function extractAndParseJSON(content: string, agentName: string): MacraNodeData[] {
  try {
    // 1. 移除 Markdown 代码块标记
    let cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '')

    // 2. 提取 JSON 数组
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      auditLogger.error({
        action: `business-langgraph.${agentName}.extractJSON`,
        metadata: { error: 'No JSON array found', content: content.substring(0, 200) }
      })
      return []
    }

    let jsonStr = jsonMatch[0]

    // 3. 清理常见的 JSON 格式问题
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1')

    // 3a. P11.9 · escape literal control chars inside string values so
    //     LLM output with raw markdown newlines parses successfully.
    jsonStr = escapeControlCharsInJsonStrings(jsonStr)

    // 4. 解析 JSON
    const nodes = JSON.parse(jsonStr) as MacraNodeData[]

    if (!Array.isArray(nodes) || nodes.length === 0) {
      auditLogger.error({
        action: `business-langgraph.${agentName}.parseJSON`,
        metadata: { error: 'Parsed result is not a valid array', nodes }
      })
      return []
    }

    return nodes
  } catch (error) {
    // Per-cell partial recovery: don't lose ALL cells just because ONE has
    // a syntax error somewhere in the JSON.
    let cleanedContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '')
    // P11.9 · pre-escape control chars before recovery scan as well.
    cleanedContent = escapeControlCharsInJsonStrings(cleanedContent)
    const recovered = partialRecoveryParseObjects(cleanedContent, agentName)
    if (recovered.length > 0) {
      auditLogger.warn({
        action: `business-langgraph.${agentName}.parseJSON.recovered`,
        metadata: {
          originalError: String(error),
          recoveredCount: recovered.length,
          errorType: error instanceof SyntaxError ? 'SyntaxError' : 'UnknownError'
        }
      })
      return recovered
    }
    auditLogger.error({
      action: `business-langgraph.${agentName}.parseJSON`,
      metadata: {
        error: String(error),
        content: content.substring(0, 500),
        errorType: error instanceof SyntaxError ? 'SyntaxError' : 'UnknownError'
      }
    })
    return []
  }
}

// ============== Domain normalization ==============

export function normalizeDomainNodes(
  nodes: MacraNodeData[],
  options: {
    allowedDomains: readonly CCBMCDomain[]
    agentType: AgentType
    round: number
  }
): MacraNodeData[] {
  const byDomain = new Map<CCBMCDomain, MacraNodeData>()
  // P11.12 · #4 audit duplicates explicitly. BMC semantically has 1 cell
  // per dimension and downstream layout uses deterministic IDs, so we
  // can't keep multiple cells per domain — but the silent drop hid
  // legit agent output. Log the count so degraded output is visible.
  const duplicates: Array<{ domain: CCBMCDomain; droppedLabel: string | undefined }> = []
  // P11.12 · #4 invalid-domain audit. nodes whose domain is not in
  // allowedDomains were also silently skipped — log them to catch
  // agent confusion (e.g. product-agent emitting a finance-domain cell).
  const invalidDomain: Array<{ idHint: string | undefined; reportedDomain: string | undefined }> = []

  for (const node of nodes) {
    const domain = node.domain as CCBMCDomain | undefined
    if (!domain || !options.allowedDomains.some((allowedDomain) => allowedDomain === domain)) {
      invalidDomain.push({ idHint: node.id, reportedDomain: node.domain as string | undefined })
      continue
    }
    if (!byDomain.has(domain)) {
      byDomain.set(domain, node)
    } else {
      duplicates.push({ domain, droppedLabel: node.label })
    }
  }

  if (duplicates.length > 0) {
    auditLogger.warn({
      action: 'business-langgraph.normalizeDomainNodes.duplicateDomainsDropped',
      metadata: {
        agentType: options.agentType,
        round: options.round,
        droppedCount: duplicates.length,
        dropped: duplicates,
        note: 'BMC layout uses deterministic IDs (one cell per domain); first-wins. Consider merging duplicate angles into the kept cell content.'
      }
    })
  }

  if (invalidDomain.length > 0) {
    auditLogger.warn({
      action: 'business-langgraph.normalizeDomainNodes.invalidDomain',
      metadata: {
        agentType: options.agentType,
        round: options.round,
        droppedCount: invalidDomain.length,
        dropped: invalidDomain,
        allowed: options.allowedDomains,
        note: 'Agent emitted cells with domain outside its allow-list — likely prompt confusion or wrong agent invocation.'
      }
    })
  }

  const missing = options.allowedDomains.filter((d) => !byDomain.has(d))
  if (missing.length > 0) {
    auditLogger.warn({
      action: 'business-langgraph.normalizeDomainNodes.missingDomains',
      metadata: {
        agentType: options.agentType,
        round: options.round,
        expected: options.allowedDomains,
        produced: [...byDomain.keys()],
        missing
      }
    })
  }

  return options.allowedDomains.flatMap((domain) => {
    const node = byDomain.get(domain)
    if (!node) return []

    return [{
      ...node,
      id: buildDeterministicNodeId(options.agentType, domain),
      type: 'cc-bmc-card' as const,
      domain,
      metadata: {
        ...node.metadata,
        agent_signature: options.agentType,
        stage: options.round > 1 ? ('review' as const) : ('execution' as const),
        tags: appendRoundTag(node.metadata?.tags ?? [], options.round)
      }
    }]
  })
}

/**
 * Validate that a generated graph covers the full 9-dimension CC-BMC spec.
 * Used as an integration-level invariant check: if any dimension is absent
 * from agent output, the system should at minimum surface this as a
 * structural issue rather than silently accept an 8-dimension graph.
 *
 * Returns the list of missing dimensions (empty = complete).
 */
export function validateNineBmcDimensions(nodes: MacraNodeData[]): CCBMCDomain[] {
  const produced = new Set<CCBMCDomain>()
  for (const node of nodes) {
    const d = node.domain as CCBMCDomain | undefined
    if (d) produced.add(d)
  }
  const allDomains = Object.values(CC_BMC_DOMAINS) as CCBMCDomain[]
  return allDomains.filter((d) => !produced.has(d))
}

// ============== Deep-research section splitter ==============

/**
 * Map a BMC dimension to the LangGraph node name of the agent that owns it.
 * Used by the supervisor's coverage gate to decide which agent to bring back
 * for a revision round when a dimension is structurally missing — so we
 * don't silently ship an 8-dim BMC just because no critic conflict happened
 * to mention the gap.
 */
/**
 * Phase 2.6 · split LLM-emitted deep-research markdown into the (summary,
 * detail) pair the canvas renders as two cards.
 *
 * Expected shape (instructed by the system prompt):
 *
 *   ## 核心结论
 *   <1-3 sentences>
 *
 *   ## 详细分析
 *   <3-5 paragraphs>
 *
 * If the LLM ignores the structure, fall back to: first paragraph → summary,
 * remainder → detail. If only one section is present, the other is empty.
 */
export function splitDeepResearchSections(raw: string): { summary: string; detail: string } {
  if (!raw || !raw.trim()) return { summary: '', detail: '' }
  const text = raw.replace(/\r\n/g, '\n')

  // Match `## 核心结论` and `## 详细分析` headers (any leading whitespace).
  const summaryMatch = text.match(/##\s*核心结论\s*\n([\s\S]*?)(?=\n##\s*详细分析|\n##\s|$)/)
  const detailMatch = text.match(/##\s*详细分析\s*\n([\s\S]*?)(?=\n##\s*核心结论|$)/)

  if (summaryMatch || detailMatch) {
    return {
      summary: (summaryMatch?.[1] ?? '').trim(),
      detail: (detailMatch?.[1] ?? '').trim()
    }
  }

  // Fallback: first non-empty paragraph as summary, rest as detail.
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  if (paragraphs.length === 0) return { summary: '', detail: '' }
  if (paragraphs.length === 1) return { summary: paragraphs[0], detail: '' }
  return {
    summary: paragraphs[0],
    detail: paragraphs.slice(1).join('\n\n')
  }
}

export function makeDeepResearchPair(
  traceId: string,
  summary: string,
  detail: string,
  evidenceCount: number,
  confidence: 'high' | 'medium' | 'low'
): MacraNodeData[] {
  const baseMeta = {
    agent_signature: AGENT_TYPES.ORCHESTRATOR,
    confidence,
    stage: 'review' as const,
    evidenceCount
  }
  const summaryNode: MacraNodeData = {
    id: `deep-research-summary-${traceId}`,
    type: 'insight-note',
    label: '深度研究 · 核心结论',
    content: summary,
    metadata: { ...baseMeta, segment: 'summary' }
  }
  const detailNode: MacraNodeData = {
    id: `deep-research-detail-${traceId}`,
    type: 'insight-note',
    label: '深度研究 · 详细分析',
    content: detail,
    metadata: { ...baseMeta, segment: 'detail' }
  }
  // Detail card skipped if empty so the canvas isn't littered with placeholder
  // notes; summary card always emitted (even if short) so user sees something.
  return detail ? [summaryNode, detailNode] : [summaryNode]
}

/**
 * Phase 2.6 · build a 1-3 sentence TL;DR for the synthesizer's "核心结论"
 * card. Pure function over rule-based signals — no LLM, no I/O — so the
 * output is deterministic and easy to test.
 */
export function buildConsistencySummary(input: {
  bmcNodeCount: number
  hasHighEnd: boolean
  hasLowPrice: boolean
  hasHeavyAssets: boolean
  hasLightModel: boolean
  ruleNoteCount: number
}): string {
  if (input.bmcNodeCount === 0) return ''
  const sentences: string[] = []
  if (input.ruleNoteCount === 0) {
    sentences.push(`已围绕 ${input.bmcNodeCount} 张卡片完成商业画布初稿，规则层未发现明显跨维度矛盾。`)
  } else {
    sentences.push(`已围绕 ${input.bmcNodeCount} 张卡片完成商业画布初稿，发现 ${input.ruleNoteCount} 处跨维度矛盾需要重点关注。`)
    if (input.hasHighEnd && input.hasLowPrice) {
      sentences.push('客户定位与定价策略存在张力（高端 vs 低价）。')
    }
    if (input.hasHeavyAssets && input.hasLightModel) {
      sentences.push('资源模型路径不一致（重资产自建 vs 轻资产平台）。')
    }
  }
  return sentences.join(' ')
}

// ============== Domain → agent / node-id helpers ==============

export function agentNodeForBmcDomain(domain: CCBMCDomain): string | null {
  if ((MARKET_DOMAINS as readonly CCBMCDomain[]).includes(domain)) return 'marketAgent'
  if ((PRODUCT_DOMAINS as readonly CCBMCDomain[]).includes(domain)) return 'productAgent'
  if ((FINANCE_DOMAINS as readonly CCBMCDomain[]).includes(domain)) return 'financeAgent'
  return null
}

export function buildDeterministicNodeId(agentType: AgentType, domain: CCBMCDomain) {
  const agentPrefix: Record<AgentType, string> = {
    [AGENT_TYPES.MARKET]: 'market',
    [AGENT_TYPES.PRODUCT]: 'product',
    [AGENT_TYPES.FINANCE]: 'finance',
    [AGENT_TYPES.COMPLIANCE]: 'compliance',
    [AGENT_TYPES.ORCHESTRATOR]: 'orchestrator',
    [AGENT_TYPES.CRITIC]: 'critic',
    [AGENT_TYPES.REPORT_WRITER]: 'report',
  }
  const domainSuffix: Record<CCBMCDomain, string> = {
    [CC_BMC_DOMAINS.CUSTOMER_SEGMENTS]: 'customer-segments',
    [CC_BMC_DOMAINS.CHANNELS]: 'channels',
    [CC_BMC_DOMAINS.CUSTOMER_RELATIONSHIPS]: 'customer-relationships',
    [CC_BMC_DOMAINS.VALUE_PROPOSITIONS]: 'value-propositions',
    [CC_BMC_DOMAINS.KEY_RESOURCES]: 'key-resources',
    [CC_BMC_DOMAINS.KEY_ACTIVITIES]: 'key-activities',
    [CC_BMC_DOMAINS.KEY_PARTNERSHIPS]: 'key-partnerships',
    [CC_BMC_DOMAINS.REVENUE_STREAMS]: 'revenue-streams',
    [CC_BMC_DOMAINS.COST_STRUCTURE]: 'cost-structure'
  }

  return `${agentPrefix[agentType]}-${domainSuffix[domain]}`
}

function appendRoundTag(tags: string[], round: number) {
  if (round <= 1) return [...new Set(tags)]
  return [...new Set([...tags, `round-${round}`])]
}

// ============== Card-context rendering ==============

export function buildCompactBmcCardContext(node: MacraNodeData): BmcCompactCardContext {
  const keyClaims = extractKeyClaims(node.content)
  return {
    id: node.id,
    domain: node.domain as BmcCompactCardContext['domain'],
    label: node.label,
    agentSignature: node.metadata.agent_signature as BmcCompactCardContext['agentSignature'],
    confidence: node.metadata.confidence,
    keyClaims,
    assumptions: findContextSignals(keyClaims, ['假设', '预计', '可能', '依赖', '如果']),
    risks: findContextSignals(keyClaims, ['风险', '冲突', '不足', '不确定', '成本', '监管', '依赖']),
    evidenceRefs: extractEvidenceRefs(node.metadata)
  }
}

export function renderCompactBmcCardsForPrompt(nodes: MacraNodeData[]): string {
  if (nodes.length === 0) return ''

  return nodes
    .map(buildCompactBmcCardContext)
    .map((card) => {
      const lines = [
        `- **${card.domain ?? card.label}** (${card.agentSignature ?? 'unknown'}, confidence: ${card.confidence ?? 'unknown'})`
      ]
      for (const [index, claim] of card.keyClaims.entries()) {
        lines.push(`  - claim ${index + 1}: ${claim}`)
      }
      if (card.assumptions.length > 0) {
        lines.push(`  - assumptions: ${card.assumptions.join('；')}`)
      }
      if (card.risks.length > 0) {
        lines.push(`  - risks: ${card.risks.join('；')}`)
      }
      if (card.evidenceRefs.length > 0) {
        lines.push(`  - evidence: ${card.evidenceRefs.join(', ')}`)
      }
      return lines.join('\n')
    })
    .join('\n')
}

function extractKeyClaims(content: string): string[] {
  const normalized = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[\[(?:ref:[^\]]+|no-ref)\]\]/g, '')
    .replace(/[#*_`>]/g, '')
    .replace(/\r/g, '\n')

  const lineClaims = normalized
    .split('\n')
    .map(cleanClaim)
    .filter(isUsefulClaim)

  const claims = lineClaims.length > 0
    ? lineClaims
    : normalized
        .split(/[。！？!?；;]/)
        .map(cleanClaim)
        .filter(isUsefulClaim)

  return [...new Set(claims)].slice(0, MAX_CONTEXT_CLAIMS_PER_CARD)
}

function cleanClaim(value: string) {
  return value
    .replace(/^\s*[-+*•\d.、）)]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isUsefulClaim(value: string) {
  return value.length >= 6 && !/^[-\s]+$/.test(value)
}

function findContextSignals(claims: string[], keywords: string[]) {
  return claims
    .filter((claim) => keywords.some((keyword) => claim.includes(keyword)))
    .slice(0, 3)
}

function extractEvidenceRefs(metadata: MacraNodeData['metadata']) {
  const citations = (metadata as { citations?: unknown }).citations
  if (!Array.isArray(citations)) return []

  const refs = new Set<string>()
  for (const citation of citations) {
    const citationRefs = (citation as { refs?: unknown }).refs
    if (!Array.isArray(citationRefs)) continue
    for (const ref of citationRefs) {
      const evidenceRef = ref as { docId?: unknown; snippetId?: unknown }
      if (typeof evidenceRef.docId === 'string' && typeof evidenceRef.snippetId === 'string') {
        refs.add(`${evidenceRef.docId}#${evidenceRef.snippetId}`)
      }
    }
  }

  return [...refs].slice(0, 8)
}

// ============== Workspace-graph reuse predicates ==============

export function shouldReuseWorkspaceGraph(intent?: Intent['intent'] | null) {
  return intent === 'general' || intent === 'analyze' || intent === 'detect_conflicts'
}

export function hasUsableWorkspaceGraph(graph?: CanvasGraph) {
  return Boolean(graph && graph.nodes.length > 0)
}

export function hasSeededDomainNodes(state: SeededBusinessState) {
  return state.marketNodes.length > 0
    || state.productNodes.length > 0
    || state.financeNodes.length > 0
}

// ============== Blank / seeded state factories ==============

export function createBlankState(params: {
  traceId: string
  workspaceId: string
  userId: string
  question: string
  contextPrompt?: string
}): BusinessStateType {
  return {
    traceId: params.traceId,
    workspaceId: params.workspaceId,
    userId: params.userId,
    question: params.question,
    contextPrompt: params.contextPrompt ?? '',
    intent: null,
    roundNumber: 0,
    supervisorDirective: null,
    crossContext: EMPTY_CROSS_CONTEXT,
    knowledgeEvidence: [],
    generalNodes: [],
    marketNodes: [],
    productNodes: [],
    financeNodes: [],
    agentAvatars: [],
    conflicts: [],
    edges: [],
    moderatorVerdict: null
  }
}

export function extractSeededStateFromGraph(graph: CanvasGraph): SeededBusinessState {
  const seeded: SeededBusinessState = {
    marketNodes: [],
    productNodes: [],
    financeNodes: [],
    agentAvatars: [],
    conflicts: [],
    edges: graph.edges.map((edge) => ({ ...edge }))
  }

  for (const node of graph.nodes) {
    const macraNode = extractMacraNodeFromCanvasNode(node)
    if (!macraNode) continue

    if (macraNode.type === 'agent-avatar') {
      seeded.agentAvatars.push(macraNode)
      continue
    }

    if (macraNode.type === 'conflict-alert') {
      seeded.conflicts.push(macraNode as CriticConflict)
      continue
    }

    const agentId = macraNode.metadata.agent_signature ?? macraNode.agentType
    if (agentId === AGENT_TYPES.MARKET) {
      seeded.marketNodes.push(macraNode)
    } else if (agentId === AGENT_TYPES.PRODUCT) {
      seeded.productNodes.push(macraNode)
    } else if (agentId === AGENT_TYPES.FINANCE) {
      seeded.financeNodes.push(macraNode)
    }
  }

  return seeded
}

export function extractMacraNodeFromCanvasNode(node: CanvasNode): MacraNodeData | null {
  const data = (node.data ?? {}) as {
    title?: string
    content?: string
    meta?: {
      macraType?: MacraNodeData['type']
      domain?: CCBMCDomain
      agentType?: AgentType
      severity?: MacraNodeData['severity']
      conflictType?: MacraNodeData['conflictType']
      isInteractive?: boolean
      metadata?: MacraNodeData['metadata']
    }
  }
  const meta = data.meta
  if (!meta?.macraType) return null

  return {
    id: node.id,
    type: meta.macraType,
    label: typeof data.title === 'string' && data.title.trim() ? data.title : node.id,
    content: typeof data.content === 'string' ? data.content : '',
    domain: meta.domain,
    metadata: meta.metadata ?? {},
    agentType: meta.agentType,
    severity: meta.severity,
    conflictType: meta.conflictType,
    isInteractive: meta.isInteractive
  }
}

export function createGeneralResponseNode(traceId: string, content: string, stage: SeminarPhase): MacraNodeData {
  return {
    id: `general-response-${traceId}`,
    type: 'insight-note',
    label: '综合回答',
    content,
    metadata: {
      agent_signature: AGENT_TYPES.ORCHESTRATOR,
      confidence: 'high',
      stage
    }
  }
}

// ============== Model-text + canvas-node helpers ==============

export function readModelText(response: unknown) {
  if (typeof response === 'string') return response
  const payload = response as { content?: unknown }
  if (typeof payload?.content === 'string') return payload.content
  if (Array.isArray(payload?.content)) {
    return payload.content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
          return item.text
        }
        return ''
      })
      .join('')
      .trim()
  }
  return ''
}

export function computeNextY(nodes: CanvasNode[]) {
  const maxY = nodes.reduce((max, node) => Math.max(max, node.position?.y ?? ROOT_POSITION.y), ROOT_POSITION.y)
  return maxY + NODE_SPACING
}

export function cloneCanvasNode(node: CanvasNode): CanvasNode {
  return {
    ...node,
    position: { ...node.position },
    data: structuredClone(node.data)
  }
}

// ============== LLM factory ==============

export function createLLMModel(): BusinessModel | null {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || ''
  if (!apiKey) {
    auditLogger.warn({
      action: 'business-langgraph.createLLMModel',
      metadata: { message: 'No LLM_API_KEY or OPENAI_API_KEY found in environment' }
    })
    return null
  }

  const baseURL = process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || ''
  const model = process.env.LANGGRAPH_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini'
  const configuration = baseURL ? { baseURL } : undefined

  // DeepSeek V4 family supports `thinking.type` + `reasoning_effort`
  // body params; v3 (deepseek-chat) and earlier reject them. Inject
  // only when the model name marks itself as v4 / thinking-enabled.
  const isThinkingModel =
    model.toLowerCase().startsWith('deepseek-v4') ||
    model.toLowerCase().includes('-thinking')
  const modelKwargs = isThinkingModel
    ? { thinking: { type: 'enabled' }, reasoning_effort: 'high' }
    : undefined

  return new ChatOpenAI({
    apiKey,
    model,
    temperature: 0.3,
    maxTokens: 40000,
    configuration,
    ...(modelKwargs ? { modelKwargs } : {})
  })
}
