'use client'

/**
 * Centered "thinking" overlay shown when the orchestrator is mid-flight
 * (workflowStage === 'thinking' | 'revising', or isOrchestratorProcessing
 * true). Replaces the previously-empty canvas surface with a clear
 * indication that 8 agents are actively dispatching, so the user knows
 * the system is alive and isn't broken.
 *
 * Visual: navy halo + animated 4-dot pulse + Fraunces label + sky-blue
 * sub-kicker that cycles through agent names ("市场分析专家上线 · 价值
 * 主张专家上线 ..."). Uses backdrop blur so the surface beneath is dim
 * but still hints at the empty canvas state.
 */

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { WorkflowStage } from '../store/workflow-stage'

const AGENT_TICKS: ReadonlyArray<string> = [
  '客户细分专家上线',
  '价值主张专家分析中',
  '渠道通路专家拆解',
  '收入来源专家估算',
  '成本结构专家核算',
  '关键资源专家盘点',
  'Critic Agent 检测冲突',
  'Synthesizer 整合输出',
]

type Props = {
  visible: boolean
  workflowStage?: WorkflowStage
}

export function CanvasThinkingOverlay({ visible, workflowStage }: Props) {
  const [tickIndex, setTickIndex] = useState(0)

  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => {
      setTickIndex((prev) => (prev + 1) % AGENT_TICKS.length)
    }, 1600)
    return () => clearInterval(id)
  }, [visible])

  if (!visible) return null

  const stageLabel =
    workflowStage === 'revising'
      ? '正在修订'
      : workflowStage === 'thinking'
        ? '正在推演'
        : '正在协作'

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-stratum-surface/80 backdrop-blur-md pointer-events-auto"
      role="status"
      aria-live="polite"
      aria-label="AI 正在思考"
    >
      <div className="flex flex-col items-center gap-5 px-8 py-7 rounded-2xl bg-white border border-stratum-line shadow-2xl max-w-[420px]">
        {/* Animated halo + Sparkles glyph */}
        <div className="relative flex h-20 w-20 items-center justify-center">
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-stratum-blue/20 blur-2xl animate-pulse"
            style={{ animationDuration: '1.8s' }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-2 rounded-full bg-stratum-navy/5 animate-pulse"
            style={{ animationDuration: '2.4s' }}
          />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-stratum-navy text-white shadow-lg">
            <Sparkles className="h-6 w-6 text-stratum-sky" strokeWidth={2} fill="#89CEFF" />
          </span>
        </div>

        {/* Label */}
        <div className="text-center">
          <p className="font-body text-[10px] font-bold uppercase tracking-[0.18em] text-stratum-blue">
            8-AGENT · {stageLabel}
          </p>
          <h2 className="mt-1.5 font-display font-[700] text-[22px] tracking-tight text-stratum-navy leading-tight">
            正在为你拆解 BMC
          </h2>
          <p className="mt-1.5 font-body text-[12px] leading-relaxed text-stratum-muted max-w-[300px]">
            agent 在后台跑分析 + 生成节点，画布会逐步浮现内容。请稍等几十秒。
          </p>
        </div>

        {/* Agent ticker */}
        <div className="flex items-center gap-2 rounded-full bg-stratum-surface-low border border-stratum-line px-3.5 py-1.5 min-h-[28px] min-w-[260px] justify-center">
          <span className="inline-flex gap-1 shrink-0">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-stratum-blue"
              style={{ animation: 'pulse 0.9s ease-in-out 0s infinite' }}
            />
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-stratum-blue"
              style={{ animation: 'pulse 0.9s ease-in-out 0.18s infinite' }}
            />
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-stratum-blue"
              style={{ animation: 'pulse 0.9s ease-in-out 0.36s infinite' }}
            />
          </span>
          <span
            key={tickIndex}
            className="font-body text-[12px] font-medium text-stratum-navy tabular-nums animate-[fadeIn_0.3s_ease-out]"
          >
            {AGENT_TICKS[tickIndex]}
          </span>
        </div>
      </div>
    </div>
  )
}
