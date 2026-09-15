'use client'

/**
 * MACRA 分析主页面 — 三阶段交互流程：
 *   Stage 1: 输入面板（用户输入商业问题）
 *   Stage 2: 思考面板（Agent 进度 + 实时状态）
 *   Stage 3: 输出面板（CC-BMC 画布 + 冲突面板 + HITL 审核）
 *
 * 融合了 ComfyUI 工作流底层能力 + MACRA 业务场景。
 */

import { useState, useCallback, useEffect } from 'react'
import type { MacraNodeData } from '@/types/macra'
import { InputPanel } from './InputPanel'
import { AgentProgressPanel } from './AgentProgressPanel'
import { BmcGrid } from './BmcGrid'
import { ConflictPanel } from './ConflictPanel'
import { HitlReviewModal } from './HitlReviewModal'
import { NodeDetailDrawer } from './NodeDetailDrawer'
import { useMacraConversation } from '../hooks/use-macra-conversation'

interface MacraAnalysisPageProps {
  workspaceId: string
}

export function MacraAnalysisPage({ workspaceId }: MacraAnalysisPageProps) {
  const [selectedNode, setSelectedNode] = useState<MacraNodeData | null>(null)
  const [viewStage, setViewStage] = useState<'input' | 'thinking' | 'output' | null>(null)
  const {
    stage,
    phase,
    agentStatuses,
    bmcNodes,
    conflicts,
    hitlConflicts,
    showHitlModal,
    totalDuration,
    isSubmitting,
    startAnalysis,
    approveDecision,
    resolveConflict,
    applyConflictSuggestion
  } = useMacraConversation(workspaceId)
  const activeStage = viewStage ?? stage

  useEffect(() => {
    setViewStage(null)
  }, [stage])

  const handleSubmit = useCallback(
    async (question: string, options: { knowledgeBaseId?: string }) => {
      await startAnalysis(question, options)
    },
    [startAnalysis]
  )

  const handleHitlDecision = useCallback((decision: 'accept' | 'revise' | 'ignore') => {
    void approveDecision(decision)
  }, [approveDecision])

  // ── Render ────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200">
      {/* Top bar */}
      <div className="h-12 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-3">
        <span className="text-sm font-bold">MACRA</span>
        <span className="text-xs text-slate-500">多智能体协同商业画布分析</span>
        <div className="flex-1" />
        {activeStage !== 'input' && (
          <div className="flex gap-1">
            {(['input', 'thinking', 'output'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setViewStage(s)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  activeStage === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {s === 'input' ? '输入' : s === 'thinking' ? '思考' : '输出'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {activeStage === 'input' && (
          <InputPanel onSubmit={handleSubmit} isSubmitting={isSubmitting} />
        )}

        {activeStage === 'thinking' && (
          <div className="flex h-full">
            {/* Left: Agent progress */}
            <div className="w-80 border-r border-slate-800 overflow-y-auto p-4">
              <AgentProgressPanel
                agentStatuses={agentStatuses}
                currentPhase={phase}
                totalDuration={totalDuration}
              />
            </div>

            {/* Right: Partial BMC (nodes appearing as agents complete) */}
            <div className="flex-1 overflow-hidden">
              <BmcGrid
                nodes={bmcNodes}
                conflicts={[]}
                onNodeClick={setSelectedNode}
                isLoading={phase === 'execution'}
              />
            </div>
          </div>
        )}

        {activeStage === 'output' && (
          <div className="flex h-full">
            {/* Left: Agent progress + Conflicts */}
            <div className="w-80 border-r border-slate-800 overflow-y-auto p-4 space-y-4">
              <AgentProgressPanel
                agentStatuses={agentStatuses}
                currentPhase={phase}
                totalDuration={totalDuration}
              />
              <ConflictPanel
                conflicts={conflicts}
                onApplySuggestion={applyConflictSuggestion}
                onResolve={resolveConflict}
              />
            </div>

            {/* Center: CC-BMC Canvas */}
            <div className="flex-1 overflow-hidden">
              <BmcGrid
                nodes={bmcNodes}
                conflicts={conflicts}
                onNodeClick={setSelectedNode}
              />
            </div>
          </div>
        )}
      </div>

      {/* HITL Modal */}
      {showHitlModal && (
        <HitlReviewModal
          conflicts={hitlConflicts}
          onDecision={handleHitlDecision}
        />
      )}

      {/* Node Detail Drawer */}
      {selectedNode && (
        <NodeDetailDrawer
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  )
}
