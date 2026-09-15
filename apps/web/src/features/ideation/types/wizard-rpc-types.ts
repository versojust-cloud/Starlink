/**
 * Re-export shim (Wave F.7-pre).
 *
 * Wizard RPC schemas now live in @starlink/shared/ideation-coach so they
 * can be consumed by both the Next.js REST route AND the Apollo GraphQL
 * resolver. This file stays as a re-export for backward compat with
 * existing imports under `@/features/ideation/types/wizard-rpc-types`.
 */

export {
  WizardStepRequestSchema,
  WizardStepResponseSchema,
  type WizardStepRequest,
  type WizardStepResponse,
  type WizardStepId,
  WIZARD_STEP_TO_KIND,
  WIZARD_STEP_ORDER,
  nextWizardStep
} from '@starlink/shared'
