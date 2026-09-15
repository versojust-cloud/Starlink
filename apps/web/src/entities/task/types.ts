export type AsyncStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'success'
  | 'error'
  | 'partial'
  | 'canceled'

export type TaskOutputRef = {
  assetId?: string | null
  href?: string | null
  kind?: string | null
}

export type TaskRun<TInput = unknown> = {
  taskId: string
  workspaceId: string
  taskType: string
  input: TInput
  outputRef?: TaskOutputRef | null
  status: AsyncStatus
  progress?: number | null
  startedAt?: string | null
  endedAt?: string | null
  error?: string | null
  retryable: boolean
}
