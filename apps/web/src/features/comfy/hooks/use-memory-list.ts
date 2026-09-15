'use client'

/**
 * P2 · Memory drawer GraphQL hooks.
 *
 * Three queries cover the three tabs of the Memory drawer:
 *   - useMyMemories:    user-scoped memory rows (per-tab kind filter)
 *   - useMyKnowledgeEvidence: KB chunk citations reverse-lookup
 *
 * Plus one mutation:
 *   - useCorrectMemoryItem: archive / edit content / leave feedback
 *
 * All queries are user-scoped server-side (resolver enforces ctx.userId);
 * the frontend doesn't pass userId — it's derived from the authenticated
 * session.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { getGraphQLClient } from '@/shared/lib/graphql-client'

export interface MemoryItem {
  id: string
  workspaceId: string
  userId: string | null
  /** P14 · canonical layer in the 5-level memory hierarchy. Null on
   *  rows pre-dating migration 016 (deprecation window). */
  layer: string | null
  /** P14 · cognitive-science facet (episodic / semantic / procedural). */
  facet: string | null
  /** P14 · business-term within (layer, facet). */
  category: string | null
  /** @deprecated P14 P2 — use {@link layer}. */
  scope: string
  /** @deprecated P14 P2 — use {@link facet} + {@link category}. */
  kind: string
  title: string
  content: string
  sourceType: string
  sourceId: string | null
  importance: number
  confidence: number
  tags: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  lastUsedAt: string | null
  archivedAt: string | null
}

export interface KnowledgeEvidenceRef {
  memoryItemId: string
  workspaceId: string
  docId: string
  snippet: string | null
  score: number | null
  citedAt: string
  sourceTitle: string
}

const MY_MEMORIES_QUERY = /* GraphQL */ `
  query MyMemories($workspaceId: ID, $kind: String, $query: String, $limit: Int) {
    myMemories(workspaceId: $workspaceId, kind: $kind, query: $query, limit: $limit) {
      id
      workspaceId
      userId
      layer
      facet
      category
      scope
      kind
      title
      content
      sourceType
      sourceId
      importance
      confidence
      tags
      metadata
      createdAt
      updatedAt
      lastUsedAt
      archivedAt
    }
  }
`

const MY_KB_EVIDENCE_QUERY = /* GraphQL */ `
  query MyKnowledgeEvidence($workspaceId: ID, $limit: Int) {
    myKnowledgeEvidence(workspaceId: $workspaceId, limit: $limit) {
      memoryItemId
      workspaceId
      docId
      snippet
      score
      citedAt
      sourceTitle
    }
  }
`

const CORRECT_MEMORY_MUTATION = /* GraphQL */ `
  mutation CorrectMemoryItem($input: CorrectMemoryItemInput!) {
    correctMemoryItem(input: $input) {
      id
      workspaceId
      userId
      layer
      facet
      category
      scope
      kind
      title
      content
      tags
      metadata
      updatedAt
      archivedAt
    }
  }
`

const REFRESH_USER_SKILLS_MUTATION = /* GraphQL */ `
  mutation RefreshUserSkills($workspaceId: ID!) {
    refreshUserSkills(workspaceId: $workspaceId)
  }
`

const EXPORT_MY_DATA_QUERY = /* GraphQL */ `
  query ExportMyData {
    exportMyData
  }
`

export function useMyMemories(opts: {
  workspaceId?: string | null
  kind?: string | null
  query?: string | null
  limit?: number | null
  enabled?: boolean
}): UseQueryResult<MemoryItem[]> {
  return useQuery({
    queryKey: [
      'memory',
      'my',
      opts.workspaceId ?? null,
      opts.kind ?? null,
      opts.query ?? null,
      opts.limit ?? 50
    ],
    enabled: opts.enabled !== false,
    queryFn: async () => {
      const client = getGraphQLClient()
      const response = await client.request<{ myMemories: MemoryItem[] }>(MY_MEMORIES_QUERY, {
        workspaceId: opts.workspaceId ?? null,
        kind: opts.kind ?? null,
        query: opts.query ?? null,
        limit: opts.limit ?? 50
      })
      return response.myMemories
    }
  })
}

export function useMyKnowledgeEvidence(opts: {
  workspaceId?: string | null
  limit?: number | null
  enabled?: boolean
}): UseQueryResult<KnowledgeEvidenceRef[]> {
  return useQuery({
    queryKey: ['memory', 'kb-evidence', opts.workspaceId ?? null, opts.limit ?? 100],
    enabled: opts.enabled !== false,
    queryFn: async () => {
      const client = getGraphQLClient()
      const response = await client.request<{ myKnowledgeEvidence: KnowledgeEvidenceRef[] }>(
        MY_KB_EVIDENCE_QUERY,
        {
          workspaceId: opts.workspaceId ?? null,
          limit: opts.limit ?? 100
        }
      )
      return response.myKnowledgeEvidence
    }
  })
}

export function useCorrectMemoryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      itemId: string
      newContent?: string
      archive?: boolean
      feedback?: string
    }) => {
      const client = getGraphQLClient()
      const response = await client.request<{ correctMemoryItem: MemoryItem }>(
        CORRECT_MEMORY_MUTATION,
        { input }
      )
      return response.correctMemoryItem
    },
    onSuccess: () => {
      // Invalidate all memory queries so the drawer re-renders with the
      // updated row (or hides archived rows).
      queryClient.invalidateQueries({ queryKey: ['memory'] })
    }
  })
}

/**
 * F3 · Demand-mode user-skill extraction. User clicks the "立即更新画像"
 * button → triggers a fresh DeepSeek extraction pass. Server-side rate
 * limit (F2): min 10s gap, max 6 per hour per user.
 *
 * Returns the count of changes applied (creates + updates + refines +
 * decays + cross-workspace promotes). 0 means no new traits detected.
 */
export function useRefreshUserSkills() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { workspaceId: string }) => {
      const client = getGraphQLClient()
      const response = await client.request<{ refreshUserSkills: number }>(
        REFRESH_USER_SKILLS_MUTATION,
        { workspaceId: input.workspaceId }
      )
      return response.refreshUserSkills
    },
    onSuccess: () => {
      // Refresh memory queries so newly-extracted user-skill rows show up.
      queryClient.invalidateQueries({ queryKey: ['memory'] })
    }
  })
}

/**
 * F6 · Trigger a data export (GDPR Art. 20). Returns the JSON dump
 * directly so the caller can download it as a file. Rate limit:
 * 1 per 5 minutes (server-side). This hook NOT cached — exports
 * always re-run for freshness.
 */
export function useExportMyData() {
  return useMutation({
    mutationFn: async (): Promise<unknown> => {
      const client = getGraphQLClient()
      const response = await client.request<{ exportMyData: unknown }>(EXPORT_MY_DATA_QUERY)
      return response.exportMyData
    }
  })
}
