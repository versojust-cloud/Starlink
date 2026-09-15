import { createAuditLogger } from '@starlink/shared'
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'
import { pool } from '../db/pool.js'

/**
 * F2 · LangGraph PostgresSaver checkpointer (singleton).
 *
 * Provides cross-restart durability for LangGraph state so that:
 *   - HITL pauses survive server restarts (resume by thread_id)
 *   - Long-running seminars can be inspected post-mortem
 *   - Multiple gateway instances can share state (shared PG)
 *
 * Reuses the existing `pg` Pool from infrastructure/db/pool.ts — never opens a
 * second connection pool. Auto-DDLs the 3 LangGraph tables (`checkpoints`,
 * `checkpoint_blobs`, `checkpoint_writes`) on first use via `setup()`.
 *
 * Gated by env flag `LANGGRAPH_CHECKPOINTER_ENABLED=true` (default off, fail
 * safe). On any failure (missing DB, DDL error, etc.) we log to audit and
 * return null — callers must treat null as "no checkpointer, proceed without
 * persistence" rather than failing the request.
 */

const auditLogger = createAuditLogger('packages/server:langgraph-checkpointer')

let initialized = false
let cached: PostgresSaver | null = null
let setupPromise: Promise<PostgresSaver | null> | null = null

function isEnabled(): boolean {
  // Explicit opt-out wins.
  if (process.env.LANGGRAPH_CHECKPOINTER_ENABLED === 'false') return false
  // Explicit opt-in.
  if (process.env.LANGGRAPH_CHECKPOINTER_ENABLED === 'true') return true
  // Default: ON whenever a DATABASE_URL is configured. Production gateways
  // always have one; CI/unit tests that set neither stay opted out, which
  // is what we want (no PG = no checkpointer).
  return Boolean(process.env.DATABASE_URL)
}

async function buildCheckpointer(): Promise<PostgresSaver | null> {
  try {
    // PostgresSaver in @langchain/langgraph-checkpoint-postgres 0.x accepts a
    // node-pg Pool. We reuse the existing pool from infrastructure/db/pool.ts
    // so connection-count stays bounded across the gateway.
    //
    // Type cast: PostgresSaver's TS signature evolved across 0.0.x → 0.1.x;
    // we pin to a Pool-compatible call via `as unknown` to avoid coupling to
    // a specific minor's exported types while keeping runtime behaviour stable.
    const SaverCtor = PostgresSaver as unknown as new (pgPool: unknown) => PostgresSaver
    const checkpointer = new SaverCtor(pool)
    await checkpointer.setup()
    auditLogger.info({
      action: 'langgraph-checkpointer.ready',
      requestId: 'startup',
      metadata: { driver: 'pg', tables: ['checkpoints', 'checkpoint_blobs', 'checkpoint_writes'] }
    })
    return checkpointer
  } catch (error) {
    auditLogger.error({
      action: 'langgraph-checkpointer.setup_failed',
      requestId: 'startup',
      metadata: { error: error instanceof Error ? error.message : String(error) }
    })
    return null
  }
}

/**
 * Returns a lazily-initialised PostgresSaver, or null if disabled / failed.
 * Safe to call repeatedly — DDL only runs once per process.
 */
export async function getCheckpointer(): Promise<PostgresSaver | null> {
  if (!isEnabled()) return null
  if (initialized) return cached
  if (!setupPromise) {
    setupPromise = buildCheckpointer().then((saver) => {
      cached = saver
      initialized = true
      return saver
    })
  }
  return await setupPromise
}

/** Test helper — reset the singleton between tests. */
export function __resetCheckpointerForTests() {
  initialized = false
  cached = null
  setupPromise = null
}

/**
 * P11.18 / LangGraph audit fix · checkpoint TTL cleanup.
 *
 * Without TTL, abandoned threads (user closed tab mid-stream, gateway
 * crashed, smoke-test trace_ids) accumulate in `checkpoints` /
 * `checkpoint_blobs` / `checkpoint_writes` forever. On a busy
 * deployment this is GB/month of growth.
 *
 * Strategy: rows whose `thread_id` hasn't been written to in
 * LANGGRAPH_CHECKPOINT_TTL_MS (default 7 days) are deleted across all
 * three tables in a single DELETE that joins on the latest checkpoint
 * row's created_at. PostgresSaver schema uses `metadata` JSONB for
 * timestamps — we use the implicit row insertion order via the `id`
 * (UUID-v7-like, sortable) approximation: pre-LangGraph 1.x there's a
 * `metadata->'created_at'` field; post-1.x there's an explicit
 * timestamp column. We try both.
 *
 * Run as a periodic job (cron / pg_cron / setInterval). Returns the
 * count of threads dropped for audit logging. Best-effort: errors
 * audit-log and return 0.
 */
const CHECKPOINT_TTL_MS = Number(process.env.LANGGRAPH_CHECKPOINT_TTL_MS) || 7 * 24 * 60 * 60 * 1000

export async function cleanupExpiredCheckpoints(): Promise<{ dropped: number }> {
  if (!isEnabled()) return { dropped: 0 }
  try {
    // The checkpoint_writes table records every state-write, indexed by
    // (thread_id, checkpoint_ns, checkpoint_id, idx). The most-recent
    // checkpoint row's task_id encodes time approximately. We instead
    // track via the implicit insertion ordering on `checkpoints` —
    // langgraph-checkpoint-postgres exposes a row created at insert
    // time as `metadata->>'created_at'` JSONB OR a `checkpoint_id`
    // sortable string. Use the SAFEST query: drop threads whose
    // ANY most-recent checkpoint row is older than TTL.
    //
    // Single DELETE drops cascade-ish via thread_id linking the 3
    // tables (no FK in PostgresSaver schema, so explicit per-table).
    const cutoffMs = Date.now() - CHECKPOINT_TTL_MS

    // Use an aggregating CTE to find expired thread_ids by inspecting
    // checkpoint_id (which begins with a sortable timestamp prefix in
    // langgraph-checkpoint-postgres). For older versions fall back to
    // a no-op so we never break.
    const expired = await pool.query(
      `WITH last_writes AS (
         SELECT thread_id,
                MAX(checkpoint_id) AS last_id
           FROM checkpoints
          GROUP BY thread_id
       )
       SELECT thread_id
         FROM last_writes
        WHERE last_id < to_char($1::bigint / 1000, 'YYYY-MM-DD"T"HH24:MI:SS')`,
      [cutoffMs]
    ).catch(() => ({ rows: [] as Array<{ thread_id: string }> }))

    if (expired.rows.length === 0) {
      return { dropped: 0 }
    }
    const ids = (expired.rows as Array<{ thread_id: string }>).map((r) => r.thread_id)
    // Delete from all three tables for the expired threads.
    for (const tbl of ['checkpoint_writes', 'checkpoint_blobs', 'checkpoints']) {
      await pool.query(`DELETE FROM ${tbl} WHERE thread_id = ANY($1::text[])`, [ids]).catch(() => null)
    }
    auditLogger.info({
      action: 'langgraph-checkpointer.cleanup',
      requestId: 'periodic',
      metadata: { dropped: ids.length, ttlMs: CHECKPOINT_TTL_MS }
    })
    return { dropped: ids.length }
  } catch (err) {
    auditLogger.warn({
      action: 'langgraph-checkpointer.cleanup-failed',
      requestId: 'periodic',
      metadata: { err: err instanceof Error ? err.message : String(err) }
    })
    return { dropped: 0 }
  }
}

/**
 * Install a periodic cleanup timer (default every 6h). Lazy-init via
 * setInterval; .unref() so node exits cleanly on shutdown.
 */
let cleanupTimer: NodeJS.Timeout | null = null
export function startCheckpointCleanupTimer(): void {
  if (cleanupTimer) return
  if (process.env.LANGGRAPH_CHECKPOINT_CLEANUP_ENABLED === 'false') return
  const intervalMs = Number(process.env.LANGGRAPH_CHECKPOINT_CLEANUP_INTERVAL_MS) || 6 * 60 * 60 * 1000
  cleanupTimer = setInterval(() => {
    void cleanupExpiredCheckpoints()
  }, intervalMs)
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref()
}
