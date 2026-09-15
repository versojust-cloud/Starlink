'use client'

import { create } from 'zustand'
import type { TaskRun } from './types'

type TaskStoreState = {
  byWorkspace: Record<string, TaskRun[]>
  setWorkspaceTasks: (workspaceId: string, tasks: TaskRun[]) => void
  clearWorkspaceTasks: (workspaceId: string) => void
}

export const useTaskStore = create<TaskStoreState>((set) => ({
  byWorkspace: {},
  setWorkspaceTasks: (workspaceId, tasks) =>
    set((state) => ({
      byWorkspace: {
        ...state.byWorkspace,
        [workspaceId]: tasks
      }
    })),
  clearWorkspaceTasks: (workspaceId) =>
    set((state) => {
      const next = { ...state.byWorkspace }
      delete next[workspaceId]
      return { byWorkspace: next }
    })
}))

export function selectWorkspaceTasks(workspaceId: string) {
  return (state: TaskStoreState) => state.byWorkspace[workspaceId] ?? []
}
