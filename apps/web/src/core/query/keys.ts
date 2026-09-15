export const workspaceKeys = {
  all: ['workspace'] as const,
  directory: (viewerId = 'anonymous') => ['workspace', 'directory', viewerId] as const,
  detail: (workspaceId: string) => ['workspace', workspaceId] as const,
  graph: (workspaceId: string) => ['workspace', workspaceId, 'graph'] as const,
  runtime: (workspaceId: string, conversationId?: string | null) =>
    ['workspace', workspaceId, 'runtime', conversationId ?? 'all'] as const,
  assets: (workspaceId: string) => ['workspace', workspaceId, 'assets'] as const,
  history: (workspaceId: string, viewerId = 'anonymous') => ['workspace', workspaceId, 'history', viewerId] as const
}

export const workflowKeys = {
  all: ['workflow'] as const,
  stepStates: (workspaceId: string) => ['workflow', workspaceId, 'step-states'] as const,
  timelineHistory: (workspaceId: string, taskId?: string | null) =>
    ['workflow', workspaceId, 'timeline-history', taskId ?? 'unbound'] as const
}

export const knowledgeKeys = {
  all: ['knowledge'] as const,
  lists: (workspaceId: string) => ['knowledge', workspaceId, 'bases'] as const,
  statusRoot: (workspaceId: string) => ['knowledge', workspaceId, 'base-status'] as const,
  status: (workspaceId: string, kbId: string) => ['knowledge', workspaceId, 'base-status', kbId] as const
}

export const taskKeys = {
  all: ['tasks'] as const,
  byWorkspace: (workspaceId: string) => ['tasks', 'workspace', workspaceId] as const,
  byKnowledgeBase: (workspaceId: string, kbId: string) =>
    ['tasks', 'workspace', workspaceId, 'knowledge-base', kbId] as const
}

export const monitorKeys = {
  all: ['monitor'] as const,
  snapshot: (workspaceId: string) => ['monitor', 'snapshot', workspaceId] as const
}
