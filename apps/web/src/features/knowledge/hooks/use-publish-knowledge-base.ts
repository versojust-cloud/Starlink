'use client'

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { knowledgeKeys } from '@/core/query/keys'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import type { KnowledgeBaseSummary } from '@/types/knowledge'

const PUBLISH_KNOWLEDGE_BASE_MUTATION = /* GraphQL */ `
  mutation PublishKnowledgeBase($workspaceId: ID!, $kbId: ID!) {
    publishKnowledgeBase(workspaceId: $workspaceId, kbId: $kbId) {
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

export function usePublishKnowledgeBase(
  workspaceId: string
): UseMutationResult<KnowledgeBaseSummary, Error, { kbId: string }> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ kbId }) => {
      const client = getGraphQLClient()
      const response = await client.request<{ publishKnowledgeBase: KnowledgeBaseSummary }>(
        PUBLISH_KNOWLEDGE_BASE_MUTATION,
        { workspaceId, kbId }
      )
      return response.publishKnowledgeBase
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: knowledgeKeys.lists(workspaceId) })
      await queryClient.invalidateQueries({ queryKey: knowledgeKeys.statusRoot(workspaceId) })
    }
  })
}
