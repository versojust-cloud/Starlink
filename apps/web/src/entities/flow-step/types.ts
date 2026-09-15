export type FlowStepStatus = 'empty' | 'active' | 'complete' | 'blocked'

export type FlowStepReadiness = 'ready' | 'waiting' | 'blocked'

export type FlowStepState = {
  stepKey: string
  workspaceId: string
  status: FlowStepStatus
  readiness: FlowStepReadiness
  blockers: string[]
  linkedAssets: string[]
  linkedTasks: string[]
  lastUpdatedAt: string
}
