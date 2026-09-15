'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { workspaceKeys } from '@/core/query/keys'
import { useConversationRuntime, useTimelineHistory, useWorkspaceGraph } from '@/features/workspace/hooks'
import { buildAgentWorkspaceSnapshot, buildSeminarSnapshot } from '@/features/workspace/lib/agent-runtime'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import type { AssetEntity } from './types'
import {
  getAssetFeedEventName,
  readCommunityAssets,
  readPracticeAssets
} from './local-source'
import { selectWorkspaceAssets, useAssetStore } from './store'
import { useWorkspaceTaskRuns } from '../task/api'

type SaveCommunityPostInput = {
  workspaceId: string
  title: string
  body: string
  tags: string[]
  authorName: string
  authorRole?: string
}

type SavePracticeSessionInput = {
  workspaceId: string
  scenarioId: string
  scenarioTitle?: string
  messages: Array<{
    id: string
    role: string
    content: string
    timestamp: number
    feedback?: string
  }>
  insights: Array<{ title: string; detail: string }>
  resources: Array<{ title: string; url?: string }>
  quickReplies: string[]
  lastUpdated?: string
}

const WORKSPACE_ASSETS_QUERY = /* GraphQL */ `
  query WorkspaceAssets($workspaceId: ID!) {
    workspaceAssets(workspaceId: $workspaceId) {
      assetId
      workspaceId
      assetType
      title
      sourceModule
      sourceTaskId
      metadata
      content
      version
      status
      createdBy
      createdAt
      updatedAt
    }
  }
`

const SAVE_COMMUNITY_POST_MUTATION = /* GraphQL */ `
  mutation SaveCommunityPost($input: CommunityPostInput!) {
    saveCommunityPost(input: $input) {
      assetId
      workspaceId
      assetType
      title
      sourceModule
      sourceTaskId
      metadata
      content
      version
      status
      createdBy
      createdAt
      updatedAt
    }
  }
`

const SAVE_PRACTICE_SESSION_MUTATION = /* GraphQL */ `
  mutation SavePracticeSession($input: SavePracticeSessionInput!) {
    savePracticeSession(input: $input) {
      assetId
      workspaceId
      assetType
      title
      sourceModule
      sourceTaskId
      metadata
      content
      version
      status
      createdBy
      createdAt
      updatedAt
    }
  }
`

function toAssetStatus(status: string): AssetEntity['status'] {
  if (status === 'ready' || status === 'published') return 'ready'
  if (status === 'processing') return 'processing'
  if (status === 'failed' || status === 'error') return 'error'
  return 'draft'
}

function nowIso() {
  return new Date().toISOString()
}

function mergeAssets(primary: AssetEntity[], fallback: AssetEntity[]) {
  const byId = new Map<string, AssetEntity>()

  for (const asset of [...primary, ...fallback]) {
    const current = byId.get(asset.assetId)
    if (!current || asset.updatedAt > current.updatedAt) {
      byId.set(asset.assetId, asset)
    }
  }

  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function useLocalWorkspaceAssets(workspaceId: string) {
  const [localVersion, setLocalVersion] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleFeedChanged = () => setLocalVersion((value) => value + 1)
    const eventName = getAssetFeedEventName()
    window.addEventListener(eventName, handleFeedChanged as EventListener)
    window.addEventListener('storage', handleFeedChanged)
    return () => {
      window.removeEventListener(eventName, handleFeedChanged as EventListener)
      window.removeEventListener('storage', handleFeedChanged)
    }
  }, [])

  return useMemo(
    () => {
      void localVersion
      return [...readPracticeAssets(workspaceId), ...readCommunityAssets(workspaceId)]
    },
    [localVersion, workspaceId]
  )
}

export function useWorkspaceSavedAssetsQuery(workspaceId: string) {
  return useQuery({
    queryKey: workspaceKeys.assets(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const client = getGraphQLClient()
      const data = await client.request<{ workspaceAssets: AssetEntity[] }>(
        WORKSPACE_ASSETS_QUERY,
        { workspaceId }
      )
      return data.workspaceAssets
    }
  })
}

export function useWorkspacePersistedAssets(workspaceId: string) {
  const localAssets = useLocalWorkspaceAssets(workspaceId)
  const remoteQuery = useWorkspaceSavedAssetsQuery(workspaceId)

  return useMemo(
    () => mergeAssets(remoteQuery.data ?? [], localAssets),
    [localAssets, remoteQuery.data]
  )
}

export function useSaveCommunityPostMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SaveCommunityPostInput) => {
      const client = getGraphQLClient()
      const data = await client.request<{ saveCommunityPost: AssetEntity }>(
        SAVE_COMMUNITY_POST_MUTATION,
        { input }
      )
      return data.saveCommunityPost
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.assets(variables.workspaceId) })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.directory() })
    }
  })
}

export function useSavePracticeSessionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SavePracticeSessionInput) => {
      const client = getGraphQLClient()
      const data = await client.request<{ savePracticeSession: AssetEntity }>(
        SAVE_PRACTICE_SESSION_MUTATION,
        { input }
      )
      return data.savePracticeSession
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.assets(variables.workspaceId) })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.directory() })
    }
  })
}

export function useWorkspaceAssets(workspaceId: string) {
  const taskId = `${workspaceId}-default`
  const { latestKnowledgeBase, taskRuns } = useWorkspaceTaskRuns(workspaceId)
  const workspaceGraphQuery = useWorkspaceGraph(workspaceId)
  const timelineHistoryQuery = useTimelineHistory(workspaceId, taskId)
  const runtime = useConversationRuntime(workspaceId)
  const graph = workspaceGraphQuery.data
  const iterations = useMemo(
    () => timelineHistoryQuery.data?.iterations ?? [],
    [timelineHistoryQuery.data?.iterations]
  )
  const agentSnapshot = useMemo(
    () => (graph ? buildAgentWorkspaceSnapshot(graph) : null),
    [graph]
  )
  const seminarSnapshot = useMemo(
    () => (agentSnapshot ? buildSeminarSnapshot(agentSnapshot) : null),
    [agentSnapshot]
  )
  const persistedAssets = useWorkspacePersistedAssets(workspaceId)
  const savedAssetsQuery = useWorkspaceSavedAssetsQuery(workspaceId)

  const assets = useMemo<AssetEntity[]>(() => {
    const next: AssetEntity[] = []

    if (latestKnowledgeBase) {
      next.push({
        assetId: `kb:${latestKnowledgeBase.id}`,
        workspaceId,
        assetType: 'knowledge-base',
        title: latestKnowledgeBase.name,
        sourceModule: 'knowledge',
        sourceTaskId: null,
        metadata: {
          status: latestKnowledgeBase.status,
          taskCount: taskRuns.length
        },
        content: {
          knowledgeBase: latestKnowledgeBase,
          tasks: taskRuns
        },
        version: 1,
        status: toAssetStatus(latestKnowledgeBase.status),
        createdBy: 'system',
        createdAt: latestKnowledgeBase.createdAt,
        updatedAt: latestKnowledgeBase.updatedAt
      })
    }

    if (iterations.length > 0) {
      const latestIteration = iterations[0]
      next.push({
        assetId: `analysis:${workspaceId}:${taskId}`,
        workspaceId,
        assetType: 'research-brief',
        title: 'Analysis Timeline',
        sourceModule: 'deep-research',
        sourceTaskId: taskId,
        metadata: {
          iterationCount: iterations.length
        },
        content: {
          iterations
        },
        version: iterations.length,
        status: 'ready',
        createdBy: 'system',
        createdAt: latestIteration?.createdAt ?? nowIso(),
        updatedAt: latestIteration?.createdAt ?? nowIso()
      })
    }

    if (graph) {
      next.push({
        assetId: `graph:${workspaceId}`,
        workspaceId,
        assetType: 'canvas-graph',
        title: `${workspaceId} Canvas`,
        sourceModule: 'canvas',
        sourceTaskId: null,
        metadata: {
          nodeCount: graph.nodes.length,
          edgeCount: graph.edges.length
        },
        content: graph,
        version: graph.nodes.length + graph.edges.length,
        status: graph.nodes.length > 0 ? 'ready' : 'draft',
        createdBy: 'system',
        createdAt: latestKnowledgeBase?.createdAt ?? nowIso(),
        updatedAt: latestKnowledgeBase?.updatedAt ?? nowIso()
      })
    }

    if ((agentSnapshot?.agents.length ?? 0) > 0) {
      next.push({
        assetId: `agents:${workspaceId}`,
        workspaceId,
        assetType: 'agent-run-result',
        title: 'Agent Contributions',
        sourceModule: 'agents',
        sourceTaskId: null,
        metadata: {
          agentCount: agentSnapshot?.agents.length ?? 0
        },
        content: agentSnapshot,
        version: agentSnapshot?.agents.length ?? 1,
        status: 'ready',
        createdBy: 'system',
        createdAt: latestKnowledgeBase?.createdAt ?? nowIso(),
        updatedAt: latestKnowledgeBase?.updatedAt ?? nowIso()
      })
    }

    const seminarEvents =
      (seminarSnapshot?.openingStatements.length ?? 0) +
      (seminarSnapshot?.planning.length ?? 0) +
      (seminarSnapshot?.execution.length ?? 0) +
      (seminarSnapshot?.review.length ?? 0) +
      (seminarSnapshot?.decision.length ?? 0) +
      runtime.seminarTurns.length

    if (seminarEvents > 0 || runtime.latestDecision) {
      next.push({
        assetId: `seminar:${workspaceId}`,
        workspaceId,
        assetType: 'seminar-summary',
        title: 'Seminar Summary',
        sourceModule: 'seminar',
        sourceTaskId: null,
        metadata: {
          eventCount: seminarEvents,
          decisionCount: (seminarSnapshot?.decision.length ?? 0) + (runtime.latestDecision ? 1 : 0)
        },
        content: {
          runtime,
          seminarSnapshot
        },
        version: seminarEvents,
        status: runtime.latestDecision ? 'ready' : 'draft',
        createdBy: 'system',
        createdAt: latestKnowledgeBase?.createdAt ?? nowIso(),
        updatedAt: latestKnowledgeBase?.updatedAt ?? nowIso()
      })
    }

    next.push(...persistedAssets)

    return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [
    agentSnapshot,
    graph,
    iterations,
    latestKnowledgeBase,
    persistedAssets,
    runtime,
    seminarSnapshot,
    taskId,
    taskRuns,
    workspaceId
  ])

  const setWorkspaceAssets = useAssetStore((state) => state.setWorkspaceAssets)
  const storedAssets = useAssetStore(selectWorkspaceAssets(workspaceId))

  useEffect(() => {
    setWorkspaceAssets(workspaceId, assets)
  }, [assets, setWorkspaceAssets, workspaceId])

  return {
    assets,
    persistedAssets,
    storedAssets,
    runtime,
    agentSnapshot,
    seminarSnapshot,
    graph,
    iterations,
    isLoading:
      workspaceGraphQuery.isLoading || timelineHistoryQuery.isLoading || savedAssetsQuery.isLoading,
    isError:
      workspaceGraphQuery.isError || timelineHistoryQuery.isError || savedAssetsQuery.isError
  }
}
