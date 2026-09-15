import type { ConversationEvent } from '@starlink/shared'
import type { ConversationEventBus, ConversationEventFilter } from './conversation-event-bus.js'
import type { ConversationRuntimeRepository } from './conversation-runtime-repository.js'

export class RuntimeEventStore {
  constructor(
    private readonly runtimeRepository: ConversationRuntimeRepository,
    private readonly eventBus: ConversationEventBus
  ) {}

  appendConversationEvent(workspaceId: string, event: ConversationEvent) {
    return this.runtimeRepository.appendConversationEvent(workspaceId, event)
  }

  listConversationEvents(workspaceId: string, conversationId?: string) {
    return this.runtimeRepository.listConversationEvents(workspaceId, conversationId)
  }

  publish(workspaceId: string, event: ConversationEvent) {
    return this.eventBus.publish(workspaceId, event)
  }

  getEventIterator(filter: ConversationEventFilter) {
    return this.eventBus.getEventIterator(filter)
  }
}
