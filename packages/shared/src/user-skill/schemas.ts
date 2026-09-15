/**
 * User-skill schemas (2026-04-28).
 *
 * Durable, per-user traits extracted across conversations. Stored as
 * `memory_items` rows with `kind === 'user-skill'`. See
 * `packages/shared/src/schemas/memory.ts` for the underlying memory shape.
 *
 * Two layers of scope:
 *   - 'user'      : global across all workspaces for this user (e.g. "B2B background")
 *   - 'workspace' : tied to one idea / workspace (e.g. "this SaaS targets SMB")
 *
 * Both layers use the same shape; the differentiator is the memory row's
 * `scope` + `workspaceId` fields, not anything in the skill payload itself.
 */

import { z } from 'zod'

/**
 * Tag taxonomy for user skills. Kept open-ended (passthrough) so the LLM
 * extractor can introduce ad-hoc tags, but a few well-known values
 * standardise downstream filtering.
 */
export const USER_SKILL_TAGS = [
  'domain', // industry / sector background ("B2B SaaS", "fintech")
  'experience', // years / depth ("5+ years engineering")
  'style', // thinking / communication ("prefers data-driven")
  'blind-spot', // recurring gap ("rarely discusses risk")
  'preference', // tooling / framing ("loves first-principles")
  'constraint' // self-imposed limit ("solo founder, no fundraising")
] as const

/**
 * Single skill payload. Persisted into `memory_items.title + content + tags +
 * metadata` columns; this schema is what the LLM extractor produces and what
 * the renderer consumes.
 */
export const UserSkillPayloadSchema = z.object({
  scope: z.enum(['user', 'workspace']),
  /** Short trait name. Persisted into `memory_items.title`. Cap raised
   *  to 60 (was 24) after observing LLM output occasionally producing
   *  English-language titles ~30-40 chars. The system prompt still asks
   *  for ≤24 chars; the schema is the runtime safety net. */
  title: z.string().min(1).max(60),
  /** Descriptive sentence. Persisted into `memory_items.content`. */
  content: z.string().min(4).max(480),
  /** Tags used for retrieval filtering and prompt rendering grouping. */
  tags: z.array(z.string().max(40)).max(8).default([]),
  /** [0, 1]; we threshold reads at 0.5 by default. */
  confidence: z.number().min(0).max(1).default(0.5),
  /** [0, 1]; multiplied with cosine score during ranking. */
  importance: z.number().min(0).max(1).default(0.6),
  /** Trace IDs of conversations that supported this trait. */
  observedEvidence: z.array(z.string()).max(20).default([])
})

export type UserSkillPayload = z.infer<typeof UserSkillPayloadSchema>

/**
 * What `UserSkillExtractor` produces from one extraction run. Four lists:
 *
 * - `creates`: new skills to insert
 * - `updates`: existing skills (by id) whose confidence should change
 * - `refines`: existing skills (by id) whose title/content should be rewritten
 *              based on accumulated evidence (Layer 1 self-evolution). The
 *              old text is appended to `metadata.revisionTrend` for audit.
 * - `decays`:  existing skills (by id) that look stale and should drop
 *
 * Updates / refines / decays operate on `memory_items.id`; creates contain
 * a fully-formed payload passed to `upsertMemory`.
 */
export const UserSkillExtractionOutputSchema = z.object({
  creates: z.array(UserSkillPayloadSchema).max(8).default([]),
  updates: z
    .array(
      z.object({
        id: z.string(),
        confidenceDelta: z.number().min(-1).max(1),
        addEvidence: z.string().nullable().default(null)
      })
    )
    .max(8)
    .default([]),
  refines: z
    .array(
      z.object({
        id: z.string(),
        newTitle: z.string().min(1).max(24).nullable().default(null),
        newContent: z.string().min(4).max(480).nullable().default(null),
        /** Why this refinement — required for the audit trail. */
        reason: z.string().min(4).max(160)
      })
    )
    .max(8)
    .default([]),
  decays: z.array(z.object({ id: z.string() })).max(8).default([])
})

export type UserSkillExtractionOutput = z.infer<typeof UserSkillExtractionOutputSchema>

/**
 * Input shape passed to the extractor's LLM call. The extractor orchestrator
 * (server-side) builds this from recent conversation summaries + existing
 * skills queried from `memory_items`.
 */
export const UserSkillExtractionInputSchema = z.object({
  userId: z.string(),
  /** Most recent first. Each entry is a one-paragraph summary of a past
   *  conversation, regardless of which workspace it happened in. */
  recentConversationSummaries: z
    .array(
      z.object({
        traceId: z.string(),
        workspaceId: z.string(),
        summary: z.string(),
        createdAt: z.string()
      })
    )
    .max(10),
  /** Existing skills already on file; the extractor decides whether to
   *  reinforce / decay / leave them. */
  existingSkills: z
    .array(
      z.object({
        id: z.string(),
        scope: z.enum(['user', 'workspace']),
        title: z.string(),
        content: z.string(),
        confidence: z.number(),
        tags: z.array(z.string())
      })
    )
    .max(20)
})

export type UserSkillExtractionInput = z.infer<typeof UserSkillExtractionInputSchema>

// ===========================================================================
// Layer-2 self-evolution: cross-skill consolidation (2026-04-28)
// ===========================================================================

/**
 * `UserSkillConsolidator` runs periodically (when active skill count for a
 * user exceeds a threshold, default 15) and proposes:
 *
 * - `merges`: 2+ existing skills that semantically overlap collapse into
 *   one new skill ("B2B 销售经验" + "做过 enterprise SaaS" → "B2B 资深背景")
 * - `splits`: 1 existing skill whose evidence shows it bundles 2+ orthogonal
 *   traits gets split ("混合背景：B2B + 偏好数据驱动" → 2 separate rows)
 *
 * Each merge consumes its source skills (archive); each split consumes its
 * source. The replacement payloads use the same UserSkillPayload shape as
 * `creates` from the extractor, so downstream upsert code paths stay
 * uniform.
 */
export const UserSkillConsolidationInputSchema = z.object({
  userId: z.string(),
  /** All active (non-archived, confidence ≥ 0.5) skills for this user. */
  activeSkills: z
    .array(
      z.object({
        id: z.string(),
        scope: z.enum(['user', 'workspace']),
        title: z.string(),
        content: z.string(),
        confidence: z.number(),
        importance: z.number(),
        tags: z.array(z.string())
      })
    )
    .min(2)
    .max(40)
})
export type UserSkillConsolidationInput = z.infer<typeof UserSkillConsolidationInputSchema>

export const UserSkillConsolidationOutputSchema = z.object({
  /** Each merge: archive `sourceIds` (≥2), create `merged` as a new skill. */
  merges: z
    .array(
      z.object({
        sourceIds: z.array(z.string()).min(2).max(5),
        merged: UserSkillPayloadSchema,
        reason: z.string().min(4).max(200)
      })
    )
    .max(5)
    .default([]),
  /** Each split: archive `sourceId`, create each of `parts` as a new skill. */
  splits: z
    .array(
      z.object({
        sourceId: z.string(),
        parts: z.array(UserSkillPayloadSchema).min(2).max(3),
        reason: z.string().min(4).max(200)
      })
    )
    .max(3)
    .default([])
})
export type UserSkillConsolidationOutput = z.infer<
  typeof UserSkillConsolidationOutputSchema
>
