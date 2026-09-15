import { createAuditLogger } from '@starlink/shared'
import { pool } from '../infrastructure/db/pool.js'

// Minimal structural shapes for the bits of node-pg we touch. Using these
// inline avoids a TS2709 "namespace as type" issue under NodeNext + the
// DefinitelyTyped @types/pg 8.6 namespace-style declarations.
interface PgNotification {
  channel: string
  payload?: string
  processId: number
}
type PoolClientLike = {
  on(event: string, listener: (...args: unknown[]) => void): void
  query(sql: string): Promise<unknown>
  release(err?: Error | boolean): void
}

/**
 * Task B · HITL pending-approvals PG store.
 *
 * Replaces the in-memory `pendingDecisionTimeouts` / `pendingDecisionResolvers`
 * Maps in ConversationStore so that:
 *   - HITL approval state survives gateway restart
 *   - Multiple gateway instances can share approval queues
 *   - Stale decisions auto-expire via `expires_at`
 *
 * Reuses the existing `pg` Pool from infrastructure/db/pool.ts. Auto-DDL is
 * gated by `HITL_RUNTIME_DDL=true` (matches the ConversationMemoryStore
 * pattern — production should run `db:migrate` explicitly and leave the flag
 * off to avoid every process racing on the DDL).
 *
 * `await(conversationId, timeoutMs)` polls every ~500ms by default — adequate
 * for human-in-the-loop latency; cross-process notifications would normally
 * use LISTEN/NOTIFY but polling keeps this dependency-free.
 *
 * Wave 3 A · cross-process resume: `decide()` also issues
 * `pg_notify('hitl_approval_decided', conversationId)`, and
 * `subscribeToDecisions()` opens a dedicated client that LISTENs on the same
 * channel. Subscribers fetch the row to read the actual decision (NOTIFY
 * payload is bounded at 8KB so we only carry the conversationId). The listen
 * client auto-reconnects on socket error / disconnect with a 1s backoff.
 */

const HITL_NOTIFY_CHANNEL = 'hitl_approval_decided'

const auditLogger = createAuditLogger('packages/server:hitl-approval-store')

const runtimeDdlEnabled = process.env.HITL_RUNTIME_DDL === 'true'

const initTables = runtimeDdlEnabled ? pool.query(`
  CREATE TABLE IF NOT EXISTS hitl_approvals (
    conversation_id TEXT PRIMARY KEY,
    payload JSONB NOT NULL DEFAULT '{}',
    decision TEXT,
    decided_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_hitl_approvals_expires
    ON hitl_approvals (expires_at)
    WHERE decision IS NULL;
`) : Promise.resolve()

export type HitlApprovalPayload = Record<string, unknown>

export type HitlApprovalEntry = {
  conversationId: string
  payload: HitlApprovalPayload
  decision: string | null
  decidedAt: string | null
  expiresAt: string
  createdAt: string
}

export type HitlAwaitOutcome =
  | { status: 'decided'; decision: string }
  | { status: 'timeout' }
  | { status: 'expired' }

type DecisionSubscriber = {
  callback: (conversationId: string, decision: string) => void
}

export class HitlApprovalStore {
  private ready: Promise<void> | null = null
  private readonly pollIntervalMs: number

  constructor(options: { pollIntervalMs?: number } = {}) {
    this.pollIntervalMs = Math.max(100, options.pollIntervalMs ?? 500)
  }

  private ensureTables() {
    if (!this.ready) {
      this.ready = initTables.then(() => undefined)
    }
    return this.ready
  }

  /** Insert (or refresh) a pending approval. Resets `decision` to NULL so a
   *  re-enqueue treats the prior decision as superseded. */
  async enqueue(
    conversationId: string,
    payload: HitlApprovalPayload,
    ttlSec: number
  ): Promise<HitlApprovalEntry> {
    await this.ensureTables()
    const safeTtl = Math.max(1, Math.floor(ttlSec))
    const result = await pool.query(
      `INSERT INTO hitl_approvals (conversation_id, payload, expires_at)
       VALUES ($1, $2::jsonb, now() + ($3 || ' seconds')::interval)
       ON CONFLICT (conversation_id) DO UPDATE SET
         payload = EXCLUDED.payload,
         decision = NULL,
         decided_at = NULL,
         expires_at = EXCLUDED.expires_at,
         created_at = now()
       RETURNING *`,
      [conversationId, JSON.stringify(payload ?? {}), String(safeTtl)]
    )
    return rowToEntry(result.rows[0])
  }

  /** Record a human decision. Returns true if the row was found & updated.
   *  Emits `pg_notify('hitl_approval_decided', conversationId)` on success so
   *  any other gateway instance LISTENing on the channel can resume the
   *  awaiter (Wave 3 A · cross-instance resume). The notify is best-effort:
   *  if it fails the SQL UPDATE has already committed so the polling fallback
   *  in `await()` still resolves the awaiter on the same instance. */
  async decide(conversationId: string, decision: string): Promise<boolean> {
    await this.ensureTables()
    const result = await pool.query(
      `UPDATE hitl_approvals
       SET decision = $2, decided_at = now()
       WHERE conversation_id = $1
         AND decision IS NULL
         AND expires_at > now()
       RETURNING conversation_id`,
      [conversationId, decision]
    )
    const updated = Boolean(result.rowCount && result.rowCount > 0)
    if (updated) {
      try {
        await pool.query(`SELECT pg_notify($1, $2)`, [HITL_NOTIFY_CHANNEL, conversationId])
      } catch (error) {
        auditLogger.error({
          action: 'hitl-approval.notify-failed',
          requestId: conversationId,
          metadata: { error: error instanceof Error ? error.message : String(error) }
        })
      }
    }
    return updated
  }

  /**
   * Wave 3 A · subscribe to cross-instance decision notifications.
   *
   * Lifecycle:
   *   - First subscriber lazily acquires a sticky `pool.connect()` client and
   *     issues `LISTEN hitl_approval_decided`. Subsequent subscribers reuse
   *     the same client (reference-counted).
   *   - On `notification`, the payload (conversationId) is used to look up the
   *     full row — NOTIFY can't safely carry the decision past 8KB, and the
   *     row is the source of truth anyway.
   *   - The unsubscribe fn returned decrements the refcount; when it hits 0
   *     we `UNLISTEN` and release the client back to the pool.
   *
   * Resilience:
   *   - If the listen client errors / disconnects (`error` or `end` events),
   *     we log, mark it dead, and reconnect after a 1s backoff while there
   *     is still at least one subscriber. Missed notifications during the
   *     gap are still observable via the `await()` polling fallback (which
   *     keeps the same-instance fast-path correct), so reconnect is purely
   *     to restore cross-instance latency to ~one round-trip.
   */
  subscribeToDecisions(
    callback: (conversationId: string, decision: string) => void
  ): () => void {
    const subscriber: DecisionSubscriber = { callback }
    this.subscribers.add(subscriber)
    void this.ensureListenClient()
    return () => {
      if (!this.subscribers.delete(subscriber)) return
      if (this.subscribers.size === 0) {
        void this.teardownListenClient()
      }
    }
  }

  private subscribers = new Set<DecisionSubscriber>()
  private listenClient: PoolClientLike | null = null
  private listenClientStarting: Promise<void> | null = null
  private listenReconnectTimer: NodeJS.Timeout | null = null

  private async ensureListenClient(): Promise<void> {
    if (this.listenClient || this.listenClientStarting) return
    if (this.subscribers.size === 0) return
    await this.ensureTables()
    this.listenClientStarting = (async () => {
      try {
        const client = await pool.connect()
        client.on('notification', (msg: PgNotification) => {
          if (msg.channel !== HITL_NOTIFY_CHANNEL) return
          const conversationId = msg.payload ?? ''
          if (!conversationId) return
          void this.dispatchNotification(conversationId)
        })
        client.on('error', (error: unknown) => {
          auditLogger.error({
            action: 'hitl-approval.listen-client-error',
            requestId: 'listener',
            metadata: { error: error instanceof Error ? error.message : String(error) }
          })
          this.scheduleReconnect()
        })
        // `end` fires when the underlying socket closes (e.g. PG restart). The
        // pg driver already removes the client from the pool, so we just need
        // to reconnect.
        client.on('end', () => {
          this.scheduleReconnect()
        })
        await client.query(`LISTEN ${HITL_NOTIFY_CHANNEL}`)
        this.listenClient = client
      } catch (error) {
        auditLogger.error({
          action: 'hitl-approval.listen-setup-failed',
          requestId: 'listener',
          metadata: { error: error instanceof Error ? error.message : String(error) }
        })
        this.scheduleReconnect()
      } finally {
        this.listenClientStarting = null
      }
    })()
    return this.listenClientStarting
  }

  private scheduleReconnect() {
    const dead = this.listenClient
    this.listenClient = null
    if (dead) {
      try {
        // `release(true)` flags the client as broken so the pool drops it
        dead.release(true)
      } catch {
        // already released / never attached — ignore
      }
    }
    if (this.listenReconnectTimer || this.subscribers.size === 0) return
    this.listenReconnectTimer = setTimeout(() => {
      this.listenReconnectTimer = null
      void this.ensureListenClient()
    }, 1000)
  }

  private async teardownListenClient(): Promise<void> {
    if (this.listenReconnectTimer) {
      clearTimeout(this.listenReconnectTimer)
      this.listenReconnectTimer = null
    }
    const client = this.listenClient
    this.listenClient = null
    if (!client) return
    try {
      await client.query(`UNLISTEN ${HITL_NOTIFY_CHANNEL}`)
    } catch {
      // best-effort
    }
    try {
      client.release()
    } catch {
      // already released — ignore
    }
  }

  private async dispatchNotification(conversationId: string): Promise<void> {
    if (this.subscribers.size === 0) return
    let entry: HitlApprovalEntry | null = null
    try {
      entry = await this.get(conversationId)
    } catch (error) {
      auditLogger.error({
        action: 'hitl-approval.notification-fetch-failed',
        requestId: conversationId,
        metadata: { error: error instanceof Error ? error.message : String(error) }
      })
      return
    }
    if (!entry?.decision) return
    const decision = entry.decision
    for (const subscriber of [...this.subscribers]) {
      try {
        subscriber.callback(conversationId, decision)
      } catch (error) {
        auditLogger.error({
          action: 'hitl-approval.subscriber-error',
          requestId: conversationId,
          metadata: { error: error instanceof Error ? error.message : String(error) }
        })
      }
    }
  }

  /** Read current state without mutating. */
  async get(conversationId: string): Promise<HitlApprovalEntry | null> {
    await this.ensureTables()
    const result = await pool.query(
      'SELECT * FROM hitl_approvals WHERE conversation_id = $1',
      [conversationId]
    )
    return result.rowCount ? rowToEntry(result.rows[0]) : null
  }

  /** Block until decided / expired / external timeout fires. */
  async await(conversationId: string, timeoutMs: number): Promise<HitlAwaitOutcome> {
    const deadline = Date.now() + Math.max(0, timeoutMs)
    while (true) {
      const entry = await this.get(conversationId)
      if (!entry) return { status: 'expired' }
      if (entry.decision) return { status: 'decided', decision: entry.decision }
      if (Date.parse(entry.expiresAt) <= Date.now()) return { status: 'expired' }
      if (Date.now() >= deadline) return { status: 'timeout' }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs))
    }
  }

  /** Sweep expired un-decided rows. Safe to call from a cron / interval. */
  async purgeExpired(): Promise<number> {
    await this.ensureTables()
    try {
      const result = await pool.query(
        `DELETE FROM hitl_approvals
         WHERE decision IS NULL AND expires_at <= now()`
      )
      const removed = result.rowCount ?? 0
      if (removed > 0) {
        auditLogger.info({
          action: 'hitl-approval.purge-expired',
          requestId: 'cron',
          metadata: { removed }
        })
      }
      return removed
    } catch (error) {
      auditLogger.error({
        action: 'hitl-approval.purge-expired-failed',
        requestId: 'cron',
        metadata: { error: error instanceof Error ? error.message : String(error) }
      })
      return 0
    }
  }
}

function rowToEntry(row: Record<string, unknown>): HitlApprovalEntry {
  return {
    conversationId: String(row.conversation_id),
    payload: parseJson(row.payload),
    decision: typeof row.decision === 'string' ? row.decision : null,
    decidedAt: row.decided_at ? toIso(row.decided_at) : null,
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at)
  }
}

function parseJson(value: unknown): HitlApprovalPayload {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as HitlApprovalPayload
    } catch {
      return {}
    }
  }
  return value as HitlApprovalPayload
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return new Date(value).toISOString()
  return new Date().toISOString()
}
