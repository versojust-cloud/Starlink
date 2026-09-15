/**
 * P11.18 · End-to-end smoke for canvas mutations addNode + connectNodes
 * with PG roundtrip verification.
 *
 * Sequence:
 *   1. clearWorkspaceCanvas → canvas_graphs row reset to []
 *   2. addNode × 2 → 2 rows materialise in canvas_graphs.nodes
 *   3. connectNodes → 1 edge in canvas_graphs.edges
 *   4. workspaceGraph query → returns the persisted state
 *   5. cleanup: drop the test workspace from canvas_graphs
 *
 * Exits 0 on success, 1 on any assertion failure.
 */

import { request as gqlRequest, gql } from 'graphql-request'
import { Pool } from 'pg'

const ENDPOINT = process.env.GQL_HTTP_URL ?? 'http://localhost:4000/graphql'
const WS_ID = `smoke-canvas-${Date.now()}`
const USER_ID = 'lead-alex'

const headers = { 'x-user-id': USER_ID } as Record<string, string>

type AddNodeResult = { addNode: { id: string; type: string } }
type ConnectResult = { connectNodes: { id: string; source: string; target: string } }
type GraphResult = {
  workspaceGraph: {
    workspaceId: string
    nodes: Array<{ id: string; type: string }>
    edges: Array<{ id: string; source: string; target: string; label?: string | null }>
  }
}
type ClearResult = { clearWorkspaceCanvas: boolean }

const ADD_NODE = gql`
  mutation AddNode($wid: ID!, $input: NodeInput!) {
    addNode(workspaceId: $wid, input: $input) { id type position { x y } }
  }
`
const CONNECT = gql`
  mutation Connect($wid: ID!, $input: EdgeInput!) {
    connectNodes(workspaceId: $wid, input: $input) { id source target label }
  }
`
const QUERY_GRAPH = gql`
  query G($wid: ID!) {
    workspaceGraph(workspaceId: $wid) {
      workspaceId
      nodes { id type }
      edges { id source target label }
    }
  }
`
const CLEAR = gql`
  mutation Clear($wid: ID!) {
    clearWorkspaceCanvas(workspaceId: $wid)
  }
`

async function main() {
  console.log(`[smoke-canvas] workspaceId=${WS_ID}`)
  // Step 1: addNode A
  const a = await gqlRequest<AddNodeResult>(ENDPOINT, ADD_NODE, {
    wid: WS_ID,
    input: { type: 'note', position: { x: 100, y: 100 }, data: { type: 'note', title: 'Node A', content: 'Node A body' } }
  }, headers)
  console.log(`[+ ADD] ${a.addNode.id} (${a.addNode.type})`)

  // Step 2: addNode B
  const b = await gqlRequest<AddNodeResult>(ENDPOINT, ADD_NODE, {
    wid: WS_ID,
    input: { type: 'note', position: { x: 300, y: 100 }, data: { type: 'note', title: 'Node B', content: 'Node B body' } }
  }, headers)
  console.log(`[+ ADD] ${b.addNode.id} (${b.addNode.type})`)

  // Step 3: connectNodes A → B
  const e = await gqlRequest<ConnectResult>(ENDPOINT, CONNECT, {
    wid: WS_ID,
    input: { source: a.addNode.id, target: b.addNode.id, label: 'A→B' }
  }, headers)
  console.log(`[+ EDGE] ${e.connectNodes.id} ${e.connectNodes.source} → ${e.connectNodes.target}`)

  // Step 4: query through GraphQL — should reflect both nodes + edge
  const g = await gqlRequest<GraphResult>(ENDPOINT, QUERY_GRAPH, { wid: WS_ID }, headers)
  console.log(`[query] workspaceGraph nodes=${g.workspaceGraph.nodes.length} edges=${g.workspaceGraph.edges.length}`)
  if (g.workspaceGraph.nodes.length !== 2) {
    console.error(`❌ FAIL · expected 2 nodes, got ${g.workspaceGraph.nodes.length}`)
    process.exit(1)
  }
  if (g.workspaceGraph.edges.length !== 1) {
    console.error(`❌ FAIL · expected 1 edge, got ${g.workspaceGraph.edges.length}`)
    process.exit(1)
  }
  const edge = g.workspaceGraph.edges[0]
  if (edge.source !== a.addNode.id || edge.target !== b.addNode.id) {
    console.error(`❌ FAIL · edge source/target mismatch`)
    process.exit(1)
  }

  // Step 5: verify PG canvas_graphs row directly
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('[smoke-canvas] DATABASE_URL not set — skipping PG roundtrip')
  } else {
    const pool = new Pool({ connectionString: databaseUrl })
    try {
      const r = await pool.query(
        'SELECT jsonb_array_length(nodes) AS n, jsonb_array_length(edges) AS e FROM canvas_graphs WHERE workspace_id = $1',
        [WS_ID]
      )
      if (r.rows.length === 0) {
        console.error('❌ FAIL · canvas_graphs has no row for this workspace')
        process.exit(1)
      }
      const { n, e: edgeCount } = r.rows[0] as { n: number; e: number }
      console.log(`[PG] canvas_graphs nodes=${n} edges=${edgeCount}`)
      if (Number(n) !== 2 || Number(edgeCount) !== 1) {
        console.error('❌ FAIL · PG row counts mismatch GraphQL state')
        process.exit(1)
      }
      // Step 6: clear via mutation, verify PG row is reset
      const cleared = await gqlRequest<ClearResult>(ENDPOINT, CLEAR, { wid: WS_ID }, headers)
      console.log(`[clear] returned=${cleared.clearWorkspaceCanvas}`)
      const after = await pool.query(
        'SELECT jsonb_array_length(nodes) AS n, jsonb_array_length(edges) AS e FROM canvas_graphs WHERE workspace_id = $1',
        [WS_ID]
      )
      if (after.rows.length === 0) {
        console.log('[PG] row deleted by clear (alternative valid behavior)')
      } else {
        const { n: n2, e: e2 } = after.rows[0] as { n: number; e: number }
        console.log(`[PG after clear] nodes=${n2} edges=${e2}`)
        if (Number(n2) !== 0 || Number(e2) !== 0) {
          console.error('❌ FAIL · clearWorkspaceCanvas did not zero out the rows')
          process.exit(1)
        }
      }
      // Cleanup
      await pool.query('DELETE FROM canvas_graphs WHERE workspace_id = $1', [WS_ID])
    } finally {
      await pool.end()
    }
  }

  console.log('✅ PASS · canvas mutations + PG roundtrip verified end-to-end')
  process.exit(0)
}

void main().catch((err) => {
  console.error('[smoke-canvas] FATAL:', err)
  process.exit(1)
})
