'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { workspaceKeys } from '@/core/query/keys'
import {
  subscribeConversationProgress,
  type ConversationProgressEvent
} from '@/shared/lib/conversation-sync-engine'
import { getGraphQLClient } from '@/shared/lib/graphql-client'

type RuntimePhase = 'planning' | 'execution' | 'review' | 'decision'

type PhaseChangedPayload = {
  workspaceId: string
  phase: RuntimePhase
  reason?: string | null
  occurredAt: string
}

type SeminarTurnPayload = {
  workspaceId: string
  phase: RuntimePhase
  agentId: string
  agentName: string
  nodeId: string
  title: string
  summary: string
  occurredAt: string
}

type SeminarDecisionPayload = {
  workspaceId: string
  phase: 'decision'
  decision: string
  occurredAt: string
}

type SeminarDecisionRequestedPayload = {
  workspaceId: string
  phase: 'decision'
  decision: string
  occurredAt: string
}

export type ConversationRuntimeEvent =
  | {
      type: 'phase.changed'
      conversationId: string
      payload: PhaseChangedPayload
    }
  | {
      type: 'seminar.turn.completed'
      conversationId: string
      payload: SeminarTurnPayload
    }
  | {
      type: 'seminar.decision.made'
      conversationId: string
      payload: SeminarDecisionPayload
    }
  | {
      type: 'seminar.decision.requested'
      conversationId: string
      payload: SeminarDecisionRequestedPayload
    }

const CONVERSATION_RUNTIME_EVENTS_QUERY = /* GraphQL */ `
  query ConversationRuntimeEvents($workspaceId: ID!, $conversationId: ID) {
    conversationRuntimeEvents(workspaceId: $workspaceId, conversationId: $conversationId) {
      type
      conversationId
      status
      message
      payload
    }
  }
`

type ConversationRuntimeEventsQueryResult = {
  conversationRuntimeEvents: Array<{
    type: string
    conversationId: string
    status?: string | null
    message?: string | null
    payload?: unknown
  }>
}

export function useConversationRuntime(workspaceId: string) {
  const [liveEvents, setLiveEvents] = useState<ConversationRuntimeEvent[]>([])

  const persistedEventsQuery = useQuery({
    queryKey: workspaceKeys.runtime(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const client = getGraphQLClient()
      const data = await client.request<ConversationRuntimeEventsQueryResult>(
        CONVERSATION_RUNTIME_EVENTS_QUERY,
        { workspaceId }
      )
      return data.conversationRuntimeEvents
        .map(toRuntimeEvent)
        .filter((event): event is ConversationRuntimeEvent => event !== null)
    }
  })
  const refetchPersistedEvents = persistedEventsQuery.refetch

  useEffect(() => {
    setLiveEvents([])

    const dispose = subscribeConversationProgress(
      { workspaceId },
      (event: ConversationProgressEvent) => {
        if (event.type === 'phase.changed') {
          const payload = event.payload as PhaseChangedPayload | undefined
          if (!payload || payload.workspaceId !== workspaceId) return
          setLiveEvents((current) => current.concat({
            type: 'phase.changed',
            conversationId: event.conversationId,
            payload
          }))
          return
        }

        if (event.type === 'seminar.turn.completed') {
          const payload = event.payload as SeminarTurnPayload | undefined
          if (!payload || payload.workspaceId !== workspaceId) return
          setLiveEvents((current) => current.concat({
            type: 'seminar.turn.completed',
            conversationId: event.conversationId,
            payload
          }))
          return
        }

        if (event.type === 'seminar.decision.made') {
          const payload = event.payload as SeminarDecisionPayload | undefined
          if (!payload || payload.workspaceId !== workspaceId) return
          setLiveEvents((current) => current.concat({
            type: 'seminar.decision.made',
            conversationId: event.conversationId,
            payload
          }))
          return
        }

        if (event.type === 'seminar.decision.requested') {
          const payload = event.payload as SeminarDecisionRequestedPayload | undefined
          if (!payload || payload.workspaceId !== workspaceId) return
          setLiveEvents((current) => current.concat({
            type: 'seminar.decision.requested',
            conversationId: event.conversationId,
            payload
          }))
        }
      },
      {
        onReconnect: async () => {
          await refetchPersistedEvents()
        }
      }
    )

    return () => {
      dispose()
    }
  }, [refetchPersistedEvents, workspaceId])

  const events = useMemo(
    () => dedupeRuntimeEvents([
      ...(persistedEventsQuery.data ?? []),
      ...liveEvents
    ]),
    [liveEvents, persistedEventsQuery.data]
  )

  const latestPhase = useMemo(() => {
    const phases = events.filter((item): item is Extract<ConversationRuntimeEvent, { type: 'phase.changed' }> => item.type === 'phase.changed')
    return phases[phases.length - 1]?.payload.phase ?? null
  }, [events])

  const seminarTurns = useMemo(
    () => events.filter((item): item is Extract<ConversationRuntimeEvent, { type: 'seminar.turn.completed' }> => item.type === 'seminar.turn.completed'),
    [events]
  )

  const latestDecision = useMemo(() => {
    const decisions = events.filter((item): item is Extract<ConversationRuntimeEvent, { type: 'seminar.decision.made' }> => item.type === 'seminar.decision.made')
    return decisions[decisions.length - 1]?.payload.decision ?? null
  }, [events])

  const latestConversationId = useMemo(
    () => events[events.length - 1]?.conversationId ?? null,
    [events]
  )

  return useMemo(
    () => ({
      events,
      isLoading: persistedEventsQuery.isLoading,
      latestPhase,
      seminarTurns,
      latestDecision,
      latestConversationId
    }),
    [events, latestConversationId, latestDecision, latestPhase, persistedEventsQuery.isLoading, seminarTurns]
  )
}

function toRuntimeEvent(
  event: ConversationRuntimeEventsQueryResult['conversationRuntimeEvents'][number]
): ConversationRuntimeEvent | null {
  if (event.type === 'phase.changed') {
    const payload = event.payload as PhaseChangedPayload | undefined
    if (!payload?.workspaceId) return null
    return {
      type: 'phase.changed',
      conversationId: event.conversationId,
      payload
    }
  }

  if (event.type === 'seminar.turn.completed') {
    const payload = event.payload as SeminarTurnPayload | undefined
    if (!payload?.workspaceId) return null
    return {
      type: 'seminar.turn.completed',
      conversationId: event.conversationId,
      payload
    }
  }

  if (event.type === 'seminar.decision.made') {
    const payload = event.payload as SeminarDecisionPayload | undefined
    if (!payload?.workspaceId) return null
    return {
      type: 'seminar.decision.made',
      conversationId: event.conversationId,
      payload
    }
  }

  if (event.type === 'seminar.decision.requested') {
    const payload = event.payload as SeminarDecisionRequestedPayload | undefined
    if (!payload?.workspaceId) return null
    return {
      type: 'seminar.decision.requested',
      conversationId: event.conversationId,
      payload
    }
  }

  return null
}

function dedupeRuntimeEvents(events: ConversationRuntimeEvent[]) {
  const seen = new Set<string>()
  const result: ConversationRuntimeEvent[] = []

  for (const event of events) {
    const key = buildRuntimeEventKey(event)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(event)
  }

  return result
}

function buildRuntimeEventKey(event: ConversationRuntimeEvent) {
  if (event.type === 'phase.changed') {
    return `${event.type}:${event.conversationId}:${event.payload.phase}:${event.payload.occurredAt}`
  }

  if (event.type === 'seminar.turn.completed') {
    return `${event.type}:${event.conversationId}:${event.payload.nodeId}:${event.payload.occurredAt}`
  }

  return `${event.type}:${event.conversationId}:${event.payload.decision}:${event.payload.occurredAt}`
}
