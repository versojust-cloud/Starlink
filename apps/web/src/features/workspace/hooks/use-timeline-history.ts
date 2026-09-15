'use client'

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { workflowKeys } from '@/core/query/keys'
import type { TimelineIteration } from '@/types/timeline'
import { loadTimelineHistory } from '../lib/timeline-history-storage'

export type TimelineHistoryResponse = {
  iterations: TimelineIteration[]
}

export function useTimelineHistory(
  workspaceId: string,
  taskId?: string | null
): UseQueryResult<TimelineHistoryResponse> {
  return useQuery({
    queryKey: workflowKeys.timelineHistory(workspaceId, taskId),
    enabled: Boolean(workspaceId && taskId),
    queryFn: async () => {
      if (!workspaceId || !taskId) {
        return { iterations: [] }
      }
      return {
        iterations: loadTimelineHistory(workspaceId, taskId)
      }
    }
  })
}
