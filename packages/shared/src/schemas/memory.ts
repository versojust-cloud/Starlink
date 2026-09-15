import { z } from 'zod'
import { knowledgeEvidenceSchema } from './conversation.js'

export const conversationMessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool'])

// =============================================================================
// P14 · 5-layer × CCRF memory model (added 2026-05-09)
// =============================================================================
// New canonical axes:
//
//   - `memoryLayer`: where this memory lives in the 5-layer hierarchy. The
//     L0 'working' tier is in-memory only (BusinessState) and never reaches
//     the DB. The L4 'global' tier covers kb_chunks, separate table.
//
//   - `memoryFacet`: cognitive-science classification of memory content
//     (episodic / semantic / procedural). Independent of layer.
//
//   - `category`: free-form business string within a (layer, facet) tuple.
//     Constrained by KNOWN_MEMORY_CATEGORIES below but allowed to grow as
//     new domains emerge.
//
// Legacy axes `memoryScope` + `memoryKind` are kept for the 6-month
// deprecation window (until 2026-11-09) so old callers keep working while
// they migrate to the new schema.
// =============================================================================

export const memoryLayerSchema = z.enum(['session', 'workspace', 'user', 'global'])
export const memoryFacetSchema = z.enum(['episodic', 'semantic', 'procedural'])

/**
 * Canonical category values. Free-form `string` is also accepted (so domain
 * extensions don't require schema migration), but new code should prefer
 * one of these values for canonical retrieval keys.
 */
export const KNOWN_MEMORY_CATEGORIES = [
  // facet=episodic
  'bmc-summary',         // L2 · per-stream BMC outcome summary
  'canvas-snapshot',     // L2 · denormalized canvas state pointer
  'decision',            // L2 · final outcome / latestDecision
  'conflict',            // L2 · critic-detected dimension conflict
  'chat-message',        // L1 · raw chat turn (lazy-embedded)

  // facet=semantic
  'user-skill',          // L3 · durable user trait (domain / style / blind-spot)
  'user-preference',     // L3 · weak preference (UI / format / cadence)
  'user-constraint',     // L3 · hard constraint (budget / time / 单创)
  'workspace-fact'       // L2 · this idea's structured facts (target market, sector, ...)
] as const

export const memoryCategorySchema = z.string().min(1).max(64)

// Legacy axes (deprecated — DO NOT use in new code).
/**
 * @deprecated P14 · use {@link memoryLayerSchema} instead. The 'agent' value
 * was never written by any code path (audited 2026-05-09, 0 references) and
 * has been dropped from the live enum.
 */
export const memoryScopeSchema = z.enum(['workspace', 'user'])
/**
 * @deprecated P14 · use {@link memoryFacetSchema} + {@link memoryCategorySchema}
 * combined. Old `kind` mixed two orthogonal axes (content type vs lifecycle).
 *
 * Live values: only `summary` / `decision` / `canvas` / `user-skill` are
 * actually written by current code. The dead values `preference` / `insight`
 * / `constraint` (audited 2026-05-09, 0 production write call sites) have
 * been dropped to prevent new dead writes; legacy DB rows containing those
 * values still parse via permissive runtime fallback in conversation-memory-
 * store.ts (their `category` was already backfilled in migration 016).
 */
export const memoryKindSchema = z.enum(['decision', 'summary', 'canvas', 'user-skill'])

export const conversationSessionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  userId: z.string(),
  title: z.string(),
  status: z.enum(['running', 'completed', 'failed', 'archived']),
  latestQuestion: z.string().nullable(),
  contextSnapshot: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  // P1: heartbeat-driven session lifecycle. heartbeatAt is updated every
  // 30s by the gateway running the stream; failureReason is populated by
  // the reaper when a stale row is recovered.
  heartbeatAt: z.string().nullable().optional(),
  ownerPid: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional()
})

export const conversationMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  workspaceId: z.string(),
  userId: z.string().nullable(),
  role: conversationMessageRoleSchema,
  content: z.string(),
  metadata: z.record(z.unknown()),
  createdAt: z.string()
})

export const memoryItemSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  userId: z.string().nullable(),
  // P14 · canonical axes (5-layer × facet × category model). Marked optional
  // here so this schema continues to validate rows produced by older code
  // paths; in practice migration 016 has filled every existing row.
  layer: memoryLayerSchema.optional(),
  facet: memoryFacetSchema.optional(),
  category: memoryCategorySchema.optional(),
  // Legacy axes (kept for deprecation window).
  scope: memoryScopeSchema,
  kind: memoryKindSchema,
  title: z.string(),
  content: z.string(),
  sourceType: z.string(),
  sourceId: z.string().nullable(),
  importance: z.number(),
  confidence: z.number(),
  tags: z.array(z.string()),
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastUsedAt: z.string().nullable(),
  archivedAt: z.string().nullable()
})

export const canvasContextSummarySchema = z.object({
  nodeCount: z.number(),
  edgeCount: z.number(),
  highlights: z.array(z.string())
})

export const workspaceContextSnapshotSchema = z.object({
  workspaceId: z.string(),
  conversationId: z.string().nullable(),
  query: z.string(),
  builtAt: z.string(),
  canvasSummary: canvasContextSummarySchema,
  recentMessages: z.array(conversationMessageSchema),
  memories: z.array(memoryItemSchema),
  knowledgeEvidence: z.array(knowledgeEvidenceSchema),
  promptBlock: z.string()
})

export type ConversationMessageRole = z.infer<typeof conversationMessageRoleSchema>
export type MemoryLayer = z.infer<typeof memoryLayerSchema>
export type MemoryFacet = z.infer<typeof memoryFacetSchema>
export type MemoryCategory = z.infer<typeof memoryCategorySchema>
/** @deprecated use {@link MemoryLayer}. */
export type MemoryScope = z.infer<typeof memoryScopeSchema>
/** @deprecated use {@link MemoryFacet} + {@link MemoryCategory}. */
export type MemoryKind = z.infer<typeof memoryKindSchema>
export type ConversationSession = z.infer<typeof conversationSessionSchema>
export type ConversationMessage = z.infer<typeof conversationMessageSchema>
export type MemoryItem = z.infer<typeof memoryItemSchema>
export type CanvasContextSummary = z.infer<typeof canvasContextSummarySchema>
export type WorkspaceContextSnapshot = z.infer<typeof workspaceContextSnapshotSchema>
