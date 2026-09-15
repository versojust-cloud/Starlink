'use client'

import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Connection,
  addEdge
} from 'reactflow'
import type {
  IdeationNodeData,
  IdeationNodeKind
} from '../types/ideation-types'
import {
  commit as commitWizardStep,
  getInitialQuestion as getWizardOpening,
  type CanvasMutation,
  type StepId
} from '../conversation/ideation-conversation-engine'
import {
  getCoachGreeting,
  reflectOn,
  type CanvasSnapshot,
  type CoachEvent,
  type ScaffoldKind
} from '../conversation/coach-engine'
import {
  cancelPendingReflection,
  scheduleReflection,
  type OrchestratorContext,
  type OrchestratorResult
} from '../conversation/coach-orchestrator'
import type { ReflectionRequest } from '../types/coach-rpc-types'

// =============================================================================
// Chat & mode types
// =============================================================================

export type ChatRole = 'ai' | 'user' | 'system'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  /** ISO timestamp */
  createdAt: string
  /**
   * For AI messages: the Meflex-style scaffold kind that produced this prompt
   * (`why` / `how` / `evidence-needed` / etc). Used by the chat panel to
   * render a small kicker chip above the bubble — surfaces the *kind* of
   * coaching the AI is doing without the user having to read the message.
   */
  scaffold?: ScaffoldKind
  /**
   * Provenance for AI messages: did the content come from the live LLM, the
   * scripted local fallback, or did everything fail and we showed an apology?
   * Surfaced as a tiny mono tag next to the scaffold chip — academic-honest
   * about which path produced the content.
   */
  source?: 'llm' | 'scripted' | 'error'
  /** Server-measured wall time in ms (LLM only). */
  latencyMs?: number
}

/**
 * Coach mode (default): AI watches canvas, emits reflection prompts in chat,
 * NEVER auto-creates nodes. User has full agency.
 *
 * Wizard mode: scripted 7-step ideation flow, AI's questions auto-commit
 * user answers as new nodes (with edges between successive steps).
 *
 * Wizard auto-falls-back to coach when its `done` step is reached.
 */
export type IdeationMode = 'coach' | 'wizard'

/**
 * Canvas view mode (Stage D):
 *   'canvas' — free-form ReactFlow canvas (default)
 *   'bmc'    — read-only 9-grid output projecting current nodes onto the
 *              canonical CC-BMC dimensions via heuristic mapping
 *
 * Independent of `mode` (coach/wizard) — user can be in wizard mode AND
 * switch to BMC view to see what's been built so far.
 */
export type IdeationViewMode = 'canvas' | 'bmc'

// =============================================================================
// Store shape
// =============================================================================

export type IdeationFlowNode = Node<IdeationNodeData>

interface IdeationStore {
  // Canvas ----------------
  nodes: IdeationFlowNode[]
  edges: Edge[]
  inspectorNodeId: string | null

  // Chat ------------------
  chatMessages: ChatMessage[]
  /** input box draft text */
  chatDraft: string
  /** mode-specific runtime data */
  mode: IdeationMode
  wizardStep: StepId
  /** ids of meta-prompts already fired (so coach doesn't repeat them) */
  firedMetaIds: Set<string>
  /** number of reflections already emitted per kind, used for prompt rotation */
  perKindReflectionCount: Partial<Record<IdeationNodeKind, number>>
  /** trace ids → node ids for wizard step linking */
  traceToNodeId: Partial<Record<string, string>>
  /** true while a coach reflection is in-flight (chat panel renders thinking bubble) */
  coachThinking: boolean
  /** Canvas vs. BMC 9-grid output view */
  viewMode: IdeationViewMode

  // Node CRUD --------------
  addNode: (
    kind: IdeationNodeKind,
    position?: { x: number; y: number },
    /** internal: bypasses coach reflection (used by wizard to keep chat clean) */
    silent?: boolean
  ) => string
  addNodeAt: (kind: IdeationNodeKind, position: { x: number; y: number }) => string
  removeNode: (id: string) => void
  updateNodeData: <T extends IdeationNodeData = IdeationNodeData>(
    id: string,
    patch: Partial<T>
  ) => void

  // Inspector --------------
  openInspector: (id: string) => void
  closeInspector: () => void

  // React Flow handlers ----
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void

  // Chat -------------------
  setChatDraft: (text: string) => void
  /** user submits the chat input */
  submitChatMessage: () => void
  /** convenience: append a system note (e.g. "已切换到 Wizard 模式") */
  appendSystemMessage: (text: string) => void

  // Mode -------------------
  startWizard: () => void
  exitWizard: () => void

  // Bulk -------------------
  reset: () => void

  // View ------------------
  setViewMode: (mode: IdeationViewMode) => void

  // Coach manual control --
  /**
   * User explicitly requested a fresh reflection — bypasses the dedup
   * (firedMetaIds) so previously-shown meta prompts can fire again.
   * Routes through the same orchestrator → LLM path as automatic events.
   */
  requestManualReflection: () => void

  // Internal coach hooks (named with leading underscore by convention) -------
  _maybeReflectOnEvent: (event: CoachEvent) => void
  _maybeMetaCheck: () => void
}

// =============================================================================
// Helpers
// =============================================================================

const NOW = () => new Date().toISOString()
const newId = (prefix: string) => `${prefix}-${nanoid(8)}`

const DEFAULTS_BY_KIND: Record<IdeationNodeKind, () => IdeationNodeData> = {
  'core-idea': () => ({
    kind: 'core-idea', label: '核心想法', pitch: '', content: '',
    createdAt: NOW(), updatedAt: NOW()
  }),
  'customer-pain': () => ({
    kind: 'customer-pain', label: '客户痛点', content: '',
    createdAt: NOW(), updatedAt: NOW()
  }),
  'value-angle': () => ({
    kind: 'value-angle', label: '价值角度', content: '',
    createdAt: NOW(), updatedAt: NOW()
  }),
  hypothesis: () => ({
    kind: 'hypothesis', label: '假设', claim: '', status: 'unverified', content: '',
    createdAt: NOW(), updatedAt: NOW()
  }),
  'validation-channel': () => ({
    kind: 'validation-channel', label: '验证渠道', content: '',
    createdAt: NOW(), updatedAt: NOW()
  }),
  revenue: () => ({
    kind: 'revenue', label: '收入流', content: '',
    createdAt: NOW(), updatedAt: NOW()
  }),
  risk: () => ({
    kind: 'risk', label: '风险', severity: 'medium', content: '',
    createdAt: NOW(), updatedAt: NOW()
  }),
  evidence: () => ({
    kind: 'evidence', label: '证据', content: '',
    createdAt: NOW(), updatedAt: NOW()
  }),
  reflection: () => ({
    kind: 'reflection', label: 'AI 反思', scaffold: 'why', acknowledged: false,
    content: '', createdAt: NOW(), updatedAt: NOW()
  })
}

function buildNode(
  kind: IdeationNodeKind,
  position: { x: number; y: number }
): IdeationFlowNode {
  return {
    id: `idea-${kind}-${nanoid(8)}`,
    type: kind,
    position,
    data: DEFAULTS_BY_KIND[kind]()
  }
}

function buildSnapshot(nodes: IdeationFlowNode[], edges: Edge[]): CanvasSnapshot {
  const counts: Partial<Record<IdeationNodeKind, number>> = {}
  for (const n of nodes) {
    const kind = (n.data?.kind ?? 'core-idea') as IdeationNodeKind
    counts[kind] = (counts[kind] ?? 0) + 1
  }
  return {
    nodeCountByKind: counts,
    totalNodes: nodes.length,
    totalLinks: edges.length
  }
}

/** Apply wizard mutations to the canvas, returning a map of trace → nodeId. */
function applyMutations(
  mutations: CanvasMutation[],
  state: { nodes: IdeationFlowNode[]; edges: Edge[]; traceToNodeId: Partial<Record<string, string>> }
): { nodes: IdeationFlowNode[]; edges: Edge[]; traceToNodeId: Partial<Record<string, string>> } {
  let { nodes, edges, traceToNodeId } = state
  // Position wizard nodes in a column on the LEFT half of the canvas, stacking
  // downward so they don't overlap. The user can rearrange after.
  let yOffset = 80 + nodes.length * 40
  for (const m of mutations) {
    if (m.type === 'add-node') {
      const node = buildNode(m.kind, { x: 200, y: yOffset })
      yOffset += 200
      node.data = {
        ...node.data,
        label: m.label,
        content: m.content,
        updatedAt: NOW()
      } as IdeationNodeData
      nodes = [...nodes, node]
      traceToNodeId = { ...traceToNodeId, [m.trace]: node.id }
    } else if (m.type === 'link') {
      const source = traceToNodeId[m.fromTrace]
      const target = traceToNodeId[m.toTrace]
      if (source && target) {
        edges = [
          ...edges,
          {
            id: `e-${source}-${target}`,
            source,
            target,
            type: 'default',
            animated: true
          }
        ]
      }
    }
  }
  return { nodes, edges, traceToNodeId }
}

// =============================================================================
// Store implementation
// =============================================================================

export const useIdeationStore = create<IdeationStore>()(
  persist(
    (set, get) => ({
  nodes: [],
  edges: [],
  inspectorNodeId: null,

  chatMessages: [
    (() => {
      const greeting = getCoachGreeting()
      return {
        id: newId('msg'),
        role: 'ai' as const,
        content: greeting.content,
        scaffold: greeting.scaffold,
        createdAt: NOW()
      }
    })()
  ],
  chatDraft: '',
  mode: 'coach',
  wizardStep: 'core-idea',
  firedMetaIds: new Set(),
  perKindReflectionCount: {},
  traceToNodeId: {},
  coachThinking: false,
  viewMode: 'canvas',

  // ----------------------------------------------------------------- Node CRUD

  addNode: (kind, position, silent = false) => {
    const pos = position ?? {
      x: Math.random() * 400 + 200,
      y: Math.random() * 300 + 150
    }
    const node = buildNode(kind, pos)
    set((state) => ({ nodes: [...state.nodes, node] }))
    if (!silent) {
      get()._maybeReflectOnEvent({ type: 'node-added', kind, label: node.data.label })
      get()._maybeMetaCheck()
    }
    return node.id
  },

  addNodeAt: (kind, position) => {
    return get().addNode(kind, position)
  },

  removeNode: (id) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      inspectorNodeId: state.inspectorNodeId === id ? null : state.inspectorNodeId
    }))
  },

  updateNodeData: (id, patch) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                ...patch,
                updatedAt: NOW()
              } as IdeationNodeData
            }
          : node
      )
    }))
  },

  // ----------------------------------------------------------------- Inspector

  openInspector: (id) => set({ inspectorNodeId: id }),
  closeInspector: () => set({ inspectorNodeId: null }),

  // ---------------------------------------------------------- React Flow hooks

  onNodesChange: (changes) => {
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) as IdeationFlowNode[] }))
  },
  onEdgesChange: (changes) => {
    set((state) => ({ edges: applyEdgeChanges(changes, state.edges) }))
  },
  onConnect: (connection) => {
    const { source, target, nodes } = (() => {
      const c = connection
      const ns = get().nodes
      return { source: c.source, target: c.target, nodes: ns }
    })()
    set((state) => ({
      edges: addEdge(
        { ...connection, type: 'default', animated: true },
        state.edges
      )
    }))
    if (source && target) {
      const fromKind = (nodes.find((n) => n.id === source)?.data?.kind ?? 'core-idea') as IdeationNodeKind
      const toKind = (nodes.find((n) => n.id === target)?.data?.kind ?? 'core-idea') as IdeationNodeKind
      get()._maybeReflectOnEvent({ type: 'node-linked', fromKind, toKind })
    }
  },

  // ----------------------------------------------------------------- Chat I/O

  setChatDraft: (text) => set({ chatDraft: text }),

  submitChatMessage: () => {
    const { chatDraft, mode } = get()
    const trimmed = chatDraft.trim()
    if (!trimmed) return

    // Append user message + clear draft
    const userMsg: ChatMessage = {
      id: newId('msg'),
      role: 'user',
      content: trimmed,
      createdAt: NOW()
    }
    set((state) => ({
      chatMessages: [...state.chatMessages, userMsg],
      chatDraft: ''
    }))

    if (mode === 'wizard') {
      // Wave γ: try LLM-augmented step processing first, fall back to
      // scripted commitWizardStep on failure. The store flips
      // `coachThinking` so the chat panel renders a thinking bubble while
      // we wait for the LLM (~1-2s) — same UX as coach mode.
      const { wizardStep } = get()
      set({ coachThinking: true })
      void (async () => {
        try {
          const llmResult = await callWizardStepLlm(get())
          set((state) => {
            const applied = applyMutations(
              [
                {
                  type: 'add-node',
                  kind: llmResult.extracted.kind,
                  label: llmResult.extracted.label,
                  content: llmResult.extracted.content,
                  trace: state.wizardStep
                },
                // Link to the previous step's node when both exist
                ...(state.traceToNodeId[previousTraceOf(state.wizardStep)]
                  ? [
                      {
                        type: 'link' as const,
                        fromTrace: previousTraceOf(state.wizardStep),
                        toTrace: state.wizardStep
                      }
                    ]
                  : [])
              ],
              {
                nodes: state.nodes,
                edges: state.edges,
                traceToNodeId: state.traceToNodeId
              }
            )
            return {
              coachThinking: false,
              nodes: applied.nodes,
              edges: applied.edges,
              traceToNodeId: applied.traceToNodeId,
              wizardStep: llmResult.nextStep,
              chatMessages: [
                ...state.chatMessages,
                {
                  id: newId('msg'),
                  role: 'ai',
                  content: llmResult.nextQuestion,
                  scaffold: 'meta',
                  source: llmResult.source,
                  latencyMs: llmResult.latencyMs,
                  createdAt: NOW()
                }
              ]
            }
          })
          if (llmResult.nextStep === 'done') {
            get().exitWizard()
          }
        } catch (err) {
          // True fallback: use scripted commit
          console.warn('[ideation-store] wizard LLM call failed, using scripted', err)
          const result = commitWizardStep(wizardStep, trimmed)
          set((state) => {
            const applied = applyMutations(result.mutations, {
              nodes: state.nodes,
              edges: state.edges,
              traceToNodeId: state.traceToNodeId
            })
            return {
              coachThinking: false,
              nodes: applied.nodes,
              edges: applied.edges,
              traceToNodeId: applied.traceToNodeId,
              wizardStep: result.nextStep,
              chatMessages: [
                ...state.chatMessages,
                {
                  id: newId('msg'),
                  role: 'ai',
                  content: result.nextAiMessage,
                  scaffold: 'meta',
                  source: 'scripted',
                  createdAt: NOW()
                }
              ]
            }
          })
          if (result.nextStep === 'done') {
            get().exitWizard()
          }
        }
      })()
    } else {
      // Coach mode — Stage A doesn't have a real LLM, so we just acknowledge.
      // Stage C will route this through the LLM with the canvas snapshot as
      // context and produce a contextual reply.
      set((state) => ({
        chatMessages: [
          ...state.chatMessages,
          {
            id: newId('msg'),
            role: 'ai',
            content:
              '收到 ✓\n\n你的回答记下了。继续在画布上加节点 / 连线，我会跟着出反思问题。\n\n（Stage C 接入 LLM 后，我会针对你的回答给定向回应。）',
            createdAt: NOW()
          }
        ]
      }))
    }
  },

  appendSystemMessage: (text) => {
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        { id: newId('msg'), role: 'system', content: text, createdAt: NOW() }
      ]
    }))
  },

  // -------------------------------------------------------------- Mode toggle

  startWizard: () => {
    const opening = getWizardOpening()
    set((state) => ({
      mode: 'wizard',
      wizardStep: opening.step,
      chatMessages: [
        ...state.chatMessages,
        {
          id: newId('msg'),
          role: 'system',
          content: '🧙 已启动 7 步引导模式 — 跟着问题一步步答，画布会同步生成。'
        ,
          createdAt: NOW()
        },
        {
          id: newId('msg'),
          role: 'ai',
          content: opening.message,
          createdAt: NOW()
        }
      ]
    }))
  },

  setViewMode: (mode) => set({ viewMode: mode }),

  requestManualReflection: () => {
    const { mode, nodes, edges, perKindReflectionCount } = get()
    if (mode !== 'coach') return
    if (nodes.length === 0) return // nothing to reflect on
    const snap = buildSnapshot(nodes, edges)
    // CLEAR firedMetaIds for this manual round so meta triggers can re-fire.
    // (Stays cleared — the user is explicitly opting back into seeing the
    // full set of observations.)
    set({ firedMetaIds: new Set() })
    const freshFiredIds = new Set<string>()
    const scriptedFallback = reflectOn(
      { type: 'manual-reflect', canvasSnapshot: snap },
      freshFiredIds,
      perKindReflectionCount
    )
    scheduleReflection(
      { type: 'manual-reflect', canvasSnapshot: snap },
      () => buildOrchestratorContext(get()),
      scriptedFallback,
      {
        onStart: () => set({ coachThinking: true }),
        onComplete: (result) => appendCoachReflection(set, result)
      },
      // Manual is user-initiated — no debounce; fire immediately
      { debounceMs: 0 }
    )
  },

  exitWizard: () => {
    set((state) => ({
      mode: 'coach',
      wizardStep: 'core-idea',
      chatMessages: [
        ...state.chatMessages,
        {
          id: newId('msg'),
          role: 'system',
          content:
            '✓ 引导完成 — 已切回陪伴模式。继续在画布上打磨节点，我会在旁边出反思问题。',
          createdAt: NOW()
        }
      ]
    }))
  },

  // ---------------------------------------------------------------------- Bulk

  reset: () => {
    const greeting = getCoachGreeting()
    cancelPendingReflection()
    set({
      nodes: [],
      edges: [],
      inspectorNodeId: null,
      chatMessages: [
        {
          id: newId('msg'),
          role: 'ai',
          content: greeting.content,
          scaffold: greeting.scaffold,
          createdAt: NOW()
        }
      ],
      chatDraft: '',
      mode: 'coach',
      wizardStep: 'core-idea',
      firedMetaIds: new Set(),
      perKindReflectionCount: {},
      traceToNodeId: {},
      coachThinking: false,
      viewMode: 'canvas'
    })
  },

  // -------------------------------------------------------- Internal coach API

  /**
   * Route a coach event to the LLM via the orchestrator. Local `reflectOn`
   * is used to compute a scripted fallback synchronously up-front — if the
   * LLM call fails, the fallback is shown without an extra round-trip.
   *
   * Bumps `perKindReflectionCount` synchronously so back-to-back rapid
   * adds cycle through prompt variants, even though the LLM call itself
   * is debounced and async.
   */
  _maybeReflectOnEvent: (event: CoachEvent) => {
    const { mode, firedMetaIds, perKindReflectionCount } = get()
    if (mode !== 'coach') return // wizard owns its own narrative

    // 1) Compute scripted fallback (used if LLM fails)
    const scriptedFallback = reflectOn(event, firedMetaIds, perKindReflectionCount)
    if (!scriptedFallback) return // for rare events with no scripted prompt

    // 2) Bump per-kind counter NOW (sync) so prompt rotation works on rapid adds
    if (event.type === 'node-added') {
      set((state) => ({
        perKindReflectionCount: {
          ...state.perKindReflectionCount,
          [event.kind]: (state.perKindReflectionCount[event.kind] ?? 0) + 1
        }
      }))
    }

    // 3) Schedule the LLM call (debounced, will fall back to scripted on failure)
    scheduleReflection(
      event,
      () => buildOrchestratorContext(get()),
      scriptedFallback,
      {
        onStart: () => set({ coachThinking: true }),
        onComplete: (result) => appendCoachReflection(set, result)
      }
    )
  },

  _maybeMetaCheck: () => {
    const { mode, nodes, edges, firedMetaIds, perKindReflectionCount } = get()
    if (mode !== 'coach') return
    const snap = buildSnapshot(nodes, edges)

    // Use scripted reflectOn to decide IF a meta should fire (threshold gates)
    const scriptedFallback = reflectOn(
      { type: 'meta-check', canvasSnapshot: snap },
      firedMetaIds,
      perKindReflectionCount
    )
    if (!scriptedFallback) return // no threshold crossed

    // Fire through orchestrator. LLM gets the contextually-richer prompt;
    // scripted is the fallback content if LLM fails.
    scheduleReflection(
      { type: 'meta-check', canvasSnapshot: snap },
      () => buildOrchestratorContext(get()),
      scriptedFallback,
      {
        onStart: () => set({ coachThinking: true }),
        onComplete: (result) => appendCoachReflection(set, result)
      }
    )
  }
}),
    {
      name: 'starlink-ideation-v1',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? localStorage : undefined as unknown as Storage)),
      // Custom serialization: Sets aren't JSON-serializable, so we round-trip
      // firedMetaIds as an array. Other state is JSON-friendly already.
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        chatMessages: state.chatMessages,
        chatDraft: state.chatDraft,
        mode: state.mode,
        wizardStep: state.wizardStep,
        traceToNodeId: state.traceToNodeId,
        viewMode: state.viewMode,
        perKindReflectionCount: state.perKindReflectionCount,
        // Set → array
        firedMetaIds: Array.from(state.firedMetaIds) as unknown as Set<string>
      }),
      onRehydrateStorage: () => (rehydrated) => {
        // After hydration, coerce firedMetaIds back to a Set
        if (rehydrated && Array.isArray(rehydrated.firedMetaIds as unknown)) {
          rehydrated.firedMetaIds = new Set(rehydrated.firedMetaIds as unknown as string[])
        }
        // coachThinking + inspectorNodeId should always start fresh on reload
        // — they're transient UI state. Nothing to do (they're not in
        // partialize, so they default to the initial value).
      },
      // Bump this if we ever change the store shape in a backward-incompatible
      // way; old persisted state with mismatched version is discarded.
      version: 1
    }
  )
)

// =============================================================================
// Helpers used by the coach hooks
// =============================================================================

/**
 * Build the lightweight context payload sent to /api/ideation/reflect.
 * Trims node content to 200 chars/node, takes only last 8 chat messages,
 * filters out system divider rows.
 */
function buildOrchestratorContext(
  state: IdeationStore
): OrchestratorContext {
  const nodes: ReflectionRequest['canvas']['nodes'] = state.nodes
    .slice(-20) // most-recent 20 nodes
    .map((n) => ({
      id: n.id,
      kind: n.data.kind,
      label: n.data.label,
      content: n.data.content.slice(0, 200)
    }))

  const nodeCountByKind: Record<string, number> = {}
  for (const n of state.nodes) {
    const kind = n.data.kind
    nodeCountByKind[kind] = (nodeCountByKind[kind] ?? 0) + 1
  }

  const recentChat: ReflectionRequest['recentChat'] = state.chatMessages
    .filter((m) => m.role === 'ai' || m.role === 'user')
    .slice(-8)
    .map((m) => ({
      role: m.role as 'ai' | 'user',
      content: m.content.slice(0, 240)
    }))

  return {
    canvas: {
      nodes,
      edgeCount: state.edges.length,
      nodeCountByKind
    },
    recentChat,
    firedMetaIds: Array.from(state.firedMetaIds)
  }
}

/**
 * Wizard step ids in canonical order, used to look up "previous trace" for
 * inter-step linking. Mirrors the backend's STEP_ORDER in
 * /api/ideation/wizard-step/route.ts.
 */
const WIZARD_STEP_ORDER: StepId[] = [
  'core-idea',
  'customer-pain',
  'value-angle',
  'hypothesis',
  'validation',
  'revenue',
  'risk',
  'meta',
  'done'
]

function previousTraceOf(step: StepId): StepId {
  const idx = WIZARD_STEP_ORDER.indexOf(step)
  if (idx <= 0) return step
  return WIZARD_STEP_ORDER[idx - 1]
}

interface WizardLlmResult {
  extracted: {
    kind: IdeationNodeKind
    label: string
    content: string
  }
  nextQuestion: string
  nextStep: StepId
  source: 'llm' | 'scripted' | 'error'
  latencyMs?: number
}

/**
 * Call /api/ideation/wizard-step. Wraps the fetch in a 12s timeout via
 * AbortController (matches backend timeout). Returns the parsed JSON or
 * throws — store handles the throw with scripted fallback.
 */
async function callWizardStepLlm(state: IdeationStore): Promise<WizardLlmResult> {
  const lastUserMsg = state.chatMessages
    .filter((m) => m.role === 'user')
    .at(-1)
  if (!lastUserMsg) throw new Error('no user answer to commit')

  const canvas = {
    nodes: state.nodes.slice(-20).map((n) => ({
      id: n.id,
      kind: n.data.kind,
      label: n.data.label,
      content: n.data.content.slice(0, 200)
    })),
    edgeCount: state.edges.length
  }
  const recentChat = state.chatMessages
    .filter((m) => m.role === 'ai' || m.role === 'user')
    .slice(-8)
    .map((m) => ({
      role: m.role as 'ai' | 'user',
      content: m.content.slice(0, 240)
    }))

  const ac = new AbortController()
  const timeoutId = setTimeout(() => ac.abort(), 12_000)
  try {
    const res = await fetch('/api/ideation/wizard-step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step: state.wizardStep,
        userAnswer: lastUserMsg.content,
        canvas,
        recentChat
      }),
      signal: ac.signal
    })
    if (!res.ok) throw new Error(`wizard-step HTTP ${res.status}`)
    const json = (await res.json()) as WizardLlmResult
    return json
  } finally {
    clearTimeout(timeoutId)
  }
}

/** Append a reflection result to chat history + clear thinking state. */
function appendCoachReflection(
  set: (
    partial:
      | Partial<IdeationStore>
      | ((state: IdeationStore) => Partial<IdeationStore>)
  ) => void,
  result: OrchestratorResult
): void {
  set((state) => ({
    coachThinking: false,
    chatMessages: [
      ...state.chatMessages,
      {
        id: newId('msg'),
        role: 'ai',
        content: result.content,
        scaffold: result.scaffold,
        source: result.source,
        latencyMs: result.latencyMs,
        createdAt: NOW()
      }
    ]
  }))
}

/** Selector helper: get the inspected node, if any. */
export function useInspectedNode(): IdeationFlowNode | null {
  const id = useIdeationStore((s) => s.inspectorNodeId)
  const node = useIdeationStore((s) => (id ? s.nodes.find((n) => n.id === id) : null))
  return node ?? null
}
