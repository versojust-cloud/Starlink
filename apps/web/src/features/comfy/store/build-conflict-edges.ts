/**
 * Build ReactFlow edges that visualize critic-detected conflicts as
 * red dotted lines BETWEEN the BMC cells they implicate.
 *
 * Replaces the previous "conflicts as separate floor-stacked cards"
 * layout — the canvas IS the visual now: each conflict shows as an
 * edge from cell-A to cell-B, severity colored, click-to-expand.
 *
 * Mapping strategy (priority order):
 *   1. conflictType → canonical cell pair (most semantic)
 *      - 'resource-goal'        → key-resources ↔ revenue-streams
 *      - 'channel-product'      → channels ↔ value-propositions
 *      - 'compliance-business'  → customer-segments ↔ key-activities
 *      - 'other'                → fall back to (2)
 *   2. relatedAgents pair      → one representative cell per agent
 *      - Market_Agent           → customer-segments
 *      - Product_Agent          → value-propositions
 *      - Finance_Agent          → revenue-streams
 *
 * Edge style: press-red 1.5 px dashed, animated:false. Severity
 * encoded via opacity (high=1, moderate=0.7, low=0.45).
 */

import type { Edge } from 'reactflow'
import type { MacraNodeData } from '@/types/macra'

const PRESS_RED = '#B33028'

type ConflictType = 'resource-goal' | 'channel-product' | 'compliance-business' | 'other'

const CONFLICT_TYPE_PAIR: Record<ConflictType, [string, string]> = {
  'resource-goal':       ['product-key-resources',       'finance-revenue-streams'],
  'channel-product':     ['market-channels',             'product-value-propositions'],
  'compliance-business': ['market-customer-segments',    'product-key-activities'],
  'other':               ['product-value-propositions',  'market-customer-segments'], // fallback
}

const AGENT_REP_CELL: Record<string, string> = {
  'Market_Agent':  'market-customer-segments',
  'Product_Agent': 'product-value-propositions',
  'Finance_Agent': 'finance-revenue-streams',
}

const SEVERITY_OPACITY: Record<string, number> = {
  high:     1,
  moderate: 0.7,
  low:      0.45,
}

export function buildConflictEdges(macraNodes: Map<string, MacraNodeData>, presentNodeIds: Set<string>): Edge[] {
  const conflicts = Array.from(macraNodes.values()).filter((n) => n.type === 'conflict-alert')
  const edges: Edge[] = []

  for (const conflict of conflicts) {
    const c = conflict as MacraNodeData & {
      conflictType?: string
      relatedAgents?: string[]
      severity?: string
    }
    const severity = (c.severity ?? 'high').toLowerCase()
    const opacity = SEVERITY_OPACITY[severity] ?? 1

    let sourceCell: string | undefined
    let targetCell: string | undefined

    // 1) conflictType-based mapping (preferred — semantic)
    const ct = c.conflictType
    if (ct && ct in CONFLICT_TYPE_PAIR) {
      const pair = CONFLICT_TYPE_PAIR[ct as ConflictType]
      sourceCell = pair[0]
      targetCell = pair[1]
    }

    // 2) Fallback to relatedAgents → representative cells
    if (!sourceCell || !targetCell) {
      const agents = (c.relatedAgents ?? []).map((a) => AGENT_REP_CELL[a]).filter(Boolean)
      if (agents.length >= 2) {
        sourceCell = agents[0]
        targetCell = agents[1]
      } else if (agents.length === 1) {
        // Single agent — connect to value-propositions (visual center)
        sourceCell = agents[0]
        targetCell = 'product-value-propositions'
      } else {
        // No info at all — skip
        continue
      }
    }

    // Verify both cells are actually on the canvas; skip if missing
    if (!sourceCell || !targetCell) continue
    if (!presentNodeIds.has(sourceCell) || !presentNodeIds.has(targetCell)) continue
    if (sourceCell === targetCell) continue

    edges.push({
      id: `conflict-edge-${conflict.id}`,
      source: sourceCell,
      target: targetCell,
      type: 'smoothstep',
      animated: false,
      // ReactFlow renders edges in a layer below nodes by default; lifting
      // zIndex to 10 ensures the dashed conflict line stays visible even
      // when its bezier path crosses an intermediate BMC cell.
      zIndex: 10,
      // Larger hit area for click → easier to target a thin dashed line.
      interactionWidth: 24,
      // Smoothstep-specific path option: rounder corners read as "flow"
      // rather than a sharp router-grade right-angle.
      pathOptions: { borderRadius: 16, offset: 24 },
      // Pass conflict id through edge data for click handler
      data: {
        conflictId: conflict.id,
        severity,
        title: conflict.label ?? '维度冲突',
      },
      style: {
        stroke: PRESS_RED,
        strokeWidth: 1.5,
        strokeDasharray: '5 4',
        opacity,
      },
      labelStyle: {
        fontFamily: 'var(--font-jetbrains-mono)',
        fontSize: 9,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        fill: PRESS_RED,
        fontWeight: 700,
      },
      labelBgStyle: {
        fill: '#FFFFFF',
        fillOpacity: 0.95,
      },
      labelBgPadding: [4, 6] as [number, number],
      label: severity === 'high' ? '严重' : severity === 'moderate' ? '中' : '轻',
    })
  }

  return edges
}
