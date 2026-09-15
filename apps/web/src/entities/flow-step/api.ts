'use client'

import { useEffect, useMemo } from 'react'
import type { AssetEntity } from '@/entities/asset/types'
import type { TaskRun } from '@/entities/task/types'
import { workspaceFlowStages } from '@/lib/workspace-flow'
import { useWorkspaceAssets } from '../asset/api'
import { useWorkspaceTaskRuns } from '../task/api'
import { selectWorkspaceFlowSteps, useFlowStepStore } from './store'
import type { FlowStepReadiness, FlowStepState, FlowStepStatus } from './types'

function latestTimestamp(items: Array<{ updatedAt?: string | null; endedAt?: string | null; startedAt?: string | null }>) {
  return (
    [...items]
      .map((item) => item.updatedAt ?? item.endedAt ?? item.startedAt ?? '')
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0] ?? new Date().toISOString()
  )
}

function resolveState(options: {
  workspaceId: string
  stepKey: string
  assets: AssetEntity[]
  tasks: TaskRun[]
  blockers: string[]
  completeWhen: boolean
  activeWhen: boolean
}): FlowStepState {
  const status: FlowStepStatus = options.completeWhen
    ? 'complete'
    : options.blockers.length > 0 && !options.activeWhen
      ? 'blocked'
      : options.activeWhen
        ? 'active'
        : 'empty'
  const readiness: FlowStepReadiness = options.blockers.length > 0
    ? 'blocked'
    : status === 'empty'
      ? 'waiting'
      : 'ready'

  return {
    stepKey: options.stepKey,
    workspaceId: options.workspaceId,
    status,
    readiness,
    blockers: options.blockers,
    linkedAssets: options.assets.map((asset) => asset.assetId),
    linkedTasks: options.tasks.map((task) => task.taskId),
    lastUpdatedAt: latestTimestamp([...options.assets, ...options.tasks])
  }
}

export function useWorkspaceFlowStepStates(workspaceId: string) {
  const { assets } = useWorkspaceAssets(workspaceId)
  const { taskRuns } = useWorkspaceTaskRuns(workspaceId)

  const stepStates = useMemo<FlowStepState[]>(() => {
    const intakeAssets = assets.filter((asset) => asset.assetType === 'knowledge-base')
    const analysisAssets = assets.filter((asset) => asset.assetType === 'research-brief')
    const modelingAssets = assets.filter((asset) =>
      ['canvas-graph', 'agent-run-result'].includes(asset.assetType)
    )
    const deliveryAssets = assets.filter((asset) =>
      ['seminar-summary', 'practice-output', 'community-post'].includes(asset.assetType)
    )

    return workspaceFlowStages.map((stage) => {
      if (stage.id === 'intake') {
        return resolveState({
          workspaceId,
          stepKey: stage.id,
          assets: intakeAssets,
          tasks: taskRuns,
          blockers: [],
          completeWhen: intakeAssets.length > 0 && taskRuns.some((task) => task.status === 'success'),
          activeWhen:
            intakeAssets.length > 0 ||
            taskRuns.some((task) => ['queued', 'running'].includes(task.status))
        })
      }

      if (stage.id === 'analysis') {
        const blockers = intakeAssets.length === 0 ? ['等待资料归集产出知识资产'] : []
        return resolveState({
          workspaceId,
          stepKey: stage.id,
          assets: analysisAssets,
          tasks: [],
          blockers,
          completeWhen: analysisAssets.length > 0,
          activeWhen: analysisAssets.length > 0
        })
      }

      if (stage.id === 'modeling') {
        const blockers = analysisAssets.length === 0 ? ['等待研究分析沉淀到画布或 Agent'] : []
        return resolveState({
          workspaceId,
          stepKey: stage.id,
          assets: modelingAssets,
          tasks: [],
          blockers,
          completeWhen: modelingAssets.length >= 2,
          activeWhen: modelingAssets.length > 0
        })
      }

      const blockers = modelingAssets.length === 0 ? ['等待方案建模完成后再进入交付协作'] : []
      return resolveState({
        workspaceId,
        stepKey: stage.id,
        assets: deliveryAssets,
        tasks: [],
        blockers,
        completeWhen: deliveryAssets.some((asset) => asset.status === 'ready'),
        activeWhen: deliveryAssets.length > 0
      })
    })
  }, [assets, taskRuns, workspaceId])

  const setWorkspaceFlowSteps = useFlowStepStore((state) => state.setWorkspaceFlowSteps)
  const storedStepStates = useFlowStepStore(selectWorkspaceFlowSteps(workspaceId))

  useEffect(() => {
    setWorkspaceFlowSteps(workspaceId, stepStates)
  }, [setWorkspaceFlowSteps, stepStates, workspaceId])

  return {
    stepStates,
    storedStepStates
  }
}
