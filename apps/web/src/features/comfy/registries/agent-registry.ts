/**
 * Frontend agent registry — single source of truth for the 12 backend
 * agents that can be surfaced to users via @-mention.
 *
 * Each entry mirrors a backend agent.yaml and adds the UI metadata the
 * chat / canvas need (display name, glyph letter, byline tint, callability
 * class, output description).
 *
 * Note (2026-05-04): the 5-color `bylineAccent` palette in tokens-v2.ts is
 * intentionally kept tight (market/product/finance/critic/synthesizer).
 * The 6 additional debate / utility agents map onto the 5 existing tints
 * via a `byline` field (closest semantic match) and differentiate visually
 * through the `variant` field, which the chat / canvas can render with a
 * dashed border for 'opponent', a circular outline for 'judge', etc.
 *
 * Lookup helpers:
 *   - getAgent(id)          → AgentDescriptor | undefined
 *   - listAgents()          → AgentDescriptor[]   (stable order, used in @ menu)
 *   - filterAgentsByQuery   → typed @ popup filter
 *
 * Callability semantics (drives mention-router routing on the server):
 *   - 'standalone'              → invokeRegisteredAgent works with a minimal
 *                                 BusinessState built from question alone.
 *   - 'standalone-needs-bmc'    → invokeRegisteredAgent needs nodesSummary
 *                                 (critic) or marketNodes/productNodes/
 *                                 financeNodes (synthesizer). Frontend
 *                                 router refuses gracefully when the canvas
 *                                 has no BMC nodes yet.
 *   - 'debate-side'             → orphan-stub agent invoked through
 *                                 LlmDebateInvoker.nextTurn() in single-side
 *                                 mode (priorTurns=[], disputedNodeIds=[]).
 *   - 'debate-judge'            → orphan-stub invoked through raw chat
 *                                 against the moderator's profile prompt.
 */

import type { AgentByline } from '@/shared/design-system/tokens-v2'

// ============================================================================
// Types
// ============================================================================

/** All 12 backend agent ids. Source of truth: packages/server/src/agents/<dir>/agent.yaml `id:` field. */
export type AgentId =
  | 'market-agent'
  | 'product-agent'
  | 'finance-agent'
  | 'critic-agent'
  | 'synthesizer'
  | 'general-responder'
  | 'deep-research'
  | 'report-writer'
  | 'market-opponent'
  | 'product-opponent'
  | 'finance-opponent'
  | 'moderator'

export type AgentCallability =
  | 'standalone'
  | 'standalone-needs-bmc'
  | 'debate-side'
  | 'debate-judge'

/**
 * Visual variant — drives chat byline + canvas avatar styling.
 * - 'proponent': normal byline strip (used by all 5 native agents + utility)
 * - 'opponent':  dashed strip + slight desaturation (3 *-opponent agents)
 * - 'judge':     circular outline glyph (moderator)
 */
export type AgentVariant = 'proponent' | 'opponent' | 'judge'

export interface AgentDescriptor {
  id: AgentId
  /** Human-readable name shown as the chat sender label. */
  displayName: string
  /** Single-letter Fraunces glyph used in avatar / chat byline. */
  glyph: string
  /** tokens-v2.bylineAccent key — chosen for closest semantic tint. */
  byline: AgentByline
  /** Visual differentiation for opponent / judge variants. */
  variant: AgentVariant
  /** Routing discriminator for the server-side mention-router. */
  callability: AgentCallability
  /** One-line description shown in the @-mention dropdown. */
  shortDescription: string
  /** Whether this agent appends to the canvas (true) or chat-only (false). */
  emitsCanvasNodes: boolean
  /** Optional grouping for the @ menu (BMC team / advisors / debate / utility). */
  group: 'generators' | 'advisors' | 'debate' | 'utility'
}

// ============================================================================
// Registry
// ============================================================================

/**
 * Order matters: this is the order shown in the @-mention popup. Generators
 * first (most-used), then advisors, then debate, then utility.
 */
const AGENT_LIST: AgentDescriptor[] = [
  // ── Generators (BMC pipeline, callable standalone) ─────────────────────
  {
    id: 'market-agent',
    displayName: '市场分析专家',
    glyph: 'M',
    byline: 'market',
    variant: 'proponent',
    callability: 'standalone',
    shortDescription: '客户细分 / 渠道 / 客户关系',
    emitsCanvasNodes: true,
    group: 'generators',
  },
  {
    id: 'product-agent',
    displayName: '产品策略专家',
    glyph: 'P',
    byline: 'product',
    variant: 'proponent',
    callability: 'standalone',
    shortDescription: '价值主张 / 关键业务 / 资源 / 合作',
    emitsCanvasNodes: true,
    group: 'generators',
  },
  {
    id: 'finance-agent',
    displayName: '财务分析专家',
    glyph: 'F',
    byline: 'finance',
    variant: 'proponent',
    callability: 'standalone',
    shortDescription: '收入来源 / 成本结构',
    emitsCanvasNodes: true,
    group: 'generators',
  },

  // ── Advisors (need BMC context to be meaningful) ───────────────────────
  {
    id: 'critic-agent',
    displayName: '对抗性评论者',
    glyph: 'C',
    byline: 'critic',
    variant: 'proponent',
    callability: 'standalone-needs-bmc',
    shortDescription: '检测画布上 BMC 各维度间的逻辑冲突',
    emitsCanvasNodes: true,
    group: 'advisors',
  },
  {
    id: 'synthesizer',
    displayName: '综合者',
    glyph: 'S',
    byline: 'synthesizer',
    variant: 'proponent',
    callability: 'standalone-needs-bmc',
    shortDescription: '汇总 BMC 跨维度洞察 + 关系连线',
    emitsCanvasNodes: true,
    group: 'advisors',
  },

  // ── Debate participants (orphan-stub agents, single-side via mention) ──
  {
    id: 'market-opponent',
    displayName: '市场对手',
    glyph: 'M',
    byline: 'market',
    variant: 'opponent',
    callability: 'debate-side',
    shortDescription: '从市场反方角度单边批判',
    emitsCanvasNodes: true,
    group: 'debate',
  },
  {
    id: 'product-opponent',
    displayName: '产品对手',
    glyph: 'P',
    byline: 'product',
    variant: 'opponent',
    callability: 'debate-side',
    shortDescription: '从产品反方角度单边批判',
    emitsCanvasNodes: true,
    group: 'debate',
  },
  {
    id: 'finance-opponent',
    displayName: '财务对手',
    glyph: 'F',
    byline: 'finance',
    variant: 'opponent',
    callability: 'debate-side',
    shortDescription: '从财务反方角度单边批判',
    emitsCanvasNodes: true,
    group: 'debate',
  },
  {
    id: 'moderator',
    displayName: '辩论裁决者',
    glyph: 'J',
    byline: 'critic',
    variant: 'judge',
    callability: 'debate-judge',
    shortDescription: '对议题给出平衡评议',
    emitsCanvasNodes: true,
    group: 'debate',
  },

  // ── Utility (general fallback + research mode) ─────────────────────────
  {
    id: 'general-responder',
    displayName: '通用应答',
    glyph: 'G',
    byline: 'synthesizer',
    variant: 'proponent',
    callability: 'standalone',
    shortDescription: '不需要 BMC 的开放式问答',
    emitsCanvasNodes: true,
    group: 'utility',
  },
  {
    id: 'deep-research',
    displayName: '深度研究员',
    glyph: 'R',
    byline: 'synthesizer',
    variant: 'proponent',
    callability: 'standalone',
    shortDescription: '基于知识库证据的学术综述',
    emitsCanvasNodes: true,
    group: 'utility',
  },
  {
    id: 'report-writer',
    displayName: '报告撰写员',
    glyph: 'W',  // 'W' for Writer — distinguishes from 'R' (deep-research)
    byline: 'synthesizer',  // shares synth tint; canvas card uses ink-dark theme to differentiate visually
    variant: 'proponent',
    callability: 'standalone-needs-bmc',
    shortDescription: '整份商业报告：6 段结构化输出 + 内联引用',
    emitsCanvasNodes: true,
    group: 'utility',
  },
]

const AGENT_BY_ID = new Map<AgentId, AgentDescriptor>(
  AGENT_LIST.map((a) => [a.id, a])
)

// ============================================================================
// Public API
// ============================================================================

export function listAgents(): readonly AgentDescriptor[] {
  return AGENT_LIST
}

export function getAgent(id: string): AgentDescriptor | undefined {
  return AGENT_BY_ID.get(id as AgentId)
}

export function getAgentByline(id: string): AgentByline | null {
  return AGENT_BY_ID.get(id as AgentId)?.byline ?? null
}

export function isAgentId(value: string): value is AgentId {
  return AGENT_BY_ID.has(value as AgentId)
}

/**
 * Filter agents by a typed prefix — used by the @-mention popup.
 * Matches against id, displayName, and shortDescription (case-insensitive).
 */
export function filterAgentsByQuery(query: string): readonly AgentDescriptor[] {
  if (!query) return AGENT_LIST
  const q = query.toLowerCase()
  return AGENT_LIST.filter(
    (a) =>
      a.id.toLowerCase().includes(q) ||
      a.displayName.toLowerCase().includes(q) ||
      a.shortDescription.toLowerCase().includes(q)
  )
}
