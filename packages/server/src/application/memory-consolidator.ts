/**
 * P14 Sprint 6 (P6) · MemoryConsolidator — orchestration facade for
 * cross-layer memory promotion + decay.
 *
 * Wraps the two existing services (UserSkillExtractor + UserSkillConsolidator)
 * into one interface so consumers can fire a single trigger and let the
 * consolidator decide what's needed:
 *
 *   - consolidateRunEnd(runId)
 *       L1 → L2 promotion: distill the run's chat history + BMC outputs
 *       into a workspace-level bmc-summary memory_item. Currently the
 *       legacy captureConversationOutcome path produces canvas + decision
 *       rows; the consolidator extends this with explicit chat-history
 *       distillation as a follow-up.
 *
 *   - consolidateUserPatterns(userId)
 *       L1 → L3 promotion: scan the user's recent conversation summaries
 *       and extract / refine durable user-skill traits. Delegates to
 *       UserSkillExtractor.extractUserSkills.
 *
 *   - consolidateCrossWorkspace(userId)
 *       L2 → L3 promotion: detect user-skill rows that recur across
 *       multiple workspaces and promote them to scope='user' (cross-idea).
 *       Delegates to UserSkillConsolidator.consolidate.
 *
 *   - decayStaleSemantic()
 *       Cron-style: confidence *= 0.95 for user-skill rows whose
 *       lastReinforcedAt is older than 30 days. Prevents inferred traits
 *       from sticking around forever after they stop being reinforced.
 *
 * The 4 entry points are intentionally orthogonal — callers pick the
 * trigger that matches their event (run end / scheduled cron / etc.)
 * rather than a single "do everything" pass.
 */

import { ConversationMemoryStore } from './conversation-memory-store.js'
import { UserSkillExtractor } from '../services/user-skill-extractor.js'
import { UserSkillConsolidator } from '../services/user-skill-consolidator.js'
import { ChatHistoryDistiller } from './chat-history-distiller.js'
import { MemoryCaptureService } from './memory-capture.js'
import { pool } from '../infrastructure/db/pool.js'

export type ConsolidationResult = {
  /** Trigger kind — for telemetry / log grep. */
  trigger: 'run-end' | 'user-patterns' | 'cross-workspace' | 'decay'
  /** Number of memory_items rows created or updated. */
  rowsAffected: number
  /** Optional human-readable summary for audit log. */
  summary?: string
}

export class MemoryConsolidator {
  private readonly distiller: ChatHistoryDistiller

  constructor(
    private readonly memoryStore: ConversationMemoryStore,
    private readonly userSkillExtractor: UserSkillExtractor,
    private readonly userSkillConsolidator: UserSkillConsolidator,
    /** P14 Item 2 · captureService is optional — when present,
     *  consolidateRunEnd uses it to persist the L1→L2 chat-history
     *  distillation as a bmc-summary memory_item. Without it, chat
     *  distillation is skipped (but user-skill extraction still runs). */
    private readonly captureService?: MemoryCaptureService,
    distiller?: ChatHistoryDistiller
  ) {
    this.distiller = distiller ?? new ChatHistoryDistiller()
  }

  /**
   * Run-end trigger: a LangGraph stream just completed. Optionally extract
   * a user-skill (delegates to UserSkillExtractor) and let the underlying
   * captureConversationOutcome path persist the canvas + decision rows.
   *
   * The extractor uses an internal throttle (USER_SKILL_EXTRACT_EVERY_N,
   * default every 3rd conversation) so calling this on every run-end is
   * safe.
   */
  async consolidateRunEnd(args: {
    runId: string
    workspaceId: string
    userId: string
    /** P14 Item 2 · pass conversationId to enable chat-history distillation. */
    conversationId?: string
  }): Promise<ConsolidationResult> {
    if (!args.userId) {
      return { trigger: 'run-end', rowsAffected: 0, summary: 'no userId; skipped' }
    }
    // Best-effort user-skill refresh — internal throttle decides whether
    // to actually extract or skip this round.
    const extracted = await this.userSkillExtractor.extractUserSkills({
      userId: args.userId,
      workspaceId: args.workspaceId,
      traceId: args.runId
    }).catch((err) => {
      console.warn('[memory-consolidator] extractUserSkills failed', { runId: args.runId, error: String(err) })
      return 0
    })

    // P14 Item 2 · L1→L2 chat-history distillation. Pull the run's
    // chat messages, condense via LLM, and persist as a bmc-summary L2
    // row. Best-effort: skips silently if no captureService, conversationId,
    // too few user turns, or LLM fails.
    let distilledRows = 0
    if (this.captureService && args.conversationId) {
      try {
        const messages = await this.memoryStore.listMessages(args.conversationId, 30)
        const distilled = await this.distiller.distill(messages)
        if (distilled) {
          await this.captureService.captureBmcSummary({
            workspaceId: args.workspaceId,
            userId: args.userId,
            runId: args.runId,
            sourceTraceId: `${args.runId}-chat-history`,
            title: '会话回顾',
            content: distilled,
            importance: 0.55,
            confidence: 0.7,
            tags: ['chat-history', 'distilled'],
            metadata: {
              source: 'chat-history-distillation',
              conversationId: args.conversationId,
              userTurns: messages.filter((m) => m.role === 'user').length
            }
          })
          distilledRows = 1
        }
      } catch (err) {
        console.warn('[memory-consolidator] chat-history distillation failed', {
          runId: args.runId, error: String(err)
        })
      }
    }

    const total = extracted + distilledRows
    return {
      trigger: 'run-end',
      rowsAffected: total,
      summary: total > 0
        ? `${extracted} user-skill rows; ${distilledRows} chat-history summary`
        : 'consolidator skipped (throttled / no signal / not enough turns)'
    }
  }

  /**
   * User-patterns trigger: explicit refresh of user-skill rows (e.g. from
   * a GraphQL mutation / admin tool). Always runs — bypasses the throttle.
   */
  async consolidateUserPatterns(args: {
    userId: string
    workspaceId: string
    /** Force extraction even if the throttle would skip. */
    force?: boolean
  }): Promise<ConsolidationResult> {
    const traceId = `user-patterns-${Date.now()}`
    const rowsAffected = await this.userSkillExtractor.extractUserSkills({
      userId: args.userId,
      workspaceId: args.workspaceId,
      traceId,
      // 'demand' mode bypasses the per-user throttle so explicit refresh
      // (admin / GraphQL mutation) always runs.
      mode: args.force ? 'demand' : 'auto'
    }).catch((err) => {
      console.warn('[memory-consolidator] consolidateUserPatterns failed', { userId: args.userId, error: String(err) })
      return 0
    })
    return {
      trigger: 'user-patterns',
      rowsAffected,
      summary: `${rowsAffected} user-skill rows refreshed`
    }
  }

  /**
   * Cross-workspace trigger: promote workspace-scoped user-skill traits
   * that recur across multiple ideas to scope='user' so they're reused
   * cross-idea.
   */
  async consolidateCrossWorkspace(args: {
    userId: string
    workspaceId: string
    traceId?: string
  }): Promise<ConsolidationResult> {
    const rowsAffected = await this.userSkillConsolidator.consolidate({
      userId: args.userId,
      workspaceId: args.workspaceId,
      traceId: args.traceId ?? `cross-workspace-${Date.now()}`
    }).catch((err) => {
      console.warn('[memory-consolidator] consolidateCrossWorkspace failed', { userId: args.userId, error: String(err) })
      return 0
    })
    return {
      trigger: 'cross-workspace',
      rowsAffected,
      summary: `${rowsAffected} traits promoted to user scope`
    }
  }

  /**
   * Decay stale semantic memories. Cron-style: every user-skill row whose
   * lastReinforcedAt (in metadata) is older than `staleDays` (default 30)
   * gets `confidence *= decayFactor`. Rows whose confidence falls below
   * `archiveBelow` (default 0.2) are archived.
   *
   * Returns the number of rows decayed.
   */
  async decayStaleSemantic(opts: {
    staleDays?: number
    decayFactor?: number
    archiveBelow?: number
  } = {}): Promise<ConsolidationResult> {
    const staleDays = opts.staleDays ?? 30
    const decayFactor = opts.decayFactor ?? 0.95
    const archiveBelow = opts.archiveBelow ?? 0.2

    // Decay confidences first.
    const decayed = await pool.query(
      `UPDATE memory_items
          SET confidence = GREATEST(0, confidence * $1),
              updated_at = now()
        WHERE archived_at IS NULL
          AND (
            facet = 'semantic'
            OR kind = 'user-skill'
          )
          AND (
            (metadata->>'lastReinforcedAt')::timestamptz < now() - ($2 || ' days')::interval
            OR (
              metadata->>'lastReinforcedAt' IS NULL
              AND updated_at < now() - ($2 || ' days')::interval
            )
          )
        RETURNING id`,
      [decayFactor, staleDays]
    )

    // Archive any whose confidence dropped below the floor.
    const archived = await pool.query(
      `UPDATE memory_items
          SET archived_at = now()
        WHERE archived_at IS NULL
          AND (facet = 'semantic' OR kind = 'user-skill')
          AND confidence < $1
        RETURNING id`,
      [archiveBelow]
    )

    return {
      trigger: 'decay',
      rowsAffected: decayed.rowCount ?? 0,
      summary: `${decayed.rowCount ?? 0} decayed, ${archived.rowCount ?? 0} archived (below ${archiveBelow})`
    }
  }
}
