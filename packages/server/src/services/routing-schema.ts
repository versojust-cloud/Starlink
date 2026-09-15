/**
 * Phase C · Supervisor routing schemas (Zod).
 * RoutingDecision bridges supervisor's high-level capability selection
 * and per-invocation sub-agent overrides.
 */

import { z } from 'zod'

export const RoutingDecisionSchema = z.object({
  agent_id: z.string().min(1),
  prompt_vars: z.record(z.unknown()).default({}),
  overrides: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      max_tokens: z.number().int().positive().optional()
    })
    .default({}),
  reason: z.string().min(1)
})

export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>

export const SupervisorDecisionSchema = z.object({
  intent: z.enum(['generate_bmc', 'analyze', 'detect_conflicts', 'general']),
  decisions: z.array(RoutingDecisionSchema),
  reasoning: z.string()
})

export type SupervisorDecision = z.infer<typeof SupervisorDecisionSchema>
