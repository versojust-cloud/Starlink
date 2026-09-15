/**
 * P15 Sprint 7 · KB binding injector for the @-mention path.
 *
 * Extracted from mention-router.ts. When a user @-mentions an agent that
 * has KB bindings configured (via the agent-binding UI), this helper
 * fetches relevant chunks from those KBs (top-3 per binding, max 5
 * bindings) and merges them into the MentionInput's knowledgeEvidence
 * array before the agent runs. The agent then sees both user-explicit
 * citations and the auto-injected ones uniformly.
 *
 * Best-effort: per-binding fetch failures are logged + swallowed so a
 * single broken KB doesn't tank the whole mention; total fetch failure
 * returns the original input unchanged.
 *
 * Pure function (takes deps inline) — easy to unit-test.
 */

import { createAuditLogger } from '@starlink/shared'
import type { KnowledgeEvidence } from '@starlink/shared'
import { listKbBindingsForAgent, searchKnowledgeBase } from '../kb-task-service.js'

const auditLogger = createAuditLogger('packages/server:mention:kb-binding-injector')

/** Cap total injected chunks so a heavily-bound agent doesn't blow out
 *  the prompt window. */
const PER_BINDING_TOP_K = 3
const MAX_BINDINGS = 5

export type InjectableMentionInput = {
  workspaceId: string
  userId: string
  message: string
  knowledgeEvidence?: KnowledgeEvidence[]
}

/**
 * Inject KB-binding-derived evidence into the mention input.
 * Returns a new MentionInput-shaped object with merged knowledgeEvidence.
 *
 * Idempotent w.r.t. the original input (returned object is a shallow copy
 * with the merged array; original is untouched).
 */
export async function injectKbBindingEvidence<T extends InjectableMentionInput>(
  input: T,
  agentId: string
): Promise<T> {
  try {
    const bindings = await listKbBindingsForAgent(input.workspaceId, agentId, {
      onlyAutoSearch: true
    })
    if (bindings.length === 0) return input

    const targets = bindings.slice(0, MAX_BINDINGS)

    const fetched = await Promise.all(
      targets.map((b) =>
        searchKnowledgeBase(
          input.workspaceId,
          b.kbId,
          input.message,
          PER_BINDING_TOP_K,
          input.userId
        ).catch((err) => {
          auditLogger.warn({
            action: 'mention-router.kb-binding-search-failed',
            workflowId: input.workspaceId,
            userId: input.userId,
            metadata: {
              agentId,
              kbId: b.kbId,
              error: err instanceof Error ? err.message : String(err)
            }
          })
          return [] as KnowledgeEvidence[]
        })
      )
    )
    const merged: KnowledgeEvidence[] = [
      ...(input.knowledgeEvidence ?? []),
      ...fetched.flat()
    ]
    auditLogger.info({
      action: 'mention-router.kb-binding-injected',
      workflowId: input.workspaceId,
      userId: input.userId,
      metadata: {
        agentId,
        bindingCount: targets.length,
        chunkCount: merged.length - (input.knowledgeEvidence?.length ?? 0)
      }
    })
    return { ...input, knowledgeEvidence: merged }
  } catch (err) {
    auditLogger.warn({
      action: 'mention-router.kb-binding-fetch-failed',
      workflowId: input.workspaceId,
      userId: input.userId,
      metadata: { agentId, error: err instanceof Error ? err.message : String(err) }
    })
    return input
  }
}
