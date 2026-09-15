import { create } from 'zustand'
import { addEdge, applyEdgeChanges, applyNodeChanges } from 'reactflow'
import type { Node, Edge, Connection, NodeChange, EdgeChange } from 'reactflow'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import { watchConversation } from '@/shared/lib/conversation-sync-engine'
import { applyCanvasLayout } from './canvas-layout-registry'
import { fetchWorkspaceGraphSnapshot } from '@/features/workspace/hooks/use-workspace-graph'
import type {
  MacraNodeData,
  MacraEdgeData,
  CanvasAction,
} from '@/types/macra'
import type { CanvasNode, CanvasEdge, WorkspaceGraphResponse } from '@/types/graph'
import {
  canTransitionWorkflowStage,
  type WorkflowStage
} from './workflow-stage'

// Chat 消息类型
type ChatScaffold = 'why' | 'how' | 'so_what' | 'evidence_needed' | 'meta'
type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  /** Set on assistant turns produced by the Socratic coach (reflectOnIdeation).
   *  Empty / undefined for plain BMC-generator responses. */
  scaffold?: ChatScaffold
  /** llm / scripted / error — provenance from the coach pipeline.
   *  P12 · 'persistence-warning' is emitted by the server when a
   *  durable write (canvas_graphs / memory_items / completion summary)
   *  failed but the conversation continues. Rendered as a yellow ⚠
   *  bubble in the chat dock — non-fatal, informational. */
  source?: 'llm' | 'scripted' | 'error' | 'persistence-warning'
  /** True for meta-check turns (auto-fired every N user messages). The
   *  chat-dock renders these with a "graduate to BMC" CTA so the user
   *  can transition from exploration → generation when AI deems the
   *  conversation has covered enough dimensions. */
  isMetaCheck?: boolean
  /** True for in-chat wizard turns (start / step / completion). The chat
   *  dock renders a "STEP N/7" kicker and the entry-point start message
   *  shows a Cancel CTA so the user can opt out. */
  isWizard?: boolean
}

/** In-chat wizard state. When `active=true`, regular chat send routes
 *  to processIdeationWizardStep (instead of reflectOnChat) and each
 *  reply advances the step counter. After step 7 completes, the
 *  startConversation pipeline auto-fires. */
export interface WizardChatState {
  active: boolean
  stepIndex: number
  history: Array<{
    step: string
    question: string
    answer: string
    extractedLabel: string | null
  }>
  /** Sprint 1.2 · per-step KB prefill snapshot. When the user opts in
   *  to KB pre-read, this map holds the AI-drafted answer per step.
   *  Empty when prefill was skipped or KB had no relevant content. */
  prefill: Record<string, {
    status: 'covered' | 'partial' | 'absent'
    draftAnswer: string
    confidence: number
    citations: Array<{ docId: string; snippet: string }>
  }>
}

const META_CHECK_INTERVAL = 3

// In-chat 7-step structured wizard. Mirrors the standalone /wizard
// page but bakes the questions into the chat dock so the user sees
// their canvas grow without changing surface.
const WIZARD_CHAT_STEPS: ReadonlyArray<{
  id: 'core-idea' | 'customer-pain' | 'value-angle' | 'hypothesis' | 'validation' | 'revenue' | 'risk'
  label: string
  description: string
}> = [
  { id: 'core-idea',     label: '核心想法',  description: '一句话讲清你想做什么。' },
  { id: 'customer-pain', label: '客户痛点',  description: '谁在为什么具体的问题挣扎？描述一个具体场景。' },
  { id: 'value-angle',   label: '价值切入',  description: '你独特的价值是什么、为什么是你来做？' },
  { id: 'hypothesis',    label: '关键假设',  description: '验证之前必须先成立的前提是什么？' },
  { id: 'validation',    label: '验证渠道',  description: '怎么以最小成本验证假设是真的？' },
  { id: 'revenue',       label: '收入模式',  description: '钱从哪来，最早愿付费的一种人是谁？' },
  { id: 'risk',          label: '主要风险',  description: '最可能让这事失败的 1-2 件事是什么？' }
]

const WIZARD_CHAT_MUTATION = /* GraphQL */ `
  mutation ProcessWizardStepFromChat($input: ProcessIdeationWizardStepInput!) {
    processIdeationWizardStep(input: $input) {
      extracted { kind label content }
      nextQuestion
      nextStep
    }
  }
`

const WIZARD_KB_PREFILL_MUTATION = /* GraphQL */ `
  mutation PrefillWizardFromKbInChat($workspaceId: ID!) {
    prefillWizardFromKb(workspaceId: $workspaceId) {
      kbNames
      chunksScanned
      items {
        step
        status
        draftAnswer
        confidence
        citations { docId snippet }
      }
    }
  }
`

const WIZARD_CHAT_START_CONVERSATION = /* GraphQL */ `
  mutation StartConversationFromChatWizard($workspaceId: ID!, $question: String!) {
    startConversation(workspaceId: $workspaceId, question: $question, headless: true) {
      metadata { id }
    }
  }
`

const CLEAR_WORKSPACE_CANVAS_MUTATION = /* GraphQL */ `
  mutation ClearWorkspaceCanvas($workspaceId: ID!) {
    clearWorkspaceCanvas(workspaceId: $workspaceId)
  }
`

// Undo / redo: a snapshot is a tuple of the four canvas-level slots
// that user actions can mutate. We deliberately exclude streaming /
// network state (workflowStage, evidenceDrawer, citations) — those are
// derived or remote, not user-undoable.
export interface CanvasSnapshot {
  nodes: Node[]
  edges: Edge[]
  macraNodes: Map<string, MacraNodeData>
  selectedNodeIds: string[]
}

const HISTORY_LIMIT = 30

function takeSnapshot(state: {
  nodes: Node[]
  edges: Edge[]
  macraNodes: Map<string, MacraNodeData>
  selectedNodeIds: string[]
}): CanvasSnapshot {
  // Shallow array clones are safe — ReactFlow node objects are treated
  // as immutable on the read path, and we always replace via setNodes
  // rather than mutate in-place. Map copy avoids future-vs-past aliasing.
  return {
    nodes: [...state.nodes],
    edges: [...state.edges],
    macraNodes: new Map(state.macraNodes),
    selectedNodeIds: [...state.selectedNodeIds]
  }
}

export type ToolRunStatus = 'idle' | 'running' | 'completed' | 'failed'

export type ToolRunState = {
  status: ToolRunStatus
  startedAt: string | null
  completedAt: string | null
  error: string | null
  resultSummary: string | null
  result: unknown | null
}

const idleToolRunState = (): ToolRunState => ({
  status: 'idle',
  startedAt: null,
  completedAt: null,
  error: null,
  resultSummary: null,
  result: null
})

// 节点数据类型（保留旧接口以兼容）
export type NodeStatus = 'idle' | 'processing' | 'done' | 'error'

export interface NodeData {
  id: string
  // Resource节点数据
  resourceContent?: File | string
  resourceType?: 'image' | 'document'
  resourceName?: string
  // Agent节点数据
  agentType?: string
  systemInstruction?: string
  agentResult?: string
  // 通用状态
  status: NodeStatus
  error?: string
}

type KnowledgeEvidence = {
  docId?: string
  snippet?: string
  id?: string
  title?: string
  content?: string
  source?: string
  score?: number
}

type EvidenceRef = {
  evidenceId: string
  docId: string
  snippetId: string
}

type CitationSpan = {
  textStart: number
  textEnd: number
  refs: EvidenceRef[]
}

type CardCitation = {
  cardId: string
  fieldName: string
  spans: CitationSpan[]
}

const createInitialChatMessages = (): ChatMessage[] => [
  {
    role: 'assistant',
    content: '你好！我是你的 AI 商业顾问。描述你的想法，让我们一起将它可视化。',
    timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
]

const START_CONVERSATION_MUTATION = /* GraphQL */ `
  mutation StartConversation($workspaceId: ID!, $question: String!, $kbId: ID) {
    startConversation(workspaceId: $workspaceId, question: $question, kbId: $kbId) {
      metadata {
        id
      }
      graph {
        workspaceId
        nodes {
          id
          type
          position {
            x
            y
          }
          data
        }
        edges {
          id
          source
          target
          label
        }
      }
    }
  }
`

let activeSubscription: (() => void) | null = null

const APPROVE_DECISION_MUTATION = /* GraphQL */ `
  mutation ApproveDecision($conversationId: ID!, $decision: String) {
    approveDecision(conversationId: $conversationId, decision: $decision)
  }
`

const MENTION_AGENT_MUTATION = /* GraphQL */ `
  mutation MentionAgent($input: MentionAgentInput!) {
    mentionAgent(input: $input) {
      agentId
      reply
      refused
      refusalReason
      appendedNodes { id }
      appendedEdges { id }
    }
  }
`

const MACRA_NODE_TYPES = new Set([
  'agent-avatar',
  'cc-bmc-card',
  'insight-note',
  'conflict-alert',
  'data-source',
  'report-card',
])

const mapCanvasNodeToReactFlow = (node: CanvasNode): Node => {
  const meta = (node.data as { meta?: { macraType?: string } } | undefined)?.meta
  const macraType = meta?.macraType

  const type = (() => {
    if (typeof macraType === 'string' && MACRA_NODE_TYPES.has(macraType)) {
      return macraType
    }
    if (MACRA_NODE_TYPES.has(node.type)) {
      return node.type
    }
    if (node.type === 'image') {
      return 'canvas-image'
    }
    return 'canvas-note'
  })()

  return {
    id: node.id,
    type,
    position: node.position,
    data: node.data
  }
}

/**
 * P11.13 · per-edge-kind visual styling. Each edge type tells a
 * different story; the canvas reads the kind tag and applies a
 * distinguishable style:
 *
 *   bmc-structure  default 9-edge BMC topology — light gray dashed,
 *                  what's been there from day 1
 *   llm-insight    synthesizer LLM cross-dim suggestion — synthesizer
 *                  byline tint (#6B6B7C) solid 1.5px so users can see
 *                  "this isn't structural; the synthesizer noticed
 *                  this connection"
 *   user-drawn     manual user connection — neutral mid-gray solid
 *                  1.25px to mark "I drew this myself"
 *   revision       round N→N+1 cell replacement — orange double-arrow
 *                  with round badge (P11.13 P3, future)
 */
const EDGE_KIND_STYLE: Record<string, { stroke: string; strokeWidth: number; strokeDasharray?: string }> = {
  'bmc-structure': { stroke: '#C6C6CD', strokeWidth: 1.25, strokeDasharray: '4 4' },
  'llm-insight':   { stroke: '#6B6B7C', strokeWidth: 1.5  /* solid */ },
  'user-drawn':    { stroke: '#4A4744', strokeWidth: 1.25 /* solid */ },
  'revision':      { stroke: '#C26A1F', strokeWidth: 1.5  /* solid */ }
}

const mapCanvasEdgeToReactFlow = (edge: CanvasEdge): Edge => {
  const kind = edge.kind ?? 'bmc-structure'
  const style = EDGE_KIND_STYLE[kind] ?? EDGE_KIND_STYLE['bmc-structure']
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: 'smoothstep',
    data: { kind },
    style
  }
}

const mergeById = <T extends { id: string }>(current: T[], updates?: T[]) => {
  if (!updates || updates.length === 0) return current
  const merged = new Map(current.map((item) => [item.id, item]))
  updates.forEach((item) => merged.set(item.id, item))
  return [...merged.values()]
}

interface MacraState {
  workspaceId: string

  // ReactFlow节点和边
  nodes: Node[]
  edges: Edge[]

  // 当前画布上被选中的节点 id 集合（来自 ReactFlow 的 onSelectionChange）
  selectedNodeIds: string[]

  // 撤销 / 重做历史栈（仅记录用户级别的画布快照）
  history: {
    past: CanvasSnapshot[]
    future: CanvasSnapshot[]
  }

  // 拖拽进行中标记（内部状态）—— 用于在 onNodesChange 里识别"首次拖拽 tick"，
  // 这样我们只在拖拽开始那一刻 push 一次 history snapshot，不在每个 drag tick
  // 都 push（否则 cmd+z 一次只能撤销 1px）。
  _dragInProgress: boolean

  // 节点数据存储（兼容旧版本）
  nodeDataMap: Map<string, NodeData>

  // MACRA 节点数据存储（新版本）
  macraNodes: Map<string, MacraNodeData>

  // 执行状态
  executingNodeId: string | null
  executionQueue: string[]

  // AI 状态
  isOrchestratorProcessing: boolean
  /** True only while a Socratic chat reflection is in flight. Separate
   *  from isOrchestratorProcessing so the full-canvas thinking overlay
   *  doesn't pop for a single-turn coach reply (lighter typing-dots in
   *  chat dock are enough). isOrchestratorProcessing remains reserved
   *  for the BMC 8-agent pipeline. */
  chatReflecting: boolean
  /** Counts user messages since last meta-check fire. Used to throttle
   *  the auto-meta-check that lets the AI itself decide when the user
   *  has explored enough to graduate to BMC generation. */
  socraticTurnCounter: number
  isCriticProcessing: boolean
  lastCriticRun: number | null

  // 研讨会轮次状态
  roundNumber: number
  maxRounds: number
  pendingInterrupt: { decision: string; conflicts: unknown[] } | null
  /**
   * Sprint 3.3 · Coach real progress.
   * The agent that emitted the most-recent node delta in the current
   * stream — coach shows this instead of cycling a static ticker.
   * Set inside applyDelta when new nodes arrive; cleared on workflow
   * completion / cancel / fresh session.
   */
  currentAgent: string | null
  /**
   * Sprint 3.3 · Last node delta timestamp (ms epoch) — Coach uses
   * this to decide whether to show "<agent> 计算中" vs falling back
   * to the heartbeat ticker when the stream goes quiet for >8s.
   */
  lastDeltaAt: number | null
  /**
   * Sprint 4.4 · Timestamp (ms epoch) when the most recent live
   * stream transitioned into a terminal state (output/cancelled/
   * failed). Coach uses this to show a transient completion banner
   * for ~12s after pipeline ends.
   */
  lastCompletionAt: number | null

  // 详情面板状态
  detailPanel: {
    isOpen: boolean
    nodeId: string | null
  }

  /**
   * Focused conflict id for the Insight Panel · 审查 tab.
   *
   * Set by report-writer renderer chips ([[critic:conflict-xxx]]) so the
   * Insight Panel can auto-switch to the 审查 tab and inline-expand the
   * matching row. Canvas page subscribes to this and pipes it down to
   * CanvasCitationPanel via prop. Cleared when the panel closes (or
   * when the user manually picks a different conflict).
   */
  focusedConflictId: string | null
  setFocusedConflictId: (id: string | null) => void

  // 知识库证据
  knowledgeEvidence: KnowledgeEvidence[]
  setKnowledgeEvidence: (evidence: KnowledgeEvidence[]) => void

  /**
   * P11.14 · sub-agent live activity. Server emits 'agent/subagent-progress'
   * events from the BMC ReAct subgraph's internal nodes (call-llm, tools,
   * parse). Wire-panel widget displays the most recent so users see
   * "市场分析专家 · 调用 web-search…" while the workshop runs. Cleared
   * on conversation completion / failure / explicit reset.
   */
  subAgentActivity: { parentNode: string; nodeName: string; ts: number } | null
  setSubAgentActivity: (next: { parentNode: string; nodeName: string; ts: number } | null) => void

  /** P13 · most recent SeminarPhase from `phase.changed` events. Drives
   *  the canvas stage strip's per-stage running/done determination
   *  alongside macraNodes counts. null on a fresh canvas / before the
   *  first stream tick. */
  lastPhase: 'planning' | 'execution' | 'review' | 'decision' | null
  setLastPhase: (phase: 'planning' | 'execution' | 'review' | 'decision' | null) => void
  /** P13 · stream emitted a status='failed' event during the current run.
   *  Stage strip uses this to show a red ⚠ on the active stage. Reset to
   *  false at the start of every new stream. */
  hasStreamFailed: boolean
  setHasStreamFailed: (failed: boolean) => void

  // Cell-level citations (Stage 3 创新核心 UI)
  citations: Record<string /* cardId */, CardCitation[]>
  setCardCitation: (cardId: string, citation: CardCitation) => void
  clearCitations: () => void

  // Evidence Drawer 交互状态
  evidenceDrawer: {
    isOpen: boolean
    focusedEvidenceId: string | null
    focusedSpanIndex: number | null
    highlightedCardIds: string[]
  }
  openEvidenceDrawer: (evidenceId: string, spanIndex?: number) => void
  closeEvidenceDrawer: () => void
  highlightCardsReferencingEvidence: (cardIds: string[]) => void
  clearCitationHighlight: () => void

  // 当前会话 id (供前端反查 / drawer 使用)
  currentConversationId: string | null

  workflowStage: WorkflowStage
  workflowMeta: {
    startedAt: string | null
    lastError: string | null
    lastTransitionReason: string | null
  }
  setWorkflowStage: (stage: WorkflowStage, reason?: string) => void

  // Tool drawer / invocation UI
  activeToolId: string | null
  toolRunStates: Record<string, ToolRunState>
  openToolDrawer: (toolId: string) => void
  closeToolDrawer: () => void
  setToolRunState: (toolId: string, patch: Partial<ToolRunState>) => void

  // Chat 状态（新增）
  chatInput: string
  chatMessages: ChatMessage[]
  setChatInput: (input: string) => void
  setChatMessages: (messages: ChatMessage[] | ((msgs: ChatMessage[]) => ChatMessage[])) => void
  appendChatMessage: (message: Omit<ChatMessage, 'timestamp'>) => void

  /** In-chat 7-step wizard state. See WizardChatState comments. */
  wizardChat: WizardChatState
  /** Open the in-chat wizard. When `withKbPrefill` is true (default),
   *  triggers the LLM pre-read of any KB content for the workspace
   *  and shows a step-by-step suggestion preview the user can confirm
   *  or override. Otherwise starts the legacy 7-step from-scratch flow.
   */
  startWizardInChat: (workspaceId?: string, withKbPrefill?: boolean) => Promise<void>

  /** Sprint 1.5 · Archive (hide) all current canvas nodes so a new BMC
   *  session has a clean visual slate. Nodes are NOT deleted from PG;
   *  they're moved to a hidden bucket via `archivedAt` flag. Subsequent
   *  pipelines emit fresh nodes that don't visually pile up. */
  archiveCurrentCanvasForFreshSession: () => void
  /** Cancel the wizard mid-flow (chat returns to normal mode). */
  endWizardInChat: () => void
  /** Submit the user's answer for the current wizard step. Calls the
   *  GraphQL processIdeationWizardStep mutation, appends both the user
   *  message + the AI's next-question reply, drops an insight node
   *  onto the canvas, and advances stepIndex. After step 7 completes,
   *  fires startConversation to launch the 8-agent pipeline.
   *
   *  workspaceId is needed to scope the mutation + the kick-off seed.
   */
  submitWizardChatAnswer: (workspaceId: string, answer: string) => Promise<void>

  setWorkspaceId: (workspaceId: string) => void

  // 操作方法
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void
  setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void

  // 多选 / 批量删除
  setSelectedNodeIds: (ids: string[]) => void
  deleteSelectedNodes: () => void

  // JSON 导入 / 导出（用户保存当前画布到本地文件 + 还原）
  exportCanvasJson: () => string
  importCanvasJson: (json: string) => void

  // Undo / redo — 仅在用户级别动作前调用 pushHistorySnapshot；AI stream
  // 引发的 setNodes 不入栈，否则用户 cmd+z 一次会撤掉一整批 LLM 输出。
  pushHistorySnapshot: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // 节点数据操作（兼容旧版本）
  getNodeData: (nodeId: string) => NodeData | undefined
  updateNodeData: (nodeId: string, data: Partial<NodeData>) => void
  setNodeStatus: (nodeId: string, status: NodeStatus) => void

  // MACRA 节点操作（新版本）
  getMacraNode: (nodeId: string) => MacraNodeData | undefined
  updateMacraNode: (nodeId: string, data: Partial<MacraNodeData>) => void
  createMacraNode: (node: MacraNodeData) => void
  deleteMacraNode: (nodeId: string) => void

  // Canvas Actions 操作
  applyCanvasActions: (actions: CanvasAction[]) => Promise<void>

  // Business LangGraph 调用（通过 GraphQL startConversation）
  callLangGraph: (userPrompt: string, mode?: 'seed' | 'completion' | 'general', kbId?: string) => Promise<void>

  // 通过 conversationId 从 server 拉回已有会话状态（resume 流程：用户从
  // /chat 主页进 /canvas 后，画布需要从 GraphQL 把 server 已生成的节点 +
  // 历史消息 + KB evidence + citations 全部填回前端 store。
  // 找不到 conversation 时静默返回，调用方按 fresh canvas 处理）。
  hydrateFromConversation: (conversationId: string) => Promise<{ workspaceId: string } | null>

  /**
   * Sprint 1.4 · Active-session reconnect.
   *
   * On canvas page mount, if a previous browser tab kicked off a pipeline
   * that's still running on the server (e.g. user navigated away mid-run
   * or refreshed), re-attach the live subscription so progress resumes
   * streaming into this tab. Idempotent — no-ops when no running session
   * is found, or when the store already has a current conversation.
   *
   * Returns the conversationId we reattached to, or null.
   */
  reattachToActiveSession: (workspaceId: string) => Promise<string | null>

  /**
   * Sprint 4.1 · User-initiated cancellation of the running pipeline.
   * Calls the cancelStaleSession mutation server-side (which marks the
   * session as failed and signals the runtime via the heartbeat path),
   * then transitions the local workflow to 'cancelled' so the Coach
   * banner shows. No-op when there's no current conversation.
   */
  cancelActiveSession: (reason?: string) => Promise<boolean>

  // 苏格拉底式反问 - 调 server reflectOnIdeation，把当前 canvas snapshot
  // + 最近 chat 历史 + 用户新消息打包发过去，返回单条 scaffold 类型的反问
  // (why / how / so_what / evidence_needed / meta)。和 callLangGraph 区
  // 别：那个是触发 8-agent BMC 生成 pipeline；这个是单轮反思教练，不动节点。
  reflectOnChat: (userMessage: string) => Promise<void>

  // @-mention agent (2026-05-04). Routes a chat message to a specific
  // agent via GraphQL mentionAgent mutation; updates chat + canvas with
  // the result. Refusals (e.g. critic without BMC) come back as
  // assistant messages with refused=true and no canvas mutation.
  mentionAgent: (agentId: string, message: string) => Promise<void>

  // AI Critic 调用（通过 GraphQL 后端自动触发，前端保留手动触发接口）
  callCritic: () => Promise<void>

  // HITL 决策
  approveDecision: (conversationId: string, decision?: string) => Promise<void>
  dismissInterrupt: () => void

  // 详情面板操作
  openDetailPanel: (nodeId: string) => void
  closeDetailPanel: () => void

  // 工作流执行（兼容旧版本）
  executeWorkflow: () => Promise<void>
  executeNode: (nodeId: string) => Promise<void>

  // 重置
  reset: () => void
}

export const useComfyStore = create<MacraState>((set, get) => ({
  workspaceId: 'canvas-default',
  nodes: [],
  edges: [],
  selectedNodeIds: [],
  history: { past: [], future: [] },
  _dragInProgress: false,
  nodeDataMap: new Map(),
  macraNodes: new Map(),
  executingNodeId: null,
  executionQueue: [],
  isOrchestratorProcessing: false,
  chatReflecting: false,
  socraticTurnCounter: 0,
  isCriticProcessing: false,
  lastCriticRun: null,
  roundNumber: 0,
  maxRounds: 3,
  pendingInterrupt: null,
  currentAgent: null,
  lastDeltaAt: null,
  lastCompletionAt: null,
  knowledgeEvidence: [],
  subAgentActivity: null,
  setSubAgentActivity: (next) => set({ subAgentActivity: next }),
  // P13 · stage-strip drivers. lastPhase is set by the conversation event
  // handler when 'phase.changed' arrives; hasStreamFailed reset at every
  // stream start.
  lastPhase: null,
  setLastPhase: (phase) => set({ lastPhase: phase }),
  hasStreamFailed: false,
  setHasStreamFailed: (failed) => set({ hasStreamFailed: failed }),
  citations: {},
  evidenceDrawer: {
    isOpen: false,
    focusedEvidenceId: null,
    focusedSpanIndex: null,
    highlightedCardIds: []
  },
  currentConversationId: null,
  workflowStage: 'idle',
  workflowMeta: {
    startedAt: null,
    lastError: null,
    lastTransitionReason: null
  },
  activeToolId: null,
  toolRunStates: {},
  chatInput: '',
  chatMessages: createInitialChatMessages(),
  wizardChat: { active: false, stepIndex: 0, history: [], prefill: {} },
  detailPanel: {
    isOpen: false,
    nodeId: null
  },
  focusedConflictId: null,
  setKnowledgeEvidence: (evidence) => {
    if (get().knowledgeEvidence === evidence) return
    set({ knowledgeEvidence: evidence })
  },

  setCardCitation: (cardId, citation) => {
    set((state) => ({
      citations: { ...state.citations, [cardId]: [...(state.citations[cardId] ?? []).filter((c) => c.fieldName !== citation.fieldName), citation] }
    }))
  },

  clearCitations: () => {
    set({ citations: {} })
  },

  openEvidenceDrawer: (evidenceId, spanIndex) => {
    set({
      evidenceDrawer: {
        isOpen: true,
        focusedEvidenceId: evidenceId,
        focusedSpanIndex: spanIndex ?? null,
        highlightedCardIds: []
      }
    })
  },

  closeEvidenceDrawer: () => {
    set((state) => ({
      evidenceDrawer: {
        ...state.evidenceDrawer,
        isOpen: false,
        focusedSpanIndex: null
      }
    }))
  },

  highlightCardsReferencingEvidence: (cardIds) => {
    set((state) => ({
      evidenceDrawer: {
        ...state.evidenceDrawer,
        highlightedCardIds: cardIds
      }
    }))
  },

  clearCitationHighlight: () => {
    set((state) => ({
      evidenceDrawer: {
        ...state.evidenceDrawer,
        highlightedCardIds: []
      }
    }))
  },

  setWorkflowStage: (stage, reason) => {
    const currentStage = get().workflowStage
    if (!canTransitionWorkflowStage(currentStage, stage)) {
      console.warn(`[workflow] illegal transition ${currentStage} -> ${stage}`)
      return
    }

    // Sprint 3.3 · clear currentAgent when leaving live states.
    const isLeavingLive =
      (currentStage === 'thinking' || currentStage === 'revising') &&
      stage !== 'thinking' &&
      stage !== 'revising'

    set((state) => ({
      workflowStage: stage,
      currentAgent: isLeavingLive ? null : state.currentAgent,
      lastCompletionAt: isLeavingLive ? Date.now() : state.lastCompletionAt,
      workflowMeta: {
        startedAt:
          stage === 'thinking'
            ? new Date().toISOString()
            : state.workflowMeta.startedAt,
        lastError:
          stage === 'failed'
            ? state.workflowMeta.lastError ?? 'Workflow failed'
            : state.workflowMeta.lastError,
        lastTransitionReason: reason ?? null
      }
    }))
  },

  openToolDrawer: (toolId) => {
    set({ activeToolId: toolId })
    const currentStage = get().workflowStage
    if (canTransitionWorkflowStage(currentStage, 'input')) {
      get().setWorkflowStage('input', `tool-opened:${toolId}`)
    }
  },

  closeToolDrawer: () => {
    set({ activeToolId: null })
  },

  setToolRunState: (toolId, patch) => {
    set((state) => ({
      toolRunStates: {
        ...state.toolRunStates,
        [toolId]: {
          ...(state.toolRunStates[toolId] ?? idleToolRunState()),
          ...patch
        }
      }
    }))
  },

  setChatInput: (chatInput) => {
    if (get().chatInput === chatInput) return
    set({ chatInput })
  },

  setChatMessages: (messages) => {
    const nextMessages = typeof messages === 'function' ? messages(get().chatMessages) : messages
    if (nextMessages === get().chatMessages) return
    set({ chatMessages: nextMessages })
    // P10 fix · persist chat to localStorage so it survives page reload.
    // Helper exists in conversations-persistence.ts but was never wired.
    // Now: every setChatMessages saves the current workspace's bucket.
    const wsId = get().workspaceId
    if (wsId && typeof window !== 'undefined') {
      try {
        const stored = nextMessages.map((m) => ({
          role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.content,
          timestamp: m.timestamp || new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        }))
        const title = stored.find((m) => m.role === 'user')?.content?.slice(0, 24) || '当前会话'
        const nowIso = new Date().toISOString()
        window.localStorage.setItem(
          `starlink_conversations_${wsId}`,
          JSON.stringify({
            conversations: [{
              id: 'active',
              title: title.length > 22 ? `${title.slice(0, 22)}…` : title,
              messages: stored,
              createdAt: nowIso,
              updatedAt: nowIso
            }],
            activeId: 'active'
          })
        )
      } catch {
        // quota / serialize — silent, in-memory state still consistent
      }
    }
  },

  appendChatMessage: (message) => {
    get().setChatMessages((currentMessages) => [
      ...currentMessages,
      {
        ...message,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      }
    ])
  },

  startWizardInChat: async (workspaceId, withKbPrefill = true) => {
    if (get().wizardChat.active) return
    set({ wizardChat: { active: true, stepIndex: 0, history: [], prefill: {} } })

    // P12 fix M1 · immediate user feedback. KB prefill below can take
    // 15-20s on first run (7 vector queries + RRF + LLM scoring). Without
    // this loader bubble, clicking 向导 looks like "nothing happens" and
    // users either click again (no-op due to active guard) or assume the
    // button is broken. The loader is replaced by the actual prefillSummary
    // once the GraphQL response arrives.
    const loaderTs = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    if (workspaceId && withKbPrefill) {
      get().appendChatMessage({
        role: 'assistant',
        content: '⏳ 正在启动 7 步向导，AI 在扫描知识库中…（首次会读取 ≤ 20s）',
        timestamp: loaderTs,
        source: 'scripted'
      })
    }

    // Sprint 1.2 · KB pre-read. If the workspace has KB content, run
    // a one-shot prefill and show the user a summary. The user can:
    //   - 跳过覆盖步骤：在已 covered 的 step 直接输入 /next 或确认按钮
    //   - 编辑草稿：textarea 已预填，按 Enter 提交
    //   - 重新输入：清空 textarea 输入新内容
    let prefillSummary: string | null = null
    const prefill: WizardChatState['prefill'] = {}
    if (workspaceId && withKbPrefill) {
      try {
        const { getGraphQLClient } = await import('@/shared/lib/graphql-client')
        const client = getGraphQLClient()
        const r = await client.request<{
          prefillWizardFromKb: {
            kbNames: string[]
            chunksScanned: number
            items: Array<{
              step: string
              status: 'covered' | 'partial' | 'absent'
              draftAnswer: string
              confidence: number
              citations: Array<{ docId: string; snippet: string }>
            }>
          }
        }>(WIZARD_KB_PREFILL_MUTATION, { workspaceId })
        const result = r.prefillWizardFromKb
        const covered = result.items.filter((i) => i.status === 'covered').length
        const partial = result.items.filter((i) => i.status === 'partial').length
        if (result.kbNames.length > 0 && (covered > 0 || partial > 0)) {
          for (const item of result.items) {
            prefill[item.step] = {
              status: item.status,
              draftAnswer: item.draftAnswer,
              confidence: item.confidence,
              citations: item.citations
            }
          }
          prefillSummary = [
            `📚 已读完 KB · ${result.kbNames.join(' / ')}（${result.chunksScanned} 个 chunk）`,
            ``,
            ...result.items.map((it, i) => {
              const stepLabel = WIZARD_CHAT_STEPS[i]?.label ?? it.step
              const icon = it.status === 'covered' ? '✓' : it.status === 'partial' ? '◐' : '○'
              const note = it.status === 'covered'
                ? `已找到答案（信心 ${(it.confidence * 100).toFixed(0)}%）`
                : it.status === 'partial'
                ? `部分覆盖（信心 ${(it.confidence * 100).toFixed(0)}%）`
                : '需要你来回答'
              return `${icon} **${stepLabel}** — ${note}`
            }),
            ``,
            `> 我会把已找到的答案预填到每一步。你可以直接 Enter 确认、或修改后提交。`
          ].join('\n')
          set({ wizardChat: { active: true, stepIndex: 0, history: [], prefill } })
        }
      } catch (err) {
        // KB prefill is opt-in / best-effort; absence shouldn't break wizard.
        // eslint-disable-next-line no-console
        console.warn('[wizard] KB prefill skipped:', err)
      }
    }

    if (prefillSummary) {
      get().appendChatMessage({
        role: 'assistant',
        content: prefillSummary,
        source: 'llm',
        isWizard: true
      })
    }

    const firstStep = WIZARD_CHAT_STEPS[0]
    const firstStepPrefill = prefill[firstStep.id]
    const draftHint =
      firstStepPrefill && firstStepPrefill.status !== 'absent' && firstStepPrefill.draftAnswer
        ? `\n\n💡 **从 KB 抽到的草稿**（直接 Enter 确认，或修改）：\n> ${firstStepPrefill.draftAnswer}`
        : ''
    get().appendChatMessage({
      role: 'assistant',
      content: `**STEP 1/${WIZARD_CHAT_STEPS.length} · ${firstStep.label}**

${firstStep.description}${draftHint}

> 直接在下面输入答案，详细一点说，多两句话比一句话好；输入 \`/cancel\` 退出向导。`,
      source: 'scripted',
      isWizard: true
    })

    // Sprint 1.2 · pre-fill the chat input box with the KB draft so user
    // can hit Enter to confirm.
    if (firstStepPrefill?.draftAnswer && firstStepPrefill.status !== 'absent') {
      get().setChatInput(firstStepPrefill.draftAnswer)
    }
  },

  archiveCurrentCanvasForFreshSession: () => {
    // Mark all macra nodes archived in metadata (UI-side hide). The
    // server-side canvas_graphs row keeps full history; pipelines just
    // overwrite based on id, so we drop the visible references in the
    // store. Useful before kicking off a new wizard graduation so the
    // user sees only the new session's output.
    const { macraNodes, nodes, edges } = get()
    const archivedAt = new Date().toISOString()
    const archivedMacra = new Map<string, MacraNodeData>()
    macraNodes.forEach((m, id) => {
      archivedMacra.set(id, {
        ...m,
        metadata: { ...(m.metadata ?? {}), archivedAt }
      })
    })
    set({
      // Clear the visible ReactFlow state so the canvas looks fresh.
      // Server-persisted snapshot is untouched; replay can rehydrate.
      nodes: [],
      edges: [],
      // Keep macraNodes in memory so the user can "undo" if needed,
      // but they're hidden from canvas. Future improvement: store in
      // a separate `archivedMacraNodes` slot rather than mutating.
      macraNodes: archivedMacra,
      // P9 Block 5a · close detail panel and clear focused conflict so
      // user doesn't see a drawer pointing to an archived node (which
      // null-derefs in the drawer component when it tries to find the
      // node in the now-emptied nodes[] array).
      detailPanel: { isOpen: false, nodeId: null },
      focusedConflictId: null,
      pendingInterrupt: null,
      // P13 · archive marks the canvas as "starting a fresh session" —
      // clear stage-strip drivers so the strip doesn't carry the previous
      // pipeline's phase / failure into the wizard graduation flow.
      lastPhase: null,
      hasStreamFailed: false,
      subAgentActivity: null
    })
    // Keep editor & selection state out of the way.
    void nodes
    void edges
  },

  endWizardInChat: () => {
    if (!get().wizardChat.active) return
    set({ wizardChat: { active: false, stepIndex: 0, history: [], prefill: {} } })
    get().appendChatMessage({
      role: 'assistant',
      content: '✗ 已退出向导。继续 @ agent 自由提问，或重新输入 `/wizard` 开始 7 步引导。',
      source: 'scripted'
    })
  },

  submitWizardChatAnswer: async (workspaceId, answer) => {
    const { wizardChat, appendChatMessage } = get()
    if (!wizardChat.active) return
    const trimmed = answer.trim()
    if (!trimmed) return
    const currentStep = WIZARD_CHAT_STEPS[wizardChat.stepIndex]
    if (!currentStep) return

    // 1. user message in chat
    appendChatMessage({
      role: 'user',
      content: trimmed
    })

    try {
      const recentChat = wizardChat.history.flatMap((h) => [
        { role: 'ai', content: h.question },
        { role: 'user', content: h.answer }
      ])
      const canvasNodes = wizardChat.history
        .filter((h) => h.extractedLabel)
        .map((h) => ({ id: `${h.step}-prev`, kind: h.step, label: h.extractedLabel ?? '', content: h.answer }))

      const { getGraphQLClient } = await import('@/shared/lib/graphql-client')
      const client = getGraphQLClient()
      const response = await client.request<{
        processIdeationWizardStep: {
          extracted: { kind: string; label: string; content: string } | null
          nextQuestion: string
          nextStep: string
        }
      }>(WIZARD_CHAT_MUTATION, {
        input: {
          step: currentStep.id,
          userAnswer: trimmed,
          canvas: { nodes: canvasNodes, edgeCount: 0 },
          recentChat,
          workspaceId
        }
      })
      const result = response.processIdeationWizardStep
      const extracted = result?.extracted ?? null

      // P12 fix · DON'T drop per-step insight-notes onto the canvas.
      // Previously each wizard answer spawned an `insight-note` node
      // (`insight-wizard-<stepId>-<ts>`) which made the canvas look
      // chaotic — 7 nodes scattering as the user typed, before the
      // real BMC pipeline even ran. The wizard history is already
      // tracked in `wizardChat.history` (in-memory) and the final
      // graduation step rebuilds the canvas from scratch with the
      // BMC pipeline. The intermediate nodes were pure visual noise.
      //
      // We still keep `extracted` available in `wizardChat.history`
      // (via extractedLabel) so the graduation summary can list
      // "7 steps captured". And the BMC pipeline gets the full
      // answer text via the seed string in onWizardComplete, so no
      // information is lost.

      // 3. Update wizard state — record this step's history
      const nextHistory = [
        ...wizardChat.history,
        {
          step: currentStep.id,
          question: currentStep.description,
          answer: trimmed,
          extractedLabel: extracted?.label ?? null
        }
      ]
      const nextIndex = wizardChat.stepIndex + 1
      const isLast = nextIndex >= WIZARD_CHAT_STEPS.length

      if (isLast) {
        // 7 steps done — auto-graduate to BMC pipeline.
        set({ wizardChat: { active: false, stepIndex: 0, history: [], prefill: {} } })
        const summary = nextHistory
          .map((h, i) => `${i + 1}. ${WIZARD_CHAT_STEPS[i]?.label ?? h.step}：${h.answer}`)
          .join('\n')
        appendChatMessage({
          role: 'assistant',
          content: `✓ 7 步采集完成。已记录 ${nextHistory.filter((h) => h.extractedLabel).length} 条结构化线索（保存在向导历史中，画布暂不展示，避免视觉混乱）。

**下一步**：8 个 agent 开始协作生成完整 BMC（headless 模式不卡 HITL）。画布会清空旧节点后逐步浮现新内容。`,
          source: 'scripted',
          isWizard: true
        })
        // Sprint 1.5 · archive existing canvas nodes so the new BMC
        // doesn't visually pile up on top of stale ones.
        get().archiveCurrentCanvasForFreshSession()
        // Issue 3 · server-side wipe — the client-side archive only
        // hides nodes in this tab; on reload the server's persisted
        // canvas brings them all back. Clear the canvas_graphs row so
        // the new pipeline writes onto a clean slate. Best-effort: if
        // the mutation fails we still proceed, just with leftovers.
        try {
          const { getGraphQLClient: gql } = await import('@/shared/lib/graphql-client')
          await gql().request(CLEAR_WORKSPACE_CANVAS_MUTATION, { workspaceId })
        } catch (clearErr) {
          // P9 Block 4a · surface to user, not just console.warn —
          // canvas was already archived locally; if server clear fails
          // user sees a blank canvas with no explanation.
          console.warn('[wizard] clearWorkspaceCanvas failed', clearErr)
          appendChatMessage({
            role: 'assistant',
            content: `⚠ 服务端画布清理失败（不影响本地刷新视觉效果）：${clearErr instanceof Error ? clearErr.message : String(clearErr)}`,
            source: 'error',
            isWizard: true
          })
        }
        // Sprint 2.3 · STRONG seed framing — 7 答案是用户亲口确认的事
        // 实，agents 不能改写、只能扩展/反驳。这避免初始 BMC 输出偏离
        // 用户的实际意图。
        const seed = `[用户亲述 · 不可改写] 以下 7 段是用户通过结构化向导逐步确认的商业意图。请将每段视作 ground-truth user-attested fact，agents 在生成 BMC 时必须严格基于这些事实展开（可以扩展、补充、反驳，但不能改写或忽略）：\n\n${summary}\n\n---\n\n请基于以上结构化输入生成完整 BMC（9 维度），并在每个 cell 中明确引用对应的 wizard 答案编号。`
        try {
          const startMod = await import('@/shared/lib/graphql-client')
          const kickResp = await startMod.getGraphQLClient().request<{
            startConversation: { metadata: { id: string } }
          }>(WIZARD_CHAT_START_CONVERSATION, {
            workspaceId,
            question: seed
          })
          // Bug-fix · subscribe to the running session so progress
          // events flow into this tab. Without this, the server runs
          // the 8-agent pipeline successfully but the frontend never
          // sees the graph deltas (Coach stays at "INSIGHTS · 已采集"
          // and BMC count stays at 0/9). reattachToActiveSession is
          // designed for exactly this reconnect — it queries the
          // running session, paints the graph snapshot, and subscribes
          // to the progress stream.
          const newId = kickResp.startConversation?.metadata?.id
          if (newId) {
            // Set workflow stage but NOT isOrchestratorProcessing yet —
            // reattachToActiveSession early-returns when that flag is
            // truthy. Reattach will paint the graph snapshot + start
            // a watcher; the watcher controls isOrchestratorProcessing.
            set({
              currentConversationId: null,
              workflowStage: 'thinking'
            })
            await get().reattachToActiveSession(workspaceId)
          }
        } catch (kickErr) {
          appendChatMessage({
            role: 'assistant',
            content: `⚠ BMC pipeline 启动失败：${kickErr instanceof Error ? kickErr.message : String(kickErr)}`,
            source: 'error'
          })
        }
      } else {
        // Advance to next step.
        const nextStep = WIZARD_CHAT_STEPS[nextIndex]
        set({ wizardChat: { ...wizardChat, stepIndex: nextIndex, history: nextHistory } })
        const extractedLine = extracted
          ? `✓ 抽到「${extracted.label}」→ 已加到画布\n\n`
          : ''
        // Sprint 1.2 · attach KB-derived draft for the upcoming step
        // when prefill exists. Non-absent entries pre-populate the
        // input so user can confirm with Enter.
        const nextPrefill = wizardChat.prefill?.[nextStep.id]
        const nextDraftHint =
          nextPrefill && nextPrefill.status !== 'absent' && nextPrefill.draftAnswer
            ? `\n\n💡 **从 KB 抽到的草稿**（直接 Enter 确认，或修改）：\n> ${nextPrefill.draftAnswer}`
            : ''
        appendChatMessage({
          role: 'assistant',
          content: `${extractedLine}**STEP ${nextIndex + 1}/${WIZARD_CHAT_STEPS.length} · ${nextStep.label}**

${result?.nextQuestion ?? nextStep.description}${nextDraftHint}

> 输入 \`/cancel\` 退出向导。`,
          source: extracted ? 'llm' : 'scripted',
          isWizard: true
        })
        if (nextPrefill?.draftAnswer && nextPrefill.status !== 'absent') {
          get().setChatInput(nextPrefill.draftAnswer)
        }
      }
    } catch (err) {
      appendChatMessage({
        role: 'assistant',
        content: `⚠ 向导第 ${wizardChat.stepIndex + 1} 步失败：${err instanceof Error ? err.message : String(err)}\n\n输入 \`/cancel\` 退出，或再答一次试试。`,
        source: 'error',
        isWizard: true
      })
    }
  },

  setWorkspaceId: (workspaceId) => {
    if (get().workspaceId === workspaceId) return
    // P11.18 fix · CRITICAL workspace isolation. Previously this only
    // updated `workspaceId` and (if localStorage hit) replaced
    // chatMessages. If the new workspace had NO localStorage entry,
    // chatMessages stayed as the OLD workspace's conversation. Same for
    // macraNodes / nodes / edges → user navigated to /canvas/proj-001
    // and saw chat from /canvas/coffee-kb-... or whatever last workspace.
    //
    // Now: ALWAYS reset to initial state on workspace change. If a
    // persisted bucket exists for the new workspace, replace; otherwise
    // start fresh. The hydrateFromConversation() flow downstream then
    // pulls server-side BMC nodes via workspaceGraph query.
    //
    // P11.18 fix D · also tear down any active GraphQL subscription
    // before switching. Without this, the previous workspace's
    // watcher keeps consuming WebSocket events and writing them into
    // the NEW workspace's state (graph nodes, chat messages, etc.)
    // — silent cross-workspace data leak.
    if (activeSubscription) {
      activeSubscription()
      activeSubscription = null
    }
    set({
      workspaceId,
      chatMessages: createInitialChatMessages(),
      macraNodes: new Map(),
      nodes: [],
      edges: [],
      selectedNodeIds: [],
      detailPanel: { isOpen: false, nodeId: null },
      focusedConflictId: null,
      socraticTurnCounter: 0,
      currentAgent: null,
      pendingInterrupt: null,
      currentConversationId: null
    })

    // Then attempt to hydrate chat from localStorage for this workspace.
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(`starlink_conversations_${workspaceId}`)
        if (raw) {
          const parsed = JSON.parse(raw) as {
            conversations?: Array<{ id: string; messages?: Array<{ role: string; content: string; timestamp?: string }> }>
            activeId?: string
          }
          const list = Array.isArray(parsed.conversations) ? parsed.conversations : []
          const active = list.find((c) => c.id === parsed.activeId) || list[0]
          const stored = Array.isArray(active?.messages) ? active.messages : null
          if (stored && stored.length > 0) {
            // Replace welcome with persisted history. Skip auto-save in
            // this set() call by going directly to set, NOT via setChatMessages.
            set({
              chatMessages: stored.map((m) => ({
                role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
                content: m.content,
                timestamp: m.timestamp ?? new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
              }))
            })
          }
        }
      } catch {
        // corrupt JSON / parse error — keep the default greeting
      }
    }
  },

  setNodes: (nodes) => {
    const nextNodes = typeof nodes === 'function' ? nodes(get().nodes) : nodes
    if (nextNodes === get().nodes) return
    set({ nodes: nextNodes })
  },

  setEdges: (edges) => {
    const nextEdges = typeof edges === 'function' ? edges(get().edges) : edges
    if (nextEdges === get().edges) return
    set({ edges: nextEdges })
  },

  onNodesChange: (changes) => {
    if (changes.length === 0) return
    const { nodes, macraNodes, edges, selectedNodeIds, _dragInProgress } = get()

    // Snapshot triggers for undo:
    //   - removal (Backspace / Delete or deleteSelectedNodes) — every time
    //   - drag start (first dragging:true tick of a new drag) — once per
    //     drag, NOT on every position tick. Without the flag a single
    //     drag would push 30+ snapshots and cmd+z would un-drag 1px at a
    //     time. Capturing on the first tick (before applyNodeChanges) is
    //     critical: it preserves the pre-drag position so undo restores
    //     the original spot, not some intermediate frame.
    const hasDragStart = changes.some(
      (c) => c.type === 'position' && c.dragging === true
    )
    const hasDragEnd = changes.some(
      (c) => c.type === 'position' && c.dragging === false
    )
    const isRemoval = changes.some((c) => c.type === 'remove')
    const isFirstDragTick = hasDragStart && !_dragInProgress

    if (isRemoval || isFirstDragTick) {
      get().pushHistorySnapshot()
    }

    // Maintain the drag flag: enter on first drag tick, exit on drag end
    // (the change with dragging:false). Multiple changes per call are
    // possible (e.g. multi-select drag) but they all share the same
    // dragging-bool, so a single check suffices.
    if (isFirstDragTick) {
      set({ _dragInProgress: true })
    } else if (hasDragEnd) {
      set({ _dragInProgress: false })
    }

    const nextNodes = applyNodeChanges(changes, nodes)

    // Detect node removals (Backspace / Delete via ReactFlow's deleteKeyCode,
    // or programmatic remove changes). When nodes are removed we must also:
    //   1. drop their entries from `macraNodes` (Map state, not auto-synced
    //      with the ReactFlow nodes array)
    //   2. drop edges whose endpoints reference any removed node
    //   3. clear them from `selectedNodeIds` if they were selected
    // This keeps multi-select bulk-delete consistent — without it, a deleted
    // node leaves a zombie entry in `macraNodes` and dangling edges.
    const removeIds = changes
      .filter((c): c is NodeChange & { type: 'remove'; id: string } => c.type === 'remove')
      .map((c) => c.id)

    if (removeIds.length === 0) {
      set({ nodes: nextNodes })
      return
    }

    const removeSet = new Set(removeIds)
    const nextMacraMap = new Map(macraNodes)
    for (const id of removeIds) nextMacraMap.delete(id)
    const nextEdges = edges.filter((e) => !removeSet.has(e.source) && !removeSet.has(e.target))
    const nextSelected = selectedNodeIds.filter((id) => !removeSet.has(id))
    set({
      nodes: nextNodes,
      edges: nextEdges,
      macraNodes: nextMacraMap,
      selectedNodeIds: nextSelected
    })
  },

  onEdgesChange: (changes) => {
    if (changes.length === 0) return
    const { edges } = get()
    set({ edges: applyEdgeChanges(changes, edges) })
  },

  onConnect: (connection) => {
    const { edges } = get()
    set({ edges: addEdge(connection, edges) })
  },

  setSelectedNodeIds: (ids) => {
    const current = get().selectedNodeIds
    if (current.length === ids.length && current.every((id, i) => id === ids[i])) return
    set({ selectedNodeIds: ids })
  },

  deleteSelectedNodes: () => {
    const { selectedNodeIds } = get()
    if (selectedNodeIds.length === 0) return
    // Route through onNodesChange so removal cascades (macraNodes, edges,
    // selection) stay in lockstep with the ReactFlow array.
    const changes: NodeChange[] = selectedNodeIds.map((id) => ({ type: 'remove', id }))
    get().onNodesChange(changes)
  },

  exportCanvasJson: () => {
    const { nodes, edges, macraNodes, workspaceId } = get()
    // Map → array of values; each MacraNodeData carries its own `id`, so
    // we reconstruct the Map on import without losing keys.
    return JSON.stringify(
      {
        version: 1 as const,
        exportedAt: new Date().toISOString(),
        workspaceId,
        nodes,
        edges,
        macraNodes: Array.from(macraNodes.values())
      },
      null,
      2
    )
  },

  importCanvasJson: (json) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch (err) {
      throw new Error(`Canvas JSON is not valid JSON: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Canvas JSON must be an object')
    }
    const data = parsed as Record<string, unknown>
    if (data.version !== 1) {
      throw new Error(`Unsupported canvas export version: ${String(data.version)} (expected 1)`)
    }
    const importedNodes = Array.isArray(data.nodes) ? (data.nodes as Node[]) : []
    const importedEdges = Array.isArray(data.edges) ? (data.edges as Edge[]) : []
    const importedMacra = Array.isArray(data.macraNodes) ? (data.macraNodes as MacraNodeData[]) : []

    const macraMap = new Map<string, MacraNodeData>()
    for (const n of importedMacra) {
      if (n && typeof n === 'object' && typeof n.id === 'string') {
        macraMap.set(n.id, n)
      }
    }

    // Push current state before clobbering it so undo can restore.
    get().pushHistorySnapshot()
    set({
      nodes: importedNodes,
      edges: importedEdges,
      macraNodes: macraMap,
      selectedNodeIds: []
    })
  },

  pushHistorySnapshot: () => {
    const { nodes, edges, macraNodes, selectedNodeIds, history } = get()
    const snap = takeSnapshot({ nodes, edges, macraNodes, selectedNodeIds })
    const past = [...history.past, snap]
    if (past.length > HISTORY_LIMIT) past.shift()
    set({ history: { past, future: [] } })
  },

  undo: () => {
    const { history, nodes, edges, macraNodes, selectedNodeIds } = get()
    if (history.past.length === 0) return
    const previous = history.past[history.past.length - 1]
    const current = takeSnapshot({ nodes, edges, macraNodes, selectedNodeIds })
    set({
      nodes: previous.nodes,
      edges: previous.edges,
      macraNodes: previous.macraNodes,
      selectedNodeIds: previous.selectedNodeIds,
      history: {
        past: history.past.slice(0, -1),
        future: [current, ...history.future].slice(0, HISTORY_LIMIT)
      }
    })
  },

  redo: () => {
    const { history, nodes, edges, macraNodes, selectedNodeIds } = get()
    if (history.future.length === 0) return
    const next = history.future[0]
    const current = takeSnapshot({ nodes, edges, macraNodes, selectedNodeIds })
    set({
      nodes: next.nodes,
      edges: next.edges,
      macraNodes: next.macraNodes,
      selectedNodeIds: next.selectedNodeIds,
      history: {
        past: [...history.past, current].slice(-HISTORY_LIMIT),
        future: history.future.slice(1)
      }
    })
  },

  canUndo: () => get().history.past.length > 0,
  canRedo: () => get().history.future.length > 0,

  getNodeData: (nodeId) => {
    return get().nodeDataMap.get(nodeId)
  },

  updateNodeData: (nodeId, data) => {
    const { nodeDataMap } = get()
    const existingData = nodeDataMap.get(nodeId) || { id: nodeId, status: 'idle' as NodeStatus }
    const hasChanges = Object.entries(data).some(([key, value]) => existingData[key as keyof NodeData] !== value)
    if (!hasChanges) return
    const newData = { ...existingData, ...data }

    const newMap = new Map(nodeDataMap)
    newMap.set(nodeId, newData)

    set({ nodeDataMap: newMap })
  },

  setNodeStatus: (nodeId, status) => {
    get().updateNodeData(nodeId, { status })
  },

  // ============== MACRA 节点操作 ==============
  getMacraNode: (nodeId) => {
    return get().macraNodes.get(nodeId)
  },

  updateMacraNode: (nodeId, data) => {
    const { macraNodes } = get()
    const existingNode = macraNodes.get(nodeId)
    if (!existingNode) return
    const hasChanges = Object.entries(data).some(([key, value]) => existingNode[key as keyof MacraNodeData] !== value)
    if (!hasChanges) return

    const updatedNode = { ...existingNode, ...data }
    const newMap = new Map(macraNodes)
    newMap.set(nodeId, updatedNode)
    set({ macraNodes: newMap })
  },

  createMacraNode: (node) => {
    const { macraNodes, nodes } = get()

    // 添加到 macraNodes Map
    const newMacraMap = new Map(macraNodes)
    newMacraMap.set(node.id, node)

    // 添加到 ReactFlow nodes
    const newReactFlowNode: Node = {
      id: node.id,
      type: node.type,
      position: node.position || { x: Math.random() * 500, y: Math.random() * 500 },
      data: {
        ...node
      }
    }

    set({
      macraNodes: newMacraMap,
      nodes: [...nodes, newReactFlowNode]
    })
  },

  deleteMacraNode: (nodeId) => {
    const { macraNodes, nodes, edges } = get()

    // 从 macraNodes 删除
    const newMacraMap = new Map(macraNodes)
    newMacraMap.delete(nodeId)

    // 从 ReactFlow nodes 删除
    const newNodes = nodes.filter(n => n.id !== nodeId)

    // 删除相关的边
    const newEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId)

    set({
      macraNodes: newMacraMap,
      nodes: newNodes,
      edges: newEdges
    })
  },

  // ============== Canvas Actions 操作 ==============
  applyCanvasActions: async (actions) => {
    for (const action of actions) {
      switch (action.action) {
        case 'create_node': {
          const nodeData = action.data as MacraNodeData
          get().createMacraNode(nodeData)
          break
        }
        case 'update_node': {
          const nodeData = action.data as MacraNodeData
          get().updateMacraNode(nodeData.id, nodeData)
          break
        }
        case 'delete_node': {
          const { nodeIds } = action.data as { nodeIds: string[] }
          nodeIds?.forEach(id => get().deleteMacraNode(id))
          break
        }
        case 'create_edge': {
          const edgeData = action.data as MacraEdgeData
          const { edges } = get()
          const newEdge: Edge = {
            id: `e-${edgeData.source}-${edgeData.target}`,
            source: edgeData.source,
            target: edgeData.target,
            label: edgeData.label,
            type: edgeData.type === 'default' ? 'smoothstep' : edgeData.type,
            animated: edgeData.animated ?? true,
            style: edgeData.style || {}
          }
          set({ edges: [...edges, newEdge] })
          break
        }
        case 'delete_edge': {
          const { source, target } = action.data as { source: string; target: string }
          const { edges } = get()
          const newEdges = edges.filter(
            e => !(e.source === source && e.target === target)
          )
          set({ edges: newEdges })
          break
        }
        default:
          break
      }
    }
  },

  // ============== Business LangGraph 调用 ==============
  callLangGraph: async (userPrompt, _mode = 'general', kbId) => {
    void _mode
    get().setWorkflowStage('thinking', 'analysis-submitted')
    set((state) => ({
      isOrchestratorProcessing: true,
      citations: {},
      // P13 · reset stage-strip drivers at every new stream so the
      // pipeline status starts clean (no stale phase / failure carrying
      // over from the previous run).
      lastPhase: null,
      hasStreamFailed: false,
      workflowMeta: {
        ...state.workflowMeta,
        lastError: null
      }
    }))

    if (activeSubscription) {
      activeSubscription()
      activeSubscription = null
    }

    set({
      nodes: [],
      edges: [],
      nodeDataMap: new Map(),
      macraNodes: new Map(),
      roundNumber: 0,
      pendingInterrupt: null,
      currentAgent: null,
      lastDeltaAt: null
    })

    const workspaceId = get().workspaceId
    if (!workspaceId) {
      set({ isOrchestratorProcessing: false })
      set((state) => ({
        workflowStage: 'failed',
        workflowMeta: {
          ...state.workflowMeta,
          lastError: 'workspaceId 未设置',
          lastTransitionReason: 'missing-workspace-id'
        }
      }))
      throw new Error('workspaceId 未设置')
    }

    try {
      const client = getGraphQLClient()
      const response = await client.request<{
        startConversation: { metadata: { id: string }; graph: WorkspaceGraphResponse }
      }>(START_CONVERSATION_MUTATION, {
        workspaceId,
        question: userPrompt,
        kbId: kbId ?? undefined
      })

      const conversationId = response.startConversation.metadata.id
      set({ currentConversationId: conversationId })

      const extractMacraNodeData = (canvasNode: CanvasNode): MacraNodeData | null => {
        const data = (canvasNode.data ?? {}) as Record<string, unknown>
        const meta = data.meta as Record<string, unknown> | undefined
        if (!meta) {
          return null
        }

        const macraData: MacraNodeData = {
          id: canvasNode.id,
          type: (meta.macraType || canvasNode.type || 'cc-bmc-card') as MacraNodeData['type'],
          label: typeof data.title === 'string' ? data.title : '未命名',
          content: typeof data.content === 'string' ? data.content : '',
          // P11 fix · summary 不能 fallback 到 data.content。当 server 端
          // meta.summary 缺席（旧数据 + orchestrator 主路径都不产 summary
          // 字段），之前的代码用 data.content 兜底 → drawer 的 derivedSummary
          // 第一个 if 分支永远命中（拿到非空字符串），后面写好的 heading/
          // bullet/sentence 提取永远不执行。修：缺席时返回 '' 让 derivedSummary
          // 走它的多级提取策略。
          summary: typeof meta.summary === 'string' ? meta.summary : '',
          fullContent: typeof meta.fullContent === 'string'
            ? meta.fullContent
            : (typeof data.content === 'string' ? data.content : ''),
          domain: typeof meta.domain === 'string' ? (meta.domain as MacraNodeData['domain']) : undefined,
          metadata: (meta.metadata && typeof meta.metadata === 'object' && !Array.isArray(meta.metadata))
            ? (meta.metadata as Record<string, unknown>)
            : {},
          agentType: typeof meta.agentType === 'string' ? (meta.agentType as MacraNodeData['agentType']) : undefined,
          severity: typeof meta.severity === 'string' ? (meta.severity as MacraNodeData['severity']) : undefined,
          conflictType: typeof meta.conflictType === 'string' ? (meta.conflictType as MacraNodeData['conflictType']) : undefined,
          isInteractive: typeof meta.isInteractive === 'boolean' ? meta.isInteractive : undefined,
          position: canvasNode.position
        }

        return macraData
      }

      const applyGraph = (graph: WorkspaceGraphResponse) => {
        const reactFlowNodes = graph.nodes.map(mapCanvasNodeToReactFlow)
        const macraNodesMap = new Map<string, MacraNodeData>()

        // 同时构建 macraNodes Map
        graph.nodes.forEach(node => {
          const macraData = extractMacraNodeData(node)
          if (macraData) {
            macraNodesMap.set(node.id, macraData)
          }
        })

        // P11.16 · hydrate citations from the server into the store's
        // citations slot so EvidenceDrawer state survives workspace
        // reload (close tab → reopen). graph.citations is computed on
        // the server by walking each cell's data.meta.citations.
        const citationsMap: Record<string, CardCitation[]> = {}
        if (Array.isArray(graph.citations)) {
          for (const c of graph.citations) {
            if (!c?.cardId) continue
            const existing = citationsMap[c.cardId] ?? []
            citationsMap[c.cardId] = [...existing, c as unknown as CardCitation]
          }
        }

        // P11.18 fix · DEFENSIVE merge instead of pure REPLACE when the
        // incoming snapshot is SMALLER than current state. This protects
        // against the "一条直线" bug where a stale graph snapshot
        // (e.g. from reconnect race) would wipe out 15 of 18 accumulated
        // BMC nodes. PG is authoritative for new nodes; we never DELETE
        // accumulated cells unless explicitly told via removedNodeIds in
        // a graph/diff event.
        set((state) => {
          const incoming = reactFlowNodes
          const currentCount = state.nodes.length
          const incomingCount = incoming.length
          const shouldMerge = currentCount > 0 && incomingCount < currentCount
          if (shouldMerge) {
            console.warn(
              `[applyGraph] incoming snapshot smaller than current (${incomingCount} < ${currentCount}); merging to protect against stale-snapshot wipe`
            )
            return {
              nodes: mergeById(state.nodes, incoming),
              edges: mergeById(state.edges, graph.edges.map(mapCanvasEdgeToReactFlow)),
              macraNodes: (() => {
                const merged = new Map(state.macraNodes)
                macraNodesMap.forEach((v, k) => merged.set(k, v))
                return merged
              })(),
              ...(Object.keys(citationsMap).length > 0 ? { citations: citationsMap } : {})
            }
          }
          return {
            nodes: incoming,
            edges: graph.edges.map(mapCanvasEdgeToReactFlow),
            macraNodes: macraNodesMap,
            ...(Object.keys(citationsMap).length > 0 ? { citations: citationsMap } : {})
          }
        })
      }

      const applyDelta = (delta: {
        nodes?: CanvasNode[]
        edges?: CanvasEdge[]
        removedNodeIds?: string[]
        removedEdgeIds?: string[]
      }) => {
        // P9 Block 4b · validate delta shape — server contract drift or
        // payload corruption could send non-array fields; silently
        // ignoring the bad slice is better than throwing mid-stream.
        const validNodes = Array.isArray(delta.nodes) ? delta.nodes : undefined
        const validEdges = Array.isArray(delta.edges) ? delta.edges : undefined
        const validRemovedNodes = Array.isArray(delta.removedNodeIds) ? delta.removedNodeIds : undefined
        const validRemovedEdges = Array.isArray(delta.removedEdgeIds) ? delta.removedEdgeIds : undefined

        const nodeUpdates = validNodes?.map(mapCanvasNodeToReactFlow)
        const edgeUpdates = validEdges?.map(mapCanvasEdgeToReactFlow)
        // P9 Block 3a · pre-compute removed-id sets OUTSIDE the set()
        // setter to avoid the race where multiple graph/diff events
        // arriving < 100ms apart can have inconsistent intermediate
        // state. The previous filter inside set() referenced
        // state.nodes which could already be mid-merge.
        const removedNodeSet = validRemovedNodes ? new Set(validRemovedNodes) : null
        const removedEdgeSet = validRemovedEdges ? new Set(validRemovedEdges) : null

        set((state) => {
          const newMacraNodes = new Map(state.macraNodes)
          let detectedRound = state.roundNumber
          let detectedAgent: string | null = state.currentAgent

          removedNodeSet?.forEach((nodeId) => {
            newMacraNodes.delete(nodeId)
          })

          // 同时更新 macraNodes Map 并检测轮次
          validNodes?.forEach(node => {
            const macraData = extractMacraNodeData(node)
            if (macraData) {
              newMacraNodes.set(node.id, macraData)
              // 从 metadata.tags 中检测轮次 (round-N)
              // P9 Block 3b · Array.isArray guard — without it a
              // server bug sending tags as object/string would silently
              // iterate over keys/chars, corrupting roundNumber.
              const rawTags = macraData.metadata?.tags
              if (Array.isArray(rawTags)) {
                for (const tag of rawTags) {
                  if (typeof tag !== 'string') continue
                  const match = tag.match(/^round-(\d+)$/)
                  if (match) {
                    const round = Number(match[1])
                    if (round > detectedRound) detectedRound = round
                  }
                }
              }
              // Sprint 3.3 · capture most-recent emitting agent for Coach.
              if (typeof macraData.agentType === 'string' && macraData.agentType.length > 0) {
                detectedAgent = macraData.agentType
              }
            }
          })

          // P15 · apply BMC 9-grid layout on every streaming delta so
          // cells land in their canonical 3x3 positions IMMEDIATELY,
          // not just after a page-reload hydrate. Previously the
          // streaming path skipped applyCanvasLayout, leaving cells in
          // the server-emitted default (single column) until the page
          // refreshed and re-routed through the workspace-graph fetch.
          // First-time generations looked like a stacked list.
          const mergedNodes = mergeById(
            removedNodeSet ? state.nodes.filter((node) => !removedNodeSet.has(node.id)) : state.nodes,
            nodeUpdates
          )
          const laidOutNodes = applyCanvasLayout('bmc-9-grid', mergedNodes)
          return {
            nodes: laidOutNodes,
            edges: mergeById(
              removedEdgeSet ? state.edges.filter((edge) => !removedEdgeSet.has(edge.id)) : state.edges,
              edgeUpdates
            ),
            macraNodes: newMacraNodes,
            roundNumber: detectedRound,
            currentAgent: detectedAgent,
            lastDeltaAt: Date.now()
          }
        })
      }

      if (response.startConversation.graph) {
        applyGraph(response.startConversation.graph)
      }

      const watcher = watchConversation({
        workspaceId,
        conversationId,
        onGraphAppended: (payload) => {
          applyGraph(payload as WorkspaceGraphResponse)
        },
        onGraphDiff: (payload) => {
          applyDelta(payload as {
            nodes?: CanvasNode[]
            edges?: CanvasEdge[]
            removedNodeIds?: string[]
            removedEdgeIds?: string[]
          })
        },
        onEvidence: (payload) => {
          const evidence = payload as KnowledgeEvidence[]
          if (Array.isArray(evidence)) {
            set({ knowledgeEvidence: evidence })
          }
        },
        onCardCited: (payload) => {
          const data = payload as { cardId?: string; citation?: CardCitation; groundingRate?: number }
          if (data && data.citation && data.cardId) {
            get().setCardCitation(data.cardId, data.citation)
          }
        },
        // P11.14 + P13 · stream event router. Branches:
        //   - agent/subagent-progress → wire-panel + stage-strip currentAction
        //   - phase.changed           → stage-strip lastPhase pivot
        //   - status === 'failed'     → stage-strip hasStreamFailed flag
        // Other event types are handled by their dedicated callbacks above.
        onEvent: (event) => {
          if (event.type === 'agent/subagent-progress') {
            const payload = event.payload as
              | { ns?: string[]; nodeName?: string; payloadKeys?: string[] }
              | undefined
            if (!payload || !Array.isArray(payload.ns) || typeof payload.nodeName !== 'string') return
            const parentNode = (payload.ns[0] ?? '').split(':')[0] || '_unknown_'
            set({ subAgentActivity: { parentNode, nodeName: payload.nodeName, ts: Date.now() } })
            return
          }
          if (event.type === 'phase.changed') {
            const payload = event.payload as { phase?: string } | undefined
            const phase = payload?.phase
            if (phase === 'planning' || phase === 'execution' || phase === 'review' || phase === 'decision') {
              set({ lastPhase: phase })
            }
            return
          }
          if (event.type === 'status' && event.status === 'failed') {
            set({ hasStreamFailed: true })
          }
        },
        // P12 · server-side persistence failures (canvas_graphs upsert /
        // memory_items conversation summary / completion memory) surfaced
        // as yellow ⚠ chat bubbles instead of silent console.error.
        onPersistenceWarning: ({ severity, source, message }) => {
          get().appendChatMessage({
            role: 'assistant',
            content: `⚠ 持久化提示（${source}）：${message}`,
            source: severity === 'error' ? 'error' : 'persistence-warning'
          })
        },
        loadLatestGraph: async () => fetchWorkspaceGraphSnapshot(workspaceId)
      })
      activeSubscription = watcher.cancel
      await watcher.done.finally(() => {
        // P11.14 · clear sub-agent activity on stream-end (success or fail)
        // so the wire widget doesn't show stale "x is calling y" forever.
        set({ subAgentActivity: null })
        if (activeSubscription === watcher.cancel) {
          activeSubscription = null
        }
      })

      set({ isOrchestratorProcessing: false })
    } catch (error) {
      console.error('❌ Business LangGraph 调用失败:', error)
      set((state) => ({
        isOrchestratorProcessing: false,
        workflowStage: 'failed',
        workflowMeta: {
          ...state.workflowMeta,
          lastError: error instanceof Error ? error.message : '未知错误',
          lastTransitionReason: 'analysis-failed'
        }
      }))
      throw error
    }
  },

  // ============== Resume from existing conversation ==============
  // Called by /canvas/<conversationId> on mount when user lands from
  // /chat homepage. Pulls server-side state (graph, evidence, citations
  // and chat history) into the local store so the canvas renders the
  // conversation's already-generated nodes instead of an empty surface.
  // Returns null if the id isn't a valid conversation (caller treats
  // the URL param as a workspaceId and shows a fresh canvas).
  hydrateFromConversation: async (conversationId: string) => {
    if (!conversationId) return null
    try {
      const client = getGraphQLClient()
      type ConversationPayload = {
        conversation: {
          metadata: { id: string; status?: string }
          graph: WorkspaceGraphResponse & { workspaceId: string }
          knowledgeEvidence?: unknown[]
          citations?: unknown[]
        } | null
      }
      const data = await client.request<ConversationPayload>(
        /* GraphQL */ `
          query HydrateConversation($id: ID!) {
            conversation(id: $id) {
              metadata { id status }
              graph {
                workspaceId
                nodes {
                  id type position { x y }
                  data
                }
                edges { id source target label }
              }
              knowledgeEvidence { docId snippet score metadata }
              citations { cardId fieldName spans { textStart textEnd refs { evidenceId docId snippetId } } }
            }
          }
        `,
        { id: conversationId }
      )

      const conv = data.conversation
      if (!conv) {
        // Fallback: id wasn't a conversation — try treating it as a
        // workspaceId and load the workspace's canonical canvas snapshot.
        // /canvas/<workspaceId> URLs (legacy + standalone) hit this path
        // so an existing BMC from a prior conversation paints on mount.
        try {
          const graph = await fetchWorkspaceGraphSnapshot(conversationId)
          if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
            return null
          }
          const wsMacraMap = new Map<string, MacraNodeData>()
          graph.nodes.forEach((node) => {
            const cn = node as unknown as CanvasNode
            const dataObj = (cn.data ?? {}) as Record<string, unknown>
            const meta = dataObj.meta as Record<string, unknown> | undefined
            if (!meta) return
            wsMacraMap.set(cn.id, {
              id: cn.id,
              type: (meta.macraType || cn.type || 'cc-bmc-card') as MacraNodeData['type'],
              label: typeof dataObj.title === 'string' ? dataObj.title : '未命名',
              content: typeof dataObj.content === 'string' ? dataObj.content : '',
              summary: typeof meta.summary === 'string' ? meta.summary : '',
              fullContent: typeof meta.fullContent === 'string' ? meta.fullContent : (typeof dataObj.content === 'string' ? dataObj.content : ''),
              domain: typeof meta.domain === 'string' ? (meta.domain as MacraNodeData['domain']) : undefined,
              metadata: (meta.metadata && typeof meta.metadata === 'object' && !Array.isArray(meta.metadata))
            ? (meta.metadata as Record<string, unknown>)
            : {},
              agentType: typeof meta.agentType === 'string' ? (meta.agentType as MacraNodeData['agentType']) : undefined,
              severity: typeof meta.severity === 'string' ? (meta.severity as MacraNodeData['severity']) : undefined,
              conflictType: typeof meta.conflictType === 'string' ? (meta.conflictType as MacraNodeData['conflictType']) : undefined,
              isInteractive: typeof meta.isInteractive === 'boolean' ? meta.isInteractive : undefined,
              position: cn.position,
            } as MacraNodeData)
          })
          const wsLayoutNodes = applyCanvasLayout('bmc-9-grid', graph.nodes.map(mapCanvasNodeToReactFlow))
          set({
            nodes: wsLayoutNodes,
            edges: graph.edges.map(mapCanvasEdgeToReactFlow),
            macraNodes: wsMacraMap,
          })
          return { workspaceId: graph.workspaceId }
        } catch {
          return null
        }
      }

      // Build macra map mirror the same shape extractMacraNodeData uses
      // in callLangGraph — kept inline so this action can stand alone.
      const macraNodesMap = new Map<string, MacraNodeData>()
      conv.graph.nodes.forEach((node) => {
        const cn = node as unknown as CanvasNode
        const dataObj = (cn.data ?? {}) as Record<string, unknown>
        const meta = dataObj.meta as Record<string, unknown> | undefined
        if (!meta) return
        macraNodesMap.set(cn.id, {
          id: cn.id,
          type: (meta.macraType || cn.type || 'cc-bmc-card') as MacraNodeData['type'],
          label: typeof dataObj.title === 'string' ? dataObj.title : '未命名',
          content: typeof dataObj.content === 'string' ? dataObj.content : '',
          summary: typeof meta.summary === 'string' ? meta.summary : '',
          fullContent: typeof meta.fullContent === 'string' ? meta.fullContent : (typeof dataObj.content === 'string' ? dataObj.content : ''),
          domain: typeof meta.domain === 'string' ? (meta.domain as MacraNodeData['domain']) : undefined,
          metadata: (meta.metadata && typeof meta.metadata === 'object' && !Array.isArray(meta.metadata))
            ? (meta.metadata as Record<string, unknown>)
            : {},
          agentType: typeof meta.agentType === 'string' ? (meta.agentType as MacraNodeData['agentType']) : undefined,
          severity: typeof meta.severity === 'string' ? (meta.severity as MacraNodeData['severity']) : undefined,
          conflictType: typeof meta.conflictType === 'string' ? (meta.conflictType as MacraNodeData['conflictType']) : undefined,
          isInteractive: typeof meta.isInteractive === 'boolean' ? meta.isInteractive : undefined,
          position: cn.position,
        } as MacraNodeData)
      })

      const layoutNodes = applyCanvasLayout('bmc-9-grid', conv.graph.nodes.map(mapCanvasNodeToReactFlow))

      set({
        currentConversationId: conv.metadata.id,
        nodes: layoutNodes,
        edges: conv.graph.edges.map(mapCanvasEdgeToReactFlow),
        macraNodes: macraNodesMap,
        knowledgeEvidence: (conv.knowledgeEvidence as KnowledgeEvidence[]) ?? [],
      })

      return { workspaceId: conv.graph.workspaceId }
    } catch (err) {
      console.warn('[hydrateFromConversation] failed', err)
      return null
    }
  },

  // ============== Sprint 1.4 · Active-session reconnect ==============
  reattachToActiveSession: async (workspaceId: string) => {
    if (!workspaceId) return null
    const state = get()
    // Already attached or actively running locally — don't double-attach.
    if (state.currentConversationId) return null
    if (state.isOrchestratorProcessing) return null
    try {
      const client = getGraphQLClient()
      type SessionsPayload = {
        conversationSessions: Array<{
          id: string
          status: string
          updatedAt: string
          heartbeatAt: string | null
        }>
      }
      const data = await client.request<SessionsPayload>(
        /* GraphQL */ `
          query ActiveSessions($workspaceId: ID!) {
            conversationSessions(workspaceId: $workspaceId, limit: 5) {
              id
              status
              updatedAt
              heartbeatAt
            }
          }
        `,
        { workspaceId }
      )

      const running = (data.conversationSessions ?? []).find(
        (s) => s.status === 'running'
      )
      if (!running) return null

      // Heartbeat sanity check — server's reaper marks stale sessions
      // failed within 75s, but we add a softer client-side gate to avoid
      // re-attaching to a session that's about to be reaped.
      // P9 Block 4d · validate ISO format. new Date("invalid").getTime()
      // returns NaN, and `NaN > 90_000` is always false → without this
      // guard, malformed timestamps would pass through and we'd reconnect
      // to truly stale sessions.
      if (running.heartbeatAt) {
        const hbTime = new Date(running.heartbeatAt).getTime()
        if (Number.isNaN(hbTime)) {
          console.warn(
            `[reattachToActiveSession] invalid heartbeatAt format: ${running.heartbeatAt}; skipping`
          )
          return null
        }
        const ageMs = Date.now() - hbTime
        if (ageMs > 90_000) {
          console.warn(
            `[reattachToActiveSession] skip stale session ${running.id} (heartbeat ${Math.round(ageMs / 1000)}s ago)`
          )
          return null
        }
      }

      // Found a live session — set currentConversationId, paint the
      // latest server-side graph snapshot, and start a watcher for
      // future deltas. workflowStage stays in whatever the page derives
      // from isOrchestratorProcessing; we don't force 'thinking' so the
      // user isn't surprised by a "live" badge if the session is just
      // about to complete.
      set({ currentConversationId: running.id })

      try {
        const graph = await fetchWorkspaceGraphSnapshot(workspaceId)
        if (graph && Array.isArray(graph.nodes)) {
          // Reuse the same mapping as hydrateFromConversation — keep it
          // inline so this action is self-contained.
          const macraNodesMap = new Map<string, MacraNodeData>()
          graph.nodes.forEach((node) => {
            const cn = node as unknown as CanvasNode
            const dataObj = (cn.data ?? {}) as Record<string, unknown>
            const meta = dataObj.meta as Record<string, unknown> | undefined
            if (!meta) return
            macraNodesMap.set(cn.id, {
              id: cn.id,
              type: (meta.macraType || cn.type || 'cc-bmc-card') as MacraNodeData['type'],
              label: typeof dataObj.title === 'string' ? dataObj.title : '未命名',
              content: typeof dataObj.content === 'string' ? dataObj.content : '',
              summary: typeof meta.summary === 'string' ? meta.summary : '',
              fullContent: typeof meta.fullContent === 'string' ? meta.fullContent : (typeof dataObj.content === 'string' ? dataObj.content : ''),
              domain: typeof meta.domain === 'string' ? (meta.domain as MacraNodeData['domain']) : undefined,
              metadata: (meta.metadata && typeof meta.metadata === 'object' && !Array.isArray(meta.metadata))
            ? (meta.metadata as Record<string, unknown>)
            : {},
              agentType: typeof meta.agentType === 'string' ? (meta.agentType as MacraNodeData['agentType']) : undefined,
              severity: typeof meta.severity === 'string' ? (meta.severity as MacraNodeData['severity']) : undefined,
              conflictType: typeof meta.conflictType === 'string' ? (meta.conflictType as MacraNodeData['conflictType']) : undefined,
              isInteractive: typeof meta.isInteractive === 'boolean' ? meta.isInteractive : undefined,
              position: cn.position,
            } as MacraNodeData)
          })
          set({
            nodes: graph.nodes.map(mapCanvasNodeToReactFlow),
            edges: graph.edges.map(mapCanvasEdgeToReactFlow),
            macraNodes: macraNodesMap,
          })
        }
      } catch (err) {
        console.warn('[reattachToActiveSession] graph snapshot load failed', err)
      }

      // Spin up the watcher so future graph/diff + status events flow
      // into this tab. We deliberately do NOT await watcher.done — the
      // page mount returns immediately; the subscription self-tears
      // when the server emits status='completed'.
      // P11.18 fix · build a shared extractMacraNodeData here so reattach
      // watcher updates BOTH state.nodes (ReactFlow) AND state.macraNodes.
      // Previously this watcher only updated nodes/edges → macraNodes
      // drifted out of sync → BMC count chip was stale, drawer couldn't
      // open cards (lookup miss). Same shape as callLangGraph extractor.
      const reattachExtract = (canvasNode: CanvasNode): MacraNodeData | null => {
        const data = (canvasNode.data ?? {}) as Record<string, unknown>
        const meta = data.meta as Record<string, unknown> | undefined
        if (!meta) return null
        return {
          id: canvasNode.id,
          type: (meta.macraType || canvasNode.type || 'cc-bmc-card') as MacraNodeData['type'],
          label: typeof data.title === 'string' ? data.title : '未命名',
          content: typeof data.content === 'string' ? data.content : '',
          summary: typeof meta.summary === 'string' ? meta.summary : '',
          fullContent: typeof meta.fullContent === 'string'
            ? meta.fullContent
            : (typeof data.content === 'string' ? data.content : ''),
          domain: typeof meta.domain === 'string' ? (meta.domain as MacraNodeData['domain']) : undefined,
          metadata: (meta.metadata && typeof meta.metadata === 'object' && !Array.isArray(meta.metadata))
            ? (meta.metadata as Record<string, unknown>)
            : {},
          agentType: typeof meta.agentType === 'string' ? (meta.agentType as MacraNodeData['agentType']) : undefined,
          severity: typeof meta.severity === 'string' ? (meta.severity as MacraNodeData['severity']) : undefined,
          conflictType: typeof meta.conflictType === 'string' ? (meta.conflictType as MacraNodeData['conflictType']) : undefined,
          isInteractive: typeof meta.isInteractive === 'boolean' ? meta.isInteractive : undefined,
          position: canvasNode.position
        }
      }

      const watcher = watchConversation({
        workspaceId,
        conversationId: running.id,
        onGraphAppended: (payload) => {
          const graph = payload as WorkspaceGraphResponse
          // P11.18 fix · also rebuild macraNodes from the snapshot.
          // Without this, BMC cells appear in nodes[] but BMC chip,
          // drawer, and citation panel can't find them.
          const macraMap = new Map<string, MacraNodeData>()
          for (const n of graph.nodes) {
            const m = reattachExtract(n)
            if (m) macraMap.set(n.id, m)
          }
          set({
            nodes: graph.nodes.map(mapCanvasNodeToReactFlow),
            edges: graph.edges.map(mapCanvasEdgeToReactFlow),
            macraNodes: macraMap,
            lastDeltaAt: Date.now()
          })
        },
        onGraphDiff: (payload) => {
          const delta = payload as {
            nodes?: CanvasNode[]
            edges?: CanvasEdge[]
            removedNodeIds?: string[]
            removedEdgeIds?: string[]
          }
          set((s) => {
            // P11.18 fix · merge macraNodes alongside ReactFlow nodes.
            // Previously delta updates of BMC cells silently bypassed
            // macraNodes — frontend BMC count went stale, drawer
            // open-on-cell-click missed.
            const newMacra = new Map(s.macraNodes)
            if (Array.isArray(delta.removedNodeIds)) {
              for (const id of delta.removedNodeIds) newMacra.delete(id)
            }
            if (Array.isArray(delta.nodes)) {
              for (const n of delta.nodes) {
                const m = reattachExtract(n)
                if (m) newMacra.set(n.id, m)
              }
            }
            return {
              nodes: mergeById(
                delta.removedNodeIds
                  ? s.nodes.filter((n) => !delta.removedNodeIds?.includes(n.id))
                  : s.nodes,
                delta.nodes?.map(mapCanvasNodeToReactFlow)
              ),
              edges: mergeById(
                delta.removedEdgeIds
                  ? s.edges.filter((e) => !delta.removedEdgeIds?.includes(e.id))
                  : s.edges,
                delta.edges?.map(mapCanvasEdgeToReactFlow)
              ),
              macraNodes: newMacra,
              lastDeltaAt: Date.now()
            }
          })
        },
        onEvidence: (payload) => {
          const ev = payload as KnowledgeEvidence[]
          if (Array.isArray(ev)) set({ knowledgeEvidence: ev })
        },
        onCardCited: (payload) => {
          const data = payload as { cardId?: string; citation?: CardCitation }
          if (data?.cardId && data.citation) {
            get().setCardCitation(data.cardId, data.citation)
          }
        },
        // P12 · same surfacing as the active-stream watcher above —
        // reattach watcher also picks up persistence warnings replayed
        // from the runtime-events ring buffer after a reconnect.
        onPersistenceWarning: ({ severity, source, message }) => {
          get().appendChatMessage({
            role: 'assistant',
            content: `⚠ 持久化提示（${source}）：${message}`,
            source: severity === 'error' ? 'error' : 'persistence-warning'
          })
        },
        loadLatestGraph: async () => fetchWorkspaceGraphSnapshot(workspaceId),
      })

      // P11.18 fix D · register the watcher's cancel into the module
      // singleton so workspace switches and explicit teardowns can
      // call it. Previously this watcher was orphaned — only its
      // own `done` promise could end it, which means workspace
      // switches kept the old subscription alive and routed events
      // into the new workspace's state.
      activeSubscription = watcher.cancel

      // Tear watcher when conversation ends. Don't block the action.
      // P9 Block 4c · log subscription death so silent disconnects don't
      // leave Coach hanging at "thinking" forever with no diagnostic.
      watcher.done.catch((err) => {
        console.error('[reattachToActiveSession] subscription died', err)
      }).finally(() => {
        const cur = get().currentConversationId
        if (cur === running.id) {
          set({ currentConversationId: null })
        }
        // Self-deregister so a later workspace switch / new session
        // start doesn't double-cancel a dead subscription.
        if (activeSubscription === watcher.cancel) {
          activeSubscription = null
        }
      })

      return running.id
    } catch (err) {
      console.warn('[reattachToActiveSession] failed', err)
      return null
    }
  },

  // ============== Sprint 4.1 · User-cancel running session ==============
  cancelActiveSession: async (reason = 'user-cancelled') => {
    const conversationId = get().currentConversationId
    if (!conversationId) return false
    try {
      const client = getGraphQLClient()
      type CancelPayload = {
        cancelStaleSession: { id: string; status: string } | null
      }
      const data = await client.request<CancelPayload>(
        /* GraphQL */ `
          mutation CancelSession($sessionId: ID!, $reason: String) {
            cancelStaleSession(sessionId: $sessionId, reason: $reason) {
              id
              status
            }
          }
        `,
        { sessionId: conversationId, reason }
      )
      const ok = data.cancelStaleSession?.status === 'failed'
      // Local-side cleanup regardless: the watcher will hit status='failed'
      // and tear itself, but Coach should reflect the cancel immediately.
      // P9 Block 3c · also clear pendingInterrupt — without this, an
      // interrupt from the cancelled run could fire on the next session,
      // dropping a stale conflict-alert onto a fresh canvas.
      set((state) => ({
        currentConversationId: null,
        isOrchestratorProcessing: false,
        workflowStage: 'cancelled',
        workflowMeta: {
          ...state.workflowMeta,
          lastError: null,
          lastTransitionReason: 'user-cancelled',
        },
        currentAgent: null,
        pendingInterrupt: null,
        lastCompletionAt: Date.now(),
        // P13 · clear stage-strip drivers so the next run starts clean
        // (otherwise the previous run's phase / failure would leak into
        // the next strip derivation).
        lastPhase: null,
        hasStreamFailed: false,
        subAgentActivity: null,
      }))
      return ok
    } catch (err) {
      console.warn('[cancelActiveSession] failed', err)
      return false
    }
  },

  // ============== Socratic Coach (reflectOnIdeation) ==============
  reflectOnChat: async (userMessage: string) => {
    const trimmed = userMessage.trim()
    if (!trimmed) return

    const state = get()
    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    }
    state.setChatMessages([...state.chatMessages, userMsg])
    set({ chatInput: '', chatReflecting: true })

    // Build canvas snapshot for coach context. Map MacraNodes → the
    // shape coach expects: { id, kind, label, content }. nodeCountByKind
    // helps the coach prioritise which dimensions need more reflection.
    const nodeArray = Array.from(state.macraNodes.values())
    const canvasNodes = nodeArray.map((n) => ({
      id: n.id,
      kind: n.type ?? 'cc-bmc-card',
      label: n.label ?? '',
      content: typeof n.content === 'string' ? n.content : '',
    }))
    const nodeCountByKind: Record<string, number> = {}
    for (const n of nodeArray) {
      const k = n.type ?? 'unknown'
      nodeCountByKind[k] = (nodeCountByKind[k] ?? 0) + 1
    }

    // Last 6 chat turns (excluding the just-appended user message we want
    // to reflect on; coach reads it from event.label instead).
    const recentChat = state.chatMessages
      .slice(-6)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'ai', content: m.content }))

    // P10 fix B · pass scaffold history so LLM avoids picking the same
    // type repeatedly. Reads m.scaffold off prior assistant messages.
    const priorScaffolds = state.chatMessages
      .filter((m) => m.role === 'assistant' && typeof m.scaffold === 'string')
      .slice(-5)
      .map((m) => m.scaffold as string)

    // P10 fix D · count user messages in this session for graduation
    // pressure (after 4+ msgs and sparse canvas, suggest /wizard).
    const userTurnCount = state.chatMessages.filter((m) => m.role === 'user').length

    try {
      const client = getGraphQLClient()
      const response = await client.request<{
        reflectOnIdeation: { scaffold: ChatScaffold; content: string; source: 'llm' | 'scripted' | 'error'; latencyMs?: number }
      }>(
        /* GraphQL */ `
          mutation Reflect($input: ReflectOnIdeationInput!) {
            reflectOnIdeation(input: $input) {
              scaffold content source latencyMs
            }
          }
        `,
        {
          input: {
            event: {
              type: 'user-message',
              kind: 'chat',
              label: trimmed,
            },
            canvas: {
              nodes: canvasNodes,
              edgeCount: state.edges.length,
              nodeCountByKind,
            },
            recentChat,
            priorScaffolds,
            userTurnCount,
            firedMetaIds: [],
            workspaceId: state.workspaceId,
          },
        }
      )

      const reply = response.reflectOnIdeation
      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: reply.content,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        scaffold: reply.scaffold,
        source: reply.source,
      }
      get().setChatMessages([...get().chatMessages, aiMsg])

      // Auto meta-check: every META_CHECK_INTERVAL user turns, ask the
      // coach to evaluate whether the conversation has covered enough
      // dimensions to graduate to BMC generation. The response is rendered
      // in the chat dock as a special card with "✦ 开始生成 BMC" CTA.
      const nextCounter = state.socraticTurnCounter + 1
      set({ socraticTurnCounter: nextCounter })
      if (nextCounter % META_CHECK_INTERVAL === 0) {
        try {
          // P11.18 fix · re-read fresh canvas snapshot for meta-check.
          // Previously this reused `canvasNodes` / `state.edges.length`
          // captured at the START of reflectOnChat — which means if the
          // user just triggered BMC generation (and 9 cells materialised
          // mid-await), the meta-check still saw the OLD empty canvas
          // and emitted "画布完全空白" while the canvas was actually full.
          // Bug repro: type idea → "准备生成BMC" → BMC generates → meta
          // says "canvas empty, suggest /wizard" — directly contradicting
          // what the user sees.
          const fresh = get()
          const freshNodeArray = Array.from(fresh.macraNodes.values())
          const freshCanvasNodes = freshNodeArray.map((n) => ({
            id: n.id,
            kind: n.type ?? 'cc-bmc-card',
            label: n.label ?? '',
            content: typeof n.content === 'string' ? n.content : '',
          }))
          const freshNodeCountByKind: Record<string, number> = {}
          for (const n of freshNodeArray) {
            const k = n.type ?? 'unknown'
            freshNodeCountByKind[k] = (freshNodeCountByKind[k] ?? 0) + 1
          }
          const metaResponse = await client.request<{
            reflectOnIdeation: { scaffold: ChatScaffold; content: string; source: 'llm' | 'scripted' | 'error' }
          }>(
            /* GraphQL */ `
              mutation MetaCheck($input: ReflectOnIdeationInput!) {
                reflectOnIdeation(input: $input) {
                  scaffold content source
                }
              }
            `,
            {
              input: {
                event: { type: 'meta-check' },
                canvas: {
                  nodes: freshCanvasNodes,
                  edgeCount: fresh.edges.length,
                  nodeCountByKind: freshNodeCountByKind,
                },
                recentChat,
                firedMetaIds: [],
                workspaceId: fresh.workspaceId,
              },
            }
          )
          const meta = metaResponse.reflectOnIdeation
          const metaMsg: ChatMessage = {
            role: 'assistant',
            content: meta.content,
            timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            scaffold: meta.scaffold,
            source: meta.source,
            isMetaCheck: true,
          }
          get().setChatMessages([...get().chatMessages, metaMsg])
        } catch (err) {
          // Meta-check failure is non-fatal — the regular reflection
          // already landed; user can manually graduate via wizard or KB.
          console.warn('[reflectOnChat] meta-check failed', err)
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const errMsg: ChatMessage = {
        role: 'assistant',
        content: `（教练响应失败：${msg.slice(0, 160)}）`,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        scaffold: 'meta',
        source: 'error',
      }
      get().setChatMessages([...get().chatMessages, errMsg])
    } finally {
      set({ chatReflecting: false })
    }
  },

  // ============== @-mention agent (2026-05-04) ==============
  // Routes a chat message to a specific agent via GraphQL mentionAgent.
  // The mutation runs server-side: builds minimal BusinessState, calls
  // the agent's subgraph (or LlmDebateInvoker for debate/judge agents),
  // and persists any appended canvas nodes. We just paint the reply +
  // refresh the canvas if nodes changed.
  mentionAgent: async (agentId, message) => {
    const trimmed = message.trim()
    if (!trimmed) return
    const workspaceId = get().workspaceId
    if (!workspaceId) {
      get().setChatMessages([
        ...get().chatMessages,
        {
          role: 'assistant',
          content: 'workspaceId 未设置，无法 @ 唤起 agent',
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          source: 'error'
        }
      ])
      return
    }
    // Optimistic user message (the @ call as typed) so chat shows it immediately.
    get().setChatMessages([
      ...get().chatMessages,
      {
        role: 'user',
        content: `@${agentId} ${trimmed}`,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      }
    ])
    set({ chatReflecting: true })

    // P15 · pull user-role messages from current chat state to send as
    // priorChat. Without this, the first @-mention on a fresh canvas
    // has no idea what the user's pitch was (the /chat seed lives in
    // localStorage + chat dock, NOT in conversation_messages on the
    // server). Strip @-mention commands so context is the actual idea
    // content, not a chain of `@market-agent ...` lines.
    const priorChatUserMessages = (): string[] => {
      const msgs = get().chatMessages
      return msgs
        .filter((m) => m.role === 'user' && m.content.trim().length > 0)
        .map((m) => m.content.trim())
        .filter((c) => !/^\s*@\w[-\w]*\s+/.test(c) || c.length > 80)
        .slice(0, 10)
    }

    try {
      const client = getGraphQLClient()
      const data = await client.request<{
        mentionAgent: {
          agentId: string
          reply: string
          refused: boolean
          refusalReason: string | null
          appendedNodes: Array<{ id: string }>
          appendedEdges: Array<{ id: string }>
        }
      }>(MENTION_AGENT_MUTATION, {
        input: { workspaceId, agentId, message: trimmed, priorChat: priorChatUserMessages() }
      })

      const m = data.mentionAgent
      // Append assistant reply. Use 'mention' source so chat dock can
      // render it with the agent's byline + glyph (see canvas-chat-dock.tsx).
      // Cast through `as` because mentionedAgent / refused fields are
      // additions that the existing ChatMessage type doesn't yet declare —
      // the chat dock reads them via a runtime cast.
      get().setChatMessages([
        ...get().chatMessages,
        {
          role: 'assistant',
          content: m.reply || (m.refused ? (m.refusalReason ?? '已拒绝') : '(空响应)'),
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          source: m.refused ? 'error' : 'llm',
          // @ts-expect-error — extension fields for mention rendering
          mentionedAgent: m.agentId,
          // @ts-expect-error — extension field for mention rendering
          refused: m.refused
        }
      ])

      // If canvas was mutated, re-hydrate the workspace snapshot so the
      // BMC / 9-grid views update without requiring a full pipeline run.
      if (!m.refused && (m.appendedNodes.length > 0 || m.appendedEdges.length > 0)) {
        try {
          const fresh = await fetchWorkspaceGraphSnapshot(workspaceId)
          if (fresh && Array.isArray(fresh.nodes)) {
            const layoutNodes = applyCanvasLayout(
              'bmc-9-grid',
              fresh.nodes.map(mapCanvasNodeToReactFlow)
            )
            const macraMap = new Map<string, MacraNodeData>()
            fresh.nodes.forEach((node) => {
              const cn = node as unknown as CanvasNode
              const dataObj = (cn.data ?? {}) as Record<string, unknown>
              const meta = dataObj.meta as Record<string, unknown> | undefined
              if (!meta) return
              macraMap.set(cn.id, {
                id: cn.id,
                type: (meta.macraType || cn.type || 'cc-bmc-card') as MacraNodeData['type'],
                label: typeof dataObj.title === 'string' ? dataObj.title : '未命名',
                content: typeof dataObj.content === 'string' ? dataObj.content : '',
                domain: typeof meta.domain === 'string'
                  ? (meta.domain as MacraNodeData['domain'])
                  : undefined,
                metadata: ((meta.metadata as Record<string, unknown> | undefined) ?? {}) as MacraNodeData['metadata'],
                agentType: typeof meta.agentType === 'string'
                  ? (meta.agentType as MacraNodeData['agentType'])
                  : undefined,
                severity: typeof meta.severity === 'string'
                  ? (meta.severity as MacraNodeData['severity'])
                  : undefined,
                conflictType: typeof meta.conflictType === 'string'
                  ? (meta.conflictType as MacraNodeData['conflictType'])
                  : undefined,
                isInteractive: typeof meta.isInteractive === 'boolean' ? meta.isInteractive : undefined
              } as MacraNodeData)
            })
            set({
              nodes: layoutNodes,
              edges: fresh.edges.map(mapCanvasEdgeToReactFlow),
              macraNodes: macraMap
            })
          }
        } catch (err) {
          console.warn('[mentionAgent] hydrate after append failed', err)
        }
      }
    } catch (err) {
      console.error('@-mention failed', err)
      get().setChatMessages([
        ...get().chatMessages,
        {
          role: 'assistant',
          content: `@${agentId} 调用失败：${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          source: 'error',
          // @ts-expect-error — extension fields for mention rendering
          mentionedAgent: agentId,
          // @ts-expect-error — extension field for mention rendering
          refused: true
        }
      ])
    } finally {
      set({ chatReflecting: false })
    }
  },

  // ============== AI Critic 调用 ==============
  // P12 fix · was hitting Next.js /api/macra/critic which uses its
  // OWN LLM_API_KEY env (not configured in dev → 500 Internal Server
  // Error). Now routes through the proper backend `mentionAgent`
  // GraphQL mutation, which goes through the full critic pipeline:
  //   - critic-agent.yaml ReAct loop
  //   - LLM-failed → rule-based fallback
  //   - canvas_graphs persistence
  //   - conflict-alert nodes + red-dashed edges via build-conflict-edges
  //   - audit log (`critic.llm-failed-rule-based-fallback`)
  // The legacy /api/macra/critic route can be removed once we confirm
  // no other caller; for now the Next.js route stays as orphan code.
  callCritic: async () => {
    const { nodes, lastCriticRun, workspaceId } = get()

    // Throttle: 5s minimum gap between manual Re-Calc clicks.
    if (lastCriticRun && Date.now() - lastCriticRun < 5000) {
      return
    }
    // Need at least 4 nodes for cross-dimension conflict detection.
    if (nodes.length <= 3) {
      return
    }
    if (!workspaceId) {
      throw new Error('Critic 调用失败：未关联 workspace')
    }

    set({ isCriticProcessing: true, lastCriticRun: Date.now() })

    try {
      const { getGraphQLClient } = await import('@/shared/lib/graphql-client')
      const client = getGraphQLClient()
      const response = await client.request<{
        mentionAgent: {
          agentId: string
          reply: string
          refused: boolean
          refusalReason: string | null
          appendedNodes: Array<{ id: string }>
          appendedEdges: Array<{ id: string }>
        }
      }>(MENTION_AGENT_MUTATION, {
        input: {
          workspaceId,
          agentId: 'critic-agent',
          message: '基于当前画布的所有 BMC 节点检测跨维度逻辑冲突 / 资源-目标冲突 / 合规-业务冲突。',
          priorChat: get().chatMessages
            .filter((m) => m.role === 'user' && m.content.trim().length > 0)
            .map((m) => m.content.trim())
            .filter((c) => !/^\s*@\w[-\w]*\s+/.test(c) || c.length > 80)
            .slice(0, 10),
        },
      })

      const result = response.mentionAgent
      if (result.refused) {
        get().appendChatMessage({
          role: 'assistant',
          content: `Critic 暂未给出更新：${result.refusalReason ?? '未知原因'}`,
          source: 'scripted',
        })
      } else {
        // Backend mentionAgent already persisted appended nodes / edges
        // to canvas_graphs and pushed via subscription. The watcher in
        // `subscribeConversationProgress` handles state merge — no need
        // to apply locally. We DO show the reply text in chat for
        // user feedback.
        const conflictCount = result.appendedNodes.length
        get().appendChatMessage({
          role: 'assistant',
          content: conflictCount > 0
            ? `Critic 检测到 ${conflictCount} 处可能冲突，已在画布上标记为红虚线。\n\n${result.reply}`
            : `Critic 扫描完成，未发现重大冲突。\n\n${result.reply}`,
          source: 'scripted',
        })
      }

      set({ isCriticProcessing: false })
    } catch (error) {
      console.error('❌ Critic 调用失败:', error)
      set({ isCriticProcessing: false })
      throw error
    }
  },

  // ============== HITL 决策 ==============
  approveDecision: async (conversationId, decision) => {
    try {
      get().setWorkflowStage('revising', 'decision-approved')
      const client = getGraphQLClient()
      await client.request(APPROVE_DECISION_MUTATION, {
        conversationId,
        decision: decision ?? null
      })
      set({ pendingInterrupt: null })
    } catch (error) {
      console.error('❌ 决策审批失败:', error)
      set((state) => ({
        workflowStage: 'failed',
        workflowMeta: {
          ...state.workflowMeta,
          lastError: error instanceof Error ? error.message : '决策审批失败',
          lastTransitionReason: 'decision-approve-failed'
        }
      }))
      throw error
    }
  },

  dismissInterrupt: () => {
    set({ pendingInterrupt: null })
    get().setWorkflowStage('output', 'interrupt-dismissed')
  },

  // ============== 详情面板操作 ==============
  openDetailPanel: (nodeId) => {
    set({
      detailPanel: {
        isOpen: true,
        nodeId
      }
    })
  },

  setFocusedConflictId: (id) => {
    set({ focusedConflictId: id })
  },

  closeDetailPanel: () => {
    set({
      detailPanel: {
        isOpen: false,
        nodeId: null
      }
    })
  },

  // ============== 旧版本工作流执行（兼容） ==============
  executeNode: async (nodeId) => {
    const { nodes, edges, nodeDataMap } = get()
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return

    set({ executingNodeId: nodeId })
    get().setNodeStatus(nodeId, 'processing')

    try {
      if (node.type === 'agent') {
        const inputEdge = edges.find(e => e.target === nodeId)
        let inputContent: string = ''

        if (inputEdge) {
          const sourceData = nodeDataMap.get(inputEdge.source)
          if (sourceData?.resourceContent) {
            if (typeof sourceData.resourceContent === 'string') {
              inputContent = sourceData.resourceContent
            } else if (sourceData.resourceContent instanceof File) {
              inputContent = `文件: ${sourceData.resourceContent.name}`
            }
          }
        }

        const nodeData = nodeDataMap.get(nodeId)

        try {
          const response = await fetch('/api/ai/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: `${nodeData?.systemInstruction || '请分析以下内容'}\n\n输入内容: ${inputContent}`,
              agentType: nodeData?.agentType || 'data-analyst',
              timeline: [],
              edges: []
            })
          })

          if (!response.ok) {
            throw new Error('API调用失败')
          }

          const data = await response.json()
          const actionItems = Array.isArray(data.actionItems)
            ? data.actionItems.map((item: unknown, i: number) => `${i + 1}. ${String(item)}`).join('\n')
            : ''
          const result = `# 分析结果\n\n${data.summary || '分析完成'}\n\n## 详细信息\n\n${actionItems}`

          get().updateNodeData(nodeId, {
            agentResult: result,
            status: 'done'
          })
        } catch {
          const result = `# 分析结果 (Mock)\n\n## 输入分析\n\n输入内容: ${inputContent || '无'}\n\n## Agent信息\n\n- **Agent类型**: ${nodeData?.agentType || 'data-analyst'}\n- **系统指令**: ${nodeData?.systemInstruction || '无'}\n\n## 分析建议\n\n1. 建议进行进一步的数据收集\n2. 考虑多维度分析\n3. 与相关专家咨询\n\n**注意**: 这是模拟数据，实际API暂不可用。`

          get().updateNodeData(nodeId, {
            agentResult: result,
            status: 'done'
          })
        }
      }

      set({ executingNodeId: null })
    } catch (error) {
      get().updateNodeData(nodeId, {
        status: 'error',
        error: error instanceof Error ? error.message : '执行失败'
      })
      set({ executingNodeId: null })
    }
  },

  executeWorkflow: async () => {
    const { nodes, edges } = get()
    const visited = new Set<string>()
    const queue: string[] = []

    const resourceNodes = nodes.filter(n => n.type === 'resource')
    resourceNodes.forEach(n => queue.push(n.id))

    while (queue.length > 0) {
      const currentId = queue.shift()!
      if (visited.has(currentId)) continue
      visited.add(currentId)

      const node = nodes.find(n => n.id === currentId)
      if (!node) continue

      if (node.type === 'agent') {
        await get().executeNode(currentId)
      }

      const outgoingEdges = edges.filter(e => e.source === currentId)
      outgoingEdges.forEach(edge => {
        if (!visited.has(edge.target)) {
          queue.push(edge.target)
        }
      })
    }
  },

  reset: () => {
    if (activeSubscription) {
      activeSubscription()
      activeSubscription = null
    }
    set({
      nodes: [],
      edges: [],
      nodeDataMap: new Map(),
      macraNodes: new Map(),
      executingNodeId: null,
      executionQueue: [],
      isOrchestratorProcessing: false,
      isCriticProcessing: false,
      lastCriticRun: null,
      roundNumber: 0,
      pendingInterrupt: null,
      currentAgent: null,
      lastDeltaAt: null,
      knowledgeEvidence: [],
      citations: {},
      // P13 · workspace-switch full reset: clear stage-strip drivers so
      // the new workspace doesn't show stale phase / failure / breadcrumb.
      lastPhase: null,
      hasStreamFailed: false,
      subAgentActivity: null,
      evidenceDrawer: {
        isOpen: false,
        focusedEvidenceId: null,
        focusedSpanIndex: null,
        highlightedCardIds: []
      },
      currentConversationId: null,
      workflowStage: 'idle',
      workflowMeta: {
        startedAt: null,
        lastError: null,
        lastTransitionReason: null
      },
      activeToolId: null,
      toolRunStates: {},
      chatInput: '',
      chatMessages: createInitialChatMessages(),
      detailPanel: {
        isOpen: false,
        nodeId: null
      },
      focusedConflictId: null
    })
  }
}))

export type ComfyStore = MacraState
