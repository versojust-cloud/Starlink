/**
 * Phase 4.4 · Workspace Memory Store.
 *
 * Cross-conversation memory keyed by workspaceId. Two implementations:
 *
 *   - {@link InMemoryWorkspaceStore} — process-local Map, lost on restart.
 *     Kept as the fall-back when PG isn't wired and as a fast read cache
 *     for the bridged variant.
 *   - {@link PgBridgedWorkspaceStore} — dual-writes through to
 *     {@link ConversationMemoryStore} (PG-backed `memory_items` table with
 *     pgvector embeddings). When PG is up this is the authoritative store;
 *     the in-memory bucket lingers as a hot cache so reads inside the same
 *     process don't always have to round-trip to Postgres.
 *
 * Wiring (Phase X consolidation):
 *
 *   `context/index.ts` constructs a shared {@link ConversationMemoryStore}
 *   and calls {@link setWorkspaceMemoryStore} with a PG-bridged store. Once
 *   set, every `getWorkspaceMemoryStore()` caller (today: BusinessLangGraph
 *   `readWorkspaceMemoriesPrompt` + `writeConversationSummary`) transparently
 *   talks to PG. If the bridge is never installed (e.g. a unit test that
 *   doesn't boot the gateway), the legacy in-memory singleton is used.
 *
 * Dedup against `extractConversationMemory` (audit C3): the bridged
 * `record()` path checks `memory_items` for any prior row with the same
 * `(workspace_id, source_id)` pair and skips the write if one exists. This
 * avoids two records for the same conversation when both the streamed
 * synthetic write AND the curated `captureConversationOutcome` extract path
 * fire (the latter is canonical because it includes vectorized BMC nodes;
 * the streamed write is a low-cost back-stop summary).
 */

import { nanoid } from 'nanoid'
import type { ConversationMemoryStore } from '../../application/conversation-memory-store.js'
import { pool } from '../db/pool.js'

export interface WorkspaceMemory {
  id: string
  content: string
  tags: string[]
  createdAt: string
  sourceTraceId: string
  metadata?: Record<string, unknown>
}

export interface WorkspaceMemoryRecord {
  content: string
  tags?: string[]
  sourceTraceId: string
  metadata?: Record<string, unknown>
  /**
   * P12 fix · the bridged PG store inserts into memory_items which has
   * NOT NULL constraint on user_id. Previously the field wasn't on the
   * record shape, so writeConversationSummary failed every time with
   * "null value in column 'user_id' violates not-null constraint".
   * Now optional but BusinessLangGraph passes it through.
   */
  userId?: string | null
}

export interface WorkspaceMemoryStore {
  record(workspaceId: string, entry: WorkspaceMemoryRecord): Promise<WorkspaceMemory>
  search(
    workspaceId: string,
    opts?: {
      /** Free-text query. If set on the bridged PG store this triggers
       *  pgvector cosine semantic retrieval; otherwise the store falls back
       *  to tag+recency ordering. */
      query?: string
      tagsAny?: string[]
      limit?: number
      since?: string
    }
  ): Promise<WorkspaceMemory[]>
  size(workspaceId: string): Promise<number>
  clear(workspaceId: string): Promise<void>
  clearAll(): Promise<void>
}

class InMemoryWorkspaceStore implements WorkspaceMemoryStore {
  private byWorkspace = new Map<string, WorkspaceMemory[]>()

  async record(
    workspaceId: string,
    entry: WorkspaceMemoryRecord
  ): Promise<WorkspaceMemory> {
    const memory: WorkspaceMemory = {
      id: `mem-${nanoid(10)}`,
      content: entry.content,
      tags: entry.tags ?? [],
      createdAt: new Date().toISOString(),
      sourceTraceId: entry.sourceTraceId,
      metadata: entry.metadata
    }
    let bucket = this.byWorkspace.get(workspaceId)
    if (!bucket) {
      bucket = []
      this.byWorkspace.set(workspaceId, bucket)
    }
    bucket.unshift(memory)
    return memory
  }

  async search(
    workspaceId: string,
    opts: {
      query?: string
      tagsAny?: string[]
      limit?: number
      since?: string
    } = {}
  ): Promise<WorkspaceMemory[]> {
    const bucket = this.byWorkspace.get(workspaceId) ?? []
    const sinceMs = opts.since ? new Date(opts.since).getTime() : 0
    const limit = opts.limit ?? 20
    // The in-memory fallback can't do embedding similarity — we ignore
    // `query` here. Bridged PG store overrides search() and honors it.
    return bucket
      .filter((m) => {
        if (opts.tagsAny && opts.tagsAny.length > 0) {
          if (!opts.tagsAny.some((t) => m.tags.includes(t))) return false
        }
        if (sinceMs > 0 && new Date(m.createdAt).getTime() < sinceMs) return false
        return true
      })
      .slice(0, limit)
  }

  async size(workspaceId: string): Promise<number> {
    return this.byWorkspace.get(workspaceId)?.length ?? 0
  }

  async clear(workspaceId: string): Promise<void> {
    this.byWorkspace.delete(workspaceId)
  }

  async clearAll(): Promise<void> {
    this.byWorkspace.clear()
  }
}

/**
 * PG-bridged store. Writes mirror to `memory_items` (via
 * ConversationMemoryStore.upsertMemory) AND retain an in-memory cache so
 * subsequent reads in the same process don't need to round-trip. Reads
 * prefer PG (recency-ordered list of `bmc-conversation-summary`-tagged
 * items) and fall back to the in-memory cache on PG failure.
 */
export class PgBridgedWorkspaceStore implements WorkspaceMemoryStore {
  private readonly cache = new InMemoryWorkspaceStore()
  private readonly conversationMemoryStore: ConversationMemoryStore

  constructor(deps: { conversationMemoryStore: ConversationMemoryStore }) {
    this.conversationMemoryStore = deps.conversationMemoryStore
  }

  async record(
    workspaceId: string,
    entry: WorkspaceMemoryRecord
  ): Promise<WorkspaceMemory> {
    // Always keep a hot cache copy.
    const cached = await this.cache.record(workspaceId, entry)

    // C3 dedup: if any memory already cites this conversation as its source,
    // the curated `extractConversationMemory` (or a prior streamed write) has
    // beaten us to it — leave PG alone and return the cache entry.
    try {
      const exists = await this.hasMemoryForConversation(workspaceId, entry.sourceTraceId)
      if (exists) return cached
    } catch (err) {
      // PG read failure is non-fatal — fall through to write attempt; if PG
      // is wedged the write below will surface the error to the caller via
      // the catch in the caller (BusinessLangGraph swallows it).
      console.warn('[workspace-memory-store] dedup probe failed, attempting write anyway', {
        error: String(err)
      })
    }

    const meta = entry.metadata ?? {}
    const bmcNodeCount = typeof meta.bmcNodeCount === 'number' ? meta.bmcNodeCount : 0
    // Map node count → importance: 0 nodes = 0.4, 9+ nodes (full coverage) = 0.85.
    const importance = clamp01(0.4 + Math.min(bmcNodeCount, 9) * 0.05)

    const tags = Array.from(new Set([
      'bmc-conversation-summary',
      'auto-streamed',
      ...(entry.tags ?? [])
    ]))

    const titleQuestion = typeof meta.question === 'string' && meta.question.trim()
      ? meta.question
      : (entry.content.split('|')[0]?.trim() || 'BMC 会话摘要')
    const title = `会话摘要：${truncate(titleQuestion.replace(/^问题:\s*/, ''), 32)}`

    await this.conversationMemoryStore.upsertMemory({
      workspaceId,
      // P12 fix · forward userId so memory_items.user_id constraint
      // is satisfied. Caller (BusinessLangGraph.writeConversationSummary)
      // passes userId from BusinessState; if a synthetic call omits it,
      // we fall back to '__system__' so the row still inserts cleanly.
      userId: entry.userId ?? '__system__',
      scope: 'workspace',
      kind: 'summary',
      title,
      content: entry.content,
      // Tag with a distinct sourceType so curated extractions
      // (`sourceType: 'conversation' | 'canvas'`) and these synthetic
      // streamed summaries can coexist without colliding on the
      // (workspace_id, source_type, source_id, kind, title) unique index.
      sourceType: 'business-langgraph-stream',
      sourceId: entry.sourceTraceId,
      importance,
      confidence: 0.7,
      tags,
      metadata: {
        ...meta,
        bridgedFrom: 'workspace-memory-store',
        recordedAt: cached.createdAt
      }
    })

    return cached
  }

  async search(
    workspaceId: string,
    opts: {
      query?: string
      tagsAny?: string[]
      limit?: number
      since?: string
    } = {}
  ): Promise<WorkspaceMemory[]> {
    const limit = opts.limit ?? 20
    const query = opts.query?.trim()
    try {
      // When `query` is provided we use ConversationMemoryStore.searchMemories
      // which runs pgvector cosine retrieval (ivfflat index on the embedding
      // column) — semantically related summaries float to the top regardless
      // of recency. Without `query` we fall back to listMemories (recency
      // ordering) so the call stays cheap when the supervisor isn't asking
      // a specific question.
      const memories = query
        ? await this.conversationMemoryStore.searchMemories(workspaceId, query, limit, {
            kind: 'summary'
          })
        : await this.conversationMemoryStore.listMemories(workspaceId, {
            kind: 'summary',
            limit
          })
      const sinceMs = opts.since ? new Date(opts.since).getTime() : 0
      return memories
        .filter((m) => {
          // Bridged store filters to streamed BMC summaries. Curated
          // canvas/decision memories surface via the GraphQL
          // `workspaceMemories` query (full kind-set + vector search).
          if (!m.tags.includes('bmc-conversation-summary')) return false
          if (opts.tagsAny && opts.tagsAny.length > 0) {
            if (!opts.tagsAny.some((t) => m.tags.includes(t))) return false
          }
          if (sinceMs > 0 && new Date(m.createdAt).getTime() < sinceMs) return false
          return true
        })
        .slice(0, limit)
        .map((m) => ({
          id: m.id,
          content: m.content,
          tags: m.tags,
          createdAt: m.createdAt,
          sourceTraceId: m.sourceId ?? '',
          metadata: m.metadata
        }))
    } catch (err) {
      console.warn('[workspace-memory-store] PG read failed, falling back to in-memory cache', {
        workspaceId,
        error: String(err)
      })
      return this.cache.search(workspaceId, opts)
    }
  }

  async size(workspaceId: string): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT COUNT(*)::int AS n FROM memory_items
         WHERE workspace_id = $1
           AND archived_at IS NULL
           AND 'bmc-conversation-summary' = ANY(tags)`,
        [workspaceId]
      )
      const n = result.rows[0]?.n
      return typeof n === 'number' ? n : 0
    } catch {
      return this.cache.size(workspaceId)
    }
  }

  async clear(workspaceId: string): Promise<void> {
    await this.cache.clear(workspaceId)
    // Intentionally NOT cascading to PG — clearing the cache is fine but
    // wiping persistent memory should require an explicit admin operation.
  }

  async clearAll(): Promise<void> {
    await this.cache.clearAll()
  }

  private async hasMemoryForConversation(
    workspaceId: string,
    conversationId: string
  ): Promise<boolean> {
    if (!conversationId) return false
    const result = await pool.query(
      `SELECT 1 FROM memory_items
       WHERE workspace_id = $1
         AND source_id = $2
         AND archived_at IS NULL
       LIMIT 1`,
      [workspaceId, conversationId]
    )
    return Boolean(result.rowCount && result.rowCount > 0)
  }
}

let singleton: WorkspaceMemoryStore | undefined

/**
 * Returns the active WorkspaceMemoryStore. If the gateway has installed a
 * bridged variant via {@link setWorkspaceMemoryStore} that's returned;
 * otherwise a process-local in-memory singleton is lazily created.
 */
export function getWorkspaceMemoryStore(): WorkspaceMemoryStore {
  if (!singleton) singleton = new InMemoryWorkspaceStore()
  return singleton
}

/**
 * Install a custom store (typically the PG-bridged one). Idempotent — calling
 * twice with the same instance is a no-op; calling with a different instance
 * REPLACES the active store. Tests should prefer {@link __resetWorkspaceMemoryStoreForTest}.
 */
export function setWorkspaceMemoryStore(store: WorkspaceMemoryStore): void {
  singleton = store
}

/**
 * Convenience: build a PG-bridged store. Caller is responsible for passing
 * the bridge into {@link setWorkspaceMemoryStore} once (typically at gateway
 * boot, see `context/index.ts`).
 */
export function createWorkspaceMemoryStore(deps: {
  conversationMemoryStore: ConversationMemoryStore
}): WorkspaceMemoryStore {
  return new PgBridgedWorkspaceStore(deps)
}

export function __resetWorkspaceMemoryStoreForTest(): void {
  singleton = new InMemoryWorkspaceStore()
}

export function isMemoryReadEnabled(): boolean {
  return process.env.MEMORY_READ_ENABLED === 'true'
}

export function isMemoryWriteEnabled(): boolean {
  return process.env.MEMORY_WRITE_ENABLED === 'true'
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function truncate(text: string, max: number): string {
  const value = text.trim()
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1))}…`
}
