/**
 * Ideation → BMC mapping (heuristic, Stage D).
 *
 * Bridges the Meflex-style free-form ideation canvas to the canonical CC-BMC
 * 9-dimension framework so users can:
 *   1. Get an at-a-glance "where is my coverage?" view
 *   2. See gaps (which BMC dimensions have no nodes yet)
 *   3. Find which ideation node belongs in which BMC cell
 *
 * Strategy is deliberately HEURISTIC, not LLM-based, because:
 *   - Coverage view should update instantly as the user adds nodes (no
 *     800 ms debounce, no network)
 *   - The mapping rules are simple enough to be stable + auditable
 *   - LLM-driven mapping is a Stage E enhancement (semantic refinement)
 *
 * Mapping rules (per ideation node KIND):
 *   core-idea           → 价值主张
 *   customer-pain       → 客户细分 (primary) + 价值主张 (secondary)
 *   value-angle         → 价值主张
 *   hypothesis          → resolve via linked-from kind:
 *                            from customer-pain   → 客户细分
 *                            from value-angle     → 价值主张
 *                            from validation-...  → 渠道通路
 *                            from revenue         → 收入来源
 *                            from risk            → 成本结构
 *                            otherwise            → 价值主张 (default)
 *   validation-channel  → 渠道通路
 *   revenue             → 收入来源
 *   risk                → 成本结构 (primary) + 重要合作 (secondary)
 *   evidence            → follows the kind of whatever it's linked to;
 *                          if unlinked, marked unmapped
 *   reflection          → SKIPPED (meta-only commentary, not part of BMC)
 *
 * Output is the per-dimension grouping plus a coverage record so the UI can
 * render both the cell list and the scorecard from one pass.
 */

import { CC_BMC_DOMAINS, type CCBMCDomain } from '@/types/macra'
import type { Edge } from 'reactflow'
import type { IdeationFlowNode } from '../store/ideation-store'
import type { IdeationNodeKind } from '../types/ideation-types'

// =============================================================================
// Public types
// =============================================================================

export interface MappedNode {
  /** Underlying ReactFlow node id */
  id: string
  /** Original kind (used for hue + icon lookup) */
  kind: IdeationNodeKind
  label: string
  /** Trimmed body text — caller decides how much to show */
  content: string
  /** 0.0 - 1.0 — 1.0 means "this is squarely this dimension" */
  weight: number
}

export interface BmcMappingResult {
  byDimension: Record<CCBMCDomain, MappedNode[]>
  /** Nodes that couldn't be assigned to any dimension (e.g. orphan evidence) */
  unmapped: MappedNode[]
  /** Reflections — separated because they're meta-commentary, not BMC content */
  reflections: MappedNode[]
  coverage: {
    /** Number of dimensions with at least 1 node mapped */
    covered: number
    /** Always 9 */
    total: number
    /** Per-dimension presence flags, in canonical BMC order */
    perDimension: Array<{ domain: CCBMCDomain; count: number; covered: boolean }>
  }
}

// =============================================================================
// Implementation
// =============================================================================

const D = CC_BMC_DOMAINS

/** Return the dim(s) a given ideation kind maps to, with weights. */
function staticKindRoute(kind: IdeationNodeKind): Array<{ dim: CCBMCDomain; weight: number }> {
  switch (kind) {
    case 'core-idea':
      return [{ dim: D.VALUE_PROPOSITIONS, weight: 1.0 }]
    case 'customer-pain':
      return [
        { dim: D.CUSTOMER_SEGMENTS, weight: 0.7 },
        { dim: D.VALUE_PROPOSITIONS, weight: 0.3 }
      ]
    case 'value-angle':
      return [{ dim: D.VALUE_PROPOSITIONS, weight: 1.0 }]
    case 'validation-channel':
      return [{ dim: D.CHANNELS, weight: 1.0 }]
    case 'revenue':
      return [{ dim: D.REVENUE_STREAMS, weight: 1.0 }]
    case 'risk':
      return [
        { dim: D.COST_STRUCTURE, weight: 0.6 },
        { dim: D.KEY_PARTNERSHIPS, weight: 0.4 }
      ]
    // hypothesis / evidence / reflection handled separately (need edge context)
    default:
      return []
  }
}

/**
 * For a hypothesis, infer its dim from incoming edges (its "parent" in the
 * canvas). The strongest signal is whichever parent has the most specific
 * kind. We pick the FIRST predecessor's kind and route as if the hypothesis
 * were that kind. Falls back to VALUE_PROPOSITIONS if there's no parent.
 */
function routeHypothesis(
  nodeId: string,
  edges: Edge[],
  nodeKindById: Map<string, IdeationNodeKind>
): Array<{ dim: CCBMCDomain; weight: number }> {
  const incoming = edges.filter((e) => e.target === nodeId)
  for (const edge of incoming) {
    const parentKind = nodeKindById.get(edge.source)
    if (!parentKind) continue
    if (parentKind === 'customer-pain') {
      return [{ dim: D.CUSTOMER_SEGMENTS, weight: 0.8 }]
    }
    if (parentKind === 'validation-channel') {
      return [{ dim: D.CHANNELS, weight: 0.8 }]
    }
    if (parentKind === 'revenue') {
      return [{ dim: D.REVENUE_STREAMS, weight: 0.8 }]
    }
    if (parentKind === 'risk') {
      return [{ dim: D.COST_STRUCTURE, weight: 0.6 }]
    }
    // value-angle / core-idea / hypothesis chain → default to VP
  }
  return [{ dim: D.VALUE_PROPOSITIONS, weight: 0.6 }]
}

/**
 * For evidence, follow the FIRST outgoing edge's target kind (evidence
 * supports a hypothesis / claim, so it should sit where its claim sits).
 * If unlinked, return [] → caller marks it unmapped.
 */
function routeEvidence(
  nodeId: string,
  edges: Edge[],
  nodeKindById: Map<string, IdeationNodeKind>
): Array<{ dim: CCBMCDomain; weight: number }> {
  const outgoing = edges.filter((e) => e.source === nodeId)
  const incoming = edges.filter((e) => e.target === nodeId)
  const link = outgoing[0] ?? incoming[0]
  if (!link) return []
  const linkedNodeId = link.source === nodeId ? link.target : link.source
  const linkedKind = nodeKindById.get(linkedNodeId)
  if (!linkedKind) return []
  // Recurse: route the linked node's kind, but cap weight at 0.5 — evidence
  // is supportive, not the primary content of any dimension.
  if (linkedKind === 'hypothesis') {
    const hypoRoute = routeHypothesis(linkedNodeId, edges, nodeKindById)
    return hypoRoute.map((r) => ({ ...r, weight: Math.min(r.weight, 0.5) }))
  }
  return staticKindRoute(linkedKind).map((r) => ({ ...r, weight: Math.min(r.weight, 0.5) }))
}

// =============================================================================
// Public API
// =============================================================================

export function mapIdeationToBmc(
  nodes: IdeationFlowNode[],
  edges: Edge[]
): BmcMappingResult {
  const nodeKindById = new Map<string, IdeationNodeKind>()
  for (const n of nodes) nodeKindById.set(n.id, n.data.kind)

  const byDimension: Record<CCBMCDomain, MappedNode[]> = {
    [D.CUSTOMER_SEGMENTS]: [],
    [D.CUSTOMER_RELATIONSHIPS]: [],
    [D.CHANNELS]: [],
    [D.VALUE_PROPOSITIONS]: [],
    [D.REVENUE_STREAMS]: [],
    [D.KEY_ACTIVITIES]: [],
    [D.KEY_RESOURCES]: [],
    [D.KEY_PARTNERSHIPS]: [],
    [D.COST_STRUCTURE]: []
  }
  const unmapped: MappedNode[] = []
  const reflections: MappedNode[] = []

  for (const node of nodes) {
    const kind = node.data.kind
    const baseShape: Omit<MappedNode, 'weight'> = {
      id: node.id,
      kind,
      label: node.data.label,
      content: node.data.content
    }

    if (kind === 'reflection') {
      reflections.push({ ...baseShape, weight: 1.0 })
      continue
    }

    let routes: Array<{ dim: CCBMCDomain; weight: number }>
    if (kind === 'hypothesis') {
      routes = routeHypothesis(node.id, edges, nodeKindById)
    } else if (kind === 'evidence') {
      routes = routeEvidence(node.id, edges, nodeKindById)
    } else {
      routes = staticKindRoute(kind)
    }

    if (routes.length === 0) {
      unmapped.push({ ...baseShape, weight: 0 })
      continue
    }

    for (const r of routes) {
      byDimension[r.dim].push({ ...baseShape, weight: r.weight })
    }
  }

  // Coverage scorecard, in canonical BMC reading order
  const orderedDomains: CCBMCDomain[] = [
    D.CUSTOMER_SEGMENTS,
    D.VALUE_PROPOSITIONS,
    D.CUSTOMER_RELATIONSHIPS,
    D.CHANNELS,
    D.REVENUE_STREAMS,
    D.KEY_ACTIVITIES,
    D.KEY_RESOURCES,
    D.KEY_PARTNERSHIPS,
    D.COST_STRUCTURE
  ]
  const perDimension = orderedDomains.map((domain) => ({
    domain,
    count: byDimension[domain].length,
    covered: byDimension[domain].length > 0
  }))

  return {
    byDimension,
    unmapped,
    reflections,
    coverage: {
      covered: perDimension.filter((d) => d.covered).length,
      total: 9,
      perDimension
    }
  }
}

/** Short uppercase abbreviation for the coverage scorecard (CS / VP / CR …). */
export const BMC_ABBR: Record<CCBMCDomain, string> = {
  [D.CUSTOMER_SEGMENTS]: 'CS',
  [D.CUSTOMER_RELATIONSHIPS]: 'CR',
  [D.CHANNELS]: 'CH',
  [D.VALUE_PROPOSITIONS]: 'VP',
  [D.REVENUE_STREAMS]: 'RS',
  [D.KEY_ACTIVITIES]: 'KA',
  [D.KEY_RESOURCES]: 'KR',
  [D.KEY_PARTNERSHIPS]: 'KP',
  [D.COST_STRUCTURE]: 'CT'
}
