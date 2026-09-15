'use client'

import { create } from 'zustand'
import type { WorkspaceEntitySnapshot } from './types'

type WorkspaceStoreState = {
  byId: Record<string, WorkspaceEntitySnapshot>
  setWorkspace: (workspace: WorkspaceEntitySnapshot) => void
  clearWorkspace: (workspaceId: string) => void
}

export const useWorkspaceStore = create<WorkspaceStoreState>((set) => ({
  byId: {},
  setWorkspace: (workspace) =>
    set((state) => ({
      byId: {
        ...state.byId,
        [workspace.workspaceId]: workspace
      }
    })),
  clearWorkspace: (workspaceId) =>
    set((state) => {
      const next = { ...state.byId }
      delete next[workspaceId]
      return { byId: next }
    })
}))

export function selectWorkspaceEntity(workspaceId: string) {
  return (state: WorkspaceStoreState) => state.byId[workspaceId] ?? null
}
