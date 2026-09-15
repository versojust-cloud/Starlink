'use client'

import clsx from 'clsx'
import type { KnowledgeStage } from '@/types/knowledge'

export type StageSummary = {
  key: KnowledgeStage | 'all'
  label: string
  description: string
  count: number
  delta?: string
}

type PipelineSummaryProps = {
  stages: StageSummary[]
  activeStage: StageSummary['key']
  onSelectStage: (stage: StageSummary['key']) => void
}

export function PipelineSummary({ stages, activeStage, onSelectStage }: PipelineSummaryProps) {
  return (
    <aside className="flex w-72 flex-col border-r border-[#E3E6FF] bg-white/80 p-6 backdrop-blur">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">资料摄入流程</p>
        <p className="mt-1 text-sm text-slate-500">追踪条目在上传、解析到发布的全流程状态。</p>
      </div>

      <div className="mt-6 space-y-3">
        {stages.map((stage) => (
          <button
            key={stage.key}
            type="button"
            onClick={() => onSelectStage(stage.key)}
            className={clsx(
              'w-full rounded-2xl border px-4 py-4 text-left transition',
              activeStage === stage.key
                ? 'border-[#C8CBFF] bg-[#EEF0FF] text-[#4338CA] shadow-sm'
                : 'border-transparent bg-white/80 text-slate-600 hover:border-[#E3E6FF] hover:bg-white'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{stage.label}</h3>
                <p className="mt-1 text-xs text-slate-500">{stage.description}</p>
              </div>
              <span className="text-base font-semibold text-slate-900">{stage.count}</span>
            </div>
            {stage.delta && (
              <p className="mt-2 text-[11px] text-[#6366F1]">近 7 天 {stage.delta}</p>
            )}
          </button>
        ))}
      </div>
    </aside>
  )
}
