'use client'

/**
 * HITL 审核弹窗 — Critic 发现高危冲突时暂停，等待用户决策。
 * 论文"人机协同"的核心交互点。
 */

import type { ConflictDetection } from '@/types/macra'

interface HitlReviewModalProps {
  conflicts: ConflictDetection[]
  onDecision: (decision: 'accept' | 'revise' | 'ignore') => void
}

export function HitlReviewModal({ conflicts, onDecision }: HitlReviewModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[560px] max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-red-950/30">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            <div>
              <h2 className="text-base font-bold text-red-300">发现高危冲突</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Critic Agent 检测到 {conflicts.length} 个需要关注的逻辑冲突，请审核后决定下一步操作
              </p>
            </div>
          </div>
        </div>

        {/* Conflict details */}
        <div className="px-6 py-4 max-h-[40vh] overflow-y-auto space-y-3">
          {conflicts.map((conflict, idx) => (
            <div key={idx} className="bg-slate-800/60 rounded-lg p-4 border border-red-900/30">
              <p className="text-sm text-red-200 leading-relaxed">{conflict.reason}</p>
              {conflict.suggestion && (
                <div className="mt-2 p-2 bg-blue-950/30 rounded border-l-2 border-blue-500/50">
                  <span className="text-[11px] text-blue-400 font-medium">修复建议：</span>
                  <p className="text-[11px] text-slate-300 mt-0.5">{conflict.suggestion}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-slate-800 flex gap-3">
          <button
            onClick={() => onDecision('revise')}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
          >
            根据建议修复
          </button>
          <button
            onClick={() => onDecision('accept')}
            className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
          >
            接受当前结果
          </button>
          <button
            onClick={() => onDecision('ignore')}
            className="py-2.5 px-4 bg-transparent hover:bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-400 transition-colors"
          >
            忽略
          </button>
        </div>
      </div>
    </div>
  )
}
