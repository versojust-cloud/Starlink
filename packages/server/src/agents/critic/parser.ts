/**
 * Critic decision parser, extracted from graph.ts so unit tests can import
 * the parser without triggering graph.ts's module-level `ready` IIFE
 * (which awaits agent.yaml — fine in production where yaml ships next to
 * graph.js, but problematic in test environments and in dist/ before any
 * yaml-copy build step).
 *
 * graph.ts re-exports these for back-compat.
 */

export type CriticHumanDecision =
  | { kind: 'accepted' }
  | { kind: 'edit_plan'; plan: string }
  | { kind: 'rejected' }
  | { kind: 'none' }

/**
 * Parse the raw `Command({ resume: '...' })` value the human delivered to
 * an interrupted critic into a typed decision. Recognised markers:
 *
 *   [ACCEPTED]              → kind='accepted'
 *   [EDIT_PLAN]:<plan>      → kind='edit_plan', plan='<plan>'
 *   [EDIT_PLAN]：<plan>     → same (Chinese fullwidth colon)
 *   [EDIT_PLAN] <plan>      → same (whitespace-delimited)
 *   <anything else>         → kind='rejected'
 *   non-string              → kind='none'
 */
export function parseHumanDecision(raw: unknown): CriticHumanDecision {
  if (typeof raw !== 'string') return { kind: 'none' }
  if (raw.startsWith('[ACCEPTED]')) return { kind: 'accepted' }
  if (raw.startsWith('[EDIT_PLAN]')) {
    // Format from awaitHumanNode's interrupt payload: '[EDIT_PLAN]:<plan>'.
    // Strip both the marker and the leading ':' (or '：' fullwidth colon)
    // delimiter so the stored `plan` is the user's actual override text,
    // not the protocol delimiter. Caught by smoke-hitl-langgraph.ts.
    const tail = raw.slice('[EDIT_PLAN]'.length).trim()
    const plan = tail.replace(/^[:：]\s*/, '')
    return { kind: 'edit_plan', plan }
  }
  return { kind: 'rejected' }
}
