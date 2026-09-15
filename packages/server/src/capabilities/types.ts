/**
 * Capability DSL: declarative contract describing what an agent or advisor
 * can do. The supervisor routes by capability, not by agent name — new agents
 * and advisors can be added without modifying the supervisor.
 *
 * Reference: docs/backend-architecture-v2.md §2
 */

// ============== BMC 9 Dimensions（与 CC_BMC_DOMAINS 对齐）==============

export type BMCDimension =
  | 'CUSTOMER_SEGMENTS'
  | 'VALUE_PROPOSITIONS'
  | 'CHANNELS'
  | 'CUSTOMER_RELATIONSHIPS'
  | 'REVENUE_STREAMS'
  | 'KEY_RESOURCES'
  | 'KEY_ACTIVITIES'
  | 'KEY_PARTNERSHIPS'
  | 'COST_STRUCTURE'

export const BMC_DIMENSIONS: readonly BMCDimension[] = [
  'CUSTOMER_SEGMENTS',
  'VALUE_PROPOSITIONS',
  'CHANNELS',
  'CUSTOMER_RELATIONSHIPS',
  'REVENUE_STREAMS',
  'KEY_RESOURCES',
  'KEY_ACTIVITIES',
  'KEY_PARTNERSHIPS',
  'COST_STRUCTURE'
] as const

// ============== Critic Modes ==============

export type CriticMode =
  | 'devils-advocate'       // 反事实推理：质疑核心假设
  | 'evidence-checker'      // 要求每个 claim 有 KB 证据支撑
  | 'conflict-detector'     // 9 维之间逻辑冲突
  | 'logical-auditor'       // stretch: 检查因果链完整性
  | 'gap-hunter'            // stretch: 找被假设掉的前提

// ============== Framework Advisors ==============

export type AdvisorFramework =
  | 'swot'
  | 'blue-ocean'
  | 'jtbd'

// ============== Capability 联合类型 ==============

export type Capability =
  | { kind: 'generate'; dimension: BMCDimension }
  | { kind: 'critique'; mode: CriticMode }
  | { kind: 'advise'; framework: AdvisorFramework }
  | { kind: 'reflect'; scope: 'single_round' | 'multi_round_evolution' }
  | { kind: 'refine'; strategy: 'minimal_change' | 'full_rewrite' }

// ============== Agent Descriptor ==============

export type AgentRole = 'generator' | 'advisor' | 'meta'

export type AgentRuntime = {
  timeout: number
  retries: number
  cacheable: boolean
}

/**
 * Descriptor for an agent or advisor. Holds metadata + a factory producing
 * a compiled LangGraph subgraph. The subgraph's concrete type is intentionally
 * loose (`unknown`) because each agent carries its own state schema; the
 * top-level orchestrator will bridge at projection time.
 */
export type AgentDescriptor = {
  id: string
  name: string
  role: AgentRole
  capabilities: Capability[]
  runtime: AgentRuntime
  /**
   * Factory returning a compiled LangGraph subgraph. Caller must type-assert
   * the expected shape — each agent's subgraph is self-contained.
   */
  buildSubgraph: () => unknown
}

// ============== Advisor Descriptor ==============

export type RelevanceScorer<State> = (state: State) => number
export type TriggerPredicate<State> = (state: State) => boolean

/**
 * Advisor descriptor extends AgentDescriptor with routing hints used by the
 * Advisor Router: `relevanceScorer` produces a [0, 1] score for the current
 * SharedState; `triggerPredicate` gates whether the advisor is eligible.
 */
export type AdvisorDescriptor<State = unknown> = Omit<AgentDescriptor, 'role'> & {
  role: 'advisor'
  relevanceScorer: RelevanceScorer<State>
  triggerPredicate?: TriggerPredicate<State>
}
