/**
 * Tier-A YC case annotation TEMPLATE.
 *
 * To add a new case (J.6 scaffold):
 *
 *   1. Pick a YC company from ycombinator.com/companies. Aim to
 *      diversify sectors + outcomes (see balance table at the bottom).
 *   2. Copy this file to `yc-<company-slug>.ts`
 *   3. Replace every `__FILL__` with real content
 *   4. Append the new case to `index.ts` SEED_CASES array
 *   5. Run `pnpm --filter @starlink/server lint` to confirm Zod passes
 *   6. (Optional) Run a one-case smoke eval to sanity-check:
 *        node packages/server/dist/benchmark/eval/yc-judge-smoke.js \
 *          --case=yc-<company-slug>-2024
 *
 * Annotation guidelines:
 *
 *   - one_liner / description: VERBATIM from the public YC profile
 *     (don't paraphrase; we want re-fetchability)
 *   - ground_truth per dimension: 1-2 sentences, factual + consensus
 *   - must_cover: 2-5 short concept tokens (lowercase) that any good
 *     BMC for THIS company should mention. Tokens get token-overlap
 *     gated AND prompted to the LLM judge. Pick distinctive terms,
 *     not generic ones ("software" is too generic; "API" might be ok
 *     if it's actually distinctive of the business)
 *   - must_not_cover: 1-3 tokens that would indicate the BMC
 *     misunderstood the business model. E.g. for Airbnb, "inventory
 *     cost" is a must_not_cover (Airbnb doesn't own homes)
 *
 * Inter-annotator quality:
 *   - `annotation_quality: 'draft'`     — first pass by 1 annotator
 *   - `annotation_quality: 'reviewed'`  — second annotator agreed
 *   - `annotation_quality: 'expert-validated'` — Tier C only
 */

import type { YcCompanyCase } from './yc-company-schema.js'

/* eslint-disable */
// NOTE: this is a template — placeholder values satisfy the type but
// will fail Zod runtime validation (e.g. yc_batch regex, sector enum).
// The template intentionally never gets imported from index.ts.
export const ycTEMPLATECase: YcCompanyCase = {
  // -------------------------------------------------------------- Provenance
  case_id: 'yc-COMPANY_SLUG-2024', // e.g. 'yc-doordash-2024'
  company_name: '__FILL__', // e.g. 'DoorDash'
  yc_batch: 'S13', // [WSF] + 2-digit year, e.g. 'S13' or 'W21'
  source_url: 'https://www.ycombinator.com/companies/COMPANY_SLUG',
  fetched_at: '2026-04-27', // ISO date when you last sampled the profile

  // -------------------------------------------------------- Public profile
  // VERBATIM from YC profile page — don't paraphrase
  one_liner: '__FILL__ (≤200 chars, copy from YC profile)',
  description: '__FILL__ (≥20 chars, copy from YC profile)',
  website: 'https://...',

  // ------------------------------------------------------ Curated metadata
  sector: 'other', // see SECTOR_VALUES in yc-company-schema.ts
  outcome: 'active', // 'active' | 'acquired' | 'public' | 'shut-down'
  stage_at_outcome: 'series-a', // 'idea' | 'seed' | 'series-a' | 'series-b-plus' | 'late-stage'
  outcome_year: 2024,

  // ------------------------------------------------- Ground-truth BMC (9 cells)
  ground_truth_bmc: {
    CUSTOMER_SEGMENTS: {
      ground_truth:
        '__FILL__ (1-2 sentences. Who specifically uses this? Multi-segment? B2B vs B2C?)',
      must_cover: ['__token1', '__token2'],
      must_not_cover: []
    },
    VALUE_PROPOSITIONS: {
      ground_truth:
        '__FILL__ (Why customer chooses this. Differentiation. Use specific terms not generic ones)',
      must_cover: ['__distinctive_token1', '__distinctive_token2'],
      must_not_cover: []
    },
    CHANNELS: {
      ground_truth:
        '__FILL__ (Acquisition + delivery channels. Self-serve / sales / referral / retail / etc)',
      must_cover: ['__channel_token1', '__channel_token2'],
      must_not_cover: []
    },
    CUSTOMER_RELATIONSHIPS: {
      ground_truth:
        '__FILL__ (Self-service vs. dedicated support; community vs. one-on-one; etc)',
      must_cover: ['__token'],
      must_not_cover: []
    },
    REVENUE_STREAMS: {
      ground_truth:
        '__FILL__ (Specific monetization model. Subscription? Transaction fee? Ads? Mix?)',
      must_cover: ['__monetization_token1'],
      must_not_cover: []
    },
    KEY_RESOURCES: {
      ground_truth:
        '__FILL__ (Engineering? Brand? Network effects? Licenses? Data?)',
      must_cover: ['__resource_token1', '__resource_token2'],
      must_not_cover: []
    },
    KEY_ACTIVITIES: {
      ground_truth:
        '__FILL__ (What the team spends time on day-to-day. Not the same as resources)',
      must_cover: ['__activity_token'],
      must_not_cover: []
    },
    KEY_PARTNERSHIPS: {
      ground_truth:
        '__FILL__ (Who they need partners with. Suppliers? Distributors? Platform?)',
      must_cover: ['__partner_token'],
      must_not_cover: []
    },
    COST_STRUCTURE: {
      ground_truth:
        '__FILL__ (Largest cost lines. Variable vs fixed. What dominates?)',
      must_cover: ['__cost_token1', '__cost_token2'],
      must_not_cover: []
    }
  },

  // -------------------------------------------------------- Annotator metadata
  annotator_id: '__YOUR_ID__', // e.g. 'sheng-internal' or 'prolific-A1B2C3'
  annotation_quality: 'draft',
  notes:
    '__FILL__ (any caveats, e.g. "this is a hardware-heavy case; cost structure differs from typical SaaS")'
}
/* eslint-enable */

/**
 * ===========================================================================
 * Stratification target (Tier A goal: 30-50 cases)
 *
 * Currently in SEED_CASES (5):
 *   - fintech (1)        : Stripe (active)
 *   - marketplace (1)    : Airbnb (public)
 *   - devtools (1)       : Replit (active)
 *   - hardware (1)       : Pebble (shut-down)
 *   - edtech (1)         : Coursera (public, NOT YC)
 *
 * Recommended next 25 to fill out the matrix:
 *
 *   Sector             | Suggested companies (YC unless noted)
 *   -------------------|------------------------------------------
 *   consumer-saas       | Notion (W14), Loom (W18), Calendly (S20)
 *   b2b-saas            | PagerDuty, Segment (S11), Mixpanel (S09)
 *   fintech             | Coinbase (S12), Brex (W17), Mercury (S19)
 *   healthtech          | Forward (W17), Hims (W18)
 *   edtech              | Lambda School (S17), Quill (W19)
 *   climate             | Helion (S15), Sourceful (S20)
 *   biotech             | Rappi (W16, food), Ginkgo Bioworks
 *   logistics           | DoorDash (S13), Flexport (W14)
 *   marketplace         | Instacart (S12), Faire (W17)
 *   media               | Substack (W18), Cuvée
 *   gaming              | (light coverage; consider Razer or Discord)
 *   hardware            | Boom Supersonic, Anduril (B/lent)
 *   agriculture         | Plenty (S14), Bowery (S15)
 *
 *   Outcome distribution target:
 *     active     : ~14 (50%)
 *     acquired   : ~8  (28%)
 *     public     : ~5  (18%)
 *     shut-down  : ~3  (10%)  ← critical for outcome-conditioned eval
 *
 *   Stage distribution target:
 *     idea/seed   : 6
 *     series-a    : 8
 *     series-b+   : 8
 *     late-stage  : 8
 * ===========================================================================
 */
