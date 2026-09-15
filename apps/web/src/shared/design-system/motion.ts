/**
 * Editorial Boardroom v2 motion vocabulary (2026-05-01).
 *
 * THREE allowed motions. Period. The skill mandate is "extreme
 * restraint" — editorial layouts move like newsprint pages, not like
 * gaming UI. Anything not in this file does not ship.
 *
 *   1. publish    — agent dispatch lands in Wire / cell content updates
 *   2. swap       — short crossfade for "this state replaced that one"
 *   3. pageFold   — horizontal page transition (route change)
 *
 * EXPLICITLY BANNED:
 *   - spring physics (bouncy)
 *   - blur / glow filters
 *   - scale-in entry on hover
 *   - shadow throb
 *   - any motion > 200ms
 *
 * All variants honour `prefers-reduced-motion` automatically through
 * Framer Motion's built-in reduce-motion handling — when the user has
 * the OS preference set, everything snaps to its destination.
 */

import type { Variants, Transition } from 'framer-motion'

// ============================================================================
// 1. publish — agent dispatch lands
// ============================================================================
//
// 8px upward slide + opacity 0→1 over 80ms. Used when:
//   - a new transcript line lands in Wire
//   - a BMC cell receives its first content
//   - Conductor announces phase change
//
// The 8px / 80ms combination reads as "page settled" rather than "thing
// flew in" — it's the editorial equivalent of typesetting one more line.

export const publishVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.08, ease: [0.25, 0.1, 0.25, 1] }, // ease-out
  },
}

export const publishTransition: Transition = {
  duration: 0.08,
  ease: [0.25, 0.1, 0.25, 1],
}

// ============================================================================
// 2. swap — crossfade for "this replaced that"
// ============================================================================
//
// 120ms opacity swap. Used when a cell's content updates in place
// (revision rounds, agent edits). NO movement — the spatial position
// stays so the eye doesn't have to re-find the cell.

export const swapVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.12, ease: 'linear' },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.12, ease: 'linear' },
  },
}

// ============================================================================
// 3. pageFold — horizontal page transition
// ============================================================================
//
// 200ms slide + fade. Used only on top-level route changes (workspace
// → dashboard, etc). Not for in-page state changes. Direction is always
// rightward (next page enters from right) unless the user navigates
// back — then leftward.

export const pageFoldVariants: Variants = {
  initial: (direction: 'forward' | 'back') => ({
    opacity: 0,
    x: direction === 'forward' ? 24 : -24,
  }),
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
  },
  exit: (direction: 'forward' | 'back') => ({
    opacity: 0,
    x: direction === 'forward' ? -24 : 24,
    transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
  }),
}

// ============================================================================
// CSS keyframes — for non-Framer surfaces (e.g. plain HTML pages, RSC)
// ============================================================================

export const cssKeyframes = `
@keyframes editorial-publish {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes editorial-swap {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .editorial-publish,
  .editorial-swap {
    animation: none !important;
  }
}
`.trim()

export const cssClasses = {
  publish: 'editorial-publish',
  swap:    'editorial-swap',
} as const
