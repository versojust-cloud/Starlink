import type { ConversationEvent } from '@starlink/shared'
import { createConversationEventBus } from '../application/conversation-event-bus.js'
import { requireWorkspacePermission, type WorkspaceMetadataRecord } from '../application/workspace-access.js'

async function main() {
  await runPermissionChecks()
  await runScopedSubscriptionChecks()
  console.log('[smoke] access/subscription checks passed')
}

async function runPermissionChecks() {
  const metadata: WorkspaceMetadataRecord = {
    workspaceId: 'proj-001',
    name: 'Smoke Workspace',
    type: 'research-program',
    focus: 'permission checks',
    ownerId: 'lead-alex',
    ownerName: 'Alex Chen',
    members: [
      {
        id: 'lead-alex',
        name: 'Alex Chen',
        role: 'owner',
        permissions: ['workspace.read', 'workspace.write', 'workspace.publish', 'workspace.manage']
      },
      {
        id: 'analyst-sarah',
        name: 'Sarah Lee',
        role: 'analyst',
        permissions: ['workspace.read']
      }
    ]
  }

  requireWorkspacePermission('lead-alex', metadata, 'workspace.manage')
  requireWorkspacePermission('lead-alex', metadata, 'workspace.publish')
  requireWorkspacePermission('analyst-sarah', metadata, 'workspace.read')

  let blocked = false
  try {
    requireWorkspacePermission('analyst-sarah', metadata, 'workspace.write')
  } catch (error) {
    blocked = error instanceof Error && error.message === 'FORBIDDEN_WORKSPACE'
  }

  if (!blocked) {
    throw new Error('permission smoke failed: viewer without write permission was not blocked')
  }
}

async function runScopedSubscriptionChecks() {
  process.env.CONVERSATION_EVENT_BUS_DRIVER = 'memory'
  const bus = createConversationEventBus()

  const workspaceOnlyIterator = bus.getEventIterator({ workspaceId: 'proj-001' })
  const conversationIterator = bus.getEventIterator({
    workspaceId: 'proj-001',
    conversationId: 'conv-keep'
  })

  const keepEvent: ConversationEvent = {
    type: 'phase.changed',
    conversationId: 'conv-keep',
    payload: {
      workspaceId: 'proj-001',
      phase: 'planning',
      reason: 'smoke',
      occurredAt: new Date().toISOString()
    }
  }
  const wrongConversationEvent: ConversationEvent = {
    type: 'status',
    conversationId: 'conv-skip',
    status: 'completed'
  }
  const wrongWorkspaceEvent: ConversationEvent = {
    type: 'status',
    conversationId: 'conv-other',
    status: 'completed'
  }

  const workspaceNext = workspaceOnlyIterator[Symbol.asyncIterator]().next()
  const conversationNext = conversationIterator[Symbol.asyncIterator]().next()

  await bus.publish('proj-002', wrongWorkspaceEvent)
  await bus.publish('proj-001', wrongConversationEvent)
  await bus.publish('proj-001', keepEvent)

  const [workspaceResult, conversationResult] = await Promise.all([workspaceNext, conversationNext])
  const workspacePayload = workspaceResult.value?.conversationProgress
  const conversationPayload = conversationResult.value?.conversationProgress

  if (workspacePayload?.conversationId !== 'conv-skip') {
    throw new Error(`subscription smoke failed: expected workspace iterator to receive conv-skip, got ${workspacePayload?.conversationId}`)
  }

  if (conversationPayload?.conversationId !== 'conv-keep') {
    throw new Error(`subscription smoke failed: expected conversation iterator to receive conv-keep, got ${conversationPayload?.conversationId}`)
  }

  if (conversationPayload?.type !== 'phase.changed') {
    throw new Error(`subscription smoke failed: expected scoped iterator event type=phase.changed, got ${conversationPayload?.type}`)
  }

  await closeIterator(workspaceOnlyIterator)
  await closeIterator(conversationIterator)
  await bus.close()
}

async function closeIterator(iterator: AsyncIterable<unknown>) {
  const asyncIterator = iterator[Symbol.asyncIterator]()
  await asyncIterator.return?.(undefined)
}

main().catch((error) => {
  console.error('[smoke] access/subscription failed', error)
  process.exit(1)
})
