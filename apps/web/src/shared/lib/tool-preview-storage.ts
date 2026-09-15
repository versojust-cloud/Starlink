export type ResearchPreviewSnapshot = {
  question: string
  summary: string
  sourceCount: number
  updatedAt: string
}

export type TranslationPreviewSnapshot = {
  source: string
  target: string
  mode: string
  updatedAt: string
}

export type TranslationHistorySnapshot = {
  id: string
  source: string
  target: string
  mode: string
  timestamp: string
}

export function buildResearchPreviewStorageKey(workspaceId: string) {
  return `workspace:${workspaceId}:research-preview`
}

export function buildTranslationPreviewStorageKey(workspaceId: string) {
  return `workspace:${workspaceId}:translation-preview`
}

export function buildTranslationHistoryStorageKey(workspaceId: string) {
  return `workspace:${workspaceId}:translation-history`
}
