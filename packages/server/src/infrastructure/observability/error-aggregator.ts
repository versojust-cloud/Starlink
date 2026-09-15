/**
 * P11.18 · Sentry-style error aggregation (in-memory).
 *
 * Why: production log streams have thousands of WARN/ERROR lines per
 * day across hundreds of distinct fingerprints. Operators can't read
 * the firehose. They need:
 *   1. "What's broken?" — the top-N error fingerprints right now
 *   2. "Is this a new problem?" — first-seen / last-seen / count
 *   3. "Who's affected?" — sample userId / workspaceId / requestId
 *
 * Sentry solves this by hashing exception fingerprints and grouping.
 * We do the same in-process: every WARN/ERROR audit event gets a
 * fingerprint = hash(component, action, error.name + first 3 stack
 * frames). Identical fingerprints accumulate in one slot; new ones
 * push into a bounded LRU map.
 *
 * Surface:
 *   - registers as audit sink at module-load via `installErrorAggregator()`
 *   - `getErrorSummary()` returns top-N for /health/errors
 *   - bounded to MAX_FINGERPRINTS (200 default) so memory can't grow
 *     unbounded under attack
 *
 * Out of scope: persistence to Sentry/PG. The in-memory aggregator is
 * the FIRST hop — adding a real Sentry SDK later just registers another
 * sink without changing this code.
 */

import crypto from 'node:crypto'
import { type AuditLevel, type AuditEvent, registerAuditSink } from '@starlink/shared'

interface ErrorRecord {
  fingerprint: string
  component: string
  action: string
  level: AuditLevel
  message: string
  count: number
  firstSeenIso: string
  lastSeenIso: string
  sample: {
    userId?: string
    workflowId?: string
    requestId?: string
  }
}

const MAX_FINGERPRINTS = Math.max(50, Number(process.env.ERROR_AGG_MAX_FINGERPRINTS) || 200)

// Insertion-order Map = LRU when we delete-then-re-set on access.
const fingerprintsMap = new Map<string, ErrorRecord>()

function fingerprintFor(component: string, event: AuditEvent & { error?: unknown }): string {
  const err = event.error
  let errSig = ''
  if (err instanceof Error) {
    // First 3 stack frames give a strong signal without being too specific
    // (line numbers may shift across deploys; function names + file paths
    // are stable enough).
    const frames = (err.stack ?? '').split('\n').slice(1, 4).join('|')
    errSig = `${err.name}|${err.message}|${frames}`
  } else if (typeof err === 'string') {
    errSig = err
  } else if (err && typeof err === 'object') {
    errSig = JSON.stringify(err).slice(0, 200)
  }
  // Include the metadata.err field too — many of our audit calls pass
  // err via metadata rather than the top-level `error` field.
  const metaErr =
    event.metadata && typeof event.metadata.err === 'string'
      ? event.metadata.err.slice(0, 200)
      : ''
  const raw = `${component}|${event.action}|${errSig}|${metaErr}`
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16)
}

function summarizeMessage(event: AuditEvent & { error?: unknown }): string {
  if (event.error instanceof Error) return `${event.error.name}: ${event.error.message}`
  if (typeof event.error === 'string') return event.error
  if (event.metadata?.err && typeof event.metadata.err === 'string') return event.metadata.err
  return event.action
}

let installed = false

/**
 * Register the aggregator as an audit sink. Idempotent — calling twice
 * is a no-op so wiring at boot is safe even if the helper is imported
 * multiple times.
 */
export function installErrorAggregator(): void {
  if (installed) return
  installed = true
  registerAuditSink((level, component, event) => {
    if (level === 'INFO') return
    const fp = fingerprintFor(component, event)
    const now = new Date().toISOString()
    const existing = fingerprintsMap.get(fp)
    if (existing) {
      existing.count += 1
      existing.lastSeenIso = now
      // refresh LRU position
      fingerprintsMap.delete(fp)
      fingerprintsMap.set(fp, existing)
      return
    }
    if (fingerprintsMap.size >= MAX_FINGERPRINTS) {
      // Drop oldest (first inserted that wasn't recently touched).
      const firstKey = fingerprintsMap.keys().next().value
      if (firstKey) fingerprintsMap.delete(firstKey)
    }
    fingerprintsMap.set(fp, {
      fingerprint: fp,
      component,
      action: event.action,
      level,
      message: summarizeMessage(event),
      count: 1,
      firstSeenIso: now,
      lastSeenIso: now,
      sample: {
        userId: event.userId,
        workflowId: event.workflowId,
        requestId: event.requestId
      }
    })
  })
}

/**
 * Snapshot of the current top-N error fingerprints by count, descending.
 * Default N=20 is a reasonable /health/errors page size.
 */
export function getErrorSummary(topN = 20): {
  totalFingerprints: number
  totalEvents: number
  records: ErrorRecord[]
} {
  const all = Array.from(fingerprintsMap.values())
  const totalEvents = all.reduce((s, r) => s + r.count, 0)
  const records = [...all].sort((a, b) => b.count - a.count).slice(0, Math.max(1, topN))
  return { totalFingerprints: all.length, totalEvents, records }
}

/** Test/admin: clear all aggregated state. */
export function clearErrorAggregatorForTest(): void {
  fingerprintsMap.clear()
  installed = false
}
