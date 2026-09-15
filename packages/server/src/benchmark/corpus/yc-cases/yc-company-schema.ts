/**
 * Y Combinator company case schema (Tier A benchmark dataset).
 *
 * Used by the Agent-as-a-Judge evaluator (Zhuge et al. 2024) to score how
 * well Starlink's BMC pipeline / Ideation coach handles real public
 * startup info from the YC directory.
 *
 * Source attribution: ycombinator.com/companies (public listing). We do
 * NOT redistribute YC's content — this dataset only stores PUBLIC,
 * READ-ONLY metadata + our own annotations. Each case must include a
 * `source_url` pointing back to YC's page so the user can verify
 * provenance and re-fetch if needed.
 *
 * Why this format (not just a CSV)?
 *  - Type safety end-to-end (Zod parse → strongly-typed runtime)
 *  - Easy to add new fields without schema migration
 *  - Each case's metadata + ground-truth BMC live in one TS file —
 *    grep-friendly and version-controlled
 *
 * Stage Tier A scope:
 *   - 30-50 hand-picked YC companies covering diverse sectors
 *   - One-liner + long description from YC profile (text, public)
 *   - Outcome label (active / acquired / dead) — public knowledge
 *   - Hand-authored 9-dimension BMC ground-truth (~2 sentences per cell)
 *   - "Must-cover" hints per dimension (key concepts a good BMC must mention)
 *
 * Tier B (later) — recruit Prolific annotators for ~50 more cases.
 * Tier C (later) — domain-expert annotated, IRB-blessed, peer-reviewable.
 */

import { z } from 'zod'
import { BMC_DIMENSION_IDS } from '../../types.js'

const SectorEnum = z.enum([
  'devtools',
  'consumer-saas',
  'b2b-saas',
  'fintech',
  'healthtech',
  'edtech',
  'climate',
  'biotech',
  'logistics',
  'marketplace',
  'media',
  'gaming',
  'hardware',
  'agriculture',
  'other'
])

const OutcomeEnum = z.enum([
  'active', // still operating, not acquired
  'acquired', // bought by another company
  'public', // IPO'd
  'shut-down' // operations ceased
])

const StageEnum = z.enum([
  'idea', // pre-MVP
  'seed', // raised seed round
  'series-a',
  'series-b-plus',
  'late-stage'
])

const BmcDimensionExpectationSchema = z.object({
  /** Concise (≤1 sentence) ground-truth answer for this BMC dimension. */
  ground_truth: z.string().min(1),
  /** Concept tokens that any good BMC should at least mention in this cell.
   *  Used by the evaluator's coverage metric. */
  must_cover: z.array(z.string()).default([]),
  /** Concept tokens a good BMC should AVOID (these would indicate the
   *  model misunderstood the domain). Optional. */
  must_not_cover: z.array(z.string()).default([])
})

export const YcCompanyCaseSchema = z.object({
  // Provenance + identity ----------------------------------------------------
  case_id: z.string().min(3), // e.g. 'yc-stripe-2024'
  company_name: z.string().min(1),
  yc_batch: z.string().regex(/^[WSF]\d{2}$/), // W22 / S20 / F25 etc
  source_url: z.string().url(),
  /** ISO date when we last sampled the YC profile content */
  fetched_at: z.string(),

  // Public profile (verbatim — user can re-fetch) ---------------------------
  one_liner: z.string().min(10).max(200),
  description: z.string().min(20),
  website: z.string().url().optional(),

  // Hand-curated metadata ----------------------------------------------------
  sector: SectorEnum,
  outcome: OutcomeEnum,
  stage_at_outcome: StageEnum,
  /** Year of the outcome event (founding / acquisition / shutdown) */
  outcome_year: z.number().int().min(2000).max(2030),

  // Ground-truth BMC ---------------------------------------------------------
  /** One entry per BMC dimension. Annotators write a 1-2 sentence ground
   *  truth + must-cover/must-not-cover concept tokens. */
  ground_truth_bmc: z
    .object(
      Object.fromEntries(
        BMC_DIMENSION_IDS.map((id) => [id, BmcDimensionExpectationSchema])
      ) as Record<(typeof BMC_DIMENSION_IDS)[number], typeof BmcDimensionExpectationSchema>
    )
    .strict(),

  // Annotator metadata -------------------------------------------------------
  annotator_id: z.string(), // e.g. 'sheng-internal' or 'prolific-A1B2C3'
  annotation_quality: z.enum(['draft', 'reviewed', 'expert-validated']).default('draft'),
  notes: z.string().optional(), // free-text caveats for evaluator

  // Optional KB seed for the citation eval (master IMPLEMENTATION_PLAN.md §5).
  // When non-empty, the yc-vs-runners adapter passes these into the runner's
  // `knowledgeEvidence` channel; the agent prompts already include the
  // `[[ref:docId#snippetId]]` citation rule (see business-langgraph.ts §1223),
  // so the run produces grounding-rate / hallucination-rate signals against
  // a real evidence set rather than the unseeded "workspace_knowledge=[]"
  // path. Leave undefined or [] for cases that don't exercise RAG.
  workspace_knowledge: z
    .array(
      z.object({
        doc_id: z.string(),
        title: z.string(),
        content: z.string()
      })
    )
    .optional()
})

export type YcCompanyCase = z.input<typeof YcCompanyCaseSchema>
export type YcCompanyCaseStrict = z.infer<typeof YcCompanyCaseSchema>

// =============================================================================
// Sector / outcome export for the evaluator
// =============================================================================

export const SECTOR_VALUES = SectorEnum.options
export const OUTCOME_VALUES = OutcomeEnum.options
