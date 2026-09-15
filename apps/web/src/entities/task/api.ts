'use client'

import { useEffect, useMemo } from 'react'
import { useKnowledgeBases } from '@/features/knowledge/hooks'
import { useKbTaskStatus } from '@/features/knowledge/hooks/use-kb-task-status'
import { useKnowledgeBaseStatus } from '@/features/knowledge/hooks/use-knowledge-base-status'
import type { KbTaskStatus, KnowledgeBaseSummary, KnowledgeTask } from '@/types/knowledge'
import type { AsyncStatus, TaskRun } from './types'
import { selectWorkspaceTasks, useTaskStore } from './store'

type WorkspaceTaskSummary = {
  total: number
  queued: number
  running: number
  success: number
  error: number
}

type TaskRunSource = {
  id?: string
  type?: string | null
  payload?: Record<string, unknown>
  createdAt?: string
  error?: string | null
  taskId: string
  kbId: string
  taskType: string
  status: KnowledgeTask['status'] | KbTaskStatus['status']
  updatedAt: string
}

function toAsyncStatus(status: KnowledgeTask['status'] | KbTaskStatus['status']): AsyncStatus {
  if (status === 'pending') return 'queued'
  if (status === 'processing') return 'running'
  if (status === 'succeeded') return 'success'
  if (status === 'failed') return 'error'
  return 'idle'
}

function buildTaskRun(
  workspaceId: string,
  task: TaskRunSource
): TaskRun<Record<string, unknown>> {
  const normalizedStatus = toAsyncStatus(task.status)
  const startedAt = task.createdAt ?? task.updatedAt
  const endedAt = normalizedStatus === 'success' || normalizedStatus === 'error' ? task.updatedAt : null

  return {
    taskId: task.id ?? task.taskId,
    workspaceId,
    taskType: task.type ?? task.taskType,
    input: task.payload ?? {},
    outputRef: {
      kind: 'knowledge-base',
      href: `/workspace/${workspaceId}/knowledge`
    },
    status: normalizedStatus,
    progress:
      normalizedStatus === 'success'
        ? 100
        : normalizedStatus === 'running'
          ? 60
          : normalizedStatus === 'queued'
            ? 20
            : normalizedStatus === 'error'
              ? 100
              : 0,
    startedAt,
    endedAt,
    error: task.error ?? null,
    retryable: normalizedStatus === 'error'
  }
}

function mergeTaskRuns(
  workspaceId: string,
  historyTasks: KnowledgeTask[],
  realtimeTasks: KbTaskStatus[]
): TaskRun<Record<string, unknown>>[] {
  const byId = new Map<string, TaskRun<Record<string, unknown>>>()

  for (const task of historyTasks) {
    byId.set(
      task.id,
      buildTaskRun(workspaceId, {
        ...task,
        taskId: task.id,
        taskType: task.type
      })
    )
  }

  for (const task of realtimeTasks) {
    const current = byId.get(task.taskId)
    byId.set(
      task.taskId,
      buildTaskRun(workspaceId, {
        ...(current
          ? {
              id: current.taskId,
              type: current.taskType,
              payload: current.input,
              createdAt: current.startedAt ?? task.updatedAt,
              error: current.error
            }
          : {}),
        taskId: task.taskId,
        kbId: task.kbId,
        taskType: task.taskType,
        status: task.status,
        updatedAt: task.updatedAt,
        error: task.error ?? current?.error ?? null
      })
    )
  }

  return [...byId.values()].sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
}

function summarizeTasks(tasks: TaskRun[]): WorkspaceTaskSummary {
  return {
    total: tasks.length,
    queued: tasks.filter((task) => task.status === 'queued').length,
    running: tasks.filter((task) => task.status === 'running').length,
    success: tasks.filter((task) => task.status === 'success').length,
    error: tasks.filter((task) => task.status === 'error').length
  }
}

export function useWorkspaceTaskRuns(workspaceId: string) {
  const knowledgeBasesQuery = useKnowledgeBases(workspaceId)
  const latestKnowledgeBase = useMemo<KnowledgeBaseSummary | null>(() => {
    const items = knowledgeBasesQuery.data ?? []
    return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
  }, [knowledgeBasesQuery.data])
  const knowledgeBaseStatusQuery = useKnowledgeBaseStatus(workspaceId, latestKnowledgeBase?.id ?? '')
  const kbTaskStatusQuery = useKbTaskStatus(workspaceId, latestKnowledgeBase?.id ?? '')
  const taskRuns = useMemo(
    () =>
      mergeTaskRuns(
        workspaceId,
        knowledgeBaseStatusQuery.data?.tasks ?? [],
        kbTaskStatusQuery.data ?? []
      ),
    [kbTaskStatusQuery.data, knowledgeBaseStatusQuery.data?.tasks, workspaceId]
  )
  const summary = useMemo(() => summarizeTasks(taskRuns), [taskRuns])
  const setWorkspaceTasks = useTaskStore((state) => state.setWorkspaceTasks)
  const storedTaskRuns = useTaskStore(selectWorkspaceTasks(workspaceId))

  useEffect(() => {
    setWorkspaceTasks(workspaceId, taskRuns)
  }, [setWorkspaceTasks, taskRuns, workspaceId])

  return {
    latestKnowledgeBase,
    taskRuns,
    storedTaskRuns,
    summary,
    isLoading:
      knowledgeBasesQuery.isLoading || knowledgeBaseStatusQuery.isLoading || kbTaskStatusQuery.isLoading,
    isError: knowledgeBasesQuery.isError || knowledgeBaseStatusQuery.isError || kbTaskStatusQuery.isError
  }
}
