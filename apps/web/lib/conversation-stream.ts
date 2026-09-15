'use client'
/**
 * Client SDK for the conversation runtime stream.
 *
 * Pairs the `conversationProgress` graphql-ws subscription with the
 * `conversationRuntimeEvents(sinceCursor:)` HTTP backfill so app code never
 * has to reimplement gap-free delivery across WebSocket reconnects.
 *
 * Cursor semantics:
 *   `lastSeenCursor` is a 1-based positional index into the workspace event
 *   ring buffer (the Nth event received corresponds to cursor N). The server
 *   buffer is capped (CONVERSATION_RUNTIME_EVENT_LIMIT, default 400). If the
 *   client is offline long enough that events roll out of the buffer, the
 *   server silently clamps to sinceCursor=0 and earlier history is lost; the
 *   SDK warns via `onError` when it detects this fallback.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient, type Client as GraphqlWsClient } from 'graphql-ws'
import { GraphQLClient } from 'graphql-request'
import { getGraphQLHttpUrl, getGraphQLWsUrl } from '@/shared/lib/graphql-client'
import { getCurrentViewerId } from '@/shared/lib/viewer-identity'

export type ConversationEvent = {
  type: string
  conversationId: string
  status?: 'idle' | 'running' | 'failed' | 'completed' | null
  message?: string | null
  payload?: unknown
}

export type ConversationStreamStatus =
  | 'idle' | 'connecting' | 'live' | 'reconnecting' | 'closed' | 'error'

const SUBSCRIPTION = /* GraphQL */ `
  subscription ConversationProgress($workspaceId: ID!, $conversationId: ID) {
    conversationProgress(workspaceId: $workspaceId, conversationId: $conversationId) {
      type conversationId status message payload
    }
  }`

const BACKFILL_QUERY = /* GraphQL */ `
  query ConversationRuntimeEvents($workspaceId: ID!, $conversationId: ID, $sinceCursor: Int) {
    conversationRuntimeEvents(workspaceId: $workspaceId, conversationId: $conversationId, sinceCursor: $sinceCursor) {
      type conversationId status message payload
    }
  }`

export type ConversationStreamOpts = {
  workspaceId: string
  conversationId: string
  wsClient: GraphqlWsClient
  httpQueryFn: (query: string, variables: Record<string, unknown>) => Promise<unknown>
  onEvent: (evt: ConversationEvent) => void
  onError?: (err: Error) => void
  onStatus?: (status: ConversationStreamStatus) => void
}

export class ConversationStream {
  private dispose: (() => void) | null = null
  private lastSeenCursor = 0
  private status: ConversationStreamStatus = 'idle'
  private liveBuffer: ConversationEvent[] = []
  private reconciling = false
  private stopped = false
  private emittedKeys = new Set<string>()

  constructor(private opts: ConversationStreamOpts) {}

  start(): void {
    if (this.dispose || this.stopped) return
    this.setStatus('connecting')
    this.openSubscription()
  }

  stop(): void {
    this.stopped = true
    this.dispose?.()
    this.dispose = null
    this.setStatus('closed')
  }

  private setStatus(next: ConversationStreamStatus) {
    if (this.status === next) return
    this.status = next
    this.opts.onStatus?.(next)
  }

  private openSubscription() {
    const { wsClient, workspaceId, conversationId } = this.opts
    this.dispose = wsClient.subscribe(
      { query: SUBSCRIPTION, variables: { workspaceId, conversationId } },
      {
        next: ({ data }) => {
          const event = (data as { conversationProgress?: ConversationEvent } | null)?.conversationProgress
          if (!event || typeof event.type !== 'string') return
          this.handleLiveEvent(event)
        },
        error: (err) => this.handleError(err),
        complete: () => {
          if (this.stopped) return
          this.setStatus('closed')
        }
      }
    )
  }

  private emit(evt: ConversationEvent) {
    const key = dedupKey(evt)
    if (this.emittedKeys.has(key)) return
    this.emittedKeys.add(key)
    this.lastSeenCursor += 1
    this.opts.onEvent(evt)
  }

  private handleLiveEvent(event: ConversationEvent) {
    if (this.stopped) return
    if (this.reconciling) {
      this.liveBuffer.push(event)
      return
    }
    if (this.status !== 'live') this.setStatus('live')
    this.emit(event)
    if (event.type === 'status' && (event.status === 'completed' || event.status === 'failed')) {
      this.stop()
    }
  }

  private handleError(err: unknown) {
    if (this.stopped) return
    const error = err instanceof Error ? err : new Error(String(err))
    if (/unauthenticated|unauthorized|forbidden|401|403/i.test(error.message)) {
      this.setStatus('error')
      this.opts.onError?.(error)
      return
    }
    this.setStatus('reconnecting')
    this.reconciling = true
    this.dispose = null
    void this.runBackfillAndResume(error)
  }

  private async runBackfillAndResume(originalError: Error) {
    const cursorRequested = this.lastSeenCursor
    let backfillFailed = false
    try {
      const data = (await this.opts.httpQueryFn(BACKFILL_QUERY, {
        workspaceId: this.opts.workspaceId,
        conversationId: this.opts.conversationId,
        sinceCursor: cursorRequested
      })) as { conversationRuntimeEvents?: ConversationEvent[] } | null
      const backfilled = data?.conversationRuntimeEvents ?? []
      // Ring-buffer rollover detection: if we asked sinceCursor>0 but server
      // returned a full buffer worth, our cursor likely rolled out of range.
      if (cursorRequested > 0 && backfilled.length >= 400) {
        this.opts.onError?.(new Error(
          `[conversation-stream] sinceCursor=${cursorRequested} likely rolled out of server ring buffer; some history lost`
        ))
      }
      // Merge: backfilled first, then live events buffered during reconnect.
      // Dedup is by content (see dedupKey) — emittedKeys persists across
      // reconnects so live events re-delivered via backfill are dropped.
      for (const evt of backfilled) this.emit(evt)
      for (const evt of this.liveBuffer) this.emit(evt)
      this.liveBuffer = []
    } catch (err) {
      backfillFailed = true
      this.opts.onError?.(err instanceof Error ? err : new Error(String(err)))
      // Drain buffered live events anyway so we don't lose them.
      for (const evt of this.liveBuffer) this.emit(evt)
      this.liveBuffer = []
    } finally {
      this.reconciling = false
      if (!this.stopped) {
        this.setStatus('live')
        this.openSubscription()
      }
      if (!backfillFailed) this.opts.onError?.(originalError)
    }
  }
}

function dedupKey(evt: ConversationEvent): string {
  const payload = evt.payload === undefined ? '' : safeStringify(evt.payload)
  return `${evt.conversationId}|${evt.type}|${evt.message ?? ''}|${payload}`
}

function safeStringify(value: unknown): string {
  try { return JSON.stringify(value) } catch { return String(value) }
}

// ─── React hook ──────────────────────────────────────────────────────────

export function useConversationStream(opts: {
  workspaceId: string
  conversationId: string | null
}): {
  events: ConversationEvent[]
  status: ConversationStreamStatus
  error: Error | null
} {
  const { workspaceId, conversationId } = opts
  const [events, setEvents] = useState<ConversationEvent[]>([])
  const [status, setStatus] = useState<ConversationStreamStatus>('idle')
  const [error, setError] = useState<Error | null>(null)
  const streamRef = useRef<ConversationStream | null>(null)

  const wsClient = useMemo(() => {
    if (typeof window === 'undefined') return null
    return createClient({
      url: getGraphQLWsUrl(),
      lazy: true,
      retryAttempts: 8,
      connectionParams: async () => ({ 'x-user-id': getCurrentViewerId() })
    })
  }, [])

  const httpClient = useMemo(() => {
    if (typeof window === 'undefined') return null
    return new GraphQLClient(getGraphQLHttpUrl(), {
      headers: { 'x-user-id': getCurrentViewerId() }
    })
  }, [])

  useEffect(() => {
    if (!conversationId || !wsClient || !httpClient) return
    setEvents([])
    setError(null)
    setStatus('idle')
    const stream = new ConversationStream({
      workspaceId,
      conversationId,
      wsClient,
      httpQueryFn: (query, vars) => httpClient.request(query, vars as Record<string, unknown>),
      onEvent: (evt) => setEvents((prev) => [...prev, evt]),
      onError: (err) => setError(err),
      onStatus: (s) => setStatus(s)
    })
    streamRef.current = stream
    stream.start()
    return () => {
      stream.stop()
      streamRef.current = null
    }
  }, [workspaceId, conversationId, wsClient, httpClient])

  return { events, status, error }
}
