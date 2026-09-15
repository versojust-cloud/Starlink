import type { CanvasGraph } from '@starlink/shared'
import type { ConversationRuntimeRepository } from './conversation-runtime-repository.js'
import { loadPersistedGraph, persistCanvasGraph } from './canvas-persistence.js'

export class WorkspaceGraphStore {
  constructor(private readonly runtimeRepository: ConversationRuntimeRepository) {}

  getWorkspaceGraph(workspaceId: string) {
    return this.runtimeRepository.getWorkspaceGraph(workspaceId)
  }

  setWorkspaceGraph(workspaceId: string, graph: CanvasGraph) {
    return this.runtimeRepository.setWorkspaceGraph(workspaceId, graph)
  }

  loadPersistedGraph(workspaceId: string) {
    return loadPersistedGraph(workspaceId)
  }

  /**
   * P12 · Surfaced persistence — let the caller decide how to react to a
   * canvas_graphs upsert failure (publish a warning event, retry, etc).
   * Previously this swallowed all errors into console.error, which hid
   * silent data loss from the UI. Callers in conversation-store.ts wrap
   * this in `persistGraphWithWarning(...)` to publish a 'persistence/warning'
   * event the frontend renders as a yellow ⚠ bubble.
   */
  async persistGraph(graph: CanvasGraph): Promise<void> {
    await persistCanvasGraph(graph)
  }
}
