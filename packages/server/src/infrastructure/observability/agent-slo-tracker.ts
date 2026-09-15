/**
 * P11.18 · Per-agent SLO tracker (in-memory rolling window).
 *
 * Why: when the user reports "report-writer is slow today", we need
 * data to answer "by how much vs baseline?" without spelunking
 * through 1000s of audit log lines. Per-agent SLO answers:
 *   - latency p50 / p95 over last N invocations
 *   - error rate (% of invocations that threw)
 *   - fallback rate (% that triggered local-hash / rule-based degraded path)
 *   - degraded? → simple threshold-based boolean
 *
 * Implementation: per-agent fixed-size ring buffer of recent
 * (durationMs, status) tuples. O(1) record, O(N) snapshot.
 *
 * Not goals: histograms, custom percentiles, persistence to Prom.
 * Those can layer on top later. The first goal is to surface
 * `/health/agents` and `agent-degraded` warnings.
 */

import { createAuditLogger } from '@starlink/shared'
import { pool } from '../db/pool.js'

const auditLogger = createAuditLogger('packages/server:agent-slo-tracker')

const SLO_DDL = `
  CREATE TABLE IF NOT EXISTS agent_slo_totals (
    agent_id TEXT PRIMARY KEY,
    invocations BIGINT NOT NULL DEFAULT 0,
    errors      BIGINT NOT NULL DEFAULT 0,
    fallbacks   BIGINT NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`

let ddlPromise: Promise<void> | null = null
function ensureDdl(): Promise<void> {
  if (!ddlPromise) {
    ddlPromise = pool
      .query(SLO_DDL)
      .then(() => undefined)
      .catch((err: unknown) => {
        // Don't crash app on DDL failure; SLO degrades to in-memory-only.
        auditLogger.warn({
          action: 'agent-slo.ddl-failed',
          requestId: 'startup',
          metadata: { err: err instanceof Error ? err.message : String(err) }
        })
      })
  }
  return ddlPromise as Promise<void>
}

export type AgentInvocationStatus = 'success' | 'error' | 'fallback'

interface RecordedInvocation {
  durationMs: number
  status: AgentInvocationStatus
  /** epoch ms */
  ts: number
}

const WINDOW_SIZE = Math.max(20, Number(process.env.AGENT_SLO_WINDOW_SIZE) || 100)
const ERROR_RATE_DEGRADED = Number(process.env.AGENT_SLO_DEGRADED_THRESHOLD) || 0.3

interface AgentRing {
  agentId: string
  buffer: RecordedInvocation[]
  // Cumulative counters (never decay) — useful for "lifetime" stats
  // alongside the windowed view.
  totals: {
    invocations: number
    errors: number
    fallbacks: number
  }
  /** Last time we emitted an `agent-degraded` audit so we don't spam. */
  lastDegradedWarnAt: number
}

const ringByAgentId = new Map<string, AgentRing>()

function getRing(agentId: string): AgentRing {
  let ring = ringByAgentId.get(agentId)
  if (!ring) {
    ring = {
      agentId,
      buffer: [],
      totals: { invocations: 0, errors: 0, fallbacks: 0 },
      lastDegradedWarnAt: 0
    }
    ringByAgentId.set(agentId, ring)
  }
  return ring
}

/**
 * Record one agent invocation outcome. Call inside the agent runner's
 * try/finally so every code path lands. `durationMs` is wall-clock from
 * call start to terminal state.
 *
 * After recording, if this batch's error rate exceeds the threshold
 * AND we haven't warned in the last 60s, emit an audit event so
 * downstream alerting (`/health/agents`, dashboards) can surface it.
 */
export function recordAgentInvocation(
  agentId: string,
  durationMs: number,
  status: AgentInvocationStatus
): void {
  const ring = getRing(agentId)
  ring.totals.invocations += 1
  if (status === 'error') ring.totals.errors += 1
  if (status === 'fallback') ring.totals.fallbacks += 1

  ring.buffer.push({ durationMs, status, ts: Date.now() })
  if (ring.buffer.length > WINDOW_SIZE) ring.buffer.shift()

  // P11.18 · F4 cross-gateway publish (best-effort, fire-and-forget)
  if (redisPublisher) {
    try {
      redisPublisher
        .publish(
          SLO_CHANNEL,
          JSON.stringify({ agentId, durationMs, status, src: PROCESS_ID })
        )
        .catch(() => {/* tolerated */})
    } catch {
      // Defensive — never block on publish.
    }
  }

  // Degradation detector: only run after we have a meaningful window.
  if (ring.buffer.length >= 10) {
    const errorsInWindow = ring.buffer.filter((r) => r.status === 'error').length
    const errorRate = errorsInWindow / ring.buffer.length
    const now = Date.now()
    if (errorRate >= ERROR_RATE_DEGRADED && now - ring.lastDegradedWarnAt > 60_000) {
      ring.lastDegradedWarnAt = now
      auditLogger.warn({
        action: 'agent-slo.degraded',
        requestId: 'periodic',
        metadata: {
          agentId,
          errorRate: Number(errorRate.toFixed(3)),
          errorsInWindow,
          windowSize: ring.buffer.length,
          threshold: ERROR_RATE_DEGRADED
        }
      })
    }
  }
}

export interface AgentSloSnapshot {
  agentId: string
  windowSize: number
  // Rolling-window stats
  errorRate: number
  fallbackRate: number
  latencyP50Ms: number
  latencyP95Ms: number
  // Lifetime cumulative
  totals: {
    invocations: number
    errors: number
    fallbacks: number
  }
  degraded: boolean
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))
  return sorted[idx]
}

export function getAgentSloSnapshot(agentId: string): AgentSloSnapshot | null {
  const ring = ringByAgentId.get(agentId)
  if (!ring) return null
  const win = ring.buffer
  const n = win.length
  if (n === 0) {
    return {
      agentId,
      windowSize: 0,
      errorRate: 0,
      fallbackRate: 0,
      latencyP50Ms: 0,
      latencyP95Ms: 0,
      totals: { ...ring.totals },
      degraded: false
    }
  }
  const errors = win.filter((r) => r.status === 'error').length
  const fallbacks = win.filter((r) => r.status === 'fallback').length
  const errorRate = errors / n
  const fallbackRate = fallbacks / n
  const sortedDurations = win.map((r) => r.durationMs).sort((a, b) => a - b)
  return {
    agentId,
    windowSize: n,
    errorRate: Number(errorRate.toFixed(3)),
    fallbackRate: Number(fallbackRate.toFixed(3)),
    latencyP50Ms: percentile(sortedDurations, 50),
    latencyP95Ms: percentile(sortedDurations, 95),
    totals: { ...ring.totals },
    degraded: errorRate >= ERROR_RATE_DEGRADED && n >= 10
  }
}

export function getAllAgentSloSnapshots(): AgentSloSnapshot[] {
  return Array.from(ringByAgentId.keys())
    .map((id) => getAgentSloSnapshot(id))
    .filter((s): s is AgentSloSnapshot => s !== null)
    .sort((a, b) => b.totals.invocations - a.totals.invocations)
}

/** Test helper — wipe all rings. */
export function clearAgentSloForTest(): void {
  ringByAgentId.clear()
}

/**
 * P11.18 · F4 · Redis-backed cross-gateway SLO publish.
 *
 * When deployed behind a load balancer with N gateway instances, each
 * process has its own in-memory ring. Without sharing, /health/agents
 * only shows traffic THIS gateway saw. Aggregating via PG is a 5-min
 * lag (flush interval); Redis pub/sub is real-time.
 *
 * Strategy: each gateway publishes its delta `recordAgentInvocation`
 * events to a shared Redis stream. Subscribers in other gateways
 * apply the delta to their local ring. The PG flush remains the
 * source of truth for cumulative totals.
 *
 * Opt-in via REDIS_URL + AGENT_SLO_REDIS_ENABLED=true. When disabled
 * (default), behaves identically to the current single-process mode.
 *
 * Channel: `starlink:agent-slo:invocations`
 * Event:   { agentId: string, durationMs: number, status: 'success'|'error'|'fallback', src: string }
 */
let redisPublisher: import('ioredis').Redis | null = null
let redisSubscriber: import('ioredis').Redis | null = null
const SLO_CHANNEL = 'starlink:agent-slo:invocations'
const PROCESS_ID = `proc-${Math.random().toString(36).slice(2, 10)}`

export async function startAgentSloRedisSync(): Promise<{ enabled: boolean }> {
  if (process.env.AGENT_SLO_REDIS_ENABLED !== 'true') return { enabled: false }
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    auditLogger.warn({
      action: 'agent-slo.redis-skip',
      requestId: 'startup',
      metadata: { reason: 'AGENT_SLO_REDIS_ENABLED=true but REDIS_URL not set' }
    })
    return { enabled: false }
  }
  try {
    const { Redis } = await import('ioredis')
    redisPublisher = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 })
    redisSubscriber = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 })
    await redisPublisher.connect()
    await redisSubscriber.connect()
    await redisSubscriber.subscribe(SLO_CHANNEL)
    redisSubscriber.on('message', (channel, msg) => {
      if (channel !== SLO_CHANNEL) return
      try {
        const ev = JSON.parse(msg) as { agentId: string; durationMs: number; status: AgentInvocationStatus; src: string }
        // Skip our own events to avoid double-counting.
        if (ev.src === PROCESS_ID) return
        recordAgentInvocationLocal(ev.agentId, ev.durationMs, ev.status)
      } catch {
        // Bad payload — ignore.
      }
    })
    auditLogger.info({
      action: 'agent-slo.redis-ready',
      requestId: 'startup',
      metadata: { processId: PROCESS_ID, channel: SLO_CHANNEL }
    })
    return { enabled: true }
  } catch (err) {
    auditLogger.warn({
      action: 'agent-slo.redis-init-failed',
      requestId: 'startup',
      metadata: { err: err instanceof Error ? err.message : String(err) }
    })
    return { enabled: false }
  }
}

/** Internal — record without re-publishing to avoid loops. */
function recordAgentInvocationLocal(
  agentId: string,
  durationMs: number,
  status: AgentInvocationStatus
): void {
  const ring = getRing(agentId)
  ring.totals.invocations += 1
  if (status === 'error') ring.totals.errors += 1
  if (status === 'fallback') ring.totals.fallbacks += 1
  ring.buffer.push({ durationMs, status, ts: Date.now() })
  if (ring.buffer.length > WINDOW_SIZE) ring.buffer.shift()
}

export async function shutdownAgentSloRedisSync(): Promise<void> {
  try {
    if (redisSubscriber) await redisSubscriber.quit()
    if (redisPublisher) await redisPublisher.quit()
  } catch {
    // best-effort shutdown
  }
  redisPublisher = null
  redisSubscriber = null
}

/**
 * P11.18 · hydrate cumulative totals from PG on boot. The 100-element
 * ring buffer (windowed stats) is intentionally NOT persisted —
 * "recent" by definition rebuilds quickly. Only the lifetime counters
 * survive restart.
 */
export async function hydrateAgentSloFromDb(): Promise<{ loaded: number }> {
  await ensureDdl()
  try {
    const r = await pool.query(
      'SELECT agent_id, invocations, errors, fallbacks FROM agent_slo_totals'
    )
    let loaded = 0
    for (const row of r.rows as Array<Record<string, unknown>>) {
      const id = row.agent_id as string
      const ring = getRing(id)
      ring.totals.invocations = Number(row.invocations ?? 0)
      ring.totals.errors = Number(row.errors ?? 0)
      ring.totals.fallbacks = Number(row.fallbacks ?? 0)
      loaded++
    }
    return { loaded }
  } catch (err) {
    auditLogger.warn({
      action: 'agent-slo.hydrate-failed',
      requestId: 'startup',
      metadata: { err: err instanceof Error ? err.message : String(err) }
    })
    return { loaded: 0 }
  }
}

/**
 * Persist current cumulative totals back to PG. Idempotent UPSERT.
 * Best-effort — errors audit-log + return 0 (never throw).
 */
export async function flushAgentSloToDb(): Promise<{ flushed: number }> {
  await ensureDdl()
  let flushed = 0
  try {
    for (const ring of ringByAgentId.values()) {
      await pool.query(
        `INSERT INTO agent_slo_totals (agent_id, invocations, errors, fallbacks, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (agent_id) DO UPDATE SET
           invocations = EXCLUDED.invocations,
           errors = EXCLUDED.errors,
           fallbacks = EXCLUDED.fallbacks,
           updated_at = now()`,
        [ring.agentId, ring.totals.invocations, ring.totals.errors, ring.totals.fallbacks]
      )
      flushed++
    }
    return { flushed }
  } catch (err) {
    auditLogger.warn({
      action: 'agent-slo.flush-failed',
      requestId: 'periodic',
      metadata: { err: err instanceof Error ? err.message : String(err), flushed }
    })
    return { flushed }
  }
}

let flushTimer: NodeJS.Timeout | null = null
export function startAgentSloFlushTimer(): void {
  if (flushTimer) return
  if (process.env.AGENT_SLO_PERSIST_ENABLED === 'false') return
  const intervalMs = Number(process.env.AGENT_SLO_FLUSH_INTERVAL_MS) || 5 * 60 * 1000
  flushTimer = setInterval(() => {
    void flushAgentSloToDb()
  }, intervalMs)
  if (typeof flushTimer.unref === 'function') flushTimer.unref()
}
