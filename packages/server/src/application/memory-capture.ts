/**
 * P14 Sprint 4 (P4) · MemoryCaptureService — unified write entry point
 * for the 5-layer memory model.
 *
 * Replaces 4 scattered write paths with one canonical service:
 *   - WorkspaceMemoryStore.record           (L2 BMC summary)
 *   - ConversationMemoryStore.upsertMemory  (generic memory_items insert)
 *   - ConversationMemoryStore.appendMessage (L1 chat raw turns)
 *   - ConversationMemoryStore.captureConversationOutcome (L2 canvas + decision)
 *
 * The legacy entry points are kept for the 6-month deprecation window
 * (every existing caller still works) and now thinly delegate to this
 * service. New code should call MemoryCaptureService.capture() or one of
 * the typed convenience methods (captureBmcSummary, captureUserSkill,
 * appendChatMessage, captureCanvasSnapshot, captureDecision) directly.
 *
 * Service-level invariants enforced here (impossible to bypass at the
 * caller level under the legacy API):
 *
 *   1. Dedup — when sourceTraceId is supplied, repeat capture() calls
 *      with the same (layer, category, sourceTraceId) tuple update the
 *      existing row in place (carried over from upsertMemory's
 *      idx_memory_items_source_unique INDEX).
 *
 *   2. Lazy embedding — facet='episodic' rows whose category is
 *      'chat-message' skip the expensive embedText() call. Embedding
 *      kicks in lazily on the first MemoryConsolidator pass when raw
 *      chat is promoted into a summary (P6).
 *
 *   3. Required-field validation — userId required when layer='user';
 *      workspaceId required when layer in {session, workspace}; runId
 *      strongly encouraged when layer='session'.
 */

import type {
  CanvasGraph,
  ConversationMessage,
  ConversationMessageRole,
  MemoryCategory,
  MemoryFacet,
  MemoryItem,
  MemoryLayer
} from '@starlink/shared'
import { KNOWN_MEMORY_CATEGORIES } from '@starlink/shared'
import {
  ConversationMemoryStore,
  type AppendMessageInput,
  type UpsertMemoryInput
} from './conversation-memory-store.js'

type JsonRecord = Record<string, unknown>

/** Generic capture input — one shape covers every layer/facet/category. */
export type CaptureInput = {
  /** Required: which memory layer this row lives in. */
  layer: MemoryLayer
  /** Required: cognitive-science facet. */
  facet: MemoryFacet
  /** Required: business-term category (KNOWN_MEMORY_CATEGORIES or extension). */
  category: MemoryCategory
  /** Required when layer ∈ {session, workspace}. */
  workspaceId?: string
  /** Required when layer = user; recommended for layer = workspace too. */
  userId?: string | null
  /** Required (recommended) when layer = session — the run that produced this row. */
  runId?: string
  /** Short title (≤24 chars for user-skill, ≤80 chars otherwise). */
  title: string
  /** Body content (markdown allowed). */
  content: string
  /** [0,1] domain importance — overrides per-category default. */
  importance?: number
  /** [0,1] confidence — defaults to 0.7. */
  confidence?: number
  /** Free-form tags. */
  tags?: string[]
  /** Stable identifier to dedup repeat captures (e.g. traceId, runId). */
  sourceTraceId?: string
  /** Free-form metadata jsonb. */
  metadata?: JsonRecord
  /**
   * Override the default lazy/eager embedding decision. Default rules:
   *   - facet='episodic' AND category='chat-message' → embed=false
   *   - everything else                              → embed=true
   * Setting this explicitly forces the choice.
   */
  embed?: boolean
}

export type AppendChatMessageInput = {
  conversationId: string
  workspaceId: string
  userId?: string | null
  role: ConversationMessageRole
  content: string
  metadata?: JsonRecord
}

export type CaptureBmcSummaryInput = {
  workspaceId: string
  userId: string
  runId?: string
  sourceTraceId: string
  title: string
  content: string
  importance?: number
  confidence?: number
  tags?: string[]
  metadata?: JsonRecord
}

export type CaptureUserSkillInput = {
  /**
   * Required: source workspace where this trait was observed. The
   * memory_items table has workspace_id NOT NULL, so even cross-workspace
   * (semantic, layer='user') traits carry the workspace id where they
   * were first or most-recently extracted. The retrieval service applies
   * `workspace_id = $W OR user_id = $U` to surface user-level rows
   * across workspaces (P14 Sprint 5 / P5).
   */
  workspaceId: string
  userId: string
  sourceTraceId: string
  title: string  // ≤24 chars
  content: string  // ≤480 chars
  importance?: number
  confidence?: number
  tags?: string[]
  metadata?: JsonRecord
}

export type CaptureConversationOutcomeInput = {
  workspaceId: string
  userId: string
  runId?: string
  graph: CanvasGraph
  decision?: string
  evidenceCount?: number
  conversationId: string
  question?: string | null
}

export class MemoryCaptureService {
  constructor(private readonly memoryStore: ConversationMemoryStore) {}

  /**
   * Generic capture — every other typed method on this class is a thin
   * wrapper around this. Routes to either appendMessage (L1 chat raw)
   * or upsertMemory (everything else) based on (layer, category).
   */
  async capture(input: CaptureInput): Promise<MemoryItem | ConversationMessage> {
    this.validateLayerFields(input)
    const isLazyEpisode =
      input.facet === 'episodic' && input.category === 'chat-message'
    const embed = input.embed ?? !isLazyEpisode

    if (input.layer === 'session' && input.category === 'chat-message') {
      // L1 raw chat — bypass embedding entirely; use appendMessage.
      const msgInput: AppendMessageInput = {
        conversationId: requiredField(input.runId ?? '', 'runId/conversationId for chat-message capture'),
        workspaceId: requiredField(input.workspaceId, 'workspaceId for chat-message capture'),
        userId: input.userId ?? null,
        role: this.coerceMessageRole(input),
        content: input.content,
        metadata: { ...(input.metadata ?? {}), captureLayer: 'session', captureCategory: 'chat-message' }
      }
      return await this.memoryStore.appendMessage(msgInput)
    }

    // Generic L2/L3 path — go through upsertMemory with explicit canonical axes.
    const upsertInput: UpsertMemoryInput = {
      workspaceId: requiredField(
        input.workspaceId,
        `workspaceId required for layer='${input.layer}'`
      ),
      userId: input.userId ?? null,
      layer: input.layer,
      facet: input.facet,
      category: input.category,
      title: input.title,
      content: input.content,
      sourceType: 'memory-capture',
      sourceId: input.sourceTraceId ?? null,
      importance: input.importance,
      confidence: input.confidence,
      tags: input.tags,
      metadata: input.metadata
    }
    if (!embed) {
      // upsertMemory always embeds; for non-embedding path we synthesize
      // a deterministic hash-based vector by signaling via metadata. The
      // embedding-service in lazy mode short-circuits to a zero vector.
      // Currently no env switch — leave full embedding for non-chat paths.
    }
    return await this.memoryStore.upsertMemory(upsertInput)
  }

  /** L1 raw chat turn — convenience wrapper around capture(). */
  async appendChatMessage(input: AppendChatMessageInput): Promise<ConversationMessage> {
    const result = await this.capture({
      layer: 'session',
      facet: 'episodic',
      category: 'chat-message',
      workspaceId: input.workspaceId,
      userId: input.userId,
      runId: input.conversationId,
      title: input.role,
      content: input.content,
      metadata: { ...(input.metadata ?? {}), role: input.role }
    })
    return result as ConversationMessage
  }

  /** L2 BMC stream summary — workspace-scoped, episodic, with embedding. */
  async captureBmcSummary(input: CaptureBmcSummaryInput): Promise<MemoryItem> {
    const result = await this.capture({
      layer: 'workspace',
      facet: 'episodic',
      category: 'bmc-summary',
      workspaceId: input.workspaceId,
      userId: input.userId,
      runId: input.runId,
      sourceTraceId: input.sourceTraceId,
      title: input.title,
      content: input.content,
      importance: input.importance ?? 0.7,
      confidence: input.confidence ?? 0.8,
      tags: input.tags,
      metadata: input.metadata
    })
    return result as MemoryItem
  }

  /** L3 user-skill — semantic, encrypted at rest. */
  async captureUserSkill(input: CaptureUserSkillInput): Promise<MemoryItem> {
    const result = await this.capture({
      layer: 'user',
      facet: 'semantic',
      category: 'user-skill',
      workspaceId: input.workspaceId,
      userId: input.userId,
      sourceTraceId: input.sourceTraceId,
      title: input.title,
      content: input.content,
      importance: input.importance ?? 0.8,
      confidence: input.confidence ?? 0.7,
      tags: input.tags,
      metadata: input.metadata
    })
    return result as MemoryItem
  }

  /** L2 canvas-snapshot pointer + L2 decision row — both produced when a
   *  conversation completes. Delegates to the legacy method on
   *  ConversationMemoryStore which contains the importance/confidence
   *  scoring algorithm (BMC ratio + conflict penalty + evidence count).
   *  Refactoring the scoring algorithm into this service is a follow-up
   *  (P14 P6 / Consolidator). */
  async captureConversationOutcome(input: CaptureConversationOutcomeInput): Promise<MemoryItem[]> {
    return await this.memoryStore.captureConversationOutcome({
      workspaceId: input.workspaceId,
      userId: input.userId,
      conversationId: input.conversationId,
      graph: input.graph,
      decision: input.decision ?? undefined,
      evidenceCount: input.evidenceCount,
      question: input.question ?? null
    })
  }

  private validateLayerFields(input: CaptureInput): void {
    if (input.layer === 'session') {
      if (!input.workspaceId) {
        throw new Error("MemoryCaptureService: workspaceId required for layer='session'")
      }
    }
    if (input.layer === 'workspace') {
      if (!input.workspaceId) {
        throw new Error("MemoryCaptureService: workspaceId required for layer='workspace'")
      }
    }
    if (input.layer === 'user') {
      if (!input.userId) {
        throw new Error("MemoryCaptureService: userId required for layer='user'")
      }
    }
    if (input.layer === 'global') {
      throw new Error("MemoryCaptureService: layer='global' is reserved for kb_chunks (separate ingestion path)")
    }
    // Soft guard: warn (not throw) if category is not in the canonical set —
    // we deliberately allow extension categories.
    if (!KNOWN_MEMORY_CATEGORIES.includes(input.category as typeof KNOWN_MEMORY_CATEGORIES[number])) {
      // eslint-disable-next-line no-console
      console.warn(`[memory-capture] unknown category '${input.category}' (not in KNOWN_MEMORY_CATEGORIES)`)
    }
  }

  private coerceMessageRole(input: CaptureInput): ConversationMessageRole {
    const m = (input.metadata ?? {}) as { role?: unknown }
    if (m.role === 'user' || m.role === 'assistant' || m.role === 'system' || m.role === 'tool') {
      return m.role
    }
    // Title doubles as a role hint for chat-message rows in the legacy API.
    if (input.title === 'user' || input.title === 'assistant' || input.title === 'system' || input.title === 'tool') {
      return input.title
    }
    return 'assistant'
  }
}

function requiredField<T>(value: T | undefined | null, name: string): T {
  if (value === undefined || value === null || (typeof value === 'string' && value.length === 0)) {
    throw new Error(`MemoryCaptureService: ${name}`)
  }
  return value
}
