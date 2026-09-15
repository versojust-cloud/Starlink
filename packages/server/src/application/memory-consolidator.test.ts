/**
 * Integration tests for MemoryConsolidator.decayStaleSemantic.
 *
 * Run via: pnpm --filter @starlink/server test
 *
 * Exercises the SQL UPDATE that multiplies `confidence` by decayFactor
 * on stale semantic rows + archives those that fall below archiveBelow.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { nanoid } from 'nanoid'
import { ConversationMemoryStore } from './conversation-memory-store.js'
import { MemoryCaptureService } from './memory-capture.js'
import { MemoryConsolidator } from './memory-consolidator.js'
import { UserSkillExtractor } from '../services/user-skill-extractor.js'
import { UserSkillConsolidator } from '../services/user-skill-consolidator.js'
import { pool } from '../infrastructure/db/pool.js'

async function cleanup(workspaceId: string): Promise<void> {
  await pool.query('DELETE FROM memory_items WHERE workspace_id = $1', [workspaceId])
}

function buildConsolidator(): { consolidator: MemoryConsolidator; cleanup: (ws: string) => Promise<void> } {
  const store = new ConversationMemoryStore()
  const ext = new UserSkillExtractor({ memoryStore: store })
  const cons = new UserSkillConsolidator({ memoryStore: store })
  const capture = new MemoryCaptureService(store)
  const consolidator = new MemoryConsolidator(store, ext, cons, capture)
  return { consolidator, cleanup }
}

test('decayStaleSemantic: stale user-skill confidence decays by factor', async () => {
  const workspaceId = `ws-decay-${nanoid(6)}`
  const userId = `user-decay-${nanoid(6)}`
  const store = new ConversationMemoryStore()
  const capture = new MemoryCaptureService(store)
  const { consolidator } = buildConsolidator()

  try {
    const skill = await capture.captureUserSkill({
      workspaceId, userId, sourceTraceId: nanoid(),
      title: 'Stale trait', content: 'old',
      confidence: 0.8,
      metadata: { lastReinforcedAt: '2025-01-01T00:00:00Z' }
    })

    const result = await consolidator.decayStaleSemantic({
      staleDays: 30,
      decayFactor: 0.5,
      archiveBelow: 0   // suppress archival to test decay alone
    })
    assert.ok(result.rowsAffected >= 1, 'at least 1 row decayed')

    const after = await pool.query('SELECT confidence FROM memory_items WHERE id = $1', [skill.id])
    // 0.8 * 0.5 = 0.4
    assert.equal(Number(after.rows[0].confidence.toFixed(4)), 0.4)
  } finally {
    await cleanup(workspaceId)
  }
})

test('decayStaleSemantic: confidence below archiveBelow → row archived', async () => {
  const workspaceId = `ws-archive-${nanoid(6)}`
  const userId = `user-archive-${nanoid(6)}`
  const store = new ConversationMemoryStore()
  const capture = new MemoryCaptureService(store)
  const { consolidator } = buildConsolidator()

  try {
    const skill = await capture.captureUserSkill({
      workspaceId, userId, sourceTraceId: nanoid(),
      title: 'Doomed trait', content: 'almost gone',
      confidence: 0.3,    // already low
      metadata: { lastReinforcedAt: '2024-01-01T00:00:00Z' }
    })

    const result = await consolidator.decayStaleSemantic({
      staleDays: 30,
      decayFactor: 0.5,    // 0.3 * 0.5 = 0.15
      archiveBelow: 0.2    // 0.15 < 0.2 → archive
    })
    assert.ok(result.rowsAffected >= 1)

    const after = await pool.query('SELECT confidence, archived_at FROM memory_items WHERE id = $1', [skill.id])
    assert.notEqual(after.rows[0].archived_at, null, 'row should be archived')
  } finally {
    await cleanup(workspaceId)
  }
})

test('decayStaleSemantic: fresh rows are NOT decayed', async () => {
  const workspaceId = `ws-fresh-${nanoid(6)}`
  const userId = `user-fresh-${nanoid(6)}`
  const store = new ConversationMemoryStore()
  const capture = new MemoryCaptureService(store)
  const { consolidator } = buildConsolidator()

  try {
    const skill = await capture.captureUserSkill({
      workspaceId, userId, sourceTraceId: nanoid(),
      title: 'Fresh trait', content: 'just learned',
      confidence: 0.7,
      metadata: { lastReinforcedAt: new Date().toISOString() }
    })

    await consolidator.decayStaleSemantic({ staleDays: 30, decayFactor: 0.5, archiveBelow: 0 })

    const after = await pool.query('SELECT confidence FROM memory_items WHERE id = $1', [skill.id])
    // Fresh row: confidence unchanged.
    assert.equal(Number(after.rows[0].confidence.toFixed(4)), 0.7)
  } finally {
    await cleanup(workspaceId)
  }
})

test('decayStaleSemantic: episodic (non-semantic) rows are NOT decayed', async () => {
  const workspaceId = `ws-episodic-${nanoid(6)}`
  const userId = `user-episodic-${nanoid(6)}`
  const store = new ConversationMemoryStore()
  const capture = new MemoryCaptureService(store)
  const { consolidator } = buildConsolidator()

  try {
    // BMC summary is episodic, NOT semantic.
    const summary = await capture.captureBmcSummary({
      workspaceId, userId, sourceTraceId: nanoid(),
      title: 'Stale summary', content: 'old',
      confidence: 0.8
    })
    // Make it old (so the time check would pick it up if facet allowed).
    await pool.query(
      `UPDATE memory_items
          SET updated_at = now() - INTERVAL '500 days'
        WHERE id = $1`,
      [summary.id]
    )

    await consolidator.decayStaleSemantic({ staleDays: 30, decayFactor: 0.5, archiveBelow: 0 })

    const after = await pool.query('SELECT confidence FROM memory_items WHERE id = $1', [summary.id])
    // Episodic row: confidence unchanged because facet ≠ 'semantic'.
    // Note: legacy `kind = 'user-skill'` rows ARE caught — but we have
    // a brand-new bmc-summary row here, so it's safely outside the
    // decay match.
    assert.equal(Number(after.rows[0].confidence.toFixed(4)), 0.8)
  } finally {
    await cleanup(workspaceId)
  }
})
