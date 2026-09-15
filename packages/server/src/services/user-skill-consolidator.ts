/**
 * UserSkillConsolidator (Layer-2 self-evolution, 2026-04-28).
 *
 * Periodically reviews ALL active user-skill rows for a single user and
 * proposes:
 *
 *   - merges: 2-5 redundant skills collapse into 1 (archive sources,
 *             create the merged replacement)
 *   - splits: 1 bundled skill breaks into 2-3 orthogonal traits
 *             (archive source, create each part)
 *
 * Triggered conditionally by `UserSkillExtractor` after a normal extraction
 * pass — only when the user's active skill count crosses
 * `USER_SKILL_CONSOLIDATE_THRESHOLD` (default 15). Until that threshold,
 * the extractor's `creates / updates / refines / decays` is enough to keep
 * the table tidy. Above the threshold, redundancy + bundling start to
 * dilute the rendered userSkillBlock (which only surfaces top-K).
 *
 * Failure modes are logged + swallowed. The all-or-nothing parser
 * (no per-item recovery) prevents partial-apply hazards: a half-applied
 * merge would archive sources without inserting the replacement.
 */

import {
  USER_SKILL_CONSOLIDATION_SYSTEM_PROMPT,
  buildUserSkillConsolidationUserMessage,
  parseUserSkillConsolidationReplyDetailed,
  type UserSkillConsolidationInput,
  createAuditLogger
} from '@starlink/shared'
import { LLMClient } from './llm-client.js'
import type {
  ConversationMemoryStore,
  UpsertMemoryInput
} from '../application/conversation-memory-store.js'

const auditLogger = createAuditLogger('packages/server:services:user-skill-consolidator')

interface ConsolidateParams {
  userId: string
  workspaceId: string
  traceId: string
}

const DEFAULT_THRESHOLD = 15
function getThreshold(): number {
  return Math.max(2, Number(process.env.USER_SKILL_CONSOLIDATE_THRESHOLD ?? DEFAULT_THRESHOLD))
}

/**
 * Process-local cache so we don't trigger consolidation on every extractor
 * pass that happens to see ≥ threshold skills. Once consolidation runs for
 * a user, suppress for `cooldownMs` (default 1 hour) — enough time for
 * meaningful new evidence to accumulate.
 */
const lastRun = new Map<string, number>()
const COOLDOWN_MS = 60 * 60 * 1000

export class UserSkillConsolidator {
  private readonly llm: LLMClient
  private readonly memoryStore: ConversationMemoryStore

  constructor(args: { memoryStore: ConversationMemoryStore; llm?: LLMClient }) {
    this.memoryStore = args.memoryStore
    this.llm = args.llm ?? new LLMClient()
  }

  /**
   * Returns count of changes applied (merges archived + merged created +
   * splits archived + parts created). 0 means no-op (cooldown / under
   * threshold / LLM rejected). Never throws.
   */
  async consolidate(params: ConsolidateParams): Promise<number> {
    try {
      // Cooldown check.
      const lastAt = lastRun.get(params.userId) ?? 0
      const since = Date.now() - lastAt
      if (lastAt > 0 && since < COOLDOWN_MS) {
        return 0
      }

      // Pull all active skills for this user across both layers.
      const allSkills = await this.memoryStore.searchUserSkills(
        params.userId,
        params.workspaceId,
        { limit: 50 }
      )
      const active = allSkills.filter((s) => s.confidence >= 0.5)
      const threshold = getThreshold()
      if (active.length < threshold) {
        return 0
      }

      // Mark cooldown UPFRONT — even if the LLM call fails, we don't want
      // to retry consolidation on every subsequent extraction trigger.
      lastRun.set(params.userId, Date.now())

      const llmInput: UserSkillConsolidationInput = {
        userId: params.userId,
        activeSkills: active.slice(0, 40).map((s) => ({
          id: s.id,
          scope: (s.scope === 'user' ? 'user' : 'workspace') as 'user' | 'workspace',
          title: s.title,
          content: s.content,
          confidence: s.confidence,
          importance: s.importance,
          tags: s.tags
        }))
      }

      const response = await this.llm.chat({
        messages: [
          { role: 'system', content: USER_SKILL_CONSOLIDATION_SYSTEM_PROMPT },
          { role: 'user', content: buildUserSkillConsolidationUserMessage(llmInput) }
        ],
        temperature: 0.2
      })

      const parseResult = parseUserSkillConsolidationReplyDetailed(response.content ?? '')
      if (!parseResult.ok || !parseResult.data) {
        auditLogger.warn({
          action: 'user-skill-consolidator.parse-failed',
          userId: params.userId,
          metadata: {
            traceId: params.traceId,
            reason: parseResult.reason,
            issues: parseResult.issues ?? null,
            preview: parseResult.rawPreview ?? (response.content ?? '').slice(0, 200)
          }
        })
        return 0
      }
      const { merges, splits } = parseResult.data

      // Defence: if the LLM proposes both a merge AND a split touching the
      // same source, drop the conflicting entry (cf. consolidation rule
      // #3 in the system prompt — repeated here at runtime).
      const splitSourceIds = new Set(splits.map((s) => s.sourceId))
      const safeMerges = merges.filter(
        (m) => !m.sourceIds.some((id) => splitSourceIds.has(id))
      )

      let applied = 0

      // Apply merges: insert merged FIRST, then archive sources, so a
      // mid-flight failure leaves the user with both old + new (better
      // than archived sources without a replacement).
      for (const m of safeMerges) {
        const sources = active.filter((s) => m.sourceIds.includes(s.id))
        if (sources.length < 2) continue
        const targetWorkspaceId =
          m.merged.scope === 'user'
            ? sources[0].workspaceId // arbitrary; consumers don't filter on it for scope='user'
            : params.workspaceId
        const observedEvidence = Array.from(
          new Set(
            sources.flatMap((s) => {
              const oe = (s.metadata?.observedEvidence as string[] | undefined) ?? []
              return Array.isArray(oe) ? oe : []
            })
          )
        ).slice(-20)

        const input: UpsertMemoryInput = {
          workspaceId: targetWorkspaceId,
          userId: params.userId,
          scope: m.merged.scope,
          kind: 'user-skill',
          title: m.merged.title,
          content: m.merged.content,
          sourceType: 'user-skill-consolidator-merge',
          sourceId: `${params.traceId}#merge#${sources[0].id}`,
          // Confidence + importance: take MAX of sources, not the LLM's
          // suggestion. Corroboration strengthens; we don't trust the LLM
          // to assign confidence above what evidence supports.
          importance: Math.max(...sources.map((s) => s.importance)),
          confidence: Math.max(...sources.map((s) => s.confidence)),
          tags: Array.from(new Set([...m.merged.tags, ...sources.flatMap((s) => s.tags)])).slice(0, 8),
          metadata: {
            observedEvidence,
            lastReinforcedAt: new Date().toISOString(),
            confidenceTrend: [Math.max(...sources.map((s) => s.confidence))],
            consolidationOrigin: {
              kind: 'merge',
              sourceIds: sources.map((s) => s.id),
              reason: m.reason,
              at: new Date().toISOString()
            }
          }
        }
        await this.memoryStore.upsertMemory(input)
        applied++
        for (const s of sources) {
          await this.memoryStore.archiveMemory(s.id)
          applied++
        }
      }

      // Apply splits: same insert-then-archive ordering.
      for (const sp of splits) {
        const source = active.find((s) => s.id === sp.sourceId)
        if (!source) continue
        const sourceEvidence = Array.isArray(source.metadata?.observedEvidence)
          ? (source.metadata.observedEvidence as string[])
          : []
        for (const [idx, part] of sp.parts.entries()) {
          const targetWorkspaceId =
            part.scope === 'user' ? source.workspaceId : params.workspaceId
          const input: UpsertMemoryInput = {
            workspaceId: targetWorkspaceId,
            userId: params.userId,
            scope: part.scope,
            kind: 'user-skill',
            title: part.title,
            content: part.content,
            sourceType: 'user-skill-consolidator-split',
            sourceId: `${params.traceId}#split#${source.id}#${idx}`,
            // Each split part inherits the source's confidence — splitting
            // doesn't multiply evidence, it just disambiguates it.
            importance: source.importance,
            confidence: Math.max(part.confidence, 0.5),
            tags: part.tags.slice(0, 8),
            metadata: {
              observedEvidence: sourceEvidence,
              lastReinforcedAt: new Date().toISOString(),
              confidenceTrend: [source.confidence],
              consolidationOrigin: {
                kind: 'split',
                sourceId: source.id,
                partIndex: idx,
                reason: sp.reason,
                at: new Date().toISOString()
              }
            }
          }
          await this.memoryStore.upsertMemory(input)
          applied++
        }
        await this.memoryStore.archiveMemory(source.id)
        applied++
      }

      auditLogger.info({
        action: 'user-skill-consolidator.applied',
        userId: params.userId,
        metadata: {
          traceId: params.traceId,
          inputSkillCount: active.length,
          counts: {
            merges: safeMerges.length,
            splits: splits.length,
            droppedConflicts: merges.length - safeMerges.length
          }
        }
      })

      return applied
    } catch (error) {
      auditLogger.warn({
        action: 'user-skill-consolidator.failed',
        userId: params.userId,
        metadata: {
          traceId: params.traceId,
          message: error instanceof Error ? error.message : String(error)
        }
      })
      return 0
    }
  }

  /** Test-only: clear cooldown so back-to-back smokes against same userId
   *  fire real LLM calls. */
  static resetCooldownForTesting(userId?: string): void {
    if (userId) lastRun.delete(userId)
    else lastRun.clear()
  }
}
