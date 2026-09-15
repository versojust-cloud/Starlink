/**
 * Override node positions to the canonical BMC 9-cell layout, instead
 * of trusting the single-column layout the server emits.
 *
 *   ┌─────────┬───────────┬───────────┬───────────┬───────────┐
 *   │   KP    │     KA    │     VP    │     CR    │     CS    │
 *   │         ├───────────┤           ├───────────┤           │
 *   │ (tall)  │     KR    │  (tall)   │     CH    │  (tall)   │
 *   ├─────────┴───────────┴───────────┴───────────┴───────────┤
 *   │                COST                │      REV          │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ CONFLICT-1   CONFLICT-2   CONFLICT-3   CONFLICT-4 ...   │  ← conflicts row
 *   └──────────────────────────────────────────────────────────┘
 *
 * Header strip (above row 1): root + insight notes.
 * Right column: agent avatars (market / product / finance).
 * Below bottom row: critic-output conflict-alert nodes.
 *
 * Card widths (max measured at runtime):
 *   - BMC card:    340px wide × ~300px tall
 *   - agent avatar: 360px × ~216px
 *   - insight:     360px × ~200px
 *   - report card: 420px × ~200px
 *   - conflict:    320px × ~280px
 *   - data-source: 340px × ~200px
 *
 * The BMC grid:
 *   col 0: x=80, col 1: x=480, col 2: x=880, col 3: x=1280, col 4: x=1680.
 *
 * COLLISION-AVOIDANCE STRATEGY (P-fix · 2026-05-06):
 *   - Root sits ALONE at x=COL[2]=880, y=-120 (centre of header band).
 *   - Insight strip uses 4 explicit X slots that SKIP the centre column
 *     so insights never sit on top of root.
 *   - Report card row uses 3 explicit X slots that also skip centre.
 *   - When more than 4 insights / 3 reports exist, overflow goes to the
 *     overflow band BELOW the conflict zone (rather than wrapping up
 *     and racing the report band for vertical real estate).
 *   - Avatar rail at x=COL[4]+460=2140 has its own column; nothing else
 *     uses it.
 *   - Data-source nodes stack BELOW avatars in the same right rail.
 *   - Conflicts in 5×N grid below BMC, row height 320 to fit tall bodies.
 */

import type { Node } from 'reactflow'

const COL = [80, 480, 880, 1280, 1680] as const

/**
 * Vertical band layout (top → down on canvas).
 *
 * The root note can carry the wizard-graduation STRONG seed, which
 * inflates to ~500px tall (full 7-dimension summary). That broke the
 * old layout (header=-120, top=200) — root overflowed into the BMC
 * top row by ~170px. We now give root a 550px slot of its own and
 * push insights / reports above accordingly.
 *
 *   reports:  -880  (200 tall)
 *   gap:       40
 *   insights: -640  (200 tall)
 *   gap:       80
 *   root:     -360  (500 tall, extends to ~+140)
 *   gap:       60
 *   bmc top:  200   (down to ~520)
 *   bmc mid:  520
 *   bmc bot:  900
 *   conflicts: 1300
 *   overflow:  2400
 */
const ROW = {
  /** Top-most band: report cards. 200px tall + 40px gap to insights below. */
  reportTop: -880,
  /** Insight strip — 200px tall, 80px gap to root below. */
  insightStrip: -640,
  /** Root note — sized for ~500px tall STRONG-seed body, 60px gap to BMC top. */
  header: -360,
  /** BMC main grid. */
  top: 200,
  mid: 520,
  bottom: 900,
  /** Conflict-alert row(s) live below the BMC bottom row. */
  conflicts: 1300,
  /** Overflow band — for insights / reports that exceed their primary
   *  slot count. Sits well below the assumed conflict footprint
   *  (3 conflict rows × 320 = 960 → conflicts may extend to ~2260 max). */
  overflow: 2400,
} as const

/** Vertical gap when conflicts wrap to a second row.
 *  Conflict-alert nodes can grow to ~280px tall once content + tags
 *  fill in. Earlier value (320) left only 40px buffer — multi-line
 *  body + severity tags + relatedAgents could overflow into the next
 *  row. Bumped to 360 to give 80px safe buffer (P8 audit).
 */
const CONFLICT_ROW_HEIGHT = 360

/** Overflow band horizontal pitch + vertical pitch. */
const OVERFLOW_PITCH_X = 400
const OVERFLOW_ROW_HEIGHT = 240

/** Insight strip X slots — explicit list that SKIPS COL[2]=880 (root's
 *  column) and stops at COL[4] before the avatar rail (COL[4]+460).
 *  Result: at most 4 insights in the primary band; 5th+ overflows
 *  below conflicts (no upward wrap that would collide with reports).
 */
const INSIGHT_X_SLOTS = [COL[0], COL[1], COL[3], COL[4]] as const

/** Report card X slots — 420px wide cards need 460px pitch. With centre
 *  column skipped + avatar rail off-limits, 3 slots fit cleanly:
 *    slot 0: 80–500, slot 1: 540–960 (skip 880 root), slot 2: 1280–1700.
 *  Beyond 3 reports, overflow below.
 *
 *  ReactFlow virtualises canvas-space, so absolute x doesn't matter
 *  for "fits on iPad" — fitView pans + zooms to show everything. The
 *  audit's "offscreen at <1280" claim was a viewport-vs-canvas
 *  confusion; reverted to original positions.
 */
const REPORT_X_SLOTS = [COL[0], COL[1] + 60, COL[3]] as const

/** Approximate BMC bounding rect — used to shove unpositioned data-source
 *  nodes off the canvas main grid when the server doesn't pin them.
 */
function isInsideBmcRect(x: number, y: number): boolean {
  return x >= COL[0] - 20 && x <= COL[4] + 360 && y >= ROW.top - 20 && y <= ROW.bottom + 280
}

const POSITION_MAP: Record<string, { x: number; y: number }> = {
  // Row 1 — top tier (5 columns)
  'product-key-partnerships':      { x: COL[0], y: ROW.top },     // KP
  'product-key-activities':        { x: COL[1], y: ROW.top },     // KA
  'product-value-propositions':    { x: COL[2], y: ROW.top },     // VP
  'market-customer-relationships': { x: COL[3], y: ROW.top },     // CR
  'market-customer-segments':      { x: COL[4], y: ROW.top },     // CS

  // Row 2 — mid tier (only KA→KR and CR→CH stack vertically)
  'product-key-resources':         { x: COL[1], y: ROW.mid },     // KR (below KA)
  'market-channels':               { x: COL[3], y: ROW.mid },     // CH (below CR)

  // Row 3 — bottom tier (cost spans cols 0-1, revenue spans cols 2-4)
  'finance-cost-structure':        { x: COL[0] + 200, y: ROW.bottom }, // COST mid
  'finance-revenue-streams':       { x: COL[2] + 200, y: ROW.bottom }, // REV mid

  // Right rail — agent avatars (their own column at x=2140, no neighbour)
  'avatar-market':                 { x: COL[4] + 460, y: ROW.top },
  'avatar-product':                { x: COL[4] + 460, y: ROW.mid },
  'avatar-finance':                { x: COL[4] + 460, y: ROW.bottom },
}

/** Header notes: root + insight note (orchestrator output). */
const HEADER_KEYS = ['root'] as const

const matchHeader = (id: string) => HEADER_KEYS.find((k) => id.startsWith(`${k}-`)) ?? null

const isConflictNode    = (id: string) => id.startsWith('conflict-')
const isInsightNode     = (id: string) => id.startsWith('insight-')
const isReportNode      = (id: string) => id.startsWith('report-')
const isDataSourceNode  = (id: string) => id.startsWith('data-source-') || id.startsWith('ds-')
/** Mention-router output nodes (@critic / @synthesizer / @opponent /
 *  @moderator / @general-responder etc.). They share the same visual
 *  shape as insight-note but historically had unique id prefixes that
 *  fell through `applyBmcLayout`'s match list, ending up at server-issued
 *  positions that piled on top of the BMC cells.
 */
const isMentionNode = (id: string) =>
  id.startsWith('mention-')
  || id.startsWith('general-response-')
  || id.startsWith('opponent-')
  || id.startsWith('moderator-')
  || id.startsWith('synthesizer-')
  || id.startsWith('critic-')
  || id.startsWith('deep-research-')

export function applyBmcLayout<T extends Node>(nodes: T[]): T[] {
  let conflictOffset = 0
  let insightOffset = 0
  let reportOffset = 0
  let dataSourceOffset = 0
  /** Combined overflow counter for insights + reports that exceed
   *  their primary band's slot count — they all share the overflow
   *  band below conflicts. Sharing the counter keeps the overflow
   *  grid contiguous (no gaps). */
  let overflowOffset = 0

  return nodes.map((node) => {
    const pos = POSITION_MAP[node.id]
    if (pos) {
      return { ...node, position: pos }
    }
    if (matchHeader(node.id)) {
      // Root note: alone at COL[2], y=-120. Insight strip explicitly
      // skips COL[2] so this position never collides.
      return { ...node, position: { x: COL[2], y: ROW.header } }
    }

    if (isReportNode(node.id)) {
      if (reportOffset < REPORT_X_SLOTS.length) {
        const x = REPORT_X_SLOTS[reportOffset]
        reportOffset += 1
        return { ...node, position: { x, y: ROW.reportTop } }
      }
      // Overflow: 4th+ report goes below conflicts.
      const i = overflowOffset++
      return placeOverflow(node, i)
    }

    if (isInsightNode(node.id)) {
      if (insightOffset < INSIGHT_X_SLOTS.length) {
        const x = INSIGHT_X_SLOTS[insightOffset]
        insightOffset += 1
        return { ...node, position: { x, y: ROW.insightStrip } }
      }
      const i = overflowOffset++
      return placeOverflow(node, i)
    }

    if (isMentionNode(node.id)) {
      // Mention-router output (@critic / @opponent / @moderator / etc.)
      // — visually similar to insight-note but tagged separately so we
      // can keep them out of the primary insight band when the user
      // fires off many mentions in one session. They go straight to
      // the overflow band.
      const i = overflowOffset++
      return placeOverflow(node, i)
    }

    if (isConflictNode(node.id)) {
      // Conflict row(s) below bottom — 5 columns matching BMC top row,
      // wrap to second row at index ≥ 5. Row height widened to 320px to
      // accommodate node bodies that grew with severity tags + relatedAgents.
      const col = conflictOffset % 5
      const row = Math.floor(conflictOffset / 5)
      conflictOffset += 1
      return {
        ...node,
        position: {
          x: COL[col],
          y: ROW.conflicts + row * CONFLICT_ROW_HEIGHT
        }
      }
    }

    if (isDataSourceNode(node.id)) {
      // Data-source nodes: pin to the right rail BELOW the avatar stack
      // (avatars occupy y=200/520/900). Stack at COL[4]+460 starting at
      // y=ROW.bottom + 320 ≈ 1220 with 200px pitch.
      // If the server already gave a position outside the BMC rect AND
      // outside the avatar+overflow column, trust it.
      const sx = node.position?.x
      const sy = node.position?.y
      const hasServerPos = typeof sx === 'number' && typeof sy === 'number'
      if (hasServerPos && !isInsideBmcRect(sx, sy)) {
        return node
      }
      const y = ROW.bottom + 320 + dataSourceOffset * 200
      dataSourceOffset += 1
      return { ...node, position: { x: COL[4] + 460, y } }
    }

    // Unmatched — leave server-issued position untouched.
    return node
  })
}

/**
 * Freeform layout strategy (P11.7).
 *
 * The "自由" mode used to be a pure identity (return nodes unchanged), which
 * left BMC cells stacked in a single column at the server's default
 * (ROOT_POSITION.x, nextY) positions — visually unhelpful because the
 * region labels (财务结构 / SUPPLY CHAIN / VALUE CORE / CUSTOMER · MARKET)
 * still imply a 9-cell layout but cells weren't aligned to them.
 *
 * The new freeform strategy applies the canonical POSITION_MAP only to
 * the 9 BMC cells + 3 agent avatars (the structurally fixed nodes), and
 * passes through everything else (root note, insights, reports,
 * conflicts, mention outputs, data sources). User drags persist for
 * non-BMC nodes; BMC cells always snap back to their canonical anchor
 * so the canvas stays readable as a 9-cell strategy board even in
 * freeform mode.
 *
 * If you want the cells to also be drag-persistent, switch the strategy
 * id from 'free-form' to 'free-form-strict' in the registry — but the
 * default UX is "freeform = grid stays, additions are loose".
 */
export function applyFreeformLayout<T extends Node>(nodes: T[]): T[] {
  return nodes.map((node) => {
    const pos = POSITION_MAP[node.id]
    if (pos) {
      return { ...node, position: pos }
    }
    // Everything else (root / insights / reports / conflicts / mentions /
    // data sources) keeps server-issued or user-dragged position. Server
    // emits (ROOT_POSITION.x, nextY) which stacks them vertically — that's
    // the "loose freeform" feel we want for ad-hoc additions.
    return node
  })
}

/** Place an overflow node (excess insight or report) in a 5-wide grid
 *  below conflicts. Grid pitch is 400px × 240px so neither cell type
 *  (max 360 / 200) overlaps neighbours. */
function placeOverflow<T extends Node>(node: T, index: number): T {
  const col = index % 5
  const row = Math.floor(index / 5)
  return {
    ...node,
    position: {
      x: COL[0] + col * OVERFLOW_PITCH_X,
      y: ROW.overflow + row * OVERFLOW_ROW_HEIGHT
    }
  }
}
