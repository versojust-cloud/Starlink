'use client'

import { useCallback, useEffect, useRef } from 'react'
import { createClient } from 'graphql-ws'
import type { Client as WsClient } from 'graphql-ws'
import { getGraphQLClient, getGraphQLWsUrl } from '@/shared/lib/graphql-client'
import {
  EXECUTE_FLOW_MUTATION,
  FLOW_EXECUTION_PROGRESS_SUBSCRIPTION,
} from '@/core/graphql/flow-queries'
import { useExecutionStore } from '../store/execution-store'

/* ---------- response types ---------- */

interface ExecuteFlowResponse {
  executeFlow: {
    executionId: string
    status: string
  }
}

interface ProgressPayload {
  flowExecutionProgress: {
    executionId: string
    nodeId: string
    status: 'running' | 'completed' | 'failed' | 'skipped'
    output?: unknown
    error?: string
    duration?: number
    progress?: number
    progressMessage?: string
  }
}

/* ---------- hook ---------- */

export function useFlowExecution() {
  const wsRef = useRef<WsClient | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  const {
    status,
    startExecution,
    onNodeStart,
    onNodeProgress,
    onNodeComplete,
    onNodeError,
    onFlowComplete,
    reset,
  } = useExecutionStore()

  // Clean up websocket on unmount
  useEffect(() => {
    return () => {
      unsubRef.current?.()
      wsRef.current?.dispose()
    }
  }, [])

  const subscribe = useCallback(
    (executionId: string) => {
      // Create ws client lazily
      if (!wsRef.current) {
        wsRef.current = createClient({ url: getGraphQLWsUrl() })
      }

      // Cancel any previous subscription
      unsubRef.current?.()

      const unsubscribe = wsRef.current.subscribe<ProgressPayload>(
        {
          query: FLOW_EXECUTION_PROGRESS_SUBSCRIPTION.toString(),
          variables: { executionId },
        },
        {
          next({ data }) {
            if (!data) return
            const ev = data.flowExecutionProgress

            switch (ev.status) {
              case 'running':
                if (ev.progress != null) {
                  onNodeProgress(ev.nodeId, ev.progress, ev.progressMessage)
                } else {
                  onNodeStart(ev.nodeId)
                }
                break
              case 'completed':
                onNodeComplete(ev.nodeId, ev.output, ev.duration ?? 0)
                break
              case 'failed':
                onNodeError(ev.nodeId, ev.error ?? 'Unknown error')
                break
              default:
                break
            }
          },
          error() {
            onFlowComplete('failed')
          },
          complete() {
            onFlowComplete(
              useExecutionStore.getState().status === 'running'
                ? 'completed'
                : useExecutionStore.getState().status,
            )
          },
        },
      )

      unsubRef.current = unsubscribe
    },
    [onNodeStart, onNodeProgress, onNodeComplete, onNodeError, onFlowComplete],
  )

  const execute = useCallback(
    async (flowId: string, inputs?: Record<string, unknown>) => {
      reset()

      const client = getGraphQLClient()
      const res = await client.request<ExecuteFlowResponse>(EXECUTE_FLOW_MUTATION, {
        flowId,
        inputs: inputs ?? null,
      })

      const { executionId } = res.executeFlow
      startExecution(executionId)
      subscribe(executionId)

      return executionId
    },
    [reset, startExecution, subscribe],
  )

  const cancel = useCallback(
    () => {
      unsubRef.current?.()
      onFlowComplete('failed')
    },
    [onFlowComplete],
  )

  const isRunning = status === 'running'

  return { execute, cancel, isRunning } as const
}
