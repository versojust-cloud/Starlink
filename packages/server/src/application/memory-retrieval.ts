/**
 * P14 Sprint 5 (P5) · MemoryRetrievalService — unified read API for the
 * 5-layer memory model.
 *
 * Replaces 6 scattered retrieval methods with one canonical service:
 *   - searchMemories                 (vector + lexical fallback)
 *   - searchUserSkills               (scope=user OR workspace, kind=user-skill)
 *   - listUserSummaries              (recency-ordered cross-workspace)
 *   - listMemories                   (workspace-only filter)
 *   - listMemoriesForUser            (user-scoped variant)
 *   - listAllUserSkillsForUser       (cross-workspace user-skill list)
 *
 * The legacy methods are kept (back-compat) and now delegate to this
 * service. New code should call `retrieve()` directly.
 *
 * Single canonical salience formula (P14 §3.1):
 *
 *   salience(item, query) = w_cosine * cosine
 *                         + w_recency * recency_decay
 *                         + w_imp * importance
 *                         + w_conf * confidence
 *
 *   recency_decay(t, now) = exp(-(now - t) / TAU)
 *   TAU is layer-specific:
 *     session   = 1   day
 *     workspace = 14  days
 *     user      = 90  days
 *     global    = ∞   (always 1.0)
 *
 *   Default weights: w_cosine=0.40, w_recency=0.20, w_imp=0.20, w_conf=0.20.
 *
 * When queryText is missing, w_cosine collapses to 0 and the remaining
 * weights are renormalized — falls back to a recency × importance × confidence
 * ranking.
 */

import type {
  MemoryCategory,
  MemoryFacet,
  MemoryItem,
  MemoryLayer
} from '@starlink/shared'
import { ConversationMemoryStore } from './conversation-memory-store.js'
import { pool } from '../infrastructure/db/pool.js'
import { embedText, toPgVector } from '../services/embedding-service.js'

export type RetrieveQuery = {
  /** Which layers to search. Empty array = all layers. */
  layers: MemoryLayer[]
  /** Required for layer ∈ {session, workspace}. */
  workspaceId?: string
  /** Required for layer = user; recommended for cross-workspace user-level filter. */
  userId?: string
  /** When set, restrict session-layer rows to this run only. */
  runId?: string
  /** Free-form query for vector search. Optional. */
  queryText?: string
  /** Filter by facet. Empty = any. */
  facets?: MemoryFacet[]
  /** Filter by category. Empty = any. */
  categories?: MemoryCategory[]
  /** Top K results (after rank). Default 10. */
  topK?: number
  /** 'salience' (default) — composite score; 'recency' — pure last-used time. */
  rankBy?: 'salience' | 'recency'
  /** Skip these item ids (e.g. already-shown rows in pagination). */
  excludeIds?: string[]
}

export type RankedMemory = MemoryItem & {
  score: number
  scoreBreakdown: {
    cosine: number
    recency: number
    importance: number
    confidence: number
  }
  /** Deduced layer (canonical column or back-derived from legacy scope). */
  layer: MemoryLayer
}

const DEFAULT_WEIGHTS = {
  cosine: 0.4,
  recency: 0.2,
  importance: 0.2,
  confidence: 0.2
} as const

export type SalienceWeights = {
  cosine: number
  recency: number
  importance: number
  confidence: number
}

const TAU_DAYS_BY_LAYER: Record<MemoryLayer, number> = {
  session: 1,
  workspace: 14,
  user: 90,
  global: Number.POSITIVE_INFINITY
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Pure salience formula — extracted as a standalone function so unit
 * tests can exercise the math without spinning up a DB. Returns the
 * composite score in [0, 1] AND the per-component breakdown.
 *
 * When `cosine` is null (no queryText), the cosine weight collapses to
 * 0 and the remaining 3 weights scale up to keep the score in [0, 1].
 */
export function computeSalience(input: {
  cosine: number | null   // null = no queryText
  ageDays: number         // days since item.lastUsedAt
  layer: MemoryLayer
  importance: number
  confidence: number
  weights?: Partial<SalienceWeights>
  tauDaysByLayer?: Partial<Record<MemoryLayer, number>>
}): {
  score: number
  breakdown: { cosine: number; recency: number; importance: number; confidence: number }
} {
  const w = { ...DEFAULT_WEIGHTS, ...input.weights }
  const tauMap = { ...TAU_DAYS_BY_LAYER, ...input.tauDaysByLayer }
  const tau = tauMap[input.layer] ?? 14
  const recency = Number.isFinite(tau) ? Math.exp(-Math.max(0, input.ageDays) / tau) : 1
  const importance = clamp01(input.importance)
  const confidence = clamp01(input.confidence)
  const cosineComponent = clamp01(input.cosine ?? 0)

  const hasQuery = input.cosine !== null
  const sumRest = w.recency + w.importance + w.confidence
  const scale = hasQuery ? 1 : 1 / sumRest
  const wCosine = hasQuery ? w.cosine : 0
  const wRecency = w.recency * scale
  const wImp = w.importance * scale
  const wConf = w.confidence * scale

  const score =
    wCosine * cosineComponent +
    wRecency * recency +
    wImp * importance +
    wConf * confidence

  return {
    score,
    breakdown: {
      cosine: cosineComponent,
      recency,
      importance,
      confidence
    }
  }
}

export class MemoryRetrievalService {
  constructor(
    private readonly memoryStore: ConversationMemoryStore,
    private readonly options: {
      /** Override the salience weights for evaluation / unit tests. */
      weights?: Partial<typeof DEFAULT_WEIGHTS>
      /** Override TAU days per layer (sets recency decay rate). */
      tauDays?: Partial<Record<MemoryLayer, number>>
    } = {}
  ) {}

  async retrieve(query: RetrieveQuery): Promise<RankedMemory[]> {
    const topK = query.topK ?? 10
    const rankBy = query.rankBy ?? 'salience'
    const layers = query.layers.length > 0
      ? query.layers
      : (['session', 'workspace', 'user', 'global'] as MemoryLayer[])

    // Build SQL filter clauses + params shared by both vector and lexical paths.
    const filters: string[] = ['archived_at IS NULL']
    const params: unknown[] = []

    // Layer filter — uses the new `layer` column when present, falls back
    // to legacy scope inference for old rows that never got backfilled
    // (defensive; migration 016 should have hit them all).
    const layerSql = layers
      .map((l) => {
        params.push(l)
        return `$${params.length}`
      })
      .join(', ')
    filters.push(`(layer IN (${layerSql}) OR (
      layer IS NULL AND (
        ${layers.includes('user') ? "scope = 'user'" : 'FALSE'}
        OR ${layers.includes('workspace') ? "scope = 'workspace'" : 'FALSE'}
      )
    ))`)

    // Workspace + user scoping: a user-layer query may want cross-workspace
    // rows if no workspaceId given; otherwise pin to (workspace_id = $W
    // OR user_id = $U for user-level rows).
    if (query.workspaceId) {
      params.push(query.workspaceId)
      const wsParam = `$${params.length}`
      if (query.userId && layers.includes('user')) {
        params.push(query.userId)
        filters.push(`(workspace_id = ${wsParam} OR (layer = 'user' AND user_id = $${params.length}))`)
      } else {
        filters.push(`workspace_id = ${wsParam}`)
      }
    } else if (query.userId) {
      params.push(query.userId)
      filters.push(`user_id = $${params.length}`)
    }

    if (query.facets && query.facets.length > 0) {
      const facetSql = query.facets.map((f) => {
        params.push(f)
        return `$${params.length}`
      }).join(', ')
      filters.push(`facet IN (${facetSql})`)
    }
    if (query.categories && query.categories.length > 0) {
      const catSql = query.categories.map((c) => {
        params.push(c)
        return `$${params.length}`
      }).join(', ')
      filters.push(`category IN (${catSql})`)
    }
    if (query.excludeIds && query.excludeIds.length > 0) {
      const excludeSql = query.excludeIds.map((id) => {
        params.push(id)
        return `$${params.length}`
      }).join(', ')
      filters.push(`id NOT IN (${excludeSql})`)
    }

    // Embedding-aware path: when queryText is supplied, score by cosine.
    let cosineColumn = '0'
    if (query.queryText && query.queryText.trim().length > 0 && rankBy === 'salience') {
      try {
        const embedding = await embedText(query.queryText.trim())
        params.push(toPgVector(embedding.vector))
        cosineColumn = `1 - (embedding <=> $${params.length}::vector)`
        filters.push('embedding IS NOT NULL')
      } catch {
        // Embedding service unreachable — fall through to recency-only ranking.
      }
    }

    // Pull a wide pool (≥3× topK), then apply salience in JS so the formula
    // is transparent + testable. Ordering by computed score in SQL would
    // require duplicating the formula in PostgreSQL.
    const candidatePool = Math.min(Math.max(topK * 4, 30), 200)
    params.push(candidatePool)
    const sql = `
      SELECT *,
             ${cosineColumn} AS _cosine
        FROM memory_items
       WHERE ${filters.join(' AND ')}
       ORDER BY updated_at DESC
       LIMIT $${params.length}
    `
    const result = await pool.query(sql, params)
    const ranked = this.rank(result.rows, query, rankBy, topK)

    // Touch last_used_at for the returned rows so recency decay reflects use.
    if (ranked.length > 0) {
      await this.touchLastUsed(ranked.map((m) => m.id))
    }
    return ranked
  }

  private rank(
    rows: Array<Record<string, unknown>>,
    query: RetrieveQuery,
    rankBy: 'salience' | 'recency',
    topK: number
  ): RankedMemory[] {
    const now = Date.now()
    const hasQuery = Boolean(query.queryText && query.queryText.trim().length > 0)

    const ranked = rows.map((row): RankedMemory => {
      const layer = (typeof row.layer === 'string' ? row.layer : deriveLayerFromScope(row.scope)) as MemoryLayer
      const lastUsedRaw = row.last_used_at ?? row.updated_at
      const lastUsedMs = lastUsedRaw instanceof Date
        ? lastUsedRaw.getTime()
        : typeof lastUsedRaw === 'string'
        ? new Date(lastUsedRaw).getTime()
        : now
      const ageDays = Math.max(0, (now - lastUsedMs) / MS_PER_DAY)
      const cosine = hasQuery
        ? (typeof row._cosine === 'number' ? row._cosine : 0)
        : null
      const importance = Number(row.importance ?? 0.5)
      const confidence = Number(row.confidence ?? 0.7)

      const { score, breakdown } = computeSalience({
        cosine,
        ageDays,
        layer,
        importance,
        confidence,
        weights: this.options.weights,
        tauDaysByLayer: this.options.tauDays
      })

      // recency-rank-by override — return only the recency component.
      const finalScore = rankBy === 'recency' ? breakdown.recency : score

      return {
        ...rowToMemoryItem(row, layer),
        score: finalScore,
        scoreBreakdown: breakdown,
        layer
      }
    })

    ranked.sort((a, b) => b.score - a.score)
    return ranked.slice(0, topK)
  }

  private async touchLastUsed(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    try {
      await pool.query(
        `UPDATE memory_items SET last_used_at = now() WHERE id = ANY($1::text[])`,
        [ids]
      )
    } catch {
      // Non-critical: ranking still works without it.
    }
  }
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function deriveLayerFromScope(scope: unknown): MemoryLayer {
  if (scope === 'user') return 'user'
  if (scope === 'workspace') return 'workspace'
  return 'workspace'
}

/** Project a raw DB row to MemoryItem shape (without the legacy
 *  user-skill decryption — retrieval doesn't need plaintext at the
 *  service level; consumers that show user-skills go through the
 *  legacy paths which decrypt on the way out). For now we mirror
 *  rowToMemory output structure but leave encrypted fields as-is.
 *  TODO P14 P5.b · share rowToMemory with the store module to dedup. */
function rowToMemoryItem(row: Record<string, unknown>, layer: MemoryLayer): MemoryItem {
  // Use the canonical schema parse so the returned shape is identical
  // to legacy retrieve calls. The store's rowToMemory has user-skill
  // decryption which we do NOT want here (this service is for internal
  // ranked retrieval only — UI surfaces still go through the legacy
  // searchUserSkills path that decrypts).
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id ?? ''),
    userId: row.user_id ? String(row.user_id) : null,
    layer,
    facet: typeof row.facet === 'string' ? row.facet as MemoryFacet : undefined,
    category: typeof row.category === 'string' ? String(row.category) : undefined,
    scope: (row.scope === 'user' ? 'user' : 'workspace'),
    kind: (typeof row.kind === 'string' ? row.kind : 'summary') as MemoryItem['kind'],
    title: String(row.title ?? ''),
    content: String(row.content ?? ''),
    sourceType: String(row.source_type ?? 'manual'),
    sourceId: row.source_id ? String(row.source_id) : null,
    importance: Number(row.importance ?? 0.5),
    confidence: Number(row.confidence ?? 0.7),
    tags: Array.isArray(row.tags) ? row.tags as string[] : [],
    metadata: (row.metadata && typeof row.metadata === 'object')
      ? (row.metadata as Record<string, unknown>)
      : {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    lastUsedAt: row.last_used_at ? toIso(row.last_used_at) : null,
    archivedAt: row.archived_at ? toIso(row.archived_at) : null
  }
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return new Date(value).toISOString()
  return new Date().toISOString()
}
