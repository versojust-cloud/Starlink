/**
 * Conversation lifecycle phases for Evidence-Grounded BMC system.
 *
 * Phase machine (see docs/architecture-evidence-grounded-bmc.md §12.1):
 *
 *   idle
 *     ↓ startConversation
 *   initializing
 *     ↓ (kbId?)
 *   retrieving-evidence ──(no kbId / KB error fallback)──┐
 *     ↓ evidenceSet ready                                │
 *   analyzing ←──────────────────────────────────────────┘
 *     ↓ all agents done
 *   critic-review
 *     ↓ conflict?
 *   awaiting-hitl ── user decision ──→ revising ──→ critic-review
 *     ↓ skip / no conflict                              │
 *   done                                                │
 *                                                       │
 *   (any active phase) ── error ──→ failed              │
 *   (any active phase) ── user cancel ──→ cancelled ←───┘
 */

export type ConversationPhase =
  | 'idle'
  | 'initializing'
  | 'retrieving-evidence'
  | 'analyzing'
  | 'critic-review'
  | 'awaiting-hitl'
  | 'revising'
  | 'done'
  | 'failed'
  | 'cancelled'

export const CONVERSATION_PHASES: readonly ConversationPhase[] = [
  'idle',
  'initializing',
  'retrieving-evidence',
  'analyzing',
  'critic-review',
  'awaiting-hitl',
  'revising',
  'done',
  'failed',
  'cancelled'
] as const

const TERMINAL_PHASES: ReadonlySet<ConversationPhase> = new Set([
  'done',
  'failed',
  'cancelled'
])

const ACTIVE_PHASES: ReadonlySet<ConversationPhase> = new Set([
  'initializing',
  'retrieving-evidence',
  'analyzing',
  'critic-review',
  'awaiting-hitl',
  'revising'
])

export function isTerminalPhase(phase: ConversationPhase): boolean {
  return TERMINAL_PHASES.has(phase)
}

export function isActivePhase(phase: ConversationPhase): boolean {
  return ACTIVE_PHASES.has(phase)
}

/**
 * Allowed transitions. Any transition not listed is illegal.
 * Reaching failed / cancelled is allowed from any active phase (handled separately).
 */
const ALLOWED_TRANSITIONS: Readonly<Record<ConversationPhase, readonly ConversationPhase[]>> = {
  idle: ['initializing'],
  initializing: ['retrieving-evidence', 'analyzing'],
  'retrieving-evidence': ['analyzing'],
  analyzing: ['critic-review'],
  'critic-review': ['awaiting-hitl', 'done'],
  'awaiting-hitl': ['revising', 'done', 'cancelled'],
  revising: ['critic-review'],
  done: [],
  failed: [],
  cancelled: []
}

export function canTransition(
  from: ConversationPhase,
  to: ConversationPhase
): boolean {
  // From any active phase, transition to failed / cancelled is always allowed.
  if ((to === 'failed' || to === 'cancelled') && isActivePhase(from)) {
    return true
  }
  return ALLOWED_TRANSITIONS[from].includes(to)
}

export class InvalidPhaseTransitionError extends Error {
  constructor(
    public readonly from: ConversationPhase,
    public readonly to: ConversationPhase
  ) {
    super(`Invalid phase transition: ${from} → ${to}`)
    this.name = 'InvalidPhaseTransitionError'
  }
}

export function assertTransition(
  from: ConversationPhase,
  to: ConversationPhase
): void {
  if (!canTransition(from, to)) {
    throw new InvalidPhaseTransitionError(from, to)
  }
}
