/**
 * Editorial Boardroom v2 design tokens (2026-05-01).
 *
 * Replaces (gradually) the warm peach/coral tokens at ./tokens.ts and
 * the Stellar Cartographer console at features/comfy/components/canvas-design-tokens.ts.
 * v2 commits to ONE aesthetic — newspaper editorial × boardroom — with
 * three rule weights (no shadows), one accent (sparingly used), and
 * Fraunces / Geist / JetBrains Mono typography.
 *
 * Migration: surfaces opt into v2 by importing from this file. Old
 * tokens.ts stays valid until the surface is migrated. Once all
 * features import from tokens-v2, P4 deletes the old tokens.
 */

// ============================================================================
// COLOR — ink-on-paper inversion + single press red
// ============================================================================
//
// True black background takes 47% less power on OLED while keeping the
// editorial "high-contrast newsprint" feel. Paper is warm off-white
// (#F4F0E8), not pure white — pure white reads as "AI slop" generic.
// 4 ash levels give us text + container + border depth without ever
// reaching for shadows.

export const ink = {
  /** Background. True black for OLED + maximum editorial contrast. */
  primary: '#0A0A0A',
  /** First-level container — slightly lifted from background. */
  ash1: '#161514',
  /** Second-level container or subtle separator. */
  ash2: '#2A2826',
  /** Low-priority text or de-emphasised UI. */
  ash3: '#4A4744',
  /** Meta info (timestamps, byline kicker). */
  ash4: '#8A8784',
} as const

export const paper = {
  /** Surface (warm off-white — newsprint feel). */
  primary: '#F4F0E8',
  /** Slightly cooler container surface. */
  ash1: '#ECEAE4',
  /** Border or hairline rule on paper. */
  ash2: '#D8D5CE',
  /** Low-priority text on paper. */
  ash3: '#6E6B66',
} as const

/** Single accent — newsroom red. Use SPARINGLY (one per screen, max).
 *  Reserved semantically for: debate active / HITL pending / critical error.
 *  If you find yourself reaching for press-red on more than one element
 *  you're misusing it — it loses signal. */
export const press = {
  primary: '#B33028',
  /** Hover/active for press buttons. */
  active: '#8F2620',
  /** Subtle on-paper background for press notices. */
  paperWash: '#F2D6D2',
} as const

// ============================================================================
// RULE — three weights (newspaper convention)
// ============================================================================
//
// Editorial layouts express hierarchy through line weight, not drop
// shadows. Strong rule = section divider. Mid = within-section. Hair =
// inline element separator (e.g. between byline and body).

export const rules = {
  strong: { width: '1.5px', color: ink.ash1, opacity: 0.8 },
  mid:    { width: '1px',   color: ink.ash2, opacity: 0.4 },
  hair:   { width: '0.5px', color: ink.ash3, opacity: 0.16 },
} as const

// As Tailwind-friendly border helpers:
export const borderClass = {
  strong: 'border-[1.5px] border-[#161514]/80',
  mid:    'border-[1px] border-[#2A2826]/40',
  hair:   'border-[0.5px] border-[#4A4744]/16',
} as const

// ============================================================================
// SPACING — 4px base × 8-column newspaper grid
// ============================================================================

export const space = {
  px1: '4px',
  px2: '8px',
  px3: '12px',
  px4: '16px',
  px5: '24px',
  px6: '32px',
  px7: '48px',
  px8: '64px',
} as const

/** Reading measure cap — newspaper typography research says 60-75ch. */
export const measure = {
  /** Body text in Wire / Stacks columns. */
  body: '64ch',
  /** Cell content in Frontpage. */
  cell: '52ch',
  /** Display headlines. */
  display: '32ch',
} as const

// ============================================================================
// MOTION — durations only; keyframes live in motion.ts
// ============================================================================

export const motion = {
  /** slide-up + fade-in (agent dispatch publish). */
  publish: '80ms',
  /** crossfade (cell content swap). */
  swap: '120ms',
  /** paper-fold (page transition). */
  pageFold: '200ms',
} as const

// ============================================================================
// GRID — 8-col newspaper convention
// ============================================================================

export const grid = {
  /** Top-level page grid: 8 columns + 24px gutters. */
  cols: 8,
  gutterPx: 24,
  /** BMC frontpage subgrid: 3×3 BMC cells over the inner 6 columns. */
  bmcCols: 6,
  bmcRows: 3,
} as const

// ============================================================================
// AGENT BYLINE COLORS — 4 generative + 1 critical (per-agent kicker tint)
// ============================================================================
//
// Each agent gets a single-letter kicker in their byline (M/P/F/C/S).
// On ink: kicker is paper-tinted with a hairline accent below.
// On paper: kicker is ink-tinted. The accent below differs per agent —
// muted, NOT the press red (which is reserved). These are reading-aid
// colors, not decoration.

export const bylineAccent = {
  market:             '#9B8E70',  // warm brown — market/customers
  product:            '#7A8B7E',  // sage — product/value
  finance:            '#6E7A8C',  // slate-blue — finance/numbers
  critic:             '#8C6E6E',  // muted brick — critic
  synthesizer:        '#6B6B7C',  // warm gray — synthesis/integration
  // Mention system additions (agent-mention-system 2026-05-04):
  // 4 debate participants + general / research. Opponent variants are
  // deeper / more saturated than their proponent counterparts to read
  // as "challenging" without using press-red (reserved for HITL).
  'market-opponent':  '#7A4A40',  // deep brick-brown — market challenger
  'product-opponent': '#4A5C50',  // deep moss — product challenger
  'finance-opponent': '#3F4A5C',  // deep slate — finance challenger
  moderator:          '#5C5C6E',  // cool neutral gray-blue — judge
  general:            '#7C7C7C',  // neutral mid gray — general responder
  research:           '#5E6F6F',  // dark teal — deep research
} as const

export type AgentByline = keyof typeof bylineAccent

// ============================================================================
// EXPORT — flat constants for tailwind.config.ts and globals.css
// ============================================================================

export const editorialTokens = {
  ink,
  paper,
  press,
  rules,
  borderClass,
  space,
  measure,
  motion,
  grid,
  bylineAccent,
} as const

export type EditorialTokens = typeof editorialTokens
