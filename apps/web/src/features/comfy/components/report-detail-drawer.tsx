'use client'

/**
 * ReportDetailDrawer — Phase 6 (2026-05-04). Side drawer that opens
 * when the user clicks a `report-card` macra node on the canvas.
 *
 * Distinct from CCBMCDetailDrawer (which is BMC-specific with quiz /
 * edit / resources tabs). This drawer is purpose-built for the long
 * structured report: sticky TOC + full markdown body rendered through
 * the agent-output renderer registry (ReportWriterRenderer with
 * surface='drawer'). No tabs — reading is the only mode.
 *
 * Header has:
 *   - "REPORT · 整份报告" mono kicker + Fraunces title
 *   - timestamp (from node createdAt or now)
 *   - "复制 markdown" + "重新生成" actions
 *   - close button
 */

import { useCallback, useState } from 'react'
import { X, Copy, RefreshCw, Check, FileText } from 'lucide-react'
import { useComfyStore } from '../store'
import { renderAgentOutput } from '../registries/agent-output-renderer-registry'

export function ReportDetailDrawer() {
  const detailPanel = useComfyStore((state) => state.detailPanel)
  const closeDetailPanel = useComfyStore((state) => state.closeDetailPanel)
  const nodeData = useComfyStore((state) => {
    if (!state.detailPanel?.nodeId) return null
    return state.macraNodes.get(state.detailPanel.nodeId) ?? null
  })
  const mentionAgent = useComfyStore((state) => state.mentionAgent)

  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const handleCopy = useCallback(() => {
    if (typeof navigator === 'undefined' || !nodeData?.content) return
    navigator.clipboard
      ?.writeText(nodeData.content)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
      })
      .catch(() => {})
  }, [nodeData?.content])

  const handleRegen = useCallback(async () => {
    if (regenerating) return
    setRegenerating(true)
    try {
      await mentionAgent('report-writer', '基于当前画布的最新状态重新生成完整商业报告')
    } finally {
      setRegenerating(false)
    }
  }, [mentionAgent, regenerating])

  if (!detailPanel?.isOpen || !detailPanel?.nodeId) return null
  if (!nodeData || nodeData.type !== 'report-card') return null

  const title = nodeData.label || '商业报告'
  const content = nodeData.content || ''
  const wordCount = content.length

  return (
    <aside
      role="region"
      aria-label="整份商业报告"
      className="fixed right-0 top-0 bottom-0 z-30 w-[820px] max-w-[90vw] flex flex-col bg-paper border-l-[1.5px] border-ink-ash1 shadow-2xl pointer-events-auto"
    >
      {/* Header */}
      <header className="border-b-[0.5px] border-stratum-line bg-white">
        <div className="flex items-start justify-between gap-4 px-6 py-4">
          <div className="flex-1 min-w-0">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-stratum-muted block">
              REPORT · 整份商业报告
            </span>
            <h2 className="font-display font-[700] text-[22px] tracking-tight text-stratum-navy mt-0.5 truncate">
              {title}
            </h2>
            <p className="font-mono text-[10px] tabular-nums text-stratum-muted mt-1">
              {wordCount.toLocaleString()} 字 · 由 report-writer 生成
            </p>
          </div>
          <button
            type="button"
            onClick={closeDetailPanel}
            className="flex h-8 w-8 items-center justify-center text-stratum-muted hover:bg-stratum-surface-low hover:text-stratum-navy transition-colors"
            aria-label="关闭"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        {/* Action row */}
        <div className="flex items-center gap-2 px-6 pb-3 border-t-[0.5px] border-stratum-line bg-stratum-surface-low/40">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-stratum-navy bg-white border border-stratum-line hover:bg-stratum-surface-low transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" strokeWidth={2} /> 已复制
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" strokeWidth={1.75} /> Copy MD
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleRegen}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-stratum-navy bg-white border border-stratum-line hover:bg-stratum-surface-low transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${regenerating ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            {regenerating ? '生成中…' : 'Regenerate'}
          </button>
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-stratum-muted">
            <FileText className="h-3 w-3" strokeWidth={1.5} />
            阅读模式
          </span>
        </div>
      </header>

      {/* Body — renderer registry handles the multi-section layout */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {renderAgentOutput({
          surface: 'drawer',
          content,
          agentId: 'report-writer',
          macraType: 'report-card',
        })}
      </div>
    </aside>
  )
}
