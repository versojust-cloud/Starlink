'use client'

import { createClient } from 'graphql-ws'
import { getCurrentViewerId } from './viewer-identity'
import { getGraphQLWsUrl } from './graphql-client'

export type ConversationProgressEvent = {
  type:
    | 'graph/appended'
    | 'graph/diff'
    | 'evidence/updated'
    | 'card/cited'
    | 'status'
    | 'phase.changed'
    | 'seminar.turn.completed'
    | 'seminar.decision.made'
    | 'seminar.decision.requested'
    /**
     * Sub-graph internal progress (e.g. ToolNode invocation inside the
     * BMC ReAct loop). Server emits this when LangGraph's `subgraphs:true`
     * stream yields a non-empty namespace path. Payload shape:
     *   { ns: string[], nodeName: string, payloadKeys: string[] }
     * Frontend uses ns[0] (parent agent) + nodeName to render breadcrumbs
     * like "market-agent is calling web-search…" between phase changes.
     */
    | 'agent/subagent-progress'
    /**
     * P12 · Server-side persistence failure. Emitted by conversation-store
     * when a durable write (canvas_graphs upsert, memory_items conversation
     * summary, conversation completion memory) fails but the conversation
     * itself continues. Payload shape:
     *   { severity: 'warning' | 'error', source: 'canvas-graph' |
     *     'conversation-summary' | 'conversation-completion',
     *     message: string }
     * Frontend renders a yellow ⚠ chat bubble — non-fatal, informational.
     */
    | 'persistence/warning'
  conversationId: string
  status?: 'idle' | 'running' | 'failed' | 'completed'
  message?: string | null
  payload?: unknown
}

export type ConversationProgressScope = {
  workspaceId: string
  conversationId?: string
}

type EventListener = (event: ConversationProgressEvent) => void

type SubscriptionListener = {
  onEvent: EventListener
  onReconnect?: () => void | Promise<void>
}

type ScopedStream = {
  scope: ConversationProgressScope
  listeners: Set<SubscriptionListener>
  dispose: (() => void) | null
}

type WatchConversationOptions = {
  workspaceId: string
  conversationId: string
  onGraphAppended?: (payload: unknown) => void
  onGraphDiff?: (payload: unknown) => void
  onEvidence?: (payload: unknown) => void
  onCardCited?: (payload: unknown) => void
  onEvent?: (event: ConversationProgressEvent) => void
  /** P12 · server-side persistence failure visibility. Fires on
   *  'persistence/warning' events so the front-end can render a
   *  yellow ⚠ chat bubble (canvas saved-but-not-persisted etc). */
  onPersistenceWarning?: (payload: {
    severity?: 'warning' | 'error'
    source: string
    message: string
  }) => void
  loadLatestGraph?: () => Promise<unknown>
}

const CONVERSATION_PROGRESS_SUBSCRIPTION = /* GraphQL */ `
  subscription ConversationProgress($workspaceId: ID!, $conversationId: ID) {
    conversationProgress(workspaceId: $workspaceId, conversationId: $conversationId) {
      type
      conversationId
      status
      message
      payload
    }
  }
`

class ConversationSyncEngine {
  private readonly streams = new Map<string, ScopedStream>()
  private readonly wsClient = createClient({
    url: getGraphQLWsUrl(),
    lazy: true,
    retryAttempts: 8,
    retryWait: async (retries) => {
      const baseDelayMs = Math.min(1000 * (2 ** retries), 15000)
      const jitterMs = Math.floor(Math.random() * 800)
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs + jitterMs))
    },
    // P11.18 fix J · ping the server every 30s and drop the socket if
    // no pong arrives within 10s. Without this, a silently-dropped
    // connection (proxy timeout / NAT eviction / laptop sleep) keeps
    // the subscription "open" client-side but no events arrive — the
    // user sees "thinking" forever. With ping/pong, the client now
    // detects the dead socket within ~40s and triggers retryAttempts
    // which calls onReconnect() to replay missed events.
    keepAlive: 30000,
    connectionParams: async () => ({
      'x-user-id': getCurrentViewerId()
    }),
    on: {
      connected: (_socket, _payload, retrying) => {
        if (!retrying) return
        for (const stream of this.streams.values()) {
          for (const listener of stream.listeners) {
            void listener.onReconnect?.()
          }
        }
      },
      // P11.18 · log silent disconnects so support can diagnose
      // why a client stopped receiving events.
      closed: (event) => {
        // Older code logged `{ code }` which the browser stringified to
        // `[object Object]` in console, hiding the close code from devs.
        // Pull code + reason out as primitives so the log line is
        // self-describing.
        let code: number | undefined
        let reason: string | undefined
        let wasClean: boolean | undefined
        if (typeof event === 'object' && event) {
          code = (event as { code?: number }).code
          reason = (event as { reason?: string }).reason
          wasClean = (event as { wasClean?: boolean }).wasClean
        }
        // 1000 = normal close, 1001 = going away (page reload). Anything
        // else is worth surfacing — log primitives so the close code
        // shows in console instead of [object Object].
        if (code !== undefined && code !== 1000 && code !== 1001) {
          console.warn(
            `[conversation-sync] ws closed unexpectedly · code=${code}` +
              (reason ? ` reason="${reason.slice(0, 80)}"` : '') +
              (wasClean === false ? ' (not-clean)' : '')
          )
        }
      }
    }
  })

  subscribe(
    scope: ConversationProgressScope,
    listener: EventListener,
    options?: { onReconnect?: () => void | Promise<void> }
  ) {
    const key = buildScopeKey(scope)
    const scopedListener: SubscriptionListener = {
      onEvent: listener,
      onReconnect: options?.onReconnect
    }

    let stream = this.streams.get(key)
    if (!stream) {
      stream = {
        scope,
        listeners: new Set<SubscriptionListener>(),
        dispose: null
      }
      this.streams.set(key, stream)
      this.startStream(stream)
    }

    stream.listeners.add(scopedListener)

    return () => {
      const active = this.streams.get(key)
      if (!active) return
      active.listeners.delete(scopedListener)
      if (active.listeners.size > 0) return
      active.dispose?.()
      this.streams.delete(key)
    }
  }

  private startStream(stream: ScopedStream) {
    // P12 fix N1 · throttled error logging. Server restarts make
    // graphql-ws emit one `error` per active subscription per retry
    // attempt, and with up to 8 retry attempts × N streams that can
    // be 12+ console errors per restart. The errors are also generic
    // [object Event] which adds zero diagnostic value beyond the
    // first one. Suppress duplicates within a 5s window per stream.
    let lastErrorAt = 0
    let suppressedSinceLast = 0

    stream.dispose = this.wsClient.subscribe(
      {
        query: CONVERSATION_PROGRESS_SUBSCRIPTION,
        variables: {
          workspaceId: stream.scope.workspaceId,
          conversationId: stream.scope.conversationId ?? null
        }
      },
      {
        next: ({ data }) => {
          const event = (data as { conversationProgress?: ConversationProgressEvent })?.conversationProgress
          if (!event || typeof event.type !== 'string') return
          for (const listener of stream.listeners) {
            listener.onEvent(event)
          }
          // Successful frame → reset the throttle so the NEXT real
          // error (after a recovery period) does log immediately.
          lastErrorAt = 0
          suppressedSinceLast = 0
        },
        error: (error) => {
          const now = Date.now()
          const since = now - lastErrorAt
          if (lastErrorAt === 0 || since > 5000) {
            const tail = suppressedSinceLast > 0
              ? ` (+${suppressedSinceLast} suppressed in last 5s)`
              : ''
            console.error('[conversation-sync-engine] subscription error', error, tail)
            lastErrorAt = now
            suppressedSinceLast = 0
          } else {
            suppressedSinceLast++
          }
        },
        complete: () => {
          // The graphql-ws client handles socket-level retries itself.
        }
      }
    )
  }
}

const conversationSyncEngine = new ConversationSyncEngine()

export function subscribeConversationProgress(
  scope: ConversationProgressScope,
  listener: EventListener,
  options?: { onReconnect?: () => void | Promise<void> }
) {
  return conversationSyncEngine.subscribe(scope, listener, options)
}

/**
 * P11.16 · Backfill missed events via conversationRuntimeEvents query.
 * Returns the new cumulative cursor after replaying.
 */
const RUNTIME_EVENTS_QUERY = /* GraphQL */ `
  query ConversationRuntimeEvents($workspaceId: ID!, $conversationId: ID, $sinceCursor: Int) {
    conversationRuntimeEvents(workspaceId: $workspaceId, conversationId: $conversationId, sinceCursor: $sinceCursor) {
      type
      conversationId
      status
      message
      payload
    }
  }
`

async function fetchAndReplayMissedEvents(
  workspaceId: string,
  conversationId: string,
  sinceCursor: number,
  onEvent: (event: ConversationProgressEvent) => void
): Promise<number> {
  try {
    const { getGraphQLClient } = await import('./graphql-client')
    const client = getGraphQLClient()
    const data = await client.request<{ conversationRuntimeEvents: ConversationProgressEvent[] }>(
      RUNTIME_EVENTS_QUERY,
      { workspaceId, conversationId, sinceCursor }
    )
    const events = data.conversationRuntimeEvents ?? []
    for (const e of events) onEvent(e)
    return sinceCursor + events.length
  } catch (err) {
    console.warn('[conversation-sync] fetchAndReplayMissedEvents failed', err)
    return sinceCursor
  }
}

export function watchConversation(options: WatchConversationOptions) {
  let cancel = () => {}
  // P11.16 · cumulative count of events seen on this watch — passed as
  // sinceCursor on reconnect so missed events are replayed exactly once
  // (server does `events.slice(cursor)`). Increments on every event we
  // forward to the listener regardless of subscription path.
  let eventsSeen = 0

  const done = new Promise<void>((resolve, reject) => {
    const handleEvent = (event: ConversationProgressEvent) => {
      eventsSeen += 1
      options.onEvent?.(event)

      if (event.type === 'graph/appended' && event.payload) {
        options.onGraphAppended?.(event.payload)
      }

      if (event.type === 'graph/diff' && event.payload) {
        options.onGraphDiff?.(event.payload)
      }

      if (event.type === 'evidence/updated' && event.payload) {
        options.onEvidence?.(event.payload)
      }

      if (event.type === 'card/cited' && event.payload) {
        options.onCardCited?.(event.payload)
      }

      // P12 · Persistence visibility passthrough.
      if (event.type === 'persistence/warning' && event.payload) {
        const payload = event.payload as {
          severity?: 'warning' | 'error'
          source?: string
          message?: string
        }
        if (payload.message) {
          options.onPersistenceWarning?.({
            severity: payload.severity ?? 'warning',
            source: payload.source ?? 'unknown',
            message: payload.message
          })
        }
      }

      if (event.type === 'status') {
        if (event.status === 'completed') {
          // P11.18 fix · before resolving, do ONE final FULL refetch
          // from PG and REPLACE the local graph state. This consolidates
          // any nodes that may have been lost due to:
          //   - WS event drops (silent reconnect)
          //   - delta events arriving out-of-order
          //   - subscriber latency (event published before client subscribed)
          // PG is authoritative — by the time status=completed fires,
          // every node has been persisted via graphStore.persistGraph.
          // User-visible repro before fix: BMC pipeline persists 18 nodes
          // to PG, but only 3 reach frontend → user sees "一条直线" until
          // they manually reload.
          if (options.loadLatestGraph) {
            options
              .loadLatestGraph()
              .then((latestGraph) => {
                if (latestGraph) options.onGraphAppended?.(latestGraph)
              })
              .catch((err) => {
                console.warn('[conversation-sync] final refetch failed', err)
              })
              .finally(() => {
                cancel()
                resolve()
              })
            return
          }
          cancel()
          resolve()
        }
        if (event.status === 'failed') {
          cancel()
          reject(new Error(event.message ?? 'conversation failed'))
        }
      }
    }

    cancel = subscribeConversationProgress(
      {
        workspaceId: options.workspaceId,
        conversationId: options.conversationId
      },
      handleEvent,
      {
        onReconnect: async () => {
          // P11.16 · two-step recovery on reconnect:
          //   1. Replay events that fired DURING the disconnect via the
          //      server's 400-event ring buffer (sinceCursor lookup).
          //   2. Refresh the canonical canvas snapshot so anything that
          //      rolled out of the buffer is still consistent.
          // Order matters: replay first (so animations / breadcrumbs
          // play back in order), then snapshot to reconcile final state.
          eventsSeen = await fetchAndReplayMissedEvents(
            options.workspaceId,
            options.conversationId,
            eventsSeen,
            handleEvent
          )
          const latestGraph = await options.loadLatestGraph?.()
          if (latestGraph) {
            options.onGraphAppended?.(latestGraph)
          }
        }
      }
    )
  })

  return {
    done,
    cancel: () => {
      cancel()
    }
  }
}

function buildScopeKey(scope: ConversationProgressScope) {
  return `${scope.workspaceId}:${scope.conversationId ?? '*'}`
}
