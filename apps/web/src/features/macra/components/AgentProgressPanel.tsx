'use client'

/**
 * Agent 进度面板 — 实时展示 6 个 Agent 的执行状态。
 * 这是论文"多 Agent 协同可见性"的核心展示组件。
 */

import type { AgentType } from '@/types/macra'
import { AGENT_TYPES } from '@/types/macra'

export interface AgentStatus {
  agentType: AgentType
  label: string
  status: 'idle' | 'thinking' | 'running' | 'completed' | 'failed'
  progress: number // 0-100
  outputSummary?: string
  duration?: number // ms
  nodeCount?: number
  domains?: string[]
}

// 6 个核心 Agent 定义
const CORE_AGENTS: Array<{
  type: AgentType
  label: string
  icon: string
  color: string
  domains: string[]
}> = [
  { type: AGENT_TYPES.MARKET, label: '市场分析', icon: '📊', color: '#3b82f6', domains: ['客户细分', '渠道通路', '客户关系'] },
  { type: AGENT_TYPES.PRODUCT, label: '产品策略', icon: '🎯', color: '#f59e0b', domains: ['价值主张', '核心资源', '关键业务', '重要合作'] },
  { type: AGENT_TYPES.FINANCE, label: '财务分析', icon: '💰', color: '#10b981', domains: ['收入来源', '成本结构'] },
  { type: AGENT_TYPES.ORCHESTRATOR, label: '协调整合', icon: '🔗', color: '#8b5cf6', domains: [] },
  { type: AGENT_TYPES.CRITIC, label: '对抗审查', icon: '🔍', color: '#ef4444', domains: [] },
  { type: AGENT_TYPES.SEMANTIC_PLAN, label: '语义规划', icon: '🧠', color: '#6366f1', domains: [] },
]

interface AgentProgressPanelProps {
  agentStatuses: Map<AgentType, AgentStatus>
  currentPhase: 'idle' | 'planning' | 'execution' | 'review' | 'decision'
  totalDuration?: number
}

export function AgentProgressPanel({ agentStatuses, currentPhase, totalDuration }: AgentProgressPanelProps) {
  const phaseLabel = {
    idle: '等待输入',
    planning: '任务规划',
    execution: 'Agent 执行中',
    review: '对抗审查',
    decision: '等待决策',
  }[currentPhase]

  const phaseColor = {
    idle: 'text-slate-500',
    planning: 'text-blue-400',
    execution: 'text-amber-400',
    review: 'text-red-400',
    decision: 'text-purple-400',
  }[currentPhase]

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
      {/* Phase Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${currentPhase !== 'idle' ? 'animate-pulse' : ''} ${
            currentPhase === 'idle' ? 'bg-slate-600'
            : currentPhase === 'execution' ? 'bg-amber-400'
            : currentPhase === 'review' ? 'bg-red-400'
            : 'bg-blue-400'
          }`} />
          <span className={`text-sm font-medium ${phaseColor}`}>{phaseLabel}</span>
        </div>
        {totalDuration !== undefined && (
          <span className="text-xs text-slate-500">{(totalDuration / 1000).toFixed(1)}s</span>
        )}
      </div>

      {/* Agent List */}
      <div className="divide-y divide-slate-800/50">
        {CORE_AGENTS.map((agent) => {
          const status = agentStatuses.get(agent.type)
          const isActive = status?.status === 'running' || status?.status === 'thinking'
          const isDone = status?.status === 'completed'
          const isFailed = status?.status === 'failed'

          return (
            <div
              key={agent.type}
              className={`px-4 py-2.5 transition-colors ${isActive ? 'bg-slate-800/40' : ''}`}
            >
              <div className="flex items-center gap-3">
                {/* Icon */}
                <span className="text-base flex-shrink-0">{agent.icon}</span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">{agent.label}</span>
                    {/* Status badge */}
                    {isActive && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-300 animate-pulse">
                        执行中
                      </span>
                    )}
                    {isDone && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300">
                        完成
                      </span>
                    )}
                    {isFailed && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-300">
                        失败
                      </span>
                    )}
                  </div>

                  {/* Domains */}
                  {agent.domains.length > 0 && (
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {agent.domains.map((d) => (
                        <span key={d} className="text-[9px] text-slate-500">{d}</span>
                      ))}
                    </div>
                  )}

                  {/* Output summary */}
                  {status?.outputSummary && (
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{status.outputSummary}</p>
                  )}
                </div>

                {/* Progress / Duration */}
                <div className="flex flex-col items-end flex-shrink-0">
                  {status?.nodeCount !== undefined && status.nodeCount > 0 && (
                    <span className="text-[10px] text-slate-500">{status.nodeCount} 节点</span>
                  )}
                  {status?.duration !== undefined && (
                    <span className="text-[10px] text-slate-600">{(status.duration / 1000).toFixed(1)}s</span>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {isActive && status?.progress !== undefined && (
                <div className="mt-1.5 h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${status.progress}%`, backgroundColor: agent.color }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
