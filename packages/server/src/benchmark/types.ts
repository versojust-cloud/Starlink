/**
 * Phase 3.5 · Benchmark common types.
 */

import { z } from 'zod'

export const BMC_DIMENSION_IDS = [
  'CUSTOMER_SEGMENTS',
  'VALUE_PROPOSITIONS',
  'CHANNELS',
  'CUSTOMER_RELATIONSHIPS',
  'REVENUE_STREAMS',
  'KEY_RESOURCES',
  'KEY_ACTIVITIES',
  'KEY_PARTNERSHIPS',
  'COST_STRUCTURE'
] as const

export type BmcDimensionId = (typeof BMC_DIMENSION_IDS)[number]

export const DimensionExpectationSchema = z.object({
  must_cover: z.array(z.string()).default([]),
  must_not_cover: z.array(z.string()).default([]),
  min_confidence: z.number().min(0).max(1).optional()
})

export const BenchmarkCaseSchema = z.object({
  case_id: z.string(),
  domain: z.string(),
  region: z.string().optional(),
  source: z.object({
    kind: z.enum(['academic-paper', 'business-case', 'synthetic', 'student-project']),
    citation: z.string().optional()
  }),
  input: z.object({
    question: z.string(),
    workspace_knowledge: z
      .array(
        z.object({
          doc_id: z.string(),
          title: z.string(),
          content: z.string()
        })
      )
      .default([]),
    constraints: z.array(z.string()).default([])
  }),
  expected_output: z.object({
    dimensions: z.record(DimensionExpectationSchema).default({}),
    consistency_checks: z.array(z.string()).default([])
  }),
  reference_outputs: z
    .object({
      human_expert: z.unknown().optional(),
      gpt_solo: z.unknown().optional(),
      metagpt: z.unknown().optional(),
      autogen: z.unknown().optional()
    })
    .optional()
})

/** Use input type so case literals can omit defaulted fields (e.g.
 *  `must_not_cover` defaults to []). Consumers must use `?? []` / `?? {}`
 *  fallbacks defensively, OR call `BenchmarkCaseSchema.parse(c)` first to
 *  apply defaults (the corpus loader does this). */
export type BenchmarkCase = z.input<typeof BenchmarkCaseSchema>

export const PerAgentContributionSchema = z.record(
  z.string(),
  z.object({
    generations: z.number().default(0),
    revisions_received: z.number().default(0),
    critiques_emitted: z.number().default(0),
    debate_turns: z.number().default(0),
    actions_invoked: z.number().default(0),
    escalations: z.number().default(0)
  })
)

export type PerAgentContribution = z.infer<typeof PerAgentContributionSchema>

export const BenchmarkRunSchema = z.object({
  case_id: z.string(),
  runner: z.enum(['starlink', 'gpt-solo', 'gpt-solo-forced', 'metagpt', 'autogen']),
  started_at: z.string(),
  ended_at: z.string(),
  duration_ms: z.number(),
  token_cost: z
    .object({
      input: z.number(),
      output: z.number(),
      total: z.number()
    })
    .optional(),
  output: z.object({
    bmc_nodes: z.array(z.unknown()).default([]),
    handoff_count: z.number().default(0),
    per_agent_contribution: PerAgentContributionSchema.optional()
  }),
  error: z.string().optional()
})

export type BenchmarkRun = z.infer<typeof BenchmarkRunSchema>

export interface MetricScore {
  name: string
  score: number
  detail?: Record<string, unknown>
}

export interface RunReport {
  case_id: string
  runner: string
  metrics: MetricScore[]
  composite: number
}
