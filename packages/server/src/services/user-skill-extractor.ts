/**
 * UserSkillExtractor — async LLM-driven extraction of durable user traits
 * from recent conversation summaries (2026-04-28).
 *
 * Triggered fire-and-forget at the tail of `writeConversationSummary` in
 * `business-langgraph.ts`. Reads recent cross-workspace summaries + existing
 * skills for the user, calls DeepSeek with the prompts in
 * `@starlink/shared/user-skill`, applies the parsed result via
 * `ConversationMemoryStore.upsertMemory` / archive helpers.
 *
 * Output shape from the LLM is parsed by `parseUserSkillExtractionReply`:
 *   { creates, updates, refines, decays }
 *
 * Layer-1 self-evolution: `refines` rewrites existing skill title/content
 * and appends the prior text to `metadata.revisionTrend` so the audit
 * trail keeps every revision.
 *
 * P3 · Three-tier trigger (replaces simple throttle):
 *   - eager:      first N sessions (default 5) → extract every time
 *                 (fast cold-start so AI learns the user quickly)
 *   - throttled:  after threshold → only every Mth (default 3)
 *                 (controls LLM cost on power users)
 *   - demand:     explicit user-driven via mode='demand' (e.g. UI
 *                 "立即更新画像" button) → always extract
 *
 * Trigger mode env knobs:
 *   USER_SKILL_EAGER_MAX_SESSIONS  default 5
 *   USER_SKILL_EXTRACT_EVERY_N     default 3
 */

import {
  USER_SKILL_SYSTEM_PROMPT,
  buildUserSkillUserMessage,
  parseUserSkillExtractionReplyDetailed,
  type UserSkillExtractionInput,
  createAuditLogger
} from '@starlink/shared'
import { LLMClient } from './llm-client.js'
import type {
  ConversationMemoryStore,
  UpsertMemoryInput
} from '../application/conversation-memory-store.js'
import { UserSkillConsolidator } from './user-skill-consolidator.js'

const auditLogger = createAuditLogger('packages/server:services:user-skill-extractor')

/**
 * Trigger mode — passed by callers to override automatic tier selection.
 *   - 'auto'     (default) decide tier from session count
 *   - 'eager'    bypass throttle (e.g. cold-start fallback when count
 *                lookup fails)
 *   - 'demand'   explicit user request from UI; always extract
 *   - 'throttled' force throttled even on cold-start (testing only)
 */
export type ExtractTriggerMode = 'auto' | 'eager' | 'demand' | 'throttled'

interface ExtractParams {
  userId: string
  workspaceId: string
  traceId: string
  /** Trigger mode override; defaults to 'auto' for tier-based selection. */
  mode?: ExtractTriggerMode
}

const callCounter = new Map<string, number>()
const EXTRACT_EVERY_N = Math.max(1, Number(process.env.USER_SKILL_EXTRACT_EVERY_N ?? '3'))
const EAGER_MAX_SESSIONS = Math.max(0, Number(process.env.USER_SKILL_EAGER_MAX_SESSIONS ?? '5'))

export class UserSkillExtractor {
  private readonly llm: LLMClient
  private readonly memoryStore: ConversationMemoryStore
  private readonly consolidator: UserSkillConsolidator

  constructor(args: {
    memoryStore: ConversationMemoryStore
    llm?: LLMClient
    consolidator?: UserSkillConsolidator
  }) {
    this.memoryStore = args.memoryStore
    this.llm = args.llm ?? new LLMClient()
    this.consolidator =
      args.consolidator ??
      new UserSkillConsolidator({ memoryStore: this.memoryStore, llm: this.llm })
  }

  /**
   * Fire-and-forget extraction. Caller must wrap in `void` + `.catch()`;
   * this method never throws (errors are logged + swallowed). Returns the
   * count of changes applied (0 if throttled or empty extraction).
   *
   * P3 · Trigger tier:
   *   - mode='demand' → always run (user clicked "refresh my profile")
   *   - mode='eager'  → always run (cold-start override)
   *   - mode='throttled' → only every Nth call (power-user mode)
   *   - mode='auto' (default):
   *       - sessions < EAGER_MAX_SESSIONS → eager (fast cold-start)
   *       - sessions ≥ EAGER_MAX_SESSIONS → throttled
   *
   * If the session count lookup fails, fall back to throttled — better
   * to under-extract than to flood the LLM during a transient DB issue.
   */
  async extractUserSkills(params: ExtractParams): Promise<number> {
    try {
      const mode: ExtractTriggerMode = params.mode ?? 'auto'

      // Decide effective tier.
      let tier: 'extract' | 'skip' = 'skip'
      if (mode === 'demand' || mode === 'eager') {
        tier = 'extract'
      } else {
        // For 'auto' / 'throttled', consult session count + global counter.
        let useEager = false
        if (mode === 'auto') {
          try {
            const completed = await this.memoryStore.countCompletedSessionsForUser(params.userId)
            useEager = completed < EAGER_MAX_SESSIONS
          } catch (err) {
            auditLogger.warn({
              action: 'user-skill-extractor.session-count-failed',
              userId: params.userId,
              metadata: {
                traceId: params.traceId,
                error: err instanceof Error ? err.message : String(err)
              }
            })
            useEager = false
          }
        }
        if (useEager) {
          tier = 'extract'
        } else {
          // Throttled: every Nth call per user does real work.
          const prev = callCounter.get(params.userId) ?? 0
          callCounter.set(params.userId, prev + 1)
          if ((prev + 1) % EXTRACT_EVERY_N === 0) {
            tier = 'extract'
          }
        }
      }

      if (tier === 'skip') return 0

      auditLogger.info({
        action: 'user-skill-extractor.tier-selected',
        userId: params.userId,
        metadata: {
          mode,
          traceId: params.traceId
        }
      })

      const summaries = await this.memoryStore.listUserSummaries(params.userId, 5)
      if (summaries.length === 0) {
        // P12 fix L · symmetric completion log so frontend doesn't see
        // tier-selected without a paired terminal event. The early-exit
        // path was previously silent; on-demand refresh callers (e.g.
        // /memory panel "立即更新") had no way to distinguish "still
        // running" from "ran and found nothing".
        auditLogger.info({
          action: 'user-skill-extractor.completed',
          userId: params.userId,
          metadata: {
            mode,
            traceId: params.traceId,
            reason: 'no-recent-summaries',
            applied: 0
          }
        })
        return 0
      }
      const existing = await this.memoryStore.searchUserSkills(
        params.userId,
        params.workspaceId,
        { limit: 20 }
      )

      const llmInput: UserSkillExtractionInput = {
        userId: params.userId,
        recentConversationSummaries: summaries.map((m) => ({
          traceId: typeof m.metadata?.traceId === 'string' ? m.metadata.traceId : m.id,
          workspaceId: m.workspaceId,
          summary: m.content,
          createdAt: m.createdAt
        })),
        existingSkills: existing.map((m) => ({
          id: m.id,
          scope: (m.scope === 'user' ? 'user' : 'workspace') as 'user' | 'workspace',
          title: m.title,
          content: m.content,
          confidence: m.confidence,
          tags: m.tags
        }))
      }

      const response = await this.llm.chat({
        messages: [
          { role: 'system', content: USER_SKILL_SYSTEM_PROMPT },
          { role: 'user', content: buildUserSkillUserMessage(llmInput) }
        ],
        temperature: 0.2
      })

      const parseResult = parseUserSkillExtractionReplyDetailed(response.content ?? '')
      if (!parseResult.ok || !parseResult.data) {
        auditLogger.warn({
          action: 'user-skill-extractor.parse-failed',
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
      const parsed = parseResult.data

      let applied = 0
      // ---- creates ----
      for (const [idx, c] of parsed.creates.entries()) {
        const input: UpsertMemoryInput = {
          workspaceId: c.scope === 'workspace' ? params.workspaceId : params.workspaceId,
          userId: params.userId,
          scope: c.scope,
          kind: 'user-skill',
          title: c.title,
          content: c.content,
          sourceType: 'user-skill-extractor',
          // Differentiate per-create so upsert dedup-by-source doesn't
          // collapse multiple skills from the same extraction pass into
          // one row. Each new skill needs its own row identity.
          sourceId: `${params.traceId}#${idx}`,
          importance: c.importance,
          confidence: c.confidence,
          tags: c.tags,
          metadata: {
            observedEvidence: c.observedEvidence,
            lastReinforcedAt: new Date().toISOString(),
            confidenceTrend: [c.confidence],
            revisionTrend: []
          }
        }
        await this.memoryStore.upsertMemory(input)
        applied++
      }

      // ---- updates: bump confidence + add evidence ----
      for (const u of parsed.updates) {
        const target = existing.find((m) => m.id === u.id)
        if (!target) continue
        const prevConfTrend = Array.isArray(target.metadata?.confidenceTrend)
          ? (target.metadata.confidenceTrend as number[])
          : []
        const evidence = Array.isArray(target.metadata?.observedEvidence)
          ? ([...(target.metadata.observedEvidence as string[])] as string[])
          : []
        if (u.addEvidence && !evidence.includes(u.addEvidence)) {
          evidence.push(u.addEvidence)
        }
        const newConf = clamp01(target.confidence + u.confidenceDelta)
        await this.memoryStore.upsertMemory({
          id: target.id,
          workspaceId: target.workspaceId,
          userId: target.userId,
          scope: target.scope,
          kind: 'user-skill',
          title: target.title,
          content: target.content,
          sourceType: target.sourceType,
          sourceId: target.sourceId,
          importance: target.importance,
          confidence: newConf,
          tags: target.tags,
          metadata: {
            ...target.metadata,
            observedEvidence: evidence.slice(-20),
            lastReinforcedAt: new Date().toISOString(),
            confidenceTrend: [...prevConfTrend, newConf].slice(-10)
          }
        })
        applied++
      }

      // ---- refines (Layer-1 self-evolution): rewrite title/content ----
      for (const r of parsed.refines) {
        const target = existing.find((m) => m.id === r.id)
        if (!target) continue
        const prevTrend = Array.isArray(target.metadata?.revisionTrend)
          ? (target.metadata.revisionTrend as Array<Record<string, unknown>>)
          : []
        const newTitle = r.newTitle ?? target.title
        const newContent = r.newContent ?? target.content
        if (newTitle === target.title && newContent === target.content) continue
        await this.memoryStore.upsertMemory({
          id: target.id,
          workspaceId: target.workspaceId,
          userId: target.userId,
          scope: target.scope,
          kind: 'user-skill',
          title: newTitle,
          content: newContent,
          sourceType: target.sourceType,
          sourceId: target.sourceId,
          importance: target.importance,
          confidence: target.confidence,
          tags: target.tags,
          metadata: {
            ...target.metadata,
            revisionTrend: [
              ...prevTrend,
              {
                from: { title: target.title, content: target.content },
                to: { title: newTitle, content: newContent },
                reason: r.reason,
                at: new Date().toISOString()
              }
            ].slice(-10)
          }
        })
        applied++
      }

      // ---- decays: archive ----
      for (const d of parsed.decays) {
        const target = existing.find((m) => m.id === d.id)
        if (!target) continue
        await this.memoryStore.archiveMemory(target.id)
        applied++
      }

      auditLogger.info({
        action: 'user-skill-extractor.applied',
        userId: params.userId,
        metadata: {
          traceId: params.traceId,
          counts: {
            creates: parsed.creates.length,
            updates: parsed.updates.length,
            refines: parsed.refines.length,
            decays: parsed.decays.length
          }
        }
      })

      // Layer-2 self-evolution trigger. The consolidator's own threshold
      // check (USER_SKILL_CONSOLIDATE_THRESHOLD, default 15) + cooldown
      // (1h per user) gate whether real LLM work fires; calling
      // unconditionally is cheap. Errors are swallowed inside
      // `consolidate()` so an extractor success never gets reverted by
      // a downstream consolidator failure.
      const consolidated = await this.consolidator.consolidate({
        userId: params.userId,
        workspaceId: params.workspaceId,
        traceId: params.traceId
      })
      if (consolidated > 0) {
        auditLogger.info({
          action: 'user-skill-extractor.consolidator-applied',
          userId: params.userId,
          metadata: { traceId: params.traceId, changes: consolidated }
        })
      }

      // P3 · Cross-workspace promote pass.
      // When the SAME user-skill title appears in ≥ N (default 3)
      // distinct workspaces with scope='workspace', it represents a
      // durable trait of the user — not idea-specific noise. Promote
      // by inserting one scope='user' row (workspace_id=NULL) and
      // archiving the workspace duplicates. This is what makes the
      // Memory drawer "个人画像" tab populated with real cross-idea
      // traits over time.
      const promoted = await this.maybeCrossWorkspacePromote(params.userId).catch((err) => {
        auditLogger.warn({
          action: 'user-skill-extractor.promote-failed',
          userId: params.userId,
          metadata: {
            traceId: params.traceId,
            error: err instanceof Error ? err.message : String(err)
          }
        })
        return 0
      })
      if (promoted > 0) {
        auditLogger.info({
          action: 'user-skill-extractor.cross-workspace-promoted',
          userId: params.userId,
          metadata: { traceId: params.traceId, count: promoted }
        })
      }

      return applied + consolidated + promoted
    } catch (error) {
      auditLogger.warn({
        action: 'user-skill-extractor.outer-failed',
        userId: params.userId,
        metadata: {
          traceId: params.traceId,
          message: error instanceof Error ? error.message : String(error)
        }
      })
      return 0
    }
  }

  /**
   * P3 · Cross-workspace promote.
   *
   * Scans all scope='workspace' user-skill rows for this user, groups
   * by normalised title, and promotes any title that appears in ≥
   * CROSS_WORKSPACE_PROMOTE_THRESHOLD distinct workspaces.
   *
   * Promotion = insert one scope='user' row (workspace_id=NULL)
   * combining the highest-confidence variant + an aggregated
   * observedEvidence; the per-workspace rows are kept (they carry
   * idea-specific context) but the global row appears in the
   * Memory drawer "个人画像" tab.
   *
   * Idempotent: if a global row with the same title already exists
   * for the user, this method bumps its confidence + extends its
   * observedEvidence rather than inserting a duplicate.
   */
  private async maybeCrossWorkspacePromote(userId: string): Promise<number> {
    // Fetch ALL non-archived user-skill rows for this user across all
    // workspaces (and any scope='user' globals). limit=200 is plenty —
    // extractor caps creates per call so the user's total skill count
    // grows slowly. listAllUserSkillsForUser is the cross-workspace
    // analogue of searchUserSkills (which is bound to one workspace).
    const all = await this.memoryStore.listAllUserSkillsForUser(userId, 200)
    if (all.length === 0) return 0

    // Group by normalised title — case-insensitive trim, collapse whitespace.
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
    const buckets = new Map<string, typeof all>()
    for (const m of all) {
      if (m.scope !== 'workspace') continue
      const key = norm(m.title)
      const arr = buckets.get(key) ?? []
      arr.push(m)
      buckets.set(key, arr)
    }

    let promoted = 0
    for (const [key, rows] of buckets.entries()) {
      const distinctWorkspaces = new Set(rows.map((r) => r.workspaceId))
      if (distinctWorkspaces.size < CROSS_WORKSPACE_PROMOTE_THRESHOLD) continue

      // Pick the highest-confidence variant as canonical.
      const canonical = rows.reduce((best, cur) =>
        cur.confidence > best.confidence ? cur : best
      )
      const aggregatedEvidence = Array.from(
        new Set(
          rows.flatMap((r) =>
            Array.isArray(r.metadata?.observedEvidence)
              ? (r.metadata.observedEvidence as string[])
              : []
          )
        )
      ).slice(-30)

      // Check for an existing global row to merge into.
      const existingGlobal = all.find(
        (m) => m.scope === 'user' && norm(m.title) === key
      )
      if (existingGlobal) {
        // Bump confidence + extend evidence; don't create a duplicate.
        const mergedConfidence = clamp01(
          Math.max(existingGlobal.confidence, canonical.confidence) + 0.05
        )
        await this.memoryStore.upsertMemory({
          id: existingGlobal.id,
          workspaceId: existingGlobal.workspaceId,
          userId: existingGlobal.userId,
          scope: 'user',
          kind: 'user-skill',
          title: existingGlobal.title,
          content: existingGlobal.content,
          sourceType: existingGlobal.sourceType,
          sourceId: existingGlobal.sourceId,
          importance: existingGlobal.importance,
          confidence: mergedConfidence,
          tags: existingGlobal.tags,
          metadata: {
            ...existingGlobal.metadata,
            observedEvidence: aggregatedEvidence,
            lastReinforcedAt: new Date().toISOString(),
            crossWorkspaceCount: distinctWorkspaces.size
          }
        })
        promoted += 1
        continue
      }

      // Insert a new global row. workspaceId is required by upsertMemory
      // signature even though scope='user' rows have workspace_id NULL —
      // we pass the canonical workspace id and rely on upsertMemory's
      // scope='user' branch to NULL it out at the SQL layer (mirrors the
      // existing extractor pattern).
      await this.memoryStore.upsertMemory({
        workspaceId: canonical.workspaceId,
        userId,
        scope: 'user',
        kind: 'user-skill',
        title: canonical.title,
        content: canonical.content,
        sourceType: 'user-skill-promote',
        sourceId: `cross-workspace:${key}`,
        importance: Math.min(1, canonical.importance + 0.1),
        confidence: clamp01(canonical.confidence + 0.05),
        tags: canonical.tags,
        metadata: {
          observedEvidence: aggregatedEvidence,
          lastReinforcedAt: new Date().toISOString(),
          confidenceTrend: [canonical.confidence],
          revisionTrend: [],
          crossWorkspaceCount: distinctWorkspaces.size,
          promotedFrom: rows.map((r) => ({ id: r.id, workspaceId: r.workspaceId }))
        }
      })
      promoted += 1
    }
    return promoted
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

const CROSS_WORKSPACE_PROMOTE_THRESHOLD = Math.max(
  2,
  Number(process.env.USER_SKILL_PROMOTE_THRESHOLD ?? '3')
)

