/**
 * P14 Sprint 7 (P7) · MemoryReaper — layer-specific TTL cleanup.
 *
 * Cron-style maintenance: archive raw rows whose last_used_at exceeds the
 * per-layer TTL.
 *
 *   layer       TTL     Behavior
 *   ─────       ───     ────────
 *   session     30d     archive raw chat-message rows (keeps summaries)
 *   workspace   90d     archive workspace-scoped episodic rows
 *   user        ∞       never auto-archived (user owns their long-term picture)
 *   global      —       managed by KB ingestion; reaper does NOT touch kb_chunks
 *
 * The reaper sets `archived_at = now()` rather than deleting, so:
 *   - Audit / export still has access (exportUserData reads regardless of archived_at)
 *   - Future re-activation is possible via UPDATE archived_at = NULL
 *
 * Companion to MemoryConsolidator.decayStaleSemantic (which decays
 * confidence on semantic rows). The reaper is for episodic raw data.
 */

import { pool } from '../infrastructure/db/pool.js'

export type ReapResult = {
  /** Rows archived per layer for this run. */
  archived: Record<'session' | 'workspace', number>
  /** Total rows archived across all layers. */
  total: number
}

const DEFAULT_TTL_DAYS: Record<'session' | 'workspace', number> = {
  session: 30,
  workspace: 90
}

export class MemoryReaper {
  constructor(
    private readonly options: {
      ttlDays?: Partial<Record<'session' | 'workspace', number>>
      /** Optional cap per pass to avoid long-running statements. */
      batchSize?: number
    } = {}
  ) {}

  /**
   * Archive eligible rows. Idempotent — already-archived rows aren't
   * touched. Returns the count of rows newly archived per layer.
   */
  async reap(): Promise<ReapResult> {
    const ttlSession = this.options.ttlDays?.session ?? DEFAULT_TTL_DAYS.session
    const ttlWorkspace = this.options.ttlDays?.workspace ?? DEFAULT_TTL_DAYS.workspace
    const batch = this.options.batchSize ?? 500

    const archived: Record<'session' | 'workspace', number> = { session: 0, workspace: 0 }

    // Session layer: archive raw chat-message rows whose last_used_at (or
    // updated_at as fallback) is older than ttlSession.
    const sessionResult = await pool.query(
      `UPDATE memory_items
          SET archived_at = now()
        WHERE id IN (
          SELECT id FROM memory_items
           WHERE archived_at IS NULL
             AND layer = 'session'
             AND COALESCE(last_used_at, updated_at) < now() - ($1 || ' days')::interval
           ORDER BY COALESCE(last_used_at, updated_at) ASC
           LIMIT $2
        )
        RETURNING id`,
      [ttlSession, batch]
    )
    archived.session = sessionResult.rowCount ?? 0

    // Workspace layer: archive episodic rows older than ttlWorkspace.
    // Semantic rows are NOT touched — those are the durable workspace facts;
    // they only decay via MemoryConsolidator.decayStaleSemantic.
    const wsResult = await pool.query(
      `UPDATE memory_items
          SET archived_at = now()
        WHERE id IN (
          SELECT id FROM memory_items
           WHERE archived_at IS NULL
             AND layer = 'workspace'
             AND facet = 'episodic'
             AND COALESCE(last_used_at, updated_at) < now() - ($1 || ' days')::interval
           ORDER BY COALESCE(last_used_at, updated_at) ASC
           LIMIT $2
        )
        RETURNING id`,
      [ttlWorkspace, batch]
    )
    archived.workspace = wsResult.rowCount ?? 0

    return {
      archived,
      total: archived.session + archived.workspace
    }
  }

  /**
   * Force-archive everything matching a workspace. Used when a workspace
   * is deleted by the user — bulk-archive all associated memory rows.
   */
  async reapWorkspace(workspaceId: string): Promise<number> {
    const result = await pool.query(
      `UPDATE memory_items
          SET archived_at = now()
        WHERE workspace_id = $1
          AND archived_at IS NULL
        RETURNING id`,
      [workspaceId]
    )
    return result.rowCount ?? 0
  }
}
