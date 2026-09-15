/**
 * Static configuration constants for the business-langgraph orchestrator.
 *
 * Extracted from business-langgraph.ts (Stage 4d cleanup, 2026-05-04) to
 * give every consumer of these maps / dimension lists a single, lightweight
 * import target instead of pulling in the 4000-line orchestrator file. The
 * orchestrator re-exports the public symbols so external imports remain
 * unchanged.
 */

import type { z } from 'zod'
import type { HumanMessage, SystemMessage } from '@langchain/core/messages'

// ============== CC-BMC 九大维度（与前端保持一致） ==============
export const CC_BMC_DOMAINS = {
  CUSTOMER_SEGMENTS: '客户细分',
  CUSTOMER_RELATIONSHIPS: '客户关系',
  CHANNELS: '渠道通路',
  VALUE_PROPOSITIONS: '价值主张',
  REVENUE_STREAMS: '收入来源',
  KEY_ACTIVITIES: '关键业务',
  KEY_RESOURCES: '核心资源',
  KEY_PARTNERSHIPS: '重要合作',
  COST_STRUCTURE: '成本结构'
} as const

export type CCBMCDomain = (typeof CC_BMC_DOMAINS)[keyof typeof CC_BMC_DOMAINS]

export const MARKET_DOMAINS = [
  CC_BMC_DOMAINS.CUSTOMER_SEGMENTS,
  CC_BMC_DOMAINS.CHANNELS,
  CC_BMC_DOMAINS.CUSTOMER_RELATIONSHIPS
] as const

export const PRODUCT_DOMAINS = [
  CC_BMC_DOMAINS.VALUE_PROPOSITIONS,
  CC_BMC_DOMAINS.KEY_RESOURCES,
  CC_BMC_DOMAINS.KEY_ACTIVITIES,
  CC_BMC_DOMAINS.KEY_PARTNERSHIPS
] as const

export const FINANCE_DOMAINS = [
  CC_BMC_DOMAINS.REVENUE_STREAMS,
  CC_BMC_DOMAINS.COST_STRUCTURE
] as const

// ============== Agent 类型 ==============
export const AGENT_TYPES = {
  MARKET: 'Market_Agent',
  PRODUCT: 'Product_Agent',
  FINANCE: 'Finance_Agent',
  COMPLIANCE: 'Compliance_Agent',
  ORCHESTRATOR: 'Orchestrator',
  CRITIC: 'Adversarial_Critic',
  REPORT_WRITER: 'Report_Writer',
} as const

export type AgentType = (typeof AGENT_TYPES)[keyof typeof AGENT_TYPES]

// ============== Business LLM model interface ==============
export type BusinessModel = {
  invoke: (messages: Array<SystemMessage | HumanMessage>) => Promise<unknown>
  withStructuredOutput: <T>(
    schema: z.ZodType<T>,
    options: {
      name: string
      strict?: boolean
      // langchain-openai withStructuredOutput accepts a `method` discriminator
      // — 'jsonSchema' is the default strict mode (OpenAI/Azure only),
      // 'functionCalling' uses tool-call routing (DeepSeek-compatible),
      // 'jsonMode' uses `response_format: { type: 'json_object' }`.
      method?: 'functionCalling' | 'jsonMode' | 'jsonSchema'
    }
  ) => {
    invoke: (messages: Array<SystemMessage | HumanMessage>) => Promise<T>
  }
}

// ============== String-id maps ==============

/** Agent 名称（AGENT_TYPES.* 值）→ LangGraph 节点名称（legacy camelCase）。 */
export const AGENT_TO_NODE: Record<string, string> = {
  [AGENT_TYPES.MARKET]: 'marketAgent',
  [AGENT_TYPES.PRODUCT]: 'productAgent',
  [AGENT_TYPES.FINANCE]: 'financeAgent'
}

/** Phase C bridge: registry kebab id → legacy camelCase node name. */
export const REGISTRY_ID_TO_NODE: Record<string, string> = {
  'market-agent': 'marketAgent',
  'product-agent': 'productAgent',
  'finance-agent': 'financeAgent'
}

/** Generator-agent id → opponent-agent id, for the debate orchestrator. */
export const OPPONENT_MAP: Record<string, string> = {
  'market-agent': 'market-opponent',
  'product-agent': 'product-opponent',
  'finance-agent': 'finance-opponent'
}

/** Critic conflict's `relatedAgents` signature → registry agent id. */
export const AGENT_SIGNATURE_TO_ID: Record<string, string> = {
  Market_Agent: 'market-agent',
  Product_Agent: 'product-agent',
  Finance_Agent: 'finance-agent'
}

// ============== Round / context limits ==============
/**
 * Hard upper bound on supervisor → critic → revision loops. Default 3
 * matches earlier behaviour. Overridable via env BMC_MAX_ROUNDS for
 * faster smoke runs.
 *
 * Sprint 2.2 · Early-stop heuristic:
 *   - If the round-N critic conflict count is >= round-(N-1) count,
 *     no revision is happening — supervisor should end. Implemented
 *     in business-langgraph.shouldStopEarly().
 */
export const MAX_ROUNDS = Math.max(1, Math.min(5, Number(process.env.BMC_MAX_ROUNDS ?? '3')))
export const MAX_CONTEXT_CLAIMS_PER_CARD = 4

// Sprint 2.1 · per-stage timeout (ms). When a single agent takes longer
// than this, the supervisor downgrades to "skip and end". Prevents the
// 24-min stalls observed in real demos.
export const STAGE_TIMEOUT_MS = Math.max(
  10_000,
  Number(process.env.BMC_STAGE_TIMEOUT_MS ?? '90000')
)

// ============== Canvas layout ==============
export const ROOT_POSITION = { x: 160, y: 160 }
export const NODE_SPACING = 220
