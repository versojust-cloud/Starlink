export type WorkspaceStatus = 'draft' | 'active' | 'archived' | 'provisioning' | 'error'

export type WorkspaceModuleId =
  | 'knowledge'
  | 'translate'
  | 'deep-research'
  | 'insights'
  | 'experts'
  | 'macra'
  | 'flow'
  | 'canvas'
  | 'comfy'
  | 'agents'
  | 'seminar'
  | 'cultural-tools'
  | 'community'
  | 'practice'
  | 'monitor'
  | (string & {})

export type WorkspacePermission =
  | 'workspace.read'
  | 'workspace.write'
  | 'workspace.publish'
  | 'workspace.manage'
  | 'workspace.share'
  | (string & {})

export type WorkspaceMember = {
  id: string
  name: string
  role?: string
  permissions: WorkspacePermission[]
}

export type WorkspaceEntity = {
  workspaceId: string
  name: string
  type: string
  focus: string
  ownerId: string
  ownerName: string
  members: WorkspaceMember[]
  viewerPermissions: WorkspacePermission[]
  canManage: boolean
  currentFlow: string
  activeModules: WorkspaceModuleId[]
  permissions: WorkspacePermission[]
  status: WorkspaceStatus
  createdAt: string
  updatedAt: string
}

export type WorkspaceEntitySnapshot = WorkspaceEntity & {
  currentStageId: string
  recommendedFlowKey: string
  recommendedHref: string
  progress: number
  blockers: string[]
  counts: {
    assets: number
    tasks: number
    completedSteps: number
    totalSteps: number
  }
}
