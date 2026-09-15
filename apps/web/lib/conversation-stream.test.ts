// Run with (from apps/web):
//   pnpm exec tsx --tsconfig tsconfig.json --test lib/conversation-stream.test.ts
// Requires tsconfig-paths resolution for the `@/shared/*` aliases the SDK
// imports at module level (React hook code path — unused by these tests but
// evaluated on import). If your runner doesn't resolve aliases, run via
// the project's existing playwright/next harness. The tests themselves only
// exercise the framework-agnostic ConversationStream class.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Client as GraphqlWsClient } from 'graphql-ws'
import { ConversationStream, type ConversationEvent } from './conversation-stream'

type Sink = { next: (msg: { data: unknown }) => void; error: (e: unknown) => void; complete: () => void }

function makeMockWs() {
  let activeSink: Sink | null = null
  const wsClient = {
    subscribe(_payload: unknown, sink: Sink) {
      activeSink = sink
      return () => { activeSink = null }
    }
  } as unknown as GraphqlWsClient
  return {
    wsClient,
    deliver: (evt: ConversationEvent) => activeSink?.next({ data: { conversationProgress: evt } }),
    disconnect: (err: Error) => activeSink?.error(err),
    isOpen: () => activeSink !== null
  }
}

const evt = (type: string, message: string, n: number): ConversationEvent =>
  ({ type, conversationId: 'c1', message, payload: { n } })

test('forwards live events through onEvent', () => {
  const ws = makeMockWs()
  const received: ConversationEvent[] = []
  const stream = new ConversationStream({
    workspaceId: 'w1', conversationId: 'c1',
    wsClient: ws.wsClient,
    httpQueryFn: async () => ({ conversationRuntimeEvents: [] }),
    onEvent: (e) => received.push(e)
  })
  stream.start()
  ws.deliver(evt('graph/appended', 'a', 1))
  ws.deliver(evt('graph/appended', 'b', 2))
  assert.equal(received.length, 2)
  assert.equal(received[1].message, 'b')
  stream.stop()
})

test('on disconnect calls backfill with correct sinceCursor', async () => {
  const ws = makeMockWs()
  const received: ConversationEvent[] = []
  let backfillVars: Record<string, unknown> | null = null
  const stream = new ConversationStream({
    workspaceId: 'w1', conversationId: 'c1',
    wsClient: ws.wsClient,
    httpQueryFn: async (_q, vars) => { backfillVars = vars; return { conversationRuntimeEvents: [] } },
    onEvent: (e) => received.push(e)
  })
  stream.start()
  ws.deliver(evt('x', 'a', 1))
  ws.deliver(evt('x', 'b', 2))
  ws.deliver(evt('x', 'c', 3))
  ws.disconnect(new Error('socket dropped'))
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(backfillVars?.sinceCursor, 3)
  assert.equal(backfillVars?.workspaceId, 'w1')
  assert.equal(backfillVars?.conversationId, 'c1')
})

test('dedupes overlapping live + backfilled events on reconnect', async () => {
  const ws = makeMockWs()
  const received: ConversationEvent[] = []
  // After disconnect, server backfill returns event "b" again (already seen live)
  // plus a new event "d". Live buffer holds "c" (received during reconcile).
  const backfill: ConversationEvent[] = [evt('x', 'b', 2), evt('x', 'd', 4)]
  const stream = new ConversationStream({
    workspaceId: 'w1', conversationId: 'c1',
    wsClient: ws.wsClient,
    httpQueryFn: async () => ({ conversationRuntimeEvents: backfill }),
    onEvent: (e) => received.push(e)
  })
  stream.start()
  ws.deliver(evt('x', 'a', 1))
  ws.deliver(evt('x', 'b', 2))
  ws.disconnect(new Error('drop'))
  // Live event arrives during reconcile (subscription reopened by SDK):
  ws.deliver(evt('x', 'c', 3))
  await new Promise((r) => setTimeout(r, 5))
  // Should see: a, b (live), then on reconnect: d (backfilled, b is dedup'd), c
  const messages = received.map((r) => r.message)
  assert.deepEqual(messages, ['a', 'b', 'd', 'c'])
})
