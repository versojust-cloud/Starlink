/**
 * In-memory ConversationMemoryStore subset for the coaching-mode benchmark
 * (2026-04-28).
 *
 * The real store opens a PG pool at module load; for an offline algorithm
 * validation we substitute this duck-typed mock. The mock satisfies the
 * SUBSET of `ConversationMemoryStore` methods that `UserSkillExtractor` +
 * `buildUserSkillPrompt` actually call:
 *
 *   - listUserSummaries
 *   - searchUserSkills
 *   - upsertMemory
 *   - archiveMemory
 *
 * Other methods on the real store (captureConversationOutcome, search,
 * listMessages, etc.) are intentionally NOT mocked — they're not used by
 * the user-skill pipeline and the benchmark would fail loudly if any
 * production code tried to reach for them through this stub.
 *
 * Embedding handling: cheap deterministic hash-based pseudo-vector (no
 * remote OpenAI call). This is acceptable because the benchmark scores
 * recall with KEYWORD-based match (lexical) instead of vector cosine —
 * see `coach-eval-runner.ts`.
 */

import { nanoid } from 'nanoid'
import type {
  MemoryItem,
  MemoryKind,
  MemoryScope
} from '@starlink/shared'
import type {
  ConversationMemoryStore,
  UpsertMemoryInput
} from '../../application/conversation-memory-store.js'

interface InMemoryRow {
  id: string
  workspaceId: string
  userId: string | null
  scope: MemoryScope
  kind: MemoryKind
  title: string
  content: string
  sourceType: string
  sourceId: string | null
  importance: number
  confidence: number
  tags: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  lastUsedAt: string | null
  archivedAt: string | null
}

function rowToItem(row: InMemoryRow): MemoryItem {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    scope: row.scope,
    kind: row.kind,
    title: row.title,
    content: row.content,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    importance: row.importance,
    confidence: row.confidence,
    tags: row.tags,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastUsedAt: row.lastUsedAt,
    archivedAt: row.archivedAt
  }
}

/**
 * Implements the subset of `ConversationMemoryStore` used by
 * `UserSkillExtractor` + `buildUserSkillPrompt`. Cast to the full type
 * via `as unknown as ConversationMemoryStore` when injecting (the
 * extractor doesn't reach for any other methods).
 */
export class InMemoryConversationMemoryStore {
  private rows: InMemoryRow[] = []

  /**
   * Seed with synthetic conversation summaries up front. Each entry becomes
   * a `kind: 'summary'` row that `listUserSummaries` will return.
   */
  seedSummary(input: {
    userId: string
    workspaceId: string
    traceId: string
    summary: string
    createdAt?: string
  }): void {
    const now = input.createdAt ?? new Date().toISOString()
    this.rows.push({
      id: nanoid(),
      workspaceId: input.workspaceId,
      userId: input.userId,
      scope: 'workspace',
      kind: 'summary',
      title: `summary-${input.traceId}`,
      content: input.summary,
      sourceType: 'benchmark-coaching',
      sourceId: input.traceId,
      importance: 0.5,
      confidence: 0.7,
      tags: ['bmc-conversation'],
      metadata: { traceId: input.traceId },
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      archivedAt: null
    })
  }

  async listUserSummaries(userId: string, limit = 10): Promise<MemoryItem[]> {
    return this.rows
      .filter((r) => r.userId === userId && r.kind === 'summary' && !r.archivedAt)
      .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
      .slice(0, Math.max(1, limit))
      .map(rowToItem)
  }

  async searchUserSkills(
    userId: string,
    workspaceId: string,
    options: { query?: string; limit?: number } = {}
  ): Promise<MemoryItem[]> {
    const limit = Math.max(1, options.limit ?? 20)
    const matches = this.rows.filter((r) => {
      if (r.kind !== 'user-skill') return false
      if (r.userId !== userId) return false
      if (r.archivedAt) return false
      // includeGlobalUser semantics: workspace_id matches OR is null
      if (r.workspaceId !== workspaceId && r.scope !== 'user') return false
      return true
    })
    // Cheap ranking: confidence desc, then updatedAt desc. Vector similarity
    // intentionally skipped — see file header.
    return matches
      .sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence
        return a.updatedAt > b.updatedAt ? -1 : 1
      })
      .slice(0, limit)
      .map(rowToItem)
  }

  async upsertMemory(input: UpsertMemoryInput): Promise<MemoryItem> {
    const existingIndex = input.id
      ? this.rows.findIndex((r) => r.id === input.id)
      : input.sourceId
      ? this.rows.findIndex(
          (r) => r.sourceId === input.sourceId && r.kind === (input.kind ?? 'summary')
        )
      : -1

    const now = new Date().toISOString()
    if (existingIndex >= 0) {
      const prev = this.rows[existingIndex]
      const updated: InMemoryRow = {
        ...prev,
        title: input.title,
        content: input.content,
        importance: input.importance ?? prev.importance,
        confidence: input.confidence ?? prev.confidence,
        tags: input.tags ?? prev.tags,
        metadata: { ...prev.metadata, ...(input.metadata ?? {}) },
        updatedAt: now,
        archivedAt: null
      }
      this.rows[existingIndex] = updated
      return rowToItem(updated)
    }

    const id = input.id ?? nanoid()
    const fresh: InMemoryRow = {
      id,
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      scope: input.scope ?? 'workspace',
      kind: input.kind ?? 'summary',
      title: input.title,
      content: input.content,
      sourceType: input.sourceType ?? 'benchmark-coaching',
      sourceId: input.sourceId ?? null,
      importance: input.importance ?? 0.5,
      confidence: input.confidence ?? 0.7,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      archivedAt: null
    }
    this.rows.push(fresh)
    return rowToItem(fresh)
  }

  async archiveMemory(id: string): Promise<void> {
    const idx = this.rows.findIndex((r) => r.id === id)
    if (idx >= 0 && !this.rows[idx].archivedAt) {
      this.rows[idx] = { ...this.rows[idx], archivedAt: new Date().toISOString() }
    }
  }

  /**
   * Test-only inspection helper. Returns ALL rows (including archived),
   * so the eval can dump the full state into the markdown report.
   */
  dumpAll(): MemoryItem[] {
    return this.rows.map(rowToItem)
  }
}
