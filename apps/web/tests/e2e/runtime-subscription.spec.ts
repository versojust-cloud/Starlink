import { expect, test } from '@playwright/test'

type GraphState = {
  workspaceId: string
  nodes: Array<{
    id: string
    type: string
    position: { x: number; y: number }
    data: Record<string, unknown>
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    label?: string | null
  }>
}

const graphqlEndpoint = 'http://localhost:4000/graphql'

const graph: GraphState = {
  workspaceId: 'demo',
  nodes: [
    {
      id: 'agent-market',
      type: 'note',
      position: { x: 120, y: 140 },
      data: {
        type: 'note',
        title: '市场洞察',
        content: '目标客户集中在知识密集型团队',
        meta: {
          agentType: 'Market_Agent',
          metadata: {
            agent_signature: 'Market_Agent',
            stage: 'execution',
            confidence: 'high',
            source: 'interview'
          }
        }
      }
    }
  ],
  edges: []
}

// FIXME: targets removed `/workspace/[id]/agents` page (deleted in 2190dec).
// Runtime subscription behaviour now lives in the canvas WS pipeline at
// `/canvas/[workspaceId]`; the smoke is covered by smoke:access-subscriptions
// on the server side. UI-level e2e needs a rewrite.
test.describe.fixme('Runtime subscription scope', () => {
  test('sends scoped subscription variables, propagates viewer identity, and refetches runtime history after reconnect', async ({ page }) => {
    let runtimeRequestCount = 0

    await page.addInitScript(() => {
      window.localStorage.setItem('starlink-user-id', 'lead-alex')

      const state = {
        constructs: 0,
        connectionInitPayloads: [] as Array<Record<string, unknown> | null>,
        subscriptionVariables: [] as Array<Record<string, unknown>>,
        disconnects: 0
      }

      class MockWebSocket {
        static CONNECTING = 0
        static OPEN = 1
        static CLOSING = 2
        static CLOSED = 3

        readonly instanceId: number
        readonly url: string
        readonly protocols?: string | string[]
        readyState = MockWebSocket.CONNECTING
        onopen: ((event: Event) => void) | null = null
        onmessage: ((event: MessageEvent<string>) => void) | null = null
        onclose: ((event: CloseEvent) => void) | null = null
        onerror: ((event: Event) => void) | null = null

        constructor(url: string, protocols?: string | string[]) {
          this.instanceId = ++state.constructs
          this.url = url
          this.protocols = protocols
          setTimeout(() => {
            this.readyState = MockWebSocket.OPEN
            this.onopen?.(new Event('open'))
          }, 0)
        }

        send(payload: string) {
          const message = JSON.parse(payload) as {
            id?: string
            type: string
            payload?: Record<string, unknown> | null
          }

          if (message.type === 'connection_init') {
            state.connectionInitPayloads.push((message.payload ?? null) as Record<string, unknown> | null)
            setTimeout(() => {
              this.onmessage?.(new MessageEvent('message', {
                data: JSON.stringify({ type: 'connection_ack' })
              }))
            }, 0)
            return
          }

          if (message.type === 'subscribe') {
            state.subscriptionVariables.push((message.payload?.variables ?? {}) as Record<string, unknown>)

            if (this.instanceId === 1 && message.id) {
              setTimeout(() => {
                this.onmessage?.(new MessageEvent('message', {
                  data: JSON.stringify({
                    id: message.id,
                    type: 'next',
                    payload: {
                      data: {
                        conversationProgress: {
                          type: 'phase.changed',
                          conversationId: 'conv-demo',
                          payload: {
                            workspaceId: 'demo',
                            phase: 'planning',
                            reason: 'conversation.started',
                            occurredAt: '2026-04-03T00:00:00.000Z'
                          }
                        }
                      }
                    }
                  })
                }))
              }, 20)

              setTimeout(() => {
                state.disconnects += 1
                this.readyState = MockWebSocket.CLOSED
                this.onclose?.({
                  code: 1006,
                  reason: 'mock disconnect',
                  wasClean: false
                } as CloseEvent)
              }, 80)
            }
          }
        }

        close(code = 1000, reason = 'Normal Closure') {
          if (this.readyState === MockWebSocket.CLOSED) return
          this.readyState = MockWebSocket.CLOSED
          this.onclose?.({
            code,
            reason,
            wasClean: code === 1000
          } as CloseEvent)
        }

        addEventListener() {}

        removeEventListener() {}

        dispatchEvent() {
          return true
        }
      }

      Object.assign(window, {
        __mockGraphqlWsState: state,
        WebSocket: MockWebSocket
      })
      Object.assign(globalThis, {
        WebSocket: MockWebSocket
      })
    })

    await page.route(graphqlEndpoint, async (route) => {
      const request = route.request()
      const body = request.postDataJSON() as { query?: string }
      const query = body?.query ?? ''

      const fulfillJson = async (data: unknown) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ data })
        })
      }

      if (query.includes('WorkspaceGraph')) {
        await fulfillJson({ workspaceGraph: graph })
        return
      }

      if (query.includes('ConversationRuntimeEvents')) {
        runtimeRequestCount += 1
        await fulfillJson({
          conversationRuntimeEvents: runtimeRequestCount >= 2
            ? [
                {
                  type: 'phase.changed',
                  conversationId: 'conv-demo',
                  status: null,
                  message: null,
                  payload: {
                    workspaceId: 'demo',
                    phase: 'planning',
                    reason: 'history.refetch',
                    occurredAt: '2026-04-03T00:00:01.000Z'
                  }
                }
              ]
            : []
        })
        return
      }

      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: 'Unsupported operation in runtime subscription test' }] })
      })
    })

    await page.goto('/workspace/demo/agents')
    await expect(page.getByText('当前阶段 planning')).toBeVisible()

    await page.waitForFunction(() => {
      const state = (window as typeof window & {
        __mockGraphqlWsState?: {
          constructs: number
          connectionInitPayloads: Array<Record<string, unknown> | null>
          subscriptionVariables: Array<Record<string, unknown>>
          disconnects: number
        }
      }).__mockGraphqlWsState

      return Boolean(
        state
        && state.disconnects >= 1
        && state.constructs >= 2
        && state.subscriptionVariables.length >= 2
      )
    })

    expect(runtimeRequestCount).toBeGreaterThanOrEqual(2)

    const wsState = await page.evaluate(() => {
      return (window as typeof window & {
        __mockGraphqlWsState: {
          connectionInitPayloads: Array<Record<string, unknown> | null>
          subscriptionVariables: Array<Record<string, unknown>>
        }
      }).__mockGraphqlWsState
    })

    expect(wsState.connectionInitPayloads[0]?.['x-user-id']).toBe('lead-alex')
    expect(wsState.subscriptionVariables[0]).toMatchObject({
      workspaceId: 'demo',
      conversationId: null
    })
    expect(wsState.subscriptionVariables[1]).toMatchObject({
      workspaceId: 'demo',
      conversationId: null
    })
  })
})
