'use client'

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { knowledgeKeys } from '@/core/query/keys'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import type { KnowledgeBaseSummary } from '@/types/knowledge'

const CREATE_KNOWLEDGE_BASE_MUTATION = /* GraphQL */ `
  mutation CreateKnowledgeBase($workspaceId: ID!) {
    createKnowledgeBase(workspaceId: $workspaceId) {
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

export function useCreateKnowledgeBase(workspaceId: string): UseMutationResult<KnowledgeBaseSummary, Error, void> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const client = getGraphQLClient()
      const response = await client.request<{ createKnowledgeBase: KnowledgeBaseSummary }>(
        CREATE_KNOWLEDGE_BASE_MUTATION,
        { workspaceId }
      )
      return response.createKnowledgeBase
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: knowledgeKeys.lists(workspaceId) })
      await queryClient.invalidateQueries({ queryKey: knowledgeKeys.statusRoot(workspaceId) })
    }
  })
}
