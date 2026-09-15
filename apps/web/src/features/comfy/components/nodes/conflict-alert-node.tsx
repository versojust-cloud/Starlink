'use client'

/**
 * ConflictAlertNode — Editorial Boardroom v2 (2026-05-02).
 *
 * The ONE node type that earns a press-red border on the canvas.
 * Press-red is reserved across the whole v2 system for "needs human
 * decision" surfaces — debate active, HITL pending, AND conflicts
 * surfaced by the critic. Severity differentiation is now via
 * stroke weight + a single mono kicker label, not via 3 different
 * gradient palettes (rose / amber / yellow in v1).
 *
 *   high   → 1.5 px press border + "HIGH" kicker
 *   medium → 1 px   press border + "MID"  kicker
 *   low    → 0.5 px press border + "LOW"  kicker (almost invisible —
 *           by design; low severity shouldn't draw the eye)
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { useComfyStore } from '../../store'
import { type MacraNodeData } from '@/types/macra'
import { AlertTriangle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const SEVERITY_LABEL = {
  high:   'HIGH',
  medium: 'MID',
  low:    'LOW',
} as const

const SEVERITY_BORDER = {
  high:   'border-2   border-stratum-danger',
  medium: 'border     border-stratum-danger/70',
  low:    'border     border-stratum-danger/40',
} as const

const CONFLICT_TYPE_LABELS: Record<NonNullable<MacraNodeData['conflictType']>, string> = {
  'resource-goal':       '资源-目标冲突',
  'compliance-business': '合规-业务冲突',
  'channel-product':     '渠道-产品冲突',
  other:                 '其他冲突',
}

const HANDLE_BASE =
  'h-2 w-2 !border !border-stratum-line !bg-white'

export const ConflictAlertNode = memo(function ConflictAlertNode({ id, data }: NodeProps) {
  const macraNode = useComfyStore((state) => state.macraNodes.get(id))
  const nodeData = macraNode || (data as MacraNodeData)

  const severity = nodeData?.severity || 'medium'
  const conflictType = nodeData?.conflictType
  const conflictLabel = conflictType ? CONFLICT_TYPE_LABELS[conflictType] : null

  return (
    <>
      <Handle type="target" position={Position.Top}    className={HANDLE_BASE} />

      <article
        className={[
          'relative w-[320px] rounded-xl bg-white font-body text-stratum-navy shadow-md',
          'transition-shadow duration-100 ease-out hover:shadow-lg',
          SEVERITY_BORDER[severity],
        ].join(' ')}
        style={{ boxShadow: 'inset 4px 0 0 0 #BA1A1A, 0 4px 12px rgba(186,26,26,0.08)' }}
      >
        {/* Header — danger kicker + label + conflict type */}
        <header className="flex items-baseline gap-2 px-4 pt-3 pb-2 border-b border-stratum-line">
          <AlertTriangle className="h-3.5 w-3.5 text-stratum-danger shrink-0" strokeWidth={2} fill="#FFDAD6" />
          <span className="font-body text-[10px] font-bold uppercase tracking-[0.18em] text-stratum-danger">
            CONFLICT · {SEVERITY_LABEL[severity]}
          </span>
          {conflictLabel ? (
            <span className="ml-auto font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted truncate">
              {conflictLabel}
            </span>
          ) : null}
        </header>

        {/* Title — Fraunces */}
        <div className="px-4 pt-3 pb-2">
          <h3
            className="font-display font-[700] text-[15px] tracking-tight leading-tight text-stratum-navy"
            title={nodeData?.label || ''}
          >
            {nodeData?.label || '冲突警示'}
          </h3>
        </div>

        {/* Body — markdown content */}
        <div className="px-4 pb-3 border-t border-stratum-line">
          <div className="prose prose-sm font-body text-[12px] leading-[1.55] text-stratum-ink max-h-52 max-w-measure-cell overflow-y-auto pt-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{nodeData?.content || '*暂无冲突详情*'}</ReactMarkdown>
          </div>
        </div>

        {/* Footer — detected by */}
        {nodeData?.metadata?.agent_signature ? (
          <footer className="flex items-baseline gap-2 px-4 pt-2 pb-2 border-t border-stratum-line font-body text-[10px] font-semibold uppercase tracking-[0.18em]">
            <span className="text-stratum-muted">DETECTED BY</span>
            <span className="text-byline-critic">{nodeData.metadata.agent_signature}</span>
          </footer>
        ) : null}
      </article>

      <Handle type="source" position={Position.Bottom} className={HANDLE_BASE} />
    </>
  )
})
