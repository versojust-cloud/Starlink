/**
 * Wizard-step RPC schemas (Wave F.7-pre).
 *
 * Lifted from `apps/web/src/features/ideation/types/wizard-rpc-types.ts`
 * for cross-runtime consumption (Next.js REST + future Apollo GraphQL).
 *
 * Pairs with `wizard-prompts.ts` + `wizard-parser.ts`.
 */

import { z } from 'zod'
import { IDEATION_NODE_KINDS } from './schemas.js'

const NodeKindZ = z.enum(IDEATION_NODE_KINDS)

const StepIdZ = z.enum([
  'core-idea',
  'customer-pain',
  'value-angle',
  'hypothesis',
  'validation',
  'revenue',
  'risk',
  'meta',
  'done'
])

export type WizardStepId = z.infer<typeof StepIdZ>

export const WizardStepRequestSchema = z.object({
  step: StepIdZ,
  userAnswer: z.string().min(1).max(2000),
  canvas: z.object({
    nodes: z
      .array(
        z.object({
          id: z.string(),
          kind: NodeKindZ,
          label: z.string(),
          content: z.string()
        })
      )
      .max(40),
    edgeCount: z.number().int().nonnegative()
  }),
  recentChat: z
    .array(
      z.object({
        role: z.enum(['ai', 'user']),
        content: z.string()
      })
    )
    .max(8),
  /**
   * Pre-rendered user-skill markdown block (server-fetched). See the same
   * field on `ReflectionRequestSchema` (schemas.ts) for the shape; the
   * wizard prompt injects this so step-by-step extraction can pick a more
   * informed `nextQuestion` (e.g. skip basic to-B/to-C clarification when
   * the user-skill profile already says "B2B background").
   */
  userSkillBlock: z.string().optional()
})

export type WizardStepRequest = z.infer<typeof WizardStepRequestSchema>

export const WizardStepResponseSchema = z.object({
  extracted: z.object({
    kind: NodeKindZ,
    label: z.string().min(1).max(60),
    content: z.string().min(1).max(800)
  }),
  nextQuestion: z.string().min(8).max(700),
  nextStep: StepIdZ,
  source: z.enum(['llm', 'scripted', 'error']),
  latencyMs: z.number().int().nonnegative().optional()
})

export type WizardStepResponse = z.infer<typeof WizardStepResponseSchema>

// =============================================================================
// Step → kind mapping. Wizard step decides what kind of node we extract.
// =============================================================================

import type { IdeationNodeKind } from './schemas.js'

export const WIZARD_STEP_TO_KIND: Record<WizardStepId, IdeationNodeKind | null> = {
  'core-idea': 'core-idea',
  'customer-pain': 'customer-pain',
  'value-angle': 'value-angle',
  hypothesis: 'hypothesis',
  validation: 'validation-channel',
  revenue: 'revenue',
  risk: 'risk',
  meta: 'reflection',
  done: null
}

export const WIZARD_STEP_ORDER: WizardStepId[] = [
  'core-idea',
  'customer-pain',
  'value-angle',
  'hypothesis',
  'validation',
  'revenue',
  'risk',
  'meta',
  'done'
]

export function nextWizardStep(step: WizardStepId): WizardStepId {
  const idx = WIZARD_STEP_ORDER.indexOf(step)
  if (idx < 0 || idx >= WIZARD_STEP_ORDER.length - 1) return 'done'
  return WIZARD_STEP_ORDER[idx + 1]
}
