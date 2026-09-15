'use client'

/**
 * 冲突面板 — 展示 Critic Agent 检测到的冲突，附带修复建议。
 * 论文核心展示："对抗审查"的可解释性输出。
 */

import type { ConflictDetection } from '@/types/macra'

interface ConflictPanelProps {
  conflicts: ConflictDetection[]
  onResolve?: (conflict: ConflictDetection) => void
  onApplySuggestion?: (conflict: ConflictDetection) => void
}

const severityConfig = {
  high: { label: '高危', bg: 'bg-red-900/40', border: 'border-red-700/50', text: 'text-red-300', badge: 'bg-red-500' },
  medium: { label: '中等', bg: 'bg-amber-900/30', border: 'border-amber-700/40', text: 'text-amber-300', badge: 'bg-amber-500' },
  low: { label: '低风险', bg: 'bg-slate-800/60', border: 'border-slate-700/40', text: 'text-slate-300', badge: 'bg-slate-500' },
}

export function ConflictPanel({ conflicts, onResolve, onApplySuggestion }: ConflictPanelProps) {
  if (conflicts.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">🔍</span>
          <h3 className="text-sm font-semibold text-slate-200">冲突检测</h3>
        </div>
        <div className="flex items-center justify-center py-6">
          <div className="text-center">
            <div className="text-2xl mb-1">✅</div>
            <p className="text-xs text-slate-500">未发现逻辑冲突</p>
          </div>
        </div>
      </div>
    )
  }

  const highCount = conflicts.filter((c) => c.severity === 'high').length
  const mediumCount = conflicts.filter((c) => c.severity === 'medium').length

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🔍</span>
          <h3 className="text-sm font-semibold text-slate-200">冲突检测</h3>
        </div>
        <div className="flex gap-2">
          {highCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">
              {highCount} 高危
            </span>
          )}
          {mediumCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
              {mediumCount} 中等
            </span>
          )}
        </div>
      </div>

      {/* Conflict list */}
      <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-800/50">
        {conflicts.map((conflict, idx) => {
          const config = severityConfig[conflict.severity]
          return (
            <div key={idx} className={`p-3 ${config.bg}`}>
              {/* Severity + Reason */}
              <div className="flex items-start gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded text-white flex-shrink-0 mt-0.5 ${config.badge}`}>
                  {config.label}
                </span>
                <p className={`text-xs ${config.text} leading-relaxed`}>
                  {conflict.reason}
                </p>
              </div>

              {/* Nodes involved */}
              <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-500">
                <span>{conflict.source_node_id}</span>
                <span className="text-red-400">⚡</span>
                <span>{conflict.target_node_id}</span>
              </div>

              {/* Suggestion */}
              {conflict.suggestion && (
                <div className="mt-2 p-2 bg-slate-800/60 rounded text-[11px] text-slate-400 border-l-2 border-blue-500/50">
                  <span className="text-blue-400 font-medium">建议：</span>
                  {conflict.suggestion}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-2">
                {onApplySuggestion && conflict.suggestion && (
                  <button
                    onClick={() => onApplySuggestion(conflict)}
                    className="text-[10px] px-2 py-1 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 rounded transition-colors"
                  >
                    应用建议
                  </button>
                )}
                {onResolve && (
                  <button
                    onClick={() => onResolve(conflict)}
                    className="text-[10px] px-2 py-1 bg-slate-700/50 hover:bg-slate-700/80 text-slate-300 rounded transition-colors"
                  >
                    标记已解决
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
