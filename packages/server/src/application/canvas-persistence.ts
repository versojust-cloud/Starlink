import type { CanvasEdge, CanvasGraph, CanvasNode } from '@starlink/shared'
import { pool } from '../infrastructure/db/pool.js'

const initCanvasGraphTable = pool.query(`
  CREATE TABLE IF NOT EXISTS canvas_graphs (
    workspace_id TEXT PRIMARY KEY,
    nodes JSONB NOT NULL DEFAULT '[]',
    edges JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`)

async function ensureCanvasGraphTable(): Promise<void> {
  await initCanvasGraphTable
}

export async function loadPersistedGraph(workspaceId: string): Promise<CanvasGraph | null> {
  await ensureCanvasGraphTable()
  const result = await pool.query(
    'SELECT nodes, edges FROM canvas_graphs WHERE workspace_id = $1',
    [workspaceId]
  )
  if (result.rowCount === 0) return null
  const row = result.rows[0]
  const nodes = Array.isArray(row.nodes) ? row.nodes : []
  const edges = Array.isArray(row.edges) ? row.edges : []
  return {
    workspaceId,
    nodes: nodes as CanvasNode[],
    edges: edges as CanvasEdge[]
  }
}

export async function persistCanvasGraph(graph: CanvasGraph): Promise<void> {
  await ensureCanvasGraphTable()
  await pool.query(
    `
      INSERT INTO canvas_graphs (workspace_id, nodes, edges, updated_at)
      VALUES ($1, $2::jsonb, $3::jsonb, NOW())
      ON CONFLICT (workspace_id) DO UPDATE
      SET nodes = EXCLUDED.nodes,
          edges = EXCLUDED.edges,
          updated_at = NOW()
    `,
    [graph.workspaceId, JSON.stringify(graph.nodes), JSON.stringify(graph.edges)]
  )
}

/**
 * Reset the workspace's persisted canvas to empty. Used when the user
 * starts a new wizard graduation in a workspace that already has a BMC
 * — without this, the new pipeline's nodes pile on top of the old session's
 * insights / mention output / report-cards. Server-side delete avoids
 * the "28 nodes in DOM after reload" duplicate-accumulation problem
 * that client-side `archiveCurrentCanvasForFreshSession` (in-memory only)
 * couldn't solve.
 */
export async function clearPersistedGraph(workspaceId: string): Promise<void> {
  await ensureCanvasGraphTable()
  await pool.query(
    `UPDATE canvas_graphs SET nodes = '[]'::jsonb, edges = '[]'::jsonb, updated_at = NOW() WHERE workspace_id = $1`,
    [workspaceId]
  )
}
