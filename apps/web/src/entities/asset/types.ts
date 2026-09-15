export type AssetStatus = 'draft' | 'processing' | 'ready' | 'published' | 'archived' | 'error'

export type AssetType =
  | 'research-brief'
  | 'translated-doc'
  | 'insight-report'
  | 'chart-config'
  | 'canvas-graph'
  | 'agent-run-result'
  | 'seminar-summary'
  | 'practice-output'
  | 'community-post'
  | (string & {})

export type AssetEntity<TContent = unknown> = {
  assetId: string
  workspaceId: string
  assetType: AssetType
  title: string
  sourceModule: string
  sourceTaskId?: string | null
  metadata: Record<string, unknown>
  content: TContent
  version: number
  status: AssetStatus
  createdBy: string
  createdAt: string
  updatedAt: string
}
