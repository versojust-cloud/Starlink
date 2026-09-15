'use client'

import { create } from 'zustand'
import type { FlowStepState } from './types'

type FlowStepStoreState = {
  byWorkspace: Record<string, FlowStepState[]>
  setWorkspaceFlowSteps: (workspaceId: string, steps: FlowStepState[]) => void
  clearWorkspaceFlowSteps: (workspaceId: string) => void
}

export const useFlowStepStore = create<FlowStepStoreState>((set) => ({
  byWorkspace: {},
  setWorkspaceFlowSteps: (workspaceId, steps) =>
    set((state) => ({
      byWorkspace: {
        ...state.byWorkspace,
        [workspaceId]: steps
      }
    })),
  clearWorkspaceFlowSteps: (workspaceId) =>
    set((state) => {
      const next = { ...state.byWorkspace }
      delete next[workspaceId]
      return { byWorkspace: next }
    })
}))

export function selectWorkspaceFlowSteps(workspaceId: string) {
  return (state: FlowStepStoreState) => state.byWorkspace[workspaceId] ?? []
}
