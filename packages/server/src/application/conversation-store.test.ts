import assert from 'node:assert/strict'
import test from 'node:test'
import type { CanvasGraph } from '@starlink/shared'
import { applyGraphDelta } from './graph-delta.js'
import { WorkspaceLockError } from './workspace-lock-error.js'

// ============================================================================
// DEC-5 workspace soft-lock — class shape contract
// ============================================================================
//
// resolvers.ts/toGraphQLError matches by `error.name === 'WorkspaceLockError'`
// and reads .workspaceId / .activeConversationId off the instance to populate
// the GraphQL extensions. These tests pin those guarantees so the resolver
// mapping doesn't silently break if anyone refactors the class.

test('WorkspaceLockError: name is WorkspaceLockError (resolver discriminator)', () => {
  const err = new WorkspaceLockError('ws-1', 'conv-99')
  assert.equal(err.name, 'WorkspaceLockError')
})

test('WorkspaceLockError: carries workspaceId + activeConversationId', () => {
  const err = new WorkspaceLockError('ws-42', 'conv-running')
  assert.equal(err.workspaceId, 'ws-42')
  assert.equal(err.activeConversationId, 'conv-running')
})

test('WorkspaceLockError: message contains both ids for log readability', () => {
  const err = new WorkspaceLockError('ws-x', 'conv-y')
  assert.match(err.message, /ws-x/)
  assert.match(err.message, /conv-y/)
})

test('WorkspaceLockError: is a real Error subclass (instanceof checks pass)', () => {
  const err = new WorkspaceLockError('ws', 'conv')
  assert.ok(err instanceof Error)
  assert.ok(err instanceof WorkspaceLockError)
})

test('applyGraphDelta removes stale nodes and edges before merging replacements', () => {
  const graph: CanvasGraph = {
    workspaceId: 'workspace-delta',
    nodes: [
      {
        id: 'node-old',
        type: 'note',
        position: { x: 160, y: 160 },
        data: {
          type: 'note',
          title: '旧节点',
          content: '旧内容'
        }
      }
    ],
    edges: [
      {
        id: 'edge-old',
        source: 'node-old',
        target: 'node-other',
        label: '旧连接'
      }
    ]
  }

  const nextGraph = applyGraphDelta(graph, {
    removedNodeIds: ['node-old'],
    removedEdgeIds: ['edge-old'],
    nodes: [
      {
        id: 'node-new',
        type: 'note',
        position: { x: 160, y: 380 },
        data: {
          type: 'note',
          title: '新节点',
          content: '新内容'
        }
      }
    ],
    edges: [
      {
        id: 'edge-new',
        source: 'node-new',
        target: 'node-target',
        label: '新连接'
      }
    ]
  })

  assert.deepEqual(nextGraph.nodes.map((node) => node.id), ['node-new'])
  assert.deepEqual(nextGraph.edges.map((edge) => edge.id), ['edge-new'])
})
