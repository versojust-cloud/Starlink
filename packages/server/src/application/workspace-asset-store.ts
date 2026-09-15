import type { WorkspaceAsset } from '@starlink/shared'
import type { ConversationRuntimeRepository } from './conversation-runtime-repository.js'

export class WorkspaceAssetStore {
  constructor(private readonly runtimeRepository: ConversationRuntimeRepository) {}

  upsertWorkspaceAsset(asset: WorkspaceAsset) {
    return this.runtimeRepository.upsertWorkspaceAsset(asset)
  }

  listWorkspaceAssets(workspaceId: string) {
    return this.runtimeRepository.listWorkspaceAssets(workspaceId)
  }
}
