/**
 * P11.18 · conversation_messages TTL cleanup.
 *
 * Without TTL, every chat exchange (user prompt + assistant reply +
 * scaffold metadata) accumulates in `conversation_messages` forever.
 * On a busy deployment with multiple workspaces this is GB/month of
 * growth that nobody actually queries past day 30 — recent chat is
 * served from in-memory state, deep history is summarised into
 * `memory_items` already.
 *
 * Strategy:
 *   - Default TTL = 90 days (CONVERSATION_MESSAGE_TTL_MS env override)
 *   - Best-effort DELETE in batches (LIMIT 5000 per pass) to avoid
 *     long-held row locks on large tables
 *   - Periodic timer wakes every CONVERSATION_CLEANUP_INTERVAL_MS
 *     (default 6h), .unref()'d for clean shutdown
 *   - Opt-out via CONVERSATION_CLEANUP_ENABLED=false
 *   - All errors audit-log + best-effort continue (never crash the
 *     server because of cleanup)
 *
 * NOTE: orphan conversation_sessions are NOT touched here. A session
 * can outlive its messages (the messages are summarised into the
 * session's contextSnapshot before TTL hits). If session-level TTL is
 * needed later, add a separate function — different cadence + risks.
 */

import { createAuditLogger } from '@starlink/shared'
import { pool } from '../infrastructure/db/pool.js'

const auditLogger = createAuditLogger('packages/server:conversation-cleanup')

const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000  // 6 hours
const DELETE_BATCH_SIZE = 5000

function isEnabled(): boolean {
  return process.env.CONVERSATION_CLEANUP_ENABLED !== 'false'
}

function getTtlMs(): number {
  const v = Number(process.env.CONVERSATION_MESSAGE_TTL_MS)
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_TTL_MS
}

/**
 * One-shot cleanup pass. Returns count of rows deleted across this
 * invocation (sum across multiple batches). Best-effort: errors are
 * audit-logged and the function returns 0 rather than throwing.
 */
export async function cleanupExpiredMessages(): Promise<{ deleted: number }> {
  if (!isEnabled()) return { deleted: 0 }
  const ttlMs = getTtlMs()
  const cutoffIso = new Date(Date.now() - ttlMs).toISOString()
  let totalDeleted = 0

  try {
    // Loop until a batch returns < DELETE_BATCH_SIZE rows. Cap loop
    // at 100 iterations as a safety net so a misconfigured TTL=0
    // doesn't run forever.
    for (let pass = 0; pass < 100; pass++) {
      const result = await pool.query(
        `DELETE FROM conversation_messages
          WHERE id IN (
            SELECT id FROM conversation_messages
             WHERE created_at < $1
             ORDER BY created_at ASC
             LIMIT $2
          )`,
        [cutoffIso, DELETE_BATCH_SIZE]
      )
      const n = result.rowCount ?? 0
      totalDeleted += n
      if (n < DELETE_BATCH_SIZE) break
    }

    if (totalDeleted > 0) {
      auditLogger.info({
        action: 'conversation-cleanup.expired-messages-deleted',
        requestId: 'periodic',
        metadata: { deleted: totalDeleted, ttlMs, cutoffIso }
      })
    }
    return { deleted: totalDeleted }
  } catch (err) {
    auditLogger.warn({
      action: 'conversation-cleanup.failed',
      requestId: 'periodic',
      metadata: { err: err instanceof Error ? err.message : String(err), totalDeleted }
    })
    return { deleted: totalDeleted }
  }
}

let cleanupTimer: NodeJS.Timeout | null = null
export function startConversationCleanupTimer(): void {
  if (cleanupTimer) return
  if (!isEnabled()) return
  const intervalMs =
    Number(process.env.CONVERSATION_CLEANUP_INTERVAL_MS) || DEFAULT_INTERVAL_MS
  cleanupTimer = setInterval(() => {
    void cleanupExpiredMessages()
  }, intervalMs)
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref()
}

/** Test helper — stops the periodic timer. */
export function __stopConversationCleanupTimerForTest(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
}
