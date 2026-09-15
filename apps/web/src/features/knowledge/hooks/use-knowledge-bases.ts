'use client'

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { knowledgeKeys } from '@/core/query/keys'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import type { KnowledgeBaseSummary } from '@/types/knowledge'

const KNOWLEDGE_BASES_QUERY = /* GraphQL */ `
  query KnowledgeBases($workspaceId: ID!) {
    knowledgeBases(workspaceId: $workspaceId) {
      id
      workspaceId
      name
      status
      createdAt
      updatedAt
      publishedAt
    }
  }
`

export function useKnowledgeBases(workspaceId: string): UseQueryResult<KnowledgeBaseSummary[]> {
  return useQuery({
    queryKey: knowledgeKeys.lists(workspaceId),
    refetchInterval: 10000,
    queryFn: async () => {
      const client = getGraphQLClient()
      const response = await client.request<{ knowledgeBases: KnowledgeBaseSummary[] }>(
        KNOWLEDGE_BASES_QUERY,
        { workspaceId }
      )
      return response.knowledgeBases
    }
  })
}
