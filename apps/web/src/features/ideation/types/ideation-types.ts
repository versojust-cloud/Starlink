/**
 * Ideation Canvas types — Stage A foundation.
 *
 * Design rationale: nodes are intentionally typed as a UNION rather than a
 * single shape with optional fields, because each node kind carries different
 * semantic metadata (HypothesisNode has status, RiskNode has severity, etc).
 * The union is exhaustive — adding a new kind requires updating both
 * IDEATION_NODE_KINDS and the IdeationNodeData union.
 *
 * Inspired by Meflex (Luo et al. 2026): the canvas is a non-linear collection
 * of *idea fragments* that the user iterates with AI reflection support — NOT
 * a fixed BMC 9-grid. The 9 kinds below are the fragment vocabulary.
 */

export const IDEATION_NODE_KINDS = [
  'core-idea',
  'customer-pain',
  'value-angle',
  'hypothesis',
  'validation-channel',
  'revenue',
  'risk',
  'evidence',
  'reflection'
] as const

export type IdeationNodeKind = (typeof IDEATION_NODE_KINDS)[number]

interface BaseNodeData {
  kind: IdeationNodeKind
  label: string
  /** Markdown body. */
  content: string
  createdAt: string
  updatedAt: string
}

export type CoreIdeaNodeData = BaseNodeData & {
  kind: 'core-idea'
  /** One-sentence pitch — distinct from the freeform content body. */
  pitch?: string
}

export type CustomerPainNodeData = BaseNodeData & {
  kind: 'customer-pain'
  /** "frequent / occasional / rare" — how often the user hits the pain. */
  frequency?: 'frequent' | 'occasional' | 'rare'
  intensity?: 'mild' | 'moderate' | 'severe'
}

export type ValueAngleNodeData = BaseNodeData & {
  kind: 'value-angle'
  /** Quick differentiation tag — "cheaper" / "faster" / "more accurate" etc. */
  axis?: string
}

export type HypothesisNodeData = BaseNodeData & {
  kind: 'hypothesis'
  status?: 'unverified' | 'in-progress' | 'verified' | 'falsified'
  /** One-line falsifiable claim, distinct from the freeform content. */
  claim?: string
}

export type ValidationChannelNodeData = BaseNodeData & {
  kind: 'validation-channel'
  /** "interview / landing-page / mvp / desk-research" */
  method?: 'interview' | 'landing-page' | 'mvp' | 'desk-research' | 'other'
  /** Estimated cost in informal units — kept as plain strings on purpose. */
  costTime?: string
  costMoney?: string
}

export type RevenueNodeData = BaseNodeData & {
  kind: 'revenue'
  model?: 'subscription' | 'transaction' | 'license' | 'ads' | 'service' | 'other'
  unitEconomics?: string
}

export type RiskNodeData = BaseNodeData & {
  kind: 'risk'
  severity?: 'low' | 'medium' | 'high'
  category?: 'market' | 'tech' | 'regulatory' | 'team' | 'finance'
}

export type EvidenceNodeData = BaseNodeData & {
  kind: 'evidence'
  source?: 'interview' | 'paper' | 'data' | 'observation' | 'web' | 'other'
  /** Optional URL or citation pointer. */
  citationUrl?: string
}

export type ReflectionNodeData = BaseNodeData & {
  kind: 'reflection'
  /** Which Meflex-style scaffold this prompt is — surfaced for analytics. */
  scaffold?: 'why' | 'how' | 'so-what' | 'evidence-needed' | 'meta'
  /** Has the user acted on this prompt yet? */
  acknowledged?: boolean
}

export type IdeationNodeData =
  | CoreIdeaNodeData
  | CustomerPainNodeData
  | ValueAngleNodeData
  | HypothesisNodeData
  | ValidationChannelNodeData
  | RevenueNodeData
  | RiskNodeData
  | EvidenceNodeData
  | ReflectionNodeData

/** Shape of palette items consumed by IdeationNodePalette. */
export interface IdeationPaletteItem {
  kind: IdeationNodeKind
  label: string
  /** Single-character or short emoji rendered inside the icon chip. */
  icon: string
  /** Two-line description shown under label in the palette. */
  description: string
}
