/**
 * Integration tests for MemoryReaper TTL archival.
 *
 * Run via: pnpm --filter @starlink/server test
 *
 * Requires DATABASE_URL — exercises the actual UPDATE statements but
 * scopes everything to a per-test workspaceId / userId so tests are
 * self-contained and self-cleaning.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { nanoid } from 'nanoid'
import { MemoryReaper } from './memory-reaper.js'
import { ConversationMemoryStore } from './conversation-memory-store.js'
import { MemoryCaptureService } from './memory-capture.js'
import { pool } from '../infrastructure/db/pool.js'

async function cleanup(workspaceId: string): Promise<void> {
  await pool.query('DELETE FROM memory_items WHERE workspace_id = $1', [workspaceId])
}

test('MemoryReaper archives workspace-episodic rows older than TTL', async () => {
  const workspaceId = `ws-reap-${nanoid(6)}`
  const userId = `user-reap-${nanoid(6)}`
  const store = new ConversationMemoryStore()
  const capture = new MemoryCaptureService(store)

  try {
    // Seed an episodic workspace memory + age it.
    const m = await capture.captureBmcSummary({
      workspaceId, userId, sourceTraceId: nanoid(),
      title: 'Old summary', content: 'aged content'
    })
    await pool.query(
      `UPDATE memory_items
          SET updated_at = now() - INTERVAL '100 days',
              last_used_at = now() - INTERVAL '100 days'
        WHERE id = $1`,
      [m.id]
    )

    // Reaper with default workspace TTL 90d → row should archive.
    const reaper = new MemoryReaper()
    const before = await pool.query('SELECT archived_at FROM memory_items WHERE id = $1', [m.id])
    assert.equal(before.rows[0].archived_at, null, 'pre-condition: not archived')

    const result = await reaper.reap()
    assert.ok(result.archived.workspace >= 1, 'at least 1 workspace row archived')

    const after = await pool.query('SELECT archived_at FROM memory_items WHERE id = $1', [m.id])
    assert.notEqual(after.rows[0].archived_at, null, 'post-condition: archived_at set')
  } finally {
    await cleanup(workspaceId)
  }
})

test('MemoryReaper does NOT archive fresh rows', async () => {
  const workspaceId = `ws-reap-fresh-${nanoid(6)}`
  const userId = `user-reap-fresh-${nanoid(6)}`
  const store = new ConversationMemoryStore()
  const capture = new MemoryCaptureService(store)

  try {
    const m = await capture.captureBmcSummary({
      workspaceId, userId, sourceTraceId: nanoid(),
      title: 'Fresh summary', content: 'new content'
    })

    const reaper = new MemoryReaper()
    await reaper.reap()

    const after = await pool.query('SELECT archived_at FROM memory_items WHERE id = $1', [m.id])
    assert.equal(after.rows[0].archived_at, null, 'fresh row should NOT be archived')
  } finally {
    await cleanup(workspaceId)
  }
})

test('MemoryReaper does NOT archive user-layer (semantic) rows even if old', async () => {
  const workspaceId = `ws-reap-user-${nanoid(6)}`
  const userId = `user-reap-${nanoid(6)}`
  const store = new ConversationMemoryStore()
  const capture = new MemoryCaptureService(store)

  try {
    const m = await capture.captureUserSkill({
      workspaceId, userId, sourceTraceId: nanoid(),
      title: 'Old user-skill', content: 'aged user trait'
    })
    await pool.query(
      `UPDATE memory_items
          SET updated_at = now() - INTERVAL '500 days',
              last_used_at = now() - INTERVAL '500 days'
        WHERE id = $1`,
      [m.id]
    )

    const reaper = new MemoryReaper()
    await reaper.reap()

    const after = await pool.query('SELECT archived_at FROM memory_items WHERE id = $1', [m.id])
    assert.equal(after.rows[0].archived_at, null, 'user-layer row should NOT be auto-archived (TTL = ∞)')
  } finally {
    await cleanup(workspaceId)
  }
})

test('reapWorkspace archives ALL rows in a deleted workspace', async () => {
  const workspaceId = `ws-bulk-${nanoid(6)}`
  const userId = `user-bulk-${nanoid(6)}`
  const store = new ConversationMemoryStore()
  const capture = new MemoryCaptureService(store)

  try {
    // Seed 3 rows of mixed layers.
    await capture.captureBmcSummary({ workspaceId, userId, sourceTraceId: 'a', title: 'A', content: 'a' })
    await capture.captureBmcSummary({ workspaceId, userId, sourceTraceId: 'b', title: 'B', content: 'b' })
    await capture.captureUserSkill({ workspaceId, userId, sourceTraceId: 'c', title: 'C', content: 'c' })

    const reaper = new MemoryReaper()
    const archivedCount = await reaper.reapWorkspace(workspaceId)
    assert.equal(archivedCount, 3, 'all 3 rows archived')

    const r = await pool.query(
      'SELECT COUNT(*)::int n FROM memory_items WHERE workspace_id = $1 AND archived_at IS NULL',
      [workspaceId]
    )
    assert.equal(r.rows[0].n, 0, 'no live rows remain')
  } finally {
    await cleanup(workspaceId)
  }
})

// NOTE: do NOT call pool.end() here — the pg pool is a process-wide
// singleton shared across test files. node:test exits when all tests
// settle; the pool's idle clients close cleanly on process exit.
