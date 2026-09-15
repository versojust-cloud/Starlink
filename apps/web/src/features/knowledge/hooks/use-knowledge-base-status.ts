'use client'

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { knowledgeKeys } from '@/core/query/keys'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import type { KnowledgeBaseStatus } from '@/types/knowledge'

const KNOWLEDGE_BASE_STATUS_QUERY = /* GraphQL */ `
  query KnowledgeBaseStatus($workspaceId: ID!, $kbId: ID!) {
    knowledgeBaseStatus(workspaceId: $workspaceId, kbId: $kbId) {
      knowledgeBase {
        id
        workspaceId
        name
        status
        createdAt
        updatedAt
        publishedAt
      }
      tasks {
        id
        workspaceId
        kbId
        type
        status
        payload
        error
        createdAt
        updatedAt
      }
    }
  }
`

export function useKnowledgeBaseStatus(workspaceId: string, kbId: string): UseQueryResult<KnowledgeBaseStatus> {
  return useQuery({
    queryKey: knowledgeKeys.status(workspaceId, kbId),
    enabled: kbId.length > 0,
    refetchInterval: 5000,
    queryFn: async () => {
      const client = getGraphQLClient()
      const response = await client.request<{ knowledgeBaseStatus: KnowledgeBaseStatus }>(
        KNOWLEDGE_BASE_STATUS_QUERY,
        { workspaceId, kbId }
      )
      return response.knowledgeBaseStatus
    }
  })
}
