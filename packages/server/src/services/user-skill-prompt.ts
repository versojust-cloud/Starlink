/**
 * User-skill prompt builder (standalone).
 *
 * Shared between the BMC-generator path (BusinessLangGraphService) and the
 * coach/wizard path (GraphQL resolver, Next.js API route). Both need the
 * same "fetch user-skill memories → render markdown block" pipeline; this
 * keeps it in one place so the rendering format stays consistent.
 *
 * Returns '' when:
 *   - userId or workspaceId missing
 *   - DB query throws (e.g. no PG, benchmark mode)
 *   - no skills passed the confidence threshold
 *
 * Empty string is the safe default — downstream prompt builders skip the
 * section entirely when the block is empty.
 */

import { renderUserSkillBlock } from '@starlink/shared'
import type { ConversationMemoryStore } from '../application/conversation-memory-store.js'

/** Confidence threshold for inclusion in the rendered block. */
const CONF_THRESHOLD = 0.5
/** Top-K rendered (after threshold filter, after rank). */
const TOP_K = 5

export async function buildUserSkillPrompt(
  store: ConversationMemoryStore,
  userId: string,
  workspaceId: string,
  query: string
): Promise<string> {
  if (!userId || !workspaceId) return ''
  try {
    const skills = await store.searchUserSkills(userId, workspaceId, {
      query,
      limit: 10
    })
    const filtered = skills
      .filter((s) => s.confidence >= CONF_THRESHOLD)
      .slice(0, TOP_K)
      .map((s) => ({
        title: s.title,
        content: s.content,
        confidence: s.confidence,
        scope: (s.scope === 'user' ? 'user' : 'workspace') as 'user' | 'workspace',
        tags: s.tags
      }))
    return renderUserSkillBlock(filtered)
  } catch {
    return ''
  }
}
