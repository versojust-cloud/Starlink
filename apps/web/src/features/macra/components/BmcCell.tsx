'use client'

/**
 * 单个 BMC 维度格子 — 展示该维度下的所有 Agent 产出节点。
 */

import type { MacraNodeData, CCBMCDomain, ConflictDetection } from '@/types/macra'

interface BmcCellProps {
  domain: CCBMCDomain
  label: string
  color: string
  nodes: MacraNodeData[]
  conflicts: ConflictDetection[]
  onNodeClick?: (node: MacraNodeData) => void
  isLoading?: boolean
}

export function BmcCell({ domain, label, color, nodes, conflicts, onNodeClick, isLoading }: BmcCellProps) {
  return (
    <div className="flex flex-col h-full p-3 overflow-hidden" data-domain={domain}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold text-slate-300">{label}</span>
        {nodes.length > 0 && (
          <span className="text-[10px] text-slate-500 ml-auto">{nodes.length}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-1.5 scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-4 h-4 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] text-slate-600">等待 Agent 分析...</span>
          </div>
        ) : (
          nodes.map((node) => {
            const nodeConflicts = conflicts.filter(
              (c) => c.source_node_id === node.id || c.target_node_id === node.id,
            )
            const hasConflict = nodeConflicts.length > 0

            return (
              <div
                key={node.id}
                onClick={() => onNodeClick?.(node)}
                className={`p-2 rounded text-xs cursor-pointer transition-all hover:brightness-110 ${
                  hasConflict
                    ? 'bg-red-950/40 border border-red-800/40'
                    : 'bg-slate-800/60 border border-slate-700/30'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="font-medium text-slate-200 line-clamp-1">{node.label}</span>
                  {node.metadata.confidence && (
                    <span
                      className={`text-[9px] px-1 rounded flex-shrink-0 ${
                        node.metadata.confidence === 'high'
                          ? 'bg-emerald-900/60 text-emerald-300'
                          : node.metadata.confidence === 'medium'
                            ? 'bg-amber-900/60 text-amber-300'
                            : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {node.metadata.confidence}
                    </span>
                  )}
                </div>
                <p className="text-slate-400 mt-1 line-clamp-3 leading-relaxed">
                  {node.summary ?? node.content}
                </p>
                {node.metadata.agent_signature && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="text-[9px] text-slate-600">
                      by {node.metadata.agent_signature}
                    </span>
                    {node.metadata.source && (
                      <span className="text-[9px] text-blue-500/70 ml-auto" title={node.metadata.source}>
                        [引用]
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
