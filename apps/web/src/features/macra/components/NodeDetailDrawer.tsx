'use client'

/**
 * 节点详情抽屉 — 点击 BMC 节点后展示完整内容、Agent 来源、知识库引用。
 */

import type { MacraNodeData } from '@/types/macra'

interface NodeDetailDrawerProps {
  node: MacraNodeData
  onClose: () => void
}

export function NodeDetailDrawer({ node, onClose }: NodeDetailDrawerProps) {
  return (
    <div className="fixed inset-y-0 right-0 z-40 w-96 bg-slate-900 border-l border-slate-800 shadow-xl flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">{node.label}</h3>
          {node.domain && (
            <span className="text-[10px] text-slate-500">{node.domain}</span>
          )}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg">&times;</button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Main content */}
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">分析内容</label>
          <div className="mt-1 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
            {node.fullContent ?? node.content}
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-2">
          {node.metadata.agent_signature && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500">生成 Agent</span>
              <span className="text-xs text-blue-400">{node.metadata.agent_signature}</span>
            </div>
          )}
          {node.metadata.confidence && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500">置信度</span>
              <span className={`text-xs ${
                node.metadata.confidence === 'high' ? 'text-emerald-400'
                : node.metadata.confidence === 'medium' ? 'text-amber-400'
                : 'text-slate-400'
              }`}>
                {node.metadata.confidence}
              </span>
            </div>
          )}
          {node.metadata.stage && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500">阶段</span>
              <span className="text-xs text-slate-300">{node.metadata.stage}</span>
            </div>
          )}
        </div>

        {/* Knowledge source */}
        {node.metadata.source && (
          <div className="p-3 bg-blue-950/20 rounded border border-blue-900/30">
            <label className="text-[10px] text-blue-400 font-medium">知识库引用</label>
            <p className="text-xs text-slate-300 mt-1">{node.metadata.source}</p>
          </div>
        )}

        {/* Tags */}
        {node.metadata.tags && node.metadata.tags.length > 0 && (
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">标签</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {node.metadata.tags.map((tag) => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
