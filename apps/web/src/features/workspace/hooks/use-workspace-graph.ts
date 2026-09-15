'use client'

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { workspaceKeys } from '@/core/query/keys'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import { type WorkspaceGraphResponse } from '@/types/graph'

export const WORKSPACE_GRAPH_QUERY = /* GraphQL */ `
  query WorkspaceGraph($workspaceId: ID!) {
    workspaceGraph(workspaceId: $workspaceId) {
      workspaceId
      nodes {
        id
        type
        position {
          x
          y
        }
        data
      }
      edges {
        id
        source
        target
        label
        kind
      }
      citations {
        cardId
        fieldName
        spans {
          textStart
          textEnd
          refs {
            evidenceId
            docId
            snippetId
          }
        }
      }
    }
  }
`

export async function fetchWorkspaceGraphSnapshot(workspaceId: string): Promise<WorkspaceGraphResponse> {
  const client = getGraphQLClient()
  const data = await client.request<{ workspaceGraph: WorkspaceGraphResponse }>(WORKSPACE_GRAPH_QUERY, {
    workspaceId
  })
  return data.workspaceGraph
}

export function useWorkspaceGraph(workspaceId: string): UseQueryResult<WorkspaceGraphResponse> {
  return useQuery({
    queryKey: workspaceKeys.graph(workspaceId),
    queryFn: async () => fetchWorkspaceGraphSnapshot(workspaceId)
  })
}
