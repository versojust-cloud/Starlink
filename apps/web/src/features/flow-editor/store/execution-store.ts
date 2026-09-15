import { create } from 'zustand'

/* ---------- types ---------- */

export type ExecutionStatus = 'idle' | 'running' | 'completed' | 'failed'

export type NodeExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'

export interface NodeExecutionState {
  status: NodeExecutionStatus
  output?: unknown
  error?: string
  duration?: number
  progress?: number
  progressMessage?: string
}

/* ---------- state ---------- */

interface ExecutionState {
  executionId: string | null
  status: ExecutionStatus
  nodeStates: Map<string, NodeExecutionState>

  // actions
  startExecution: (id: string) => void
  onNodeStart: (nodeId: string) => void
  onNodeProgress: (nodeId: string, percent: number, message?: string) => void
  onNodeComplete: (nodeId: string, output: unknown, duration: number) => void
  onNodeError: (nodeId: string, error: string) => void
  onFlowComplete: (status: ExecutionStatus) => void
  reset: () => void
}

/* ---------- helpers ---------- */

function updateNodeState(
  map: Map<string, NodeExecutionState>,
  nodeId: string,
  patch: Partial<NodeExecutionState>,
): Map<string, NodeExecutionState> {
  const next = new Map(map)
  const prev = next.get(nodeId) ?? { status: 'pending' as const }
  next.set(nodeId, { ...prev, ...patch })
  return next
}

/* ---------- store ---------- */

export const useExecutionStore = create<ExecutionState>((set) => ({
  executionId: null,
  status: 'idle',
  nodeStates: new Map(),

  startExecution(id) {
    set({
      executionId: id,
      status: 'running',
      nodeStates: new Map(),
    })
  },

  onNodeStart(nodeId) {
    set((s) => ({
      nodeStates: updateNodeState(s.nodeStates, nodeId, { status: 'running' }),
    }))
  },

  onNodeProgress(nodeId, percent, message) {
    set((s) => ({
      nodeStates: updateNodeState(s.nodeStates, nodeId, {
        progress: percent,
        progressMessage: message,
      }),
    }))
  },

  onNodeComplete(nodeId, output, duration) {
    set((s) => ({
      nodeStates: updateNodeState(s.nodeStates, nodeId, {
        status: 'completed',
        output,
        duration,
      }),
    }))
  },

  onNodeError(nodeId, error) {
    set((s) => ({
      nodeStates: updateNodeState(s.nodeStates, nodeId, {
        status: 'failed',
        error,
      }),
    }))
  },

  onFlowComplete(status) {
    set({ status })
  },

  reset() {
    set({
      executionId: null,
      status: 'idle',
      nodeStates: new Map(),
    })
  },
}))
