'use client'

import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getWorkspaceFlow, type WorkspaceFlowKey } from '@/lib/workspace-flow'
import { workspaceKeys } from '@/core/query/keys'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import { getCurrentViewerId } from '@/shared/lib/viewer-identity'
import { useWorkspaceAssets } from '../asset/api'
import { useWorkspaceFlowStepStates } from '../flow-step/api'
import { useWorkspaceTaskRuns } from '../task/api'
import { selectWorkspaceEntity, useWorkspaceStore } from './store'
import type { WorkspaceEntitySnapshot, WorkspaceMember, WorkspaceModuleId, WorkspaceStatus } from './types'

const STAGE_DEFAULT_FLOW: Record<string, WorkspaceFlowKey> = {
  intake: 'knowledge',
  analysis: 'canvas',
  modeling: 'canvas',
  delivery: 'cultural-tools'
}

function unique<T>(items: T[]) {
  return [...new Set(items)]
}

export type WorkspaceDirectoryEntry = {
  workspaceId: string
  name: string
  type: string
  focus: string
  ownerId: string
  ownerName: string
  members: WorkspaceMember[]
  viewerPermissions: string[]
  canManage: boolean
  status: WorkspaceStatus
  updatedAt: string
  contributors: number
  snapshot: WorkspaceEntitySnapshot | null
}

export type WorkspaceDirectorySummary = {
  workspaceId: string
  name: string
  type: string
  focus: string
  ownerId: string
  ownerName: string
  members: WorkspaceMember[]
  viewerPermissions: string[]
  canManage: boolean
  status: WorkspaceStatus
  updatedAt: string
}

export type WorkspaceMetadataUpdateInput = {
  workspaceId: string
  name: string
  type: string
  focus: string
  ownerId: string
  ownerName: string
  members: WorkspaceMember[]
}

export type WorkspaceMetadataHistoryEntry = {
  historyId: string
  workspaceId: string
  changedBy: string
  changedAt: string
  summary: string
  version: number
}

const WORKSPACE_DIRECTORY_QUERY = /* GraphQL */ `
  query WorkspaceDirectory {
    workspaces {
      workspaceId
      name
      type
      focus
      ownerId
      ownerName
      members {
        id
        name
        role
        permissions
      }
      viewerPermissions
      canManage
      status
      updatedAt
    }
  }
`

const UPDATE_WORKSPACE_METADATA_MUTATION = /* GraphQL */ `
  mutation UpdateWorkspaceMetadata($input: UpdateWorkspaceMetadataInput!) {
    updateWorkspaceMetadata(input: $input) {
      workspaceId
      name
      type
      focus
      ownerId
      ownerName
      members {
        id
        name
        role
        permissions
      }
      viewerPermissions
      canManage
      status
      updatedAt
    }
  }
`

const WORKSPACE_METADATA_HISTORY_QUERY = /* GraphQL */ `
  query WorkspaceMetadataHistory($workspaceId: ID!) {
    workspaceMetadataHistory(workspaceId: $workspaceId) {
      historyId
      workspaceId
      changedBy
      changedAt
      summary
      version
    }
  }
`

function resolveWorkspaceStatus(options: {
  hasError: boolean
  assetCount: number
  taskCount: number
}): WorkspaceStatus {
  if (options.hasError) return 'error'
  if (options.assetCount === 0 && options.taskCount === 0) return 'draft'
  return 'active'
}

function inferActiveModules(assetTypes: string[], currentFlow: WorkspaceFlowKey): WorkspaceModuleId[] {
  const modules: WorkspaceModuleId[] = []

  if (assetTypes.includes('knowledge-base')) modules.push('knowledge')
  if (assetTypes.includes('research-brief')) modules.push('deep-research')
  if (assetTypes.includes('canvas-graph')) modules.push('canvas')
  if (assetTypes.includes('agent-run-result')) modules.push('agents')
  if (assetTypes.includes('seminar-summary')) modules.push('seminar')
  if (assetTypes.includes('practice-output')) modules.push('practice')
  if (assetTypes.includes('community-post')) modules.push('community')
  modules.push(currentFlow)

  return unique(modules)
}

function resolveTimestamps(values: string[]) {
  const ordered = values.filter(Boolean).sort((a, b) => b.localeCompare(a))
  const updatedAt = ordered[0] ?? new Date().toISOString()
  const createdAt = ordered[ordered.length - 1] ?? updatedAt
  return { createdAt, updatedAt }
}

export function useWorkspaceEntity(workspaceId: string, options?: { name?: string; ownerId?: string }) {
  const flow = useMemo(() => getWorkspaceFlow(workspaceId), [workspaceId])
  const directoryQuery = useWorkspaceDirectoryQuery()
  const { assets, isError: assetError } = useWorkspaceAssets(workspaceId)
  const { taskRuns, isError: taskError } = useWorkspaceTaskRuns(workspaceId)
  const { stepStates } = useWorkspaceFlowStepStates(workspaceId)
  const setWorkspace = useWorkspaceStore((state) => state.setWorkspace)
  const storedWorkspace = useWorkspaceStore(selectWorkspaceEntity(workspaceId))

  const snapshot = useMemo<WorkspaceEntitySnapshot>(() => {
    const nextStep =
      stepStates.find((step) => step.status !== 'complete') ?? stepStates[stepStates.length - 1]
    const recommendedKey =
      (nextStep ? STAGE_DEFAULT_FLOW[nextStep.stepKey] : undefined) ?? flow[0]?.key ?? 'knowledge'
    const recommendedItem =
      flow.find((item) => item.key === recommendedKey) ??
      flow.find((item) => item.stageId === nextStep?.stepKey) ??
      flow[0]
    const blockers = stepStates.flatMap((step) => step.blockers)
    const completedSteps = stepStates.filter((step) => step.status === 'complete').length
    const timestamps = resolveTimestamps([
      ...assets.map((asset) => asset.updatedAt),
      ...taskRuns.flatMap((task) => [task.startedAt ?? '', task.endedAt ?? ''])
    ])
    const status = resolveWorkspaceStatus({
      hasError: assetError || taskError,
      assetCount: assets.length,
      taskCount: taskRuns.length
    })
    const remoteDirectoryItem = directoryQuery.data?.find((item) => item.workspaceId === workspaceId)
    const fallbackMember: WorkspaceMember = {
      id: options?.ownerId ?? remoteDirectoryItem?.ownerId ?? 'system-owner',
      name: remoteDirectoryItem?.ownerName ?? 'Workspace Owner',
      role: 'owner',
      permissions: ['workspace.read', 'workspace.write', 'workspace.publish', 'workspace.manage']
    }
    const members = remoteDirectoryItem?.members?.length ? remoteDirectoryItem.members : [fallbackMember]

    return {
      workspaceId,
      name: options?.name ?? remoteDirectoryItem?.name ?? workspaceId,
      type: remoteDirectoryItem?.type ?? 'workspace',
      focus: remoteDirectoryItem?.focus ?? '等待工作区元数据接入',
      ownerId: options?.ownerId ?? remoteDirectoryItem?.ownerId ?? fallbackMember.id,
      ownerName: remoteDirectoryItem?.ownerName ?? fallbackMember.name,
      members,
      viewerPermissions: (remoteDirectoryItem?.viewerPermissions ?? []) as typeof fallbackMember.permissions,
      canManage: remoteDirectoryItem?.canManage ?? false,
      currentFlow: recommendedItem?.key ?? 'knowledge',
      currentStageId: nextStep?.stepKey ?? 'intake',
      recommendedFlowKey: recommendedItem?.key ?? 'knowledge',
      recommendedHref: recommendedItem?.href ?? `/workspace/${workspaceId}/knowledge`,
      activeModules: inferActiveModules(
        assets.map((asset) => asset.assetType),
        (recommendedItem?.key ?? 'knowledge') as WorkspaceFlowKey
      ),
      permissions: ['workspace.read', 'workspace.write', 'workspace.publish'],
      status,
      createdAt: timestamps.createdAt,
      updatedAt: timestamps.updatedAt,
      progress: stepStates.length > 0 ? Math.round((completedSteps / stepStates.length) * 100) : 0,
      blockers,
      counts: {
        assets: assets.length,
        tasks: taskRuns.length,
        completedSteps,
        totalSteps: stepStates.length
      }
    }
  }, [
    assetError,
    assets,
    directoryQuery.data,
    flow,
    options?.name,
    options?.ownerId,
    stepStates,
    taskError,
    taskRuns,
    workspaceId
  ])

  useEffect(() => {
    setWorkspace(snapshot)
  }, [setWorkspace, snapshot])

  return {
    workspace: snapshot,
    storedWorkspace
  }
}

export function useWorkspaceDirectoryQuery() {
  const viewerId = getCurrentViewerId()
  return useQuery({
    queryKey: workspaceKeys.directory(viewerId),
    queryFn: async () => {
      const client = getGraphQLClient()
      const data = await client.request<{ workspaces: WorkspaceDirectorySummary[] }>(WORKSPACE_DIRECTORY_QUERY)
      return data.workspaces
    }
  })
}

export function useWorkspaceMetadataHistoryQuery(workspaceId: string) {
  const viewerId = getCurrentViewerId()

  return useQuery({
    queryKey: workspaceKeys.history(workspaceId, viewerId),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const client = getGraphQLClient()
      const data = await client.request<{ workspaceMetadataHistory: WorkspaceMetadataHistoryEntry[] }>(
        WORKSPACE_METADATA_HISTORY_QUERY,
        { workspaceId }
      )
      return data.workspaceMetadataHistory
    }
  })
}

export function useUpdateWorkspaceMetadataMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: WorkspaceMetadataUpdateInput) => {
      const client = getGraphQLClient()
      const data = await client.request<{ updateWorkspaceMetadata: WorkspaceDirectorySummary }>(
        UPDATE_WORKSPACE_METADATA_MUTATION,
        { input }
      )
      return data.updateWorkspaceMetadata
    },
    onSuccess: (workspace) => {
      const viewerId = getCurrentViewerId()
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.directory(viewerId) })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspace.workspaceId) })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.history(workspace.workspaceId, viewerId) })
    }
  })
}

export function useWorkspaceDirectory(options?: {
  activeWorkspaceId?: string
  seedWorkspaceIds?: string[]
}) {
  const byId = useWorkspaceStore((state) => state.byId)
  const directoryQuery = useWorkspaceDirectoryQuery()

  return useMemo<WorkspaceDirectoryEntry[]>(() => {
    const ids = unique([
      options?.activeWorkspaceId,
      ...(options?.seedWorkspaceIds ?? []),
      ...Object.keys(byId),
      ...(directoryQuery.data?.map((item) => item.workspaceId) ?? [])
    ].filter(Boolean) as string[])

    return ids.map((workspaceId) => {
      const snapshot = byId[workspaceId] ?? null
      const remoteItem = directoryQuery.data?.find((item) => item.workspaceId === workspaceId)

      return {
        workspaceId,
        name: snapshot?.name ?? remoteItem?.name ?? workspaceId,
        type: snapshot?.type ?? remoteItem?.type ?? 'workspace',
        focus:
          remoteItem?.focus ??
          (snapshot?.activeModules.length
            ? `当前活跃模块：${snapshot.activeModules.slice(0, 3).join(' / ')}`
            : '等待工作区产出与任务数据接入'),
        ownerId: snapshot?.ownerId ?? remoteItem?.ownerId ?? 'system-owner',
        ownerName: snapshot?.ownerName ?? remoteItem?.ownerName ?? 'Workspace Owner',
        members: snapshot?.members ?? remoteItem?.members ?? [],
        viewerPermissions: snapshot?.viewerPermissions ?? remoteItem?.viewerPermissions ?? [],
        canManage: snapshot?.canManage ?? remoteItem?.canManage ?? false,
        status: snapshot?.status ?? remoteItem?.status ?? 'draft',
        updatedAt: snapshot?.updatedAt ?? remoteItem?.updatedAt ?? new Date().toISOString(),
        contributors: remoteItem?.members.length ?? snapshot?.members.length ?? 1,
        snapshot
      }
    })
  }, [byId, directoryQuery.data, options?.activeWorkspaceId, options?.seedWorkspaceIds])
}
