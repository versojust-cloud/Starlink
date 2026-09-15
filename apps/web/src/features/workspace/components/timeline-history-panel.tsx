'use client'

import type { TimelineIteration } from '@/types/timeline'

type TimelineHistoryPanelProps = {
  iterations: TimelineIteration[]
  loading?: boolean
  onRestore: (iteration: TimelineIteration) => void
}

export function TimelineHistoryPanel({ iterations, loading, onRestore }: TimelineHistoryPanelProps) {
  return (
    <aside className="pointer-events-auto w-72 max-h-[420px] overflow-hidden rounded-3xl border border-canvas-border bg-canvas-surface/95 p-4 text-canvas-text shadow-lg backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-canvas-text">历史版本</h3>
          <p className="text-xs text-canvas-subtle">记录每轮拆分与行动</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 text-center text-xs text-canvas-subtle">加载中...</div>
      ) : iterations.length === 0 ? (
        <div className="mt-6 text-xs text-canvas-subtle">暂无历史记录，开始拆分任务吧。</div>
      ) : (
        <ul className="mt-4 space-y-3 overflow-y-auto pr-1 text-sm text-canvas-muted" style={{ maxHeight: 320 }}>
          {iterations
            .slice()
            .sort((a, b) => b.version - a.version)
            .map((iteration) => (
              <li key={iteration.id} className="rounded-2xl border border-canvas-border bg-canvas-panel px-3 py-3 shadow-sm">
                <div className="flex items-center justify-between text-xs text-canvas-subtle">
                  <span>第 {iteration.version} 轮</span>
                  <span>{new Date(iteration.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 max-h-14 overflow-hidden text-sm text-canvas-text">{iteration.summary || '—'}</p>
                <button
                  className="mt-3 w-full rounded-full border border-canvas-border/70 bg-canvas-surface px-3 py-1 text-xs font-medium text-canvas-text transition hover:border-canvas-border hover:bg-canvas-panel/70"
                  onClick={() => onRestore(iteration)}
                >
                  查看并恢复
                </button>
              </li>
            ))}
        </ul>
      )}
    </aside>
  )
}
