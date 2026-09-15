'use client'

/**
 * CC-BMC 9 宫格画布组件
 * 将 Agent 产出的 BMC 卡片按 9 个维度固定布局展示。
 * 这是论文核心可视化输出。
 */

import { useMemo } from 'react'
import type { MacraNodeData, CCBMCDomain, ConflictDetection } from '@/types/macra'
import { CC_BMC_DOMAINS } from '@/types/macra'
import { BmcCell } from './BmcCell'
import { ConflictOverlay } from './ConflictOverlay'

// CC-BMC 9 宫格布局定义
const BMC_GRID_LAYOUT: Array<{
  domain: CCBMCDomain
  label: string
  row: number
  col: number
  rowSpan?: number
  color: string
  bgColor: string
}> = [
  // Row 1-2 left: Key Partnerships
  { domain: CC_BMC_DOMAINS.KEY_PARTNERSHIPS, label: '重要合作', row: 1, col: 1, rowSpan: 2, color: '#8b5cf6', bgColor: 'rgba(139,92,246,0.08)' },
  // Row 1 center-left: Key Activities
  { domain: CC_BMC_DOMAINS.KEY_ACTIVITIES, label: '关键业务', row: 1, col: 2, color: '#8b5cf6', bgColor: 'rgba(139,92,246,0.08)' },
  // Row 2 center-left: Key Resources
  { domain: CC_BMC_DOMAINS.KEY_RESOURCES, label: '核心资源', row: 2, col: 2, color: '#8b5cf6', bgColor: 'rgba(139,92,246,0.08)' },
  // Row 1-2 center: Value Propositions
  { domain: CC_BMC_DOMAINS.VALUE_PROPOSITIONS, label: '价值主张', row: 1, col: 3, rowSpan: 2, color: '#f59e0b', bgColor: 'rgba(245,158,11,0.08)' },
  // Row 1 center-right: Customer Relationships
  { domain: CC_BMC_DOMAINS.CUSTOMER_RELATIONSHIPS, label: '客户关系', row: 1, col: 4, color: '#3b82f6', bgColor: 'rgba(59,130,246,0.08)' },
  // Row 2 center-right: Channels
  { domain: CC_BMC_DOMAINS.CHANNELS, label: '渠道通路', row: 2, col: 4, color: '#3b82f6', bgColor: 'rgba(59,130,246,0.08)' },
  // Row 1-2 right: Customer Segments
  { domain: CC_BMC_DOMAINS.CUSTOMER_SEGMENTS, label: '客户细分', row: 1, col: 5, rowSpan: 2, color: '#3b82f6', bgColor: 'rgba(59,130,246,0.08)' },
  // Row 3 left half: Cost Structure
  { domain: CC_BMC_DOMAINS.COST_STRUCTURE, label: '成本结构', row: 3, col: 1, color: '#ef4444', bgColor: 'rgba(239,68,68,0.08)' },
  // Row 3 right half: Revenue Streams
  { domain: CC_BMC_DOMAINS.REVENUE_STREAMS, label: '收入来源', row: 3, col: 3, color: '#10b981', bgColor: 'rgba(16,185,129,0.08)' },
]

interface BmcGridProps {
  nodes: MacraNodeData[]
  conflicts?: ConflictDetection[]
  onNodeClick?: (node: MacraNodeData) => void
  isLoading?: boolean
}

export function BmcGrid({ nodes, conflicts = [], onNodeClick, isLoading }: BmcGridProps) {
  // Group nodes by domain
  const nodesByDomain = useMemo(() => {
    const map = new Map<string, MacraNodeData[]>()
    for (const node of nodes) {
      if (node.domain) {
        const existing = map.get(node.domain) ?? []
        existing.push(node)
        map.set(node.domain, existing)
      }
    }
    return map
  }, [nodes])

  // Map conflicts to cells
  const conflictsByNode = useMemo(() => {
    const map = new Map<string, ConflictDetection[]>()
    for (const c of conflicts) {
      for (const id of [c.source_node_id, c.target_node_id]) {
        const existing = map.get(id) ?? []
        existing.push(c)
        map.set(id, existing)
      }
    }
    return map
  }, [conflicts])

  return (
    <div className="relative w-full h-full p-6">
      {/* Title */}
      <div className="text-center mb-4">
        <h2 className="text-lg font-bold text-slate-200">CC-BMC 商业模型画布</h2>
        <p className="text-xs text-slate-500">
          {nodes.length} 个分析节点 · {conflicts.length} 个冲突
        </p>
      </div>

      {/* 9-Grid */}
      <div
        className="grid gap-2 h-[calc(100%-80px)]"
        style={{
          gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
          gridTemplateRows: '1fr 1fr 1fr',
        }}
      >
        {BMC_GRID_LAYOUT.map((cell) => {
          const cellNodes = nodesByDomain.get(cell.domain) ?? []
          const cellConflicts = cellNodes.flatMap(
            (n) => conflictsByNode.get(n.id) ?? [],
          )
          const hasHighConflict = cellConflicts.some((c) => c.severity === 'high')

          return (
            <div
              key={cell.domain}
              className={`relative rounded-lg border transition-all ${
                hasHighConflict
                  ? 'border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
                  : 'border-slate-700/50'
              }`}
              style={{
                gridRow: cell.rowSpan
                  ? `${cell.row} / span ${cell.rowSpan}`
                  : `${cell.row}`,
                gridColumn:
                  cell.domain === CC_BMC_DOMAINS.COST_STRUCTURE
                    ? '1 / span 2'
                    : cell.domain === CC_BMC_DOMAINS.REVENUE_STREAMS
                      ? '3 / span 3'
                      : `${cell.col}`,
                backgroundColor: cell.bgColor,
              }}
            >
              <BmcCell
                domain={cell.domain}
                label={cell.label}
                color={cell.color}
                nodes={cellNodes}
                conflicts={cellConflicts}
                onNodeClick={onNodeClick}
                isLoading={isLoading && cellNodes.length === 0}
              />
              {hasHighConflict && <ConflictOverlay count={cellConflicts.filter((c) => c.severity === 'high').length} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
