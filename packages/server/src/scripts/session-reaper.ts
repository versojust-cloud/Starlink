/**
 * session-reaper · recover stale 'running' conversation_sessions rows
 *
 * Background:
 *   The gateway process writes a heartbeat every 30s for each active
 *   stream (see business-langgraph.streamConversation). When the
 *   gateway crashes mid-stream, the row stays at status='running'
 *   indefinitely, blocking the workspace soft-lock and accumulating
 *   "ghost" sessions in user-facing lists.
 *
 *   This script scans for sessions whose heartbeat has been silent
 *   for >90s (default) and marks them 'failed' with reason
 *   'heartbeat-lost'. Idempotent: re-running has no effect on
 *   already-failed rows.
 *
 * Run modes:
 *   pnpm kb:reembed-kb-chunks ...                        (existing pattern)
 *   pnpm reap-sessions                  — one-shot; exits when done
 *   pnpm reap-sessions --watch          — loop forever, sleeping
 *                                          REAPER_INTERVAL_SECONDS
 *                                          (default 60) between scans.
 *                                          Suitable for k8s sidecar.
 *   pnpm reap-sessions --dry-run        — log what would be reaped,
 *                                          don't write
 *
 * Env knobs:
 *   REAPER_HEARTBEAT_TIMEOUT_MS=90000   — how stale before recovery
 *   REAPER_GRACE_MS=60000               — initial grace after creation
 *                                          before requiring a heartbeat
 *   REAPER_BATCH_LIMIT=200              — max rows per scan
 *   REAPER_INTERVAL_SECONDS=60          — sleep between scans (--watch)
 *
 * Production deployment: cron / k8s CronJob every minute, or one
 *   long-running sidecar with --watch.
 */

import { createAuditLogger } from '@starlink/shared'
import { ConversationMemoryStore } from '../application/conversation-memory-store.js'
import { pool } from '../infrastructure/db/pool.js'

const auditLogger = createAuditLogger('packages/server:session-reaper')

const HEARTBEAT_TIMEOUT_MS = Number.parseInt(
  process.env.REAPER_HEARTBEAT_TIMEOUT_MS ?? '90000',
  10,
)
const GRACE_MS = Number.parseInt(process.env.REAPER_GRACE_MS ?? '60000', 10)
const BATCH_LIMIT = Number.parseInt(process.env.REAPER_BATCH_LIMIT ?? '200', 10)
const INTERVAL_SECONDS = Number.parseInt(
  process.env.REAPER_INTERVAL_SECONDS ?? '60',
  10,
)

interface RunReport {
  scanned: number
  reaped: number
  skipped: number
  errors: number
  durationMs: number
}

async function reapOnce(opts: {
  store: ConversationMemoryStore
  dryRun: boolean
}): Promise<RunReport> {
  const startedAt = Date.now()
  const stale = await opts.store.listStaleSessions({
    olderThanMs: HEARTBEAT_TIMEOUT_MS,
    graceMs: GRACE_MS,
    limit: BATCH_LIMIT,
  })

  let reaped = 0
  let errors = 0
  for (const session of stale) {
    const ageMs = session.heartbeatAt
      ? Date.now() - new Date(session.heartbeatAt).getTime()
      : Date.now() - new Date(session.createdAt).getTime()
    const reason = session.heartbeatAt
      ? `heartbeat-lost (last ${Math.round(ageMs / 1000)}s ago)`
      : `no-heartbeat (created ${Math.round(ageMs / 1000)}s ago)`

    if (opts.dryRun) {
      console.log(
        `[reaper] DRY RUN would fail · session=${session.id} workspace=${session.workspaceId} user=${session.userId} reason="${reason}"`,
      )
      reaped += 1
      continue
    }

    try {
      await opts.store.failSession(session.id, reason)
      reaped += 1
      auditLogger.info({
        action: 'session-reaper.reaped',
        requestId: session.id,
        workflowId: session.workspaceId,
        userId: session.userId,
        metadata: { reason, ageMs }
      })
    } catch (err) {
      errors += 1
      auditLogger.error({
        action: 'session-reaper.reap-failed',
        requestId: session.id,
        workflowId: session.workspaceId,
        userId: session.userId,
        metadata: { error: err instanceof Error ? err.message : String(err) }
      })
    }
  }

  return {
    scanned: stale.length,
    reaped,
    skipped: stale.length - reaped - errors,
    errors,
    durationMs: Date.now() - startedAt,
  }
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2))
  const dryRun = args.has('--dry-run')
  const watch = args.has('--watch')

  const store = new ConversationMemoryStore()

  console.log(
    `[reaper] starting · timeout=${HEARTBEAT_TIMEOUT_MS}ms grace=${GRACE_MS}ms batch=${BATCH_LIMIT} dryRun=${dryRun} watch=${watch}`,
  )

  if (!watch) {
    const report = await reapOnce({ store, dryRun })
    console.log(`[reaper] one-shot done · ${JSON.stringify(report)}`)
    await pool.end()
    return
  }

  // Watch loop. We don't catch SIGINT specially — Node's default
  // handler exits, which is what we want for k8s graceful shutdown.
  // The pool will be closed on process exit.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const report = await reapOnce({ store, dryRun })
      if (report.scanned > 0 || report.reaped > 0) {
        console.log(`[reaper] tick · ${JSON.stringify(report)}`)
      }
    } catch (err) {
      console.error(
        `[reaper] tick failed · ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_SECONDS * 1000))
  }
}

main().catch((err) => {
  console.error('[reaper] fatal:', err)
  process.exit(1)
})
