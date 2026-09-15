import type { Handoff, HandoffLogger } from './handoff-types.js'
import { pool } from '../db/pool.js'

/**
 * P11.17 · handoff log durable persistence.
 *
 * Originally the in-memory ring per thread was discarded on stream
 * end, making post-mortem debugging of multi-agent workshops
 * impossible — once the user closed the page or the gateway
 * restarted, the agent → agent communication trail vanished.
 *
 * Now releaseHandoffLogger writes the full event sequence into a
 * `handoff_events` PG table (lazy-DDL on first write) before
 * clearing the in-memory copy. Indexed by trace_id + emitted_at
 * for typical post-mortem queries: "show me the handoffs for
 * trace XYZ" / "show degradation events in the last hour".
 *
 * Writes are best-effort: a DB outage logs a warning but never
 * fails the conversation. The in-memory logger remains the
 * authoritative source during a live stream.
 */
const HANDOFF_DDL = `
  CREATE TABLE IF NOT EXISTS handoff_events (
    id BIGSERIAL PRIMARY KEY,
    trace_id TEXT NOT NULL,
    workspace_id TEXT,
    user_id TEXT,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload JSONB,
    meta JSONB,
    t_offset_ms INTEGER NOT NULL,
    emitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_handoff_events_trace_id
    ON handoff_events (trace_id, emitted_at);
  CREATE INDEX IF NOT EXISTS idx_handoff_events_kind_emitted
    ON handoff_events (kind, emitted_at DESC);
`

let ddlReady: Promise<void> | null = null
function ensureHandoffTable(): Promise<void> {
  if (!ddlReady) {
    const p: Promise<void> = pool.query(HANDOFF_DDL).then(
      () => undefined,
      (err: unknown) => {
        console.warn('[handoff-logger] DDL failed (will retry on next release):', err instanceof Error ? err.message : err)
        ddlReady = null
      }
    )
    ddlReady = p
    return p
  }
  return ddlReady
}

class InMemoryHandoffLogger implements HandoffLogger {
  private events: Handoff[] = []
  private subs = new Set<(h: Handoff) => void>()
  private startTime: number

  constructor() {
    this.startTime = Date.now()
  }

  record(event: Omit<Handoff, 't'>): void {
    const enriched: Handoff = {
      ...event,
      t: Date.now() - this.startTime
    }
    this.events.push(enriched)
    for (const sub of this.subs) {
      try {
        sub(enriched)
      } catch {
        /* swallow */
      }
    }
  }

  dump(): Handoff[] {
    return [...this.events]
  }

  subscribe(cb: (h: Handoff) => void): () => void {
    this.subs.add(cb)
    return () => {
      this.subs.delete(cb)
    }
  }

  clear(): void {
    this.events = []
    this.subs.clear()
    this.startTime = Date.now()
  }

  get size(): number {
    return this.events.length
  }
}

const loggersByThread = new Map<string, InMemoryHandoffLogger>()

export function getHandoffLogger(threadId: string): HandoffLogger {
  let logger = loggersByThread.get(threadId)
  if (!logger) {
    logger = new InMemoryHandoffLogger()
    loggersByThread.set(threadId, logger)
  }
  return logger
}

export function releaseHandoffLogger(threadId: string): Handoff[] {
  const logger = loggersByThread.get(threadId)
  if (!logger) return []
  const events = logger.dump()
  loggersByThread.delete(threadId)
  // P11.17 · drain to PG asynchronously (don't block the release).
  // Skip when no events to avoid pointless DDL.
  if (events.length > 0 && process.env.HANDOFF_LOG_PERSIST !== 'false') {
    void persistHandoffEvents(threadId, events)
  }
  return events
}

async function persistHandoffEvents(threadId: string, events: Handoff[]): Promise<void> {
  try {
    await ensureHandoffTable()
    // Build a single multi-row INSERT for efficiency. Each row gets its
    // own VALUES tuple. Workspace + user denormalised from event.meta
    // when present (LangGraph nodes pass them through).
    const rows: unknown[] = []
    const placeholders: string[] = []
    let p = 1
    for (const e of events) {
      const meta = (e.meta ?? {}) as unknown as Record<string, unknown>
      const workspaceId = (meta.workflowId as string | undefined) ?? null
      const userId = (meta.userId as string | undefined) ?? null
      placeholders.push(
        `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}::jsonb, $${p++}::jsonb, $${p++})`
      )
      rows.push(
        threadId,
        workspaceId,
        userId,
        e.from,
        e.to,
        e.kind,
        e.payload ? JSON.stringify(e.payload) : null,
        e.meta ? JSON.stringify(e.meta) : null,
        e.t ?? 0
      )
    }
    await pool.query(
      `INSERT INTO handoff_events (trace_id, workspace_id, user_id, "from", "to", kind, payload, meta, t_offset_ms)
       VALUES ${placeholders.join(', ')}`,
      rows
    )
  } catch (err) {
    console.warn(
      '[handoff-logger] persist failed for trace',
      threadId,
      '·',
      err instanceof Error ? err.message : err
    )
  }
}

export function __resetAllLoggersForTest(): void {
  for (const l of loggersByThread.values()) l.clear()
  loggersByThread.clear()
}

export function activeLoggerCount(): number {
  return loggersByThread.size
}
