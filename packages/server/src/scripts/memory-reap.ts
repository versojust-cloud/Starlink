/**
 * P14 P7 · CLI entry for MemoryReaper.
 *
 * Run via:
 *   pnpm --filter @starlink/server memory:reap [--session-ttl=30] [--workspace-ttl=90] [--batch=500]
 *
 * Prints archived row counts per layer and exits. Designed to be
 * invoked from cron / pgcron / GitHub Actions schedule.
 */

import { MemoryReaper } from '../application/memory-reaper.js'
import { pool } from '../infrastructure/db/pool.js'

function parseArg(name: string): number | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (!arg) return undefined
  const n = Number(arg.split('=')[1])
  return Number.isFinite(n) ? n : undefined
}

async function main(): Promise<void> {
  const reaper = new MemoryReaper({
    ttlDays: {
      session: parseArg('session-ttl') ?? 30,
      workspace: parseArg('workspace-ttl') ?? 90
    },
    batchSize: parseArg('batch') ?? 500
  })

  const result = await reaper.reap()
  console.log(JSON.stringify({
    action: 'memory-reap',
    archivedSession: result.archived.session,
    archivedWorkspace: result.archived.workspace,
    total: result.total,
    timestamp: new Date().toISOString()
  }))
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(JSON.stringify({
      action: 'memory-reap.failed',
      error: err instanceof Error ? err.message : String(err)
    }))
    process.exit(1)
  })
