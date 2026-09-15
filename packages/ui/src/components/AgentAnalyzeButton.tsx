'use client'

import { useMemo } from 'react'
import { useAnalyzeQuestion } from '../hooks/useAnalyzeQuestion.js'
import type { AnalyzeRequest, AnalyzeResponse, TimelineEdge, TimelineNode } from '../types.js'
import clsx from 'clsx'

export type AgentAnalyzeButtonProps = {
  question: string
  workspaceId: string
  tenantId?: string
  userId?: string
  taskId?: string
  timeline: TimelineNode[]
  edges: TimelineEdge[]
  endpoint?: string
  fetchImpl?: typeof fetch
  onSuccess?: (result: AnalyzeResponse) => void
  onError?: (error: Error) => void
  label?: string
  className?: string
  disabled?: boolean
}

export function AgentAnalyzeButton(props: AgentAnalyzeButtonProps): JSX.Element {
  const {
    question,
    workspaceId,
    tenantId,
    userId = 'anonymous',
    taskId,
    timeline,
    edges,
    endpoint,
    fetchImpl,
    onSuccess,
    onError,
    label = '生成分析',
    className,
    disabled
  } = props
  const mutation = useAnalyzeQuestion({
    endpoint,
    fetchImpl,
    mutationOptions: {
      onSuccess,
      onError
    }
  })

  const payload = useMemo<AnalyzeRequest>(
    () => ({
      tenantId: tenantId ?? workspaceId,
      userId,
      taskId: taskId ?? `${workspaceId}-default`,
      question,
      timeline,
      edges
    }),
    [tenantId, workspaceId, userId, taskId, question, timeline, edges]
  )

  const handleClick = () => {
    if (disabled || mutation.isPending) return
    mutation.mutate(payload)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || mutation.isPending}
      className={clsx(
        'inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300',
        className
      )}
    >
      {mutation.isPending ? '分析中…' : label}
    </button>
  )
}
