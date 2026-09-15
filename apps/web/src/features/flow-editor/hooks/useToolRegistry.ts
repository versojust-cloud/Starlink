'use client'

import { useQuery } from '@tanstack/react-query'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import { AVAILABLE_TOOLS_QUERY } from '@/core/graphql/flow-queries'
import type { ToolDef } from '../store/flow-store'

/* ---------- response type ---------- */

interface AvailableToolsResponse {
  availableTools: ToolDef[]
}

/* ---------- hook ---------- */

export function useToolRegistry() {
  const { data, isLoading, error } = useQuery<AvailableToolsResponse>({
    queryKey: ['availableTools'],
    queryFn: async () => {
      const client = getGraphQLClient()
      return client.request<AvailableToolsResponse>(AVAILABLE_TOOLS_QUERY)
    },
    staleTime: 5 * 60 * 1000, // tools rarely change; cache for 5 min
  })

  const tools = data?.availableTools ?? []

  const toolsByCategory = tools.reduce<Record<string, ToolDef[]>>((acc, tool) => {
    const cat = tool.category ?? 'uncategorized'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(tool)
    return acc
  }, {})

  return { tools, toolsByCategory, isLoading, error } as const
}
