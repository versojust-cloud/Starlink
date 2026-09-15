/**
 * LangGraph state definition + supporting types/schemas for the
 * business-langgraph orchestrator.
 *
 * Extracted from business-langgraph.ts (Stage 4d cleanup, 2026-05-04).
 * Includes the BusinessState Annotation root, MacraNodeData schema, intent
 * classification schema, supervisor directive shape, cross-agent context,
 * stream-update union, and the seeded-state helpers used to bootstrap a
 * graph from an existing canvas.
 *
 * Pure data — no I/O, no logging, no class. Importable from anywhere
 * without dragging the orchestrator into the dependency graph.
 */

import { z } from 'zod'
import { Annotation } from '@langchain/langgraph'
import type {
  CanvasEdge,
  CanvasGraph,
  CanvasNode,
  KnowledgeEvidence
} from '@starlink/shared'
import type { Handoff } from '../../infrastructure/handoff-log/index.js'
import type { RoutingDecision } from '../routing-schema.js'
import { CC_BMC_DOMAINS, AGENT_TYPES } from './constants.js'

// ============== MacraNodeData Schema（用于验证 LLM 输出） ==============
export const MacraNodeDataSchema = z.object({
  id: z.string(),
  type: z.enum(['cc-bmc-card', 'agent-avatar', 'insight-note', 'conflict-alert', 'data-source', 'report-card']),
  label: z.string().max(50),
  content: z.string(),
  /**
   * Issue C fix · separate one-line summary from the multi-paragraph
   * content body. Drawer's 摘要 section reads this; if missing, drawer
   * derives from content's first sentence.
   */
  // P11.2 · bumped from 240 → 600 to accommodate the new "summary as
  // condensed markdown 段落+短列表" requirement (80-200 字 + markdown
  // syntax + line breaks easily exceeds 240 chars).
  summary: z.string().max(600).optional(),
  /**
   * Issue C fix · explicit full body (markdown) when agent splits
   * summary vs detail. When set, takes precedence over `content` for
   * the drawer's "详细内容" section. Back-compat: agents that only
   * write `content` work unchanged — drawer treats content as the
   * full body.
   */
  fullContent: z.string().optional(),
  domain: z.enum(Object.values(CC_BMC_DOMAINS) as [string, ...string[]]).optional(),
  metadata: z.object({
    agent_signature: z.enum(Object.values(AGENT_TYPES) as [string, ...string[]]).optional(),
    confidence: z.enum(['high', 'medium', 'low']).optional(),
    source: z.string().optional(),
    tags: z.array(z.string()).optional(),
    stage: z.enum(['planning', 'execution', 'review', 'decision']).optional()
  }).passthrough(),
  agentType: z.enum(Object.values(AGENT_TYPES) as [string, ...string[]]).optional(),
  isInteractive: z.boolean().optional(),
  severity: z.enum(['high', 'medium', 'low']).optional(),
  conflictType: z.enum(['resource-goal', 'compliance-business', 'channel-product', 'other']).optional()
})

export type MacraNodeData = z.infer<typeof MacraNodeDataSchema>

// ============== Intent 分类 ==============
export const IntentSchema = z.object({
  intent: z.enum(['generate_bmc', 'analyze', 'detect_conflicts', 'general', 'deep_research']),
  reasoning: z.string()
})

export type Intent = z.infer<typeof IntentSchema>

// ============== Supervisor Directive ==============
export type SupervisorDirective = {
  activeAgents: string[]       // 本轮需要执行的 Agent 节点名称（legacy 格式）
  guidance: string             // 给 Agent 的修正指导
  conflictSummary: string      // 上一轮的冲突摘要
  /** Phase C+: structured routing decisions from runSupervisorRegistry. */
  decisions?: RoutingDecision[]
}

// ============== Cross Context（Agent 间共享上下文） ==============
export type CrossContext = {
  marketSummary: string
  productSummary: string
  financeSummary: string
  consistencyNotes: string     // Synthesizer 的一致性报告（详细版）
  /**
   * Phase 2.6 · synthesizer TL;DR — 1-3 句的核心结论，渲染成"核心结论"卡片
   * 在 BMC 9 卡前/旁边显示，避免用户被详细分析淹没。`consistencyNotes`
   * 仍承载完整的跨维度推理、风险、一致性详情。
   */
  consistencySummary: string
}

export const EMPTY_CROSS_CONTEXT: CrossContext = {
  marketSummary: '',
  productSummary: '',
  financeSummary: '',
  consistencyNotes: '',
  consistencySummary: ''
}

// ============== Conflict with related agents ==============
export type CriticConflict = MacraNodeData & {
  relatedAgents?: string[]     // 需要修正的 Agent 类型
}

// ============== Seeded business state ==============
export type SeededBusinessState = {
  marketNodes: MacraNodeData[]
  productNodes: MacraNodeData[]
  financeNodes: MacraNodeData[]
  agentAvatars: MacraNodeData[]
  conflicts: CriticConflict[]
  edges: CanvasEdge[]
}

export const EMPTY_SEEDED_STATE: SeededBusinessState = {
  marketNodes: [],
  productNodes: [],
  financeNodes: [],
  agentAvatars: [],
  conflicts: [],
  edges: []
}

/**
 * ============== BLACKBOARD MODEL · 共享状态空间 ==============
 *
 * This `BusinessState` is the project's blackboard (per the design
 * task book §3.1, "黑板模型"). All 12 agents write into and read from
 * the same Annotation.Root — there's no point-to-point messaging.
 * The supervisor decides which agents run; each agent reads the
 * blackboard's current snapshot, computes its contribution, and the
 * reducer (default LangGraph last-write-wins per slot) merges the
 * partial state back. The next agent then reads the updated blackboard.
 *
 * Concretely, the slots below are the blackboard:
 *
 *   - traceId / workspaceId / userId / question  → context
 *   - intent / supervisorDirective / roundNumber → control
 *   - marketNodes / productNodes / financeNodes  → BMC cells (9 dims)
 *   - agentAvatars / edges                       → synthesizer output
 *   - conflicts                                  → critic output
 *   - debateTurns / debateVerdict                → debate B-loop
 *   - knowledgeEvidence / citations              → RAG evidence layer
 *   - userSkillPrompt / supervisorMemoryPrompt   → memory injection
 *
 * Why blackboard ≠ pipeline:
 *   - pipeline = each step transforms input → output, only adjacent
 *     stages communicate.
 *   - blackboard = ALL stages share global state; the critic reads
 *     market+product+finance simultaneously to find cross-dimension
 *     conflicts; the synthesizer reads the same to find cross-domain
 *     edges. Neither is possible in a strict pipeline.
 *
 * Why this matters for the thesis (§3.1):
 *   The user's task book required a blackboard model. We deliver it
 *   via LangGraph's `Annotation.Root` + `addNode/addEdge`/conditional
 *   edges. Persistence is via `langgraph-checkpointer` to PG so the
 *   blackboard survives restarts (HITL resume across processes works
 *   precisely because the blackboard is serialised at every step).
 *
 *   See `docs/blackboard-model.md` for a full architecture diagram.
 */
/**
 * P11.10 · Moderator verdict — the workshop facilitator's per-round
 * decision to continue iterating or accept the current canvas.
 *
 *   'continue' → critic conflicts warrant another revision round; route
 *                back to supervisor so generators can address them.
 *   'accept'   → conflicts are absent or low-impact; finalize the
 *                canvas and END the run.
 *
 * Set by runModerator after critic. Reads by the moderator-conditional
 * edge that replaces the older critic-conditional. Null when moderator
 * hasn't run (legacy / non-BMC intents that bypass moderator).
 */
export type ModeratorVerdict = 'continue' | 'accept' | null

/**
 * P11.13 / T4.4 · mergeById reducer.
 *
 * The default LangGraph reducer is `last-write-wins`: the most recent
 * Partial<State> update completely replaces the prior slot value. For
 * our cell arrays that's wrong — round 2 writing `marketNodes: [...]`
 * fully replaces round 1's array, but during a multi-round revision
 * round 2 typically only re-generates a SUBSET of cells (the ones with
 * critic conflicts). With last-write-wins, untouched cells from round 1
 * silently disappear when round 2's reduced array arrives.
 *
 * mergeById preserves prior entries by id and overlays new entries on
 * the same id (a true upsert). Combined with deterministic cell IDs
 * (e.g. market-customer-segments), revisions correctly overwrite the
 * SAME cell while leaving siblings untouched. Edges preserved similarly.
 *
 * Treats undefined/null updates as no-op (passes prior through).
 */
function mergeByIdReducer<T extends { id: string }>(prev: T[] | undefined, next: T[] | undefined): T[] {
  if (!next) return prev ?? []
  if (!prev || prev.length === 0) return next
  const map = new Map<string, T>()
  for (const item of prev) map.set(item.id, item)
  for (const item of next) map.set(item.id, item)
  return Array.from(map.values())
}

export const BusinessState = Annotation.Root({
  traceId: Annotation<string>(),
  workspaceId: Annotation<string>(),
  userId: Annotation<string>(),
  question: Annotation<string>(),
  contextPrompt: Annotation<string>(),
  intent: Annotation<Intent | null>(),
  roundNumber: Annotation<number>(),
  supervisorDirective: Annotation<SupervisorDirective | null>(),
  crossContext: Annotation<CrossContext>(),
  knowledgeEvidence: Annotation<KnowledgeEvidence[]>(),
  generalNodes: Annotation<MacraNodeData[]>(),
  marketNodes: Annotation<MacraNodeData[]>({
    reducer: mergeByIdReducer<MacraNodeData>,
    default: () => []
  }),
  productNodes: Annotation<MacraNodeData[]>({
    reducer: mergeByIdReducer<MacraNodeData>,
    default: () => []
  }),
  financeNodes: Annotation<MacraNodeData[]>({
    reducer: mergeByIdReducer<MacraNodeData>,
    default: () => []
  }),
  agentAvatars: Annotation<MacraNodeData[]>({
    reducer: mergeByIdReducer<MacraNodeData>,
    default: () => []
  }),
  conflicts: Annotation<CriticConflict[]>(),
  edges: Annotation<CanvasEdge[]>({
    reducer: mergeByIdReducer<CanvasEdge>,
    default: () => []
  }),
  /**
   * P11.18 / LangGraph audit fix · explicit null default.
   * Without this, early-exit intents (general / deep_research) leave
   * moderatorVerdict=undefined; the conditional edge at the END
   * comparison (`state.moderatorVerdict === 'continue'`) is safe
   * because undefined !== 'continue', but the Annotation contract
   * is cleaner with an explicit default.
   */
  moderatorVerdict: Annotation<ModeratorVerdict>({
    reducer: (_a, b) => b,
    default: () => null
  })
})

export type BusinessStateType = typeof BusinessState.State

/**
 * P15 S1 · Field-by-field contract for the BusinessState blackboard.
 *
 * Documents who-writes / who-reads / mutability for every slot. The type
 * is read-only structured data so service modules can introspect the
 * contract at boot (e.g. supervisor wiring asserts that every active
 * agent appears in `writers` of the slots it claims).
 *
 * If you add a slot to BusinessState above, add the corresponding entry
 * here. The agent-layer test suite asserts contract.length === Object.keys(
 * BusinessState.spec).length to keep these in sync.
 */
export type BusinessStateField = {
  slot: string
  /** What this slot stores in plain language. */
  description: string
  /** Service / phase that writes this slot. 'reducer' = mergeByIdReducer
   *  preserves prior values; 'last-write-wins' = standard LangGraph. */
  reducer: 'last-write-wins' | 'merge-by-id'
  /** Which services / methods are EXPECTED to write into this slot. */
  writers: ReadonlyArray<string>
  /** Which services / methods read from this slot to compute their work. */
  readers: ReadonlyArray<string>
  /** True if reset to default at the start of every revision round. */
  perRound: boolean
}

export const BUSINESS_STATE_CONTRACT: ReadonlyArray<BusinessStateField> = [
  // ----- Context (immutable across the run) -----
  {
    slot: 'traceId',
    description: 'Request-scoped trace ID; primary key for handoff log + OTel.',
    reducer: 'last-write-wins',
    writers: ['streamConversation init'],
    readers: ['*every service*', 'handoff log', 'audit logger'],
    perRound: false
  },
  {
    slot: 'workspaceId',
    description: 'Owning workspace; scopes memory + canvas writes.',
    reducer: 'last-write-wins',
    writers: ['streamConversation init'],
    readers: ['SupervisorService', 'GenerationService', 'memoryConsolidator'],
    perRound: false
  },
  {
    slot: 'userId',
    description: 'Owning user; scopes user-skill retrieval + audit identity.',
    reducer: 'last-write-wins',
    writers: ['streamConversation init'],
    readers: ['*memory layer*', 'auditLogger'],
    perRound: false
  },
  {
    slot: 'question',
    description: 'Verbatim user prompt for this run.',
    reducer: 'last-write-wins',
    writers: ['streamConversation init'],
    readers: ['SupervisorService.classifyIntent', 'GenerationService projection'],
    perRound: false
  },
  {
    slot: 'contextPrompt',
    description: 'Pre-rendered prompt block (workspace context + KB evidence).',
    reducer: 'last-write-wins',
    writers: ['streamConversation init'],
    readers: ['GenerationService projection', 'CriticService'],
    perRound: false
  },

  // ----- Control / routing -----
  {
    slot: 'intent',
    description: 'classifyIntent output: generate_bmc | analyze | detect_conflicts | general | deep_research.',
    reducer: 'last-write-wins',
    writers: ['SupervisorService.classifyIntent'],
    readers: ['SupervisorService.runSupervisor', 'createGraph routing'],
    perRound: false
  },
  {
    slot: 'roundNumber',
    description: 'Revision round counter; increments after critic conflicts trigger another loop.',
    reducer: 'last-write-wins',
    writers: ['SupervisorService.runSupervisor'],
    readers: ['*every service*'],
    perRound: false
  },
  {
    slot: 'supervisorDirective',
    description: 'Routing decisions + revision guidance for this round (active agents + RoutingDecision[]).',
    reducer: 'last-write-wins',
    writers: ['SupervisorService.runSupervisor', 'SupervisorService.runSupervisorRegistry'],
    readers: ['GenerationService', 'CriticService', 'createGraph isAgentActive'],
    perRound: true
  },
  {
    slot: 'crossContext',
    description: 'Inter-agent shared summaries (market/product/finance + synth notes).',
    reducer: 'last-write-wins',
    writers: ['SynthesisService.buildCrossContext'],
    readers: ['GenerationService projection (cross-context block)'],
    perRound: false
  },

  // ----- BMC cells (per-domain) -----
  {
    slot: 'marketNodes',
    description: 'Market-domain BMC cells (customer-segments / channels / customer-relationships).',
    reducer: 'merge-by-id',
    writers: ['GenerationService.runMarketAgent'],
    readers: ['CriticService', 'SynthesisService', 'StreamCoordinator delta emit'],
    perRound: false
  },
  {
    slot: 'productNodes',
    description: 'Product-domain BMC cells (value-prop / KP / KA / KR).',
    reducer: 'merge-by-id',
    writers: ['GenerationService.runProductAgent'],
    readers: ['CriticService', 'SynthesisService', 'StreamCoordinator'],
    perRound: false
  },
  {
    slot: 'financeNodes',
    description: 'Finance-domain BMC cells (revenue-streams / cost-structure).',
    reducer: 'merge-by-id',
    writers: ['GenerationService.runFinanceAgent'],
    readers: ['CriticService', 'SynthesisService', 'StreamCoordinator'],
    perRound: false
  },
  {
    slot: 'generalNodes',
    description: 'General-responder / deep-research insights (non-BMC).',
    reducer: 'last-write-wins',
    writers: ['GenerationService.runGeneralResponder', 'GenerationService.runDeepResearchAgent'],
    readers: ['StreamCoordinator delta emit'],
    perRound: false
  },

  // ----- Synthesizer / critic outputs -----
  {
    slot: 'agentAvatars',
    description: 'Agent presence avatars rendered onto the canvas (1 per active agent).',
    reducer: 'merge-by-id',
    writers: ['SynthesisService.buildAgentAvatars'],
    readers: ['StreamCoordinator delta emit'],
    perRound: false
  },
  {
    slot: 'edges',
    description: 'BMC edges + synthesizer cross-domain edges + user-drawn.',
    reducer: 'merge-by-id',
    writers: ['SynthesisService.buildBMCEdges', 'mention-router user-drawn'],
    readers: ['StreamCoordinator delta emit'],
    perRound: false
  },
  {
    slot: 'conflicts',
    description: 'Critic-detected conflicts as MacraNodeData with relatedAgents[].',
    reducer: 'last-write-wins',
    writers: ['CriticService.runCritic'],
    readers: ['DebateService.maybeRunDebates', 'SupervisorService (next round)'],
    perRound: true
  },
  {
    slot: 'knowledgeEvidence',
    description: 'KB-cited chunks for this run; flows from createBusinessStream init.',
    reducer: 'last-write-wins',
    writers: ['streamConversation init'],
    readers: ['GenerationService (citation parsing)', 'memoryConsolidator'],
    perRound: false
  },
  {
    slot: 'moderatorVerdict',
    description: "P11.10 — moderator's verdict to continue or accept after each critic round.",
    reducer: 'last-write-wins',
    writers: ['DebateService.runModerator'],
    readers: ['createGraph conditional edge to END'],
    perRound: true
  }
] as const

/**
 * Helper: assert at boot that the contract matches the runtime
 * Annotation.spec — guards against silent drift when slots are added
 * to BusinessState without a corresponding contract entry.
 */
export function assertBusinessStateContractInSync(): void {
  const annotationKeys = new Set(Object.keys(BusinessState.spec))
  const contractKeys = new Set(BUSINESS_STATE_CONTRACT.map((f) => f.slot))
  const missingFromContract: string[] = []
  for (const k of annotationKeys) {
    if (!contractKeys.has(k)) missingFromContract.push(k)
  }
  const missingFromAnnotation: string[] = []
  for (const k of contractKeys) {
    if (!annotationKeys.has(k)) missingFromAnnotation.push(k)
  }
  if (missingFromContract.length > 0 || missingFromAnnotation.length > 0) {
    throw new Error(
      `BUSINESS_STATE_CONTRACT drift: missing-from-contract=${JSON.stringify(missingFromContract)} missing-from-annotation=${JSON.stringify(missingFromAnnotation)}`
    )
  }
}

// ============== Stream Update 类型 ==============
export type GraphDelta = {
  nodes?: CanvasNode[]
  edges?: CanvasEdge[]
  removedNodeIds?: string[]
  removedEdgeIds?: string[]
}

export type BusinessStreamUpdate =
  | { type: 'init'; graph: CanvasGraph; knowledgeEvidence?: KnowledgeEvidence[] }
  | { type: 'delta'; delta: GraphDelta }
  | { type: 'status'; status: 'completed' | 'failed'; message?: string }
  | { type: 'interrupt'; decision: string; conflicts: MacraNodeData[] }
  | { type: 'handoff'; handoff: Handoff }
  /**
   * Subgraph progress event — emitted when a registered agent subgraph
   * yields an internal state update (ToolNode invocation, intermediate
   * LLM call, etc) BEFORE the subgraph's final output reaches the parent
   * graph as a node-level update. Only fires when `subgraphs: true` is
   * passed to graph.stream() (Fix #2 of LangGraph hygiene pass).
   *
   * - `ns` is the LangGraph namespace path: each entry is
   *   `<parentNode>:<subgraphCheckpointId>`.
   * - `nodeName` is the subgraph-internal node that produced the update
   *   (e.g. 'call-llm', 'tools', 'parse' for the BMC ReAct subgraph).
   * - `payloadKeys` lists which top-level keys of the subgraph state
   *   were updated; the values themselves are NOT forwarded to keep
   *   the stream payload bounded (full state lives in the subgraph
   *   checkpoint anyway).
   *
   * Frontend can render "market-agent is calling web-search…" by reading
   * `ns[0]` (parent node = 'marketAgent') + `nodeName` ('tools').
   */
  | {
      type: 'subagent-progress'
      ns: string[]
      nodeName: string
      payloadKeys: string[]
    }
  /**
   * P12 · Persistence-visibility passthrough. Emitted by streamConversation
   * when a persistence call inside the stream (e.g. writeConversationSummary)
   * fails. Conversation-store translates this into a ConversationEvent
   * of type 'persistence/warning' and publishes to subscribers, so the
   * front-end chat dock can render a yellow ⚠ bubble. The conversation
   * itself continues — this is NOT a terminal failure.
   *
   * `source` identifies the failing persistence call site for log-grep:
   * - 'canvas-graph': WorkspaceGraphStore.persistGraph (canvas_graphs upsert)
   * - 'conversation-summary': writeConversationSummary (memory_items)
   * - 'conversation-completion': persistConversationCompletion
   */
  | {
      type: 'persistence-warning'
      severity?: 'warning' | 'error'
      source: 'canvas-graph' | 'conversation-summary' | 'conversation-completion'
      message: string
    }
