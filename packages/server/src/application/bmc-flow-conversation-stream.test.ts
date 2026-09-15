import assert from 'node:assert/strict'
import test from 'node:test'
import type { CanvasGraph } from '@starlink/shared'
import type { BmcFlowAdapter } from '../engine/bmc-flow-adapter.js'
import { streamBmcFlowConversation } from './bmc-flow-conversation-stream.js'

test('streamBmcFlowConversation emits init, graph delta, and completed status', async () => {
  const calls: unknown[] = []
  const resultGraph = graph('workspace-bmc', ['bmc-card'], ['bmc-card->avatar-market'])
  const adapter = {
    execute: async (input: unknown) => {
      calls.push(input)
      return {
        graph: resultGraph,
        finalState: {},
        events: []
      }
    }
  } as unknown as BmcFlowAdapter

  const baseGraph = graph('workspace-bmc', ['existing'], [])
  const updates = []

  for await (const update of streamBmcFlowConversation(adapter, {
    workspaceId: 'workspace-bmc',
    userId: 'tester',
    question: '生成商业模式画布',
    traceId: 'conv-bmc',
    baseGraph,
    knowledgeEvidence: []
  })) {
    updates.push(update)
  }

  assert.equal(updates.length, 3)
  assert.equal(updates[0]?.type, 'init')
  assert.equal(updates[1]?.type, 'delta')
  assert.equal(updates[2]?.type, 'status')
  assert.deepEqual(calls, [{
    workspaceId: 'workspace-bmc',
    userId: 'tester',
    executionId: 'conv-bmc',
    question: '生成商业模式画布'
  }])

  if (updates[0]?.type !== 'init' || updates[1]?.type !== 'delta' || updates[2]?.type !== 'status') {
    throw new Error('unexpected stream shape')
  }
  assert.equal(updates[0].graph.nodes.length, 1)
  assert.equal(updates[1].delta.nodes?.length, 1)
  assert.equal(updates[1].delta.edges?.length, 1)
  assert.equal(updates[2].status, 'completed')
})

function graph(workspaceId: string, nodeIds: string[], edgeIds: string[]): CanvasGraph {
  return {
    workspaceId,
    nodes: nodeIds.map((id, index) => ({
      id,
      type: 'note',
      position: { x: index * 120, y: index * 80 },
      data: {
        type: 'note',
        title: id,
        content: `${id} content`,
        variant: 'insight'
      }
    })),
    edges: edgeIds.map((id) => {
      const [source = '', target = ''] = id.split('->')
      return { id, source, target, label: null }
    })
  }
}
