'use client'

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { knowledgeKeys, taskKeys } from '@/core/query/keys'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import type { KnowledgeTask } from '@/types/knowledge'

const IMPORT_KNOWLEDGE_URL_MUTATION = /* GraphQL */ `
  mutation ImportKnowledgeUrl($workspaceId: ID!, $kbId: ID!, $url: String!) {
    importKnowledgeUrl(workspaceId: $workspaceId, kbId: $kbId, url: $url) {
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

export function useImportKnowledgeUrl(workspaceId: string): UseMutationResult<
  KnowledgeTask,
  Error,
  { kbId: string; url: string }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ kbId, url }) => {
      const client = getGraphQLClient()
      const response = await client.request<{ importKnowledgeUrl: KnowledgeTask }>(
        IMPORT_KNOWLEDGE_URL_MUTATION,
        { workspaceId, kbId, url }
      )
      return response.importKnowledgeUrl
    },
    onSuccess: async (task) => {
      await queryClient.invalidateQueries({ queryKey: taskKeys.byKnowledgeBase(workspaceId, task.kbId) })
      await queryClient.invalidateQueries({ queryKey: knowledgeKeys.status(workspaceId, task.kbId) })
    }
  })
}
