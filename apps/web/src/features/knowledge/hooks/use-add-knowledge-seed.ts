'use client'

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { knowledgeKeys, taskKeys } from '@/core/query/keys'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import type { KnowledgeTask } from '@/types/knowledge'

const ADD_KNOWLEDGE_SEED_MUTATION = /* GraphQL */ `
  mutation AddKnowledgeSeed($workspaceId: ID!, $kbId: ID!, $text: String!) {
    addKnowledgeSeed(workspaceId: $workspaceId, kbId: $kbId, text: $text) {
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
`

export function useAddKnowledgeSeed(workspaceId: string): UseMutationResult<
  KnowledgeTask,
  Error,
  { kbId: string; text: string }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ kbId, text }) => {
      const client = getGraphQLClient()
      const response = await client.request<{ addKnowledgeSeed: KnowledgeTask }>(
        ADD_KNOWLEDGE_SEED_MUTATION,
        { workspaceId, kbId, text }
      )
      return response.addKnowledgeSeed
    },
    onSuccess: async (task) => {
      await queryClient.invalidateQueries({ queryKey: taskKeys.byKnowledgeBase(workspaceId, task.kbId) })
      await queryClient.invalidateQueries({ queryKey: knowledgeKeys.status(workspaceId, task.kbId) })
    }
  })
}
