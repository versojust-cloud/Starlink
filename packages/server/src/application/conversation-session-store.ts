import type {
  ConversationRecord,
  ConversationRuntimeRepository,
  PendingApprovalData
} from './conversation-runtime-repository.js'

export class ConversationSessionStore {
  constructor(private readonly runtimeRepository: ConversationRuntimeRepository) {}

  createConversation(id: string, record: ConversationRecord) {
    return this.runtimeRepository.createConversation(id, record)
  }

  updateConversation(id: string, record: ConversationRecord) {
    return this.runtimeRepository.updateConversation(id, record)
  }

  getConversation(id: string) {
    return this.runtimeRepository.getConversation(id)
  }

  getConversationsByWorkspace(workspaceId: string) {
    return this.runtimeRepository.getConversationsByWorkspace(workspaceId)
  }

  setPendingApproval(conversationId: string, data: PendingApprovalData) {
    return this.runtimeRepository.setPendingApproval(conversationId, data)
  }

  getPendingApproval(conversationId: string) {
    return this.runtimeRepository.getPendingApproval(conversationId)
  }

  deletePendingApproval(conversationId: string) {
    return this.runtimeRepository.deletePendingApproval(conversationId)
  }
}
