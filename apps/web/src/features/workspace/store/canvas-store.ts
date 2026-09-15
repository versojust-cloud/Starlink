'use client'

import { create } from 'zustand'
import type { TimelineIteration } from '@/types/timeline'

type Panel = 'documents' | 'assistant' | 'templates'

type CanvasState = {
  zoom: number
  activePanels: Set<Panel>
  taskId?: string
  iterations: TimelineIteration[]
  togglePanel: (panel: Panel) => void
  setZoom: (zoom: number) => void
  setTaskId: (taskId: string) => void
  setIterations: (iterations: TimelineIteration[]) => void
  addIteration: (iteration: TimelineIteration) => void
}

export const useCanvasStore = create<CanvasState>((set) => ({
  zoom: 1,
  activePanels: new Set<Panel>(['documents', 'assistant']),
  taskId: undefined,
  iterations: [],
  togglePanel: (panel) =>
    set((state) => {
      const next = new Set(state.activePanels)
      if (next.has(panel)) {
        next.delete(panel)
      } else {
        next.add(panel)
      }
      return { activePanels: next }
    }),
  setZoom: (zoom) => set({ zoom }),
  setTaskId: (taskId) => set({ taskId }),
  setIterations: (iterations) => set({ iterations }),
  addIteration: (iteration) =>
    set((state) => {
      const existingIndex = state.iterations.findIndex((item) => item.id === iteration.id)
      if (existingIndex !== -1) {
        const updated = [...state.iterations]
        updated[existingIndex] = iteration
        return { iterations: updated }
      }
      return { iterations: [...state.iterations, iteration] }
    })
}))

export type CanvasStore = CanvasState
