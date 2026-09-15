'use client'

import { useCanvasStore } from '../store'
import { ThemeToggle } from './theme-toggle'

type CanvasToolbarProps = {
  onAddNode: () => void | Promise<void>
  onToggleDocuments: () => void
  onTogglePalette: () => void
  onRunAnalysis: () => void
}

export function CanvasToolbar({ onAddNode, onToggleDocuments, onTogglePalette, onRunAnalysis }: CanvasToolbarProps) {
  const zoom = useCanvasStore((state) => state.zoom)
  const setZoom = useCanvasStore((state) => state.setZoom)
  const togglePanel = useCanvasStore((state) => state.togglePanel)

  return (
    <div className="flex items-center justify-between border-b border-canvas-border bg-canvas-surface/80 px-8 py-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <button
          className="rounded-full border border-canvas-border/70 bg-canvas-panel px-4 py-1 text-xs font-medium text-canvas-muted transition hover:border-canvas-border hover:bg-canvas-panel/80 hover:text-canvas-text"
          onClick={onAddNode}
          type="button"
        >
          + 添加节点
        </button>
        <button className="rounded-full border border-canvas-border/70 bg-canvas-panel px-4 py-1 text-xs font-medium text-canvas-muted transition hover:border-canvas-border hover:bg-canvas-panel/80 hover:text-canvas-text">
          AI 大纲
        </button>
        <button className="rounded-full border border-canvas-border/70 bg-canvas-panel px-4 py-1 text-xs font-medium text-canvas-muted transition hover:border-canvas-border hover:bg-canvas-panel/80 hover:text-canvas-text">
          自动排版
        </button>
        <button
          className="rounded-full border border-canvas-border/70 bg-canvas-panel px-4 py-1 text-xs font-medium text-canvas-muted transition hover:border-canvas-border hover:bg-canvas-panel/80 hover:text-canvas-text"
          onClick={onTogglePalette}
          type="button"
        >
          节点库
        </button>
        <button
          className="rounded-full border border-transparent bg-canvas-primary px-4 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-canvas-primary/90"
          onClick={onRunAnalysis}
          type="button"
        >
          AI 拆分
        </button>
      </div>
      <div className="flex items-center gap-3 text-xs text-canvas-muted">
        <button
          className="rounded-full border border-canvas-border/70 bg-canvas-panel px-3 py-1 font-medium transition hover:border-canvas-border hover:bg-canvas-panel/80 hover:text-canvas-text"
          onClick={onToggleDocuments}
          type="button"
        >
          文档抽屉
        </button>
        <button
          onClick={() => {
            togglePanel('assistant')
          }}
          className="rounded-full border border-canvas-border/70 bg-canvas-panel px-3 py-1 font-medium transition hover:border-canvas-border hover:bg-canvas-panel/80 hover:text-canvas-text"
          type="button"
        >
          助手
        </button>
        <div className="flex items-center gap-2 rounded-full border border-canvas-border/70 bg-canvas-panel px-3 py-1 text-canvas-text transition">
          <button
            onClick={() => setZoom(Math.max(0.5, Math.round((zoom - 0.1) * 10) / 10))}
            className="text-canvas-muted hover:text-canvas-text"
            type="button"
          >
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(Math.min(2, Math.round((zoom + 0.1) * 10) / 10))}
            className="text-canvas-muted hover:text-canvas-text"
            type="button"
          >
            ＋
          </button>
        </div>
        <ThemeToggle />
      </div>
    </div>
  )
}
