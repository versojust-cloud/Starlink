'use client'

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { taskKeys } from '@/core/query/keys'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import type { KbTaskStatus } from '@/types/knowledge'

const KB_TASK_STATUS_QUERY = /* GraphQL */ `
  query KbTaskStatus($workspaceId: ID!, $kbId: ID!) {
    kbTaskStatus(workspaceId: $workspaceId, kbId: $kbId) {
      taskId
      workspaceId
      kbId
      status
      taskType
      error
      updatedAt
      lastEventId
    }
  }
`

export function useKbTaskStatus(workspaceId: string, kbId: string): UseQueryResult<KbTaskStatus[]> {
  return useQuery({
    queryKey: taskKeys.byKnowledgeBase(workspaceId, kbId),
    enabled: kbId.length > 0,
    refetchInterval: 5000,
    queryFn: async () => {
      const client = getGraphQLClient()
      const response = await client.request<{ kbTaskStatus: KbTaskStatus[] }>(
        KB_TASK_STATUS_QUERY,
        { workspaceId, kbId }
      )
      return response.kbTaskStatus
    }
  })
}
