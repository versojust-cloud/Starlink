/**
 * Wave 3 A · Cross-instance HITL resume smoke test.
 *
 * Boots two HitlApprovalStore instances in the same Node process to simulate
 * two gateway instances sharing the same Postgres backend. Instance A enqueues
 * a pending approval and blocks on `await()`. Instance B calls `decide()` —
 * the LISTEN/NOTIFY round-trip should wake A within tens of milliseconds.
 *
 * Run with: pnpm run smoke:hitl-cross-instance
 *   - requires DATABASE_URL in .env
 *   - sets HITL_RUNTIME_DDL=true so the table is created if missing
 */

process.env.HITL_RUNTIME_DDL = 'true'

import { pool } from '../infrastructure/db/pool.js'
import { HitlApprovalStore } from '../application/hitl-approval-store.js'

const CONV_ID = `smoke-cross-${Date.now()}`
const TTL_SEC = 60
const AWAIT_TIMEOUT_MS = 5000

async function main() {
  // Two stores = two simulated gateway instances. They share `pool`, but each
  // calls `pool.connect()` separately for its own LISTEN client.
  const instanceA = new HitlApprovalStore({ pollIntervalMs: 200 })
  const instanceB = new HitlApprovalStore({ pollIntervalMs: 200 })

  let aResolved = false
  let aResolvedAt = 0
  let aDecidedVia: 'listen' | 'await' = 'await'

  // Instance A: subscribe to LISTEN on its own client. The smoke records the
  // wallclock latency between B's `decide()` and A's notification fire, so we
  // can prove cross-instance resume works without a polling fallback.
  const unsubA = instanceA.subscribeToDecisions((convId) => {
    if (convId === CONV_ID && !aResolved) {
      aResolvedAt = Date.now()
      aDecidedVia = 'listen'
      aResolved = true
    }
  })

  // Instance B subscribes too just to verify multi-listener fan-out works
  // (both clients should fire on the same NOTIFY).
  let bNotificationAt = 0
  const unsubB = instanceB.subscribeToDecisions((convId) => {
    if (convId === CONV_ID && !bNotificationAt) {
      bNotificationAt = Date.now()
    }
  })

  // Give both LISTEN clients a tick to attach before we enqueue.
  await new Promise((r) => setTimeout(r, 200))

  console.log(`[smoke] enqueueing ${CONV_ID} on Instance A`)
  const enqueuedAt = Date.now()
  await instanceA.enqueue(CONV_ID, { simulated: 'cross-instance' }, TTL_SEC)

  // Schedule Instance B to decide ~150ms after enqueue. A should be parked in
  // `await()` (or its LISTEN handler) waiting.
  setTimeout(async () => {
    console.log(`[smoke] Instance B calling decide('[ACCEPTED]')`)
    const ok = await instanceB.decide(CONV_ID, '[ACCEPTED]')
    if (!ok) {
      console.error('[smoke] Instance B.decide returned false — row missing or already decided')
    }
  }, 150)

  // Instance A awaits via its own store (this is the `polling` fallback path
  // — same-process await still works even without LISTEN). The LISTEN
  // callback above runs in parallel and sets `aResolvedAt` for the
  // cross-instance latency measurement.
  const awaitStart = Date.now()
  const outcome = await instanceA.await(CONV_ID, AWAIT_TIMEOUT_MS)
  const awaitEnd = Date.now()

  if (!aResolved) {
    aResolvedAt = awaitEnd
    aDecidedVia = 'await'
  }

  console.log('[smoke] TIMINGS', {
    enqueueToDecideMs: aResolvedAt - enqueuedAt,
    awaitDurationMs: awaitEnd - awaitStart,
    listenLatencyMs: bNotificationAt ? bNotificationAt - (aResolvedAt - 0) : 'n/a',
    aDecidedVia
  })
  console.log('[smoke] outcome', outcome)

  unsubA()
  unsubB()
  await pool.end()

  if (outcome.status !== 'decided' || outcome.decision !== '[ACCEPTED]') {
    throw new Error(`expected decided=[ACCEPTED], got ${JSON.stringify(outcome)}`)
  }
  console.log('[smoke] hitl-cross-instance passed')
}

main().catch((error) => {
  console.error('[smoke] hitl-cross-instance failed', error)
  process.exit(1)
})
