export type KnowledgeStage = 'uploaded' | 'processing' | 'ready' | 'published'

export type KnowledgeSourceType = 'file' | 'web' | 'ai-summary'

export type KnowledgeAction =
  | 'generate-summary'
  | 'create-nodes'
  | 'share-community'
  | 'publish-template'

export type KnowledgeEntry = {
  id: string
  title: string
  stage: KnowledgeStage
  tags: string[]
  type: KnowledgeSourceType
  summary: string
  updatedAt: string
  references: number
  owner: string
  source?: string
  nextActions?: KnowledgeAction[]
}

export type IngestionJob = {
  id: string
  fileName: string
  stage: KnowledgeStage | 'completed'
  progress: number
  submittedAt: string
  owner: string
}

export type InsightLog = {
  id: string
  entryId?: string
  question: string
  generatedAt: string
  summary: string
  actions: string[]
}

export type KbTaskStatus = {
  taskId: string
  workspaceId: string
  kbId: string
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  taskType: 'seed' | 'file' | 'url'
  error?: string | null
  updatedAt: string
  lastEventId: string
}

export type KnowledgeTask = {
  id: string
  workspaceId: string
  kbId: string
  type: 'seed' | 'file' | 'url'
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  payload: Record<string, unknown>
  error?: string | null
  createdAt: string
  updatedAt: string
}

export type KnowledgeBaseSummary = {
  id: string
  workspaceId: string
  name: string
  status: string
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
}

export type KnowledgeBaseStatus = {
  knowledgeBase: KnowledgeBaseSummary
  tasks: KnowledgeTask[]
}
