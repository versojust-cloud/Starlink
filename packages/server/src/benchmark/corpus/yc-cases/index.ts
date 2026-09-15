/**
 * Tier A YC-and-extended dataset registry.
 *
 * Add new cases by importing them here. The benchmark CLI auto-loads
 * everything from this index. Cases are exported as raw `YcCompanyCase`
 * (z.input shape with defaults still as written) — Zod validation
 * happens lazily in the loader.
 *
 * Stage Tier A target: 30-50 cases. We're currently at 5.
 *
 * Tier B (later) — recruit ~50 more annotated cases via Prolific.
 * Tier C (later) — domain-expert annotated, IRB-blessed, ~200 cases
 * stratified by sector + outcome + stage.
 */

import { YcCompanyCaseSchema, type YcCompanyCase } from './yc-company-schema.js'
import { ycStripeCase } from './yc-stripe.js'
import { ycAirbnbCase } from './yc-airbnb.js'
import { ycReplitCase } from './yc-replit.js'
import { ycPebbleCase } from './yc-pebble.js'
import { ycCourseraCase } from './yc-coursera.js'
import { ycNotionCase } from './yc-notion.js'
import { ycCoinbaseCase } from './yc-coinbase.js'
import { ycDoorDashCase } from './yc-doordash.js'
import { ycTwitchCase } from './yc-twitch.js'
import { ycSegmentCase } from './yc-segment.js'
import { ycBrexCase } from './yc-brex.js'
import { ycSubstackCase } from './yc-substack.js'

const SEED_CASES: YcCompanyCase[] = [
  ycStripeCase,
  ycAirbnbCase,
  ycReplitCase,
  ycPebbleCase,
  ycCourseraCase,
  ycNotionCase,
  ycCoinbaseCase,
  ycDoorDashCase,
  ycTwitchCase,
  ycSegmentCase,
  ycBrexCase,
  ycSubstackCase
]

/**
 * Load all Tier-A cases, validated by Zod. Throws on any malformed case
 * so authoring errors surface early.
 */
export function loadAllYcCases(): YcCompanyCase[] {
  return SEED_CASES.map((c, i) => {
    try {
      return YcCompanyCaseSchema.parse(c) as YcCompanyCase
    } catch (err) {
      throw new Error(
        `[yc-cases] case at index ${i} (${c.case_id}) failed validation: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
  })
}

export function loadYcCasesBySector(sector: YcCompanyCase['sector']): YcCompanyCase[] {
  return loadAllYcCases().filter((c) => c.sector === sector)
}

export function loadYcCasesByOutcome(outcome: YcCompanyCase['outcome']): YcCompanyCase[] {
  return loadAllYcCases().filter((c) => c.outcome === outcome)
}

export type { YcCompanyCase }
