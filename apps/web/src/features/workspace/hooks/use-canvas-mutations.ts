'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { workspaceKeys } from '@/core/query/keys'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import type { CanvasEdge, CanvasNode, CanvasNodeData, WorkspaceGraphResponse } from '@/types/graph'

const ADD_NODE_MUTATION = /* GraphQL */ `
  mutation AddNode($workspaceId: ID!, $input: NodeInput!) {
    addNode(workspaceId: $workspaceId, input: $input) {
      id
      type
      position {
        x
        y
      }
      data
    }
  }
`

const CONNECT_NODES_MUTATION = /* GraphQL */ `
  mutation ConnectNodes($workspaceId: ID!, $input: EdgeInput!) {
    connectNodes(workspaceId: $workspaceId, input: $input) {
      id
      source
      target
      label
    }
  }
`

type AddNodeVariables = {
  workspaceId: string
  type: CanvasNode['type']
  position: { x: number; y: number }
  data: CanvasNodeData
}

type ConnectNodesVariables = {
  workspaceId: string
  source: string
  target: string
  label?: string | null
}

export function useCanvasMutations(workspaceId: string) {
  const queryClient = useQueryClient()
  const client = getGraphQLClient()

  const addNode = useMutation({
    mutationFn: async ({ type, position, data }: Omit<AddNodeVariables, 'workspaceId'>) => {
      const payload = await client.request<{ addNode: CanvasNode }>(ADD_NODE_MUTATION, {
        workspaceId,
        input: {
          type,
          position,
          data
        }
      })
      return payload.addNode
    },
    onSuccess: (node) => {
      queryClient.setQueryData<WorkspaceGraphResponse>(workspaceKeys.graph(workspaceId), (previous) => {
        if (!previous) return previous
        return {
          ...previous,
          nodes: [...previous.nodes, node]
        }
      })
    }
  })

  const connectNodes = useMutation({
    mutationFn: async ({ source, target, label }: Omit<ConnectNodesVariables, 'workspaceId'>) => {
      const payload = await client.request<{ connectNodes: CanvasEdge }>(CONNECT_NODES_MUTATION, {
        workspaceId,
        input: { source, target, label }
      })
      return payload.connectNodes
    },
    onSuccess: (edge) => {
      queryClient.setQueryData<WorkspaceGraphResponse>(workspaceKeys.graph(workspaceId), (previous) => {
        if (!previous) return previous
        return {
          ...previous,
          edges: [...previous.edges, edge]
        }
      })
    }
  })

  return {
    addNode,
    connectNodes
  }
}
