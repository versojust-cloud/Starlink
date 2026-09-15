export type AuditEvent = {
  action: string
  userId?: string
  workflowId?: string
  requestId?: string
  metadata?: Record<string, unknown>
  durationMs?: number
}

export type AuditLevel = 'INFO' | 'WARN' | 'ERROR'

export type AuditLogger = {
  info: (event: AuditEvent) => void
  warn: (event: AuditEvent) => void
  error: (event: AuditEvent & { error?: unknown }) => void
}

/**
 * P11.18 · audit-event sink for cross-cutting observers.
 *
 * Receives every audit emission process-wide so that:
 *   - error-aggregator can dedup-and-count WARN/ERROR by fingerprint
 *   - SLO trackers can pick up agent-level signals without coupling
 *     directly to business-langgraph
 *
 * Sinks must be cheap + non-throwing — they run synchronously inside
 * the logger call. We catch sink exceptions defensively so a buggy
 * sink can never crash the producing call site.
 */
export type AuditSink = (
  level: AuditLevel,
  component: string,
  event: AuditEvent & { error?: unknown }
) => void

const auditSinks: AuditSink[] = []

export function registerAuditSink(sink: AuditSink): () => void {
  auditSinks.push(sink)
  return () => {
    const i = auditSinks.indexOf(sink)
    if (i >= 0) auditSinks.splice(i, 1)
  }
}

export function clearAuditSinksForTest(): void {
  auditSinks.length = 0
}

function notifySinks(level: AuditLevel, component: string, event: AuditEvent & { error?: unknown }) {
  for (const sink of auditSinks) {
    try {
      sink(level, component, event)
    } catch {
      // Defensive: a sink failure must never crash the producing call.
    }
  }
}

export function createAuditLogger(component: string): AuditLogger {
  const prefix = `[audit:${component}]`
  return {
    info: (event) => {
      console.info(prefix, formatEvent('INFO', event))
      notifySinks('INFO', component, event)
    },
    warn: (event) => {
      console.warn(prefix, formatEvent('WARN', event))
      notifySinks('WARN', component, event)
    },
    error: (event) => {
      console.error(prefix, formatEvent('ERROR', event))
      notifySinks('ERROR', component, event)
    }
  }
}

function formatEvent(level: string, event: AuditEvent & { error?: unknown }) {
  const payload = {
    level,
    action: event.action,
    userId: event.userId,
    workflowId: event.workflowId,
    requestId: event.requestId,
    durationMs: event.durationMs,
    metadata: event.metadata,
    error: event.error ? serializeError(event.error) : undefined,
    timestamp: new Date().toISOString()
  }
  return JSON.stringify(removeEmpty(payload))
}

function removeEmpty<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null)
  ) as Partial<T>
}

function serializeError(error: unknown): Record<string, unknown> | string {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  }
  return typeof error === 'string' ? error : JSON.stringify(error)
}
