/**
 * HITL Phase 2.6 · resume directive parsing.
 *
 * The `resumeConversation` GraphQL mutation accepts a free-form `decision`
 * string emitted by the UI. The grammar is:
 *
 *   [ACCEPTED]                          → keep current BMC, halt critic loop
 *   [EDIT_PLAN]:<freeform body>         → run another critic→supervisor round,
 *                                          full revision (no per-dimension scope)
 *   [EDIT_PLAN][<bmc-domain>]:<body>    → revision scoped to ONE BMC dimension —
 *                                          only the agent owning that domain runs
 *   [REJECTED]                          → halt critic loop, current state is final
 *
 * `<bmc-domain>` is one of the nine cc-BMC domains (中文); we accept the
 * canonical Chinese label OR the kebab-case English alias used elsewhere
 * in the codebase (e.g. "customer-segments" ↔ "客户细分").
 */

import { ccBmcDomains, type CcBmcDomain } from '@starlink/shared'

export type HitlResumeDirective =
  | { kind: 'accepted'; raw: string }
  | { kind: 'edit_plan'; dimension: CcBmcDomain | null; body: string; raw: string }
  | { kind: 'rejected'; raw: string }
  | { kind: 'invalid'; reason: string; raw: string }

const ACCEPTED_PREFIX = '[ACCEPTED]'
const REJECTED_PREFIX = '[REJECTED]'
const EDIT_PLAN_PREFIX = '[EDIT_PLAN]'

/**
 * Map kebab-case English BMC aliases to canonical Chinese labels. The English
 * aliases come from `buildDeterministicNodeId` / canvas tooling.
 */
const ENGLISH_TO_CC_DOMAIN: Record<string, CcBmcDomain> = {
  'customer-segments': '客户细分',
  'customer-relationships': '客户关系',
  channels: '渠道通路',
  'value-propositions': '价值主张',
  'revenue-streams': '收入来源',
  'key-activities': '关键业务',
  'key-resources': '核心资源',
  'key-partnerships': '重要合作',
  'cost-structure': '成本结构'
}

const CC_DOMAINS_SET: ReadonlySet<string> = new Set(ccBmcDomains)

export function parseHitlDecision(raw: string): HitlResumeDirective {
  const safeRaw = typeof raw === 'string' ? raw : ''
  const trimmed = safeRaw.trim()
  if (!trimmed) {
    return { kind: 'invalid', reason: 'decision is empty', raw: safeRaw }
  }

  if (trimmed.startsWith(ACCEPTED_PREFIX)) {
    return { kind: 'accepted', raw: trimmed }
  }
  if (trimmed.startsWith(REJECTED_PREFIX)) {
    return { kind: 'rejected', raw: trimmed }
  }
  if (trimmed.startsWith(EDIT_PLAN_PREFIX)) {
    const tail = trimmed.slice(EDIT_PLAN_PREFIX.length)
    const dimMatch = tail.match(/^\s*\[([^\]]+)\]\s*/)
    let dimension: CcBmcDomain | null = null
    let body = tail
    if (dimMatch) {
      const candidate = dimMatch[1].trim()
      const resolved = resolveDomainLabel(candidate)
      if (!resolved) {
        return {
          kind: 'invalid',
          reason: `unknown BMC dimension: ${candidate}`,
          raw: trimmed
        }
      }
      dimension = resolved
      body = tail.slice(dimMatch[0].length)
    }
    body = body.replace(/^[:\s]+/, '').trim()
    if (!body) {
      return {
        kind: 'invalid',
        reason: '[EDIT_PLAN] body is empty',
        raw: trimmed
      }
    }
    return { kind: 'edit_plan', dimension, body, raw: trimmed }
  }

  return {
    kind: 'invalid',
    reason: 'decision must start with [ACCEPTED], [EDIT_PLAN] or [REJECTED]',
    raw: trimmed
  }
}

function resolveDomainLabel(candidate: string): CcBmcDomain | null {
  if (CC_DOMAINS_SET.has(candidate)) return candidate as CcBmcDomain
  const lowered = candidate.toLowerCase()
  return ENGLISH_TO_CC_DOMAIN[lowered] ?? null
}

/**
 * Should the critic loop halt after applying this directive?
 *
 * `accepted` and `rejected` both mean "no further critic rounds"; the
 * difference is purely audit / UI semantics. `edit_plan` always continues
 * the loop with a new revision round. `invalid` is treated as halt to fail
 * safe (stale or hostile decisions should not silently trigger more LLM
 * spend).
 */
export function shouldHaltCriticLoop(directive: HitlResumeDirective): boolean {
  return directive.kind !== 'edit_plan'
}
