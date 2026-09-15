'use client'

import type { TimelineIteration } from '@/types/timeline'

type TimelineHistoryDocument = {
  workspaceId: string
  taskId: string
  iterations: TimelineIteration[]
}

const STORAGE_PREFIX = 'workspace-timeline-history'

function getStorageKey(workspaceId: string, taskId: string) {
  return `${STORAGE_PREFIX}:${workspaceId}:${taskId}`
}

function sortByVersionDesc(iterations: TimelineIteration[]) {
  return [...iterations].sort((a, b) => b.version - a.version)
}

export function loadTimelineHistory(workspaceId: string, taskId: string): TimelineIteration[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(getStorageKey(workspaceId, taskId))
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as TimelineHistoryDocument
    if (!Array.isArray(parsed.iterations)) return []
    return sortByVersionDesc(parsed.iterations)
  } catch (error) {
    console.warn('Failed to parse timeline history from localStorage', error)
    return []
  }
}

export function saveTimelineIteration(
  workspaceId: string,
  taskId: string,
  iteration: TimelineIteration
) {
  if (typeof window === 'undefined') return
  const existing = loadTimelineHistory(workspaceId, taskId)
  const deduped = existing.filter((item) => item.id !== iteration.id)
  const next = sortByVersionDesc([...deduped, iteration])
  const doc: TimelineHistoryDocument = { workspaceId, taskId, iterations: next }

  window.localStorage.setItem(getStorageKey(workspaceId, taskId), JSON.stringify(doc))
}
